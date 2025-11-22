import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// Tesseract removed - doesn't work in Deno (Worker not defined)

declare const EdgeRuntime: any;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { fileName, fileType, fileSize, userId, documentId, content } = await req.json();

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const openAIKey = Deno.env.get('OPENAI_API_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Stage 1: Create document entry
    if (!documentId) {
      const { data: doc, error: docError } = await supabase
        .from('documents')
        .insert({
          user_id: userId,
          file_name: fileName,
          file_type: fileType,
          file_size: fileSize,
          status: 'processing',
        })
        .select()
        .single();

      if (docError) throw docError;

      return new Response(
        JSON.stringify({ documentId: doc.id }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Stage 2: Process document content
    if (documentId && content) {
      // Start background processing
      const processInBackground = async () => {
        try {
          // Fetch document to get userId
          const { data: document, error: docError } = await supabase
            .from('documents')
            .select('user_id, file_name, file_type')
            .eq('id', documentId)
            .single();

          if (docError || !document) {
            throw new Error('Document not found');
          }

          const actualUserId = document.user_id;
          const actualFileName = document.file_name;
          const actualFileType = document.file_type;

          // Update status to extracting
          await supabase
            .from('documents')
            .update({ 
              processing_progress: 10, 
              processing_stage: 'extracting' 
            })
            .eq('id', documentId);

          const buffer = Uint8Array.from(atob(content), c => c.charCodeAt(0));
          let text = '';
          
          console.log(`Processing document: ${actualFileName} (${actualFileType}, ${buffer.length} bytes)`);
          
          // Check file type and apply appropriate extraction
          if (actualFileType === 'application/pdf') {
            console.log('Processing PDF...');
            text = await extractTextFromPDF(buffer);
            
            // If extracted text is too short, likely a scanned PDF - try OCR
            if (text.trim().length < 100) {
              console.log('PDF appears to be scanned, attempting OCR...');
              text = await ocrScannedPDF(buffer);
            }
            
            if (text.trim().length === 0) {
              throw new Error('Could not extract text from PDF - file may be empty or corrupted');
            }
          } else if (actualFileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
            console.log('Processing Word document (.docx)...');
            text = await extractTextFromDocx(buffer);
            
            if (text.trim().length === 0) {
              throw new Error('Could not extract text from Word document - file may be empty or corrupted');
            }
          } else if (actualFileType.startsWith('image/')) {
            console.log('Processing image with AI vision...');
            try {
              const visionText = await analyzeImageWithVision(buffer, actualFileName);
              if (visionText) {
                text = visionText;
              } else {
                text = `[Image: ${actualFileName}]\n\nThis image was uploaded but could not be analyzed.`;
              }
            } catch (visionError) {
              console.error('Vision analysis failed:', visionError);
              const errorMsg = visionError instanceof Error ? visionError.message : 'Unknown error';
              text = `[Image: ${actualFileName}]\n\nThis image was uploaded but processing encountered an error: ${errorMsg}`;
            }
          } else {
            // For other text files, decode as text
            text = new TextDecoder().decode(buffer);
          }
          
          console.log(`Extracted ${text.length} characters`);

          // Update progress - text extraction complete
          await supabase
            .from('documents')
            .update({ 
              processing_progress: 33, 
              processing_stage: 'chunking' 
            })
            .eq('id', documentId);

          // Limit text length
          text = text.substring(0, 100000);

          // Get existing folders for better classification
          const { data: existingDocs } = await supabase
            .from('documents')
            .select('folder')
            .eq('user_id', actualUserId)
            .not('folder', 'is', null);
          
          const existingFolders = existingDocs 
            ? [...new Set(existingDocs.map(d => d.folder).filter(Boolean))]
            : [];

          // Classify document into folder
          console.log(`[${actualFileName}] Classifying document topic`);
          let folder = 'Uncategorized';
          try {
            const classifyResponse = await fetch(`${supabaseUrl}/functions/v1/classify-topic`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${supabaseKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                text,
                fileName: actualFileName,
                existingFolders,
              }),
            });
            
            if (classifyResponse.ok) {
              const classifyData = await classifyResponse.json();
              folder = classifyData.folder || 'Uncategorized';
              console.log(`[${actualFileName}] Classified as: ${folder}`);
            }
          } catch (classifyError) {
            console.error(`[${actualFileName}] Classification error:`, classifyError);
          }

          // Chunk the text with smaller size to avoid token limit (8192 tokens = ~6000 words)
          // Using 150 words per chunk (≈200 tokens) to stay well below limits
          const chunks = chunkText(text, 150, 30);

          // Update progress - chunking complete, starting embeddings
          await supabase
            .from('documents')
            .update({ 
              processing_progress: 50, 
              processing_stage: 'embedding' 
            })
            .eq('id', documentId);

          // Batch embeddings for better performance (smaller batches to avoid token limits)
          // Reduced to 3 chunks per batch to stay well under 8192 token limit
          const batchSize = 3;
          for (let i = 0; i < chunks.length; i += batchSize) {
            const batch = chunks.slice(i, i + batchSize);
            
            // Update progress during embedding generation
            const embeddingProgress = 50 + Math.floor((i / chunks.length) * 45);
            await supabase
              .from('documents')
              .update({ 
                processing_progress: embeddingProgress 
              })
              .eq('id', documentId);
            
            // Generate embeddings for batch
            const embeddingResponse = await fetch('https://api.openai.com/v1/embeddings', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${openAIKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                model: 'text-embedding-3-small',
                input: batch,
                encoding_format: 'float',
              }),
            });

            if (!embeddingResponse.ok) {
              const errorData = await embeddingResponse.text();
              console.error('OpenAI API Error:', embeddingResponse.status, errorData);
              
              if (embeddingResponse.status === 401) {
                throw new Error('OpenAI API key is invalid or missing');
              } else if (embeddingResponse.status === 429) {
                throw new Error('OpenAI API rate limit exceeded - please try again later');
              } else {
                throw new Error(`Failed to generate embeddings: ${embeddingResponse.status}`);
              }
            }

            const embeddingData = await embeddingResponse.json();
            
            // Insert chunks with embeddings
            const chunksToInsert = batch.map((chunk, idx) => ({
              document_id: documentId,
              user_id: actualUserId,
              chunk_text: chunk,
              chunk_index: i + idx,
              token_count: Math.ceil(chunk.length / 4),
              embedding: embeddingData.data[idx].embedding,
              folder: folder,
              metadata: { file_name: actualFileName, folder: folder },
            }));

            const { error: insertError } = await supabase.from('document_chunks').insert(chunksToInsert);
            if (insertError) {
              console.error('Error inserting document chunks:', insertError);
              throw insertError;
            }
          }

          // Update document status
          console.log(`Successfully processed document: ${chunks.length} chunks created in folder: ${folder}`);
          await supabase
            .from('documents')
            .update({
              status: 'ready',
              chunk_count: chunks.length,
              text_length: text.length,
              folder: folder,
              error_message: null,
              processing_progress: 100,
              processing_stage: 'complete',
            })
            .eq('id', documentId);

        } catch (error) {
          console.error('Background processing error:', error);
          
          // Provide user-friendly error messages
          let errorMessage = (error as Error).message;
          
          if (errorMessage.includes('network') || errorMessage.includes('fetch')) {
            errorMessage = 'Network error - check your connection and try again';
          } else if (errorMessage.includes('timeout')) {
            errorMessage = 'Processing timeout - file may be too large';
          }
          
          await supabase
            .from('documents')
            .update({
              status: 'error',
              error_message: errorMessage,
            })
            .eq('id', documentId);
        }
      };

      // Start background task
      EdgeRuntime.waitUntil(processInBackground());

      return new Response(
        JSON.stringify({ success: true, message: 'Processing started' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Invalid request' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in process-document:', error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// OCR function removed - Tesseract doesn't work in Deno edge functions

async function ocrScannedPDF(buffer: Uint8Array): Promise<string> {
  try {
    console.log('Processing scanned PDF...');
    
    // Use pdf-parse to get page count
    const pdfParse = await import('https://esm.sh/pdf-parse@1.1.1');
    const data = await pdfParse.default(buffer);
    
    // Note that OCR isn't available in Deno edge functions
    const message = `[Scanned PDF - ${data.numpages} pages]\n\nNote: This appears to be a scanned PDF. Text extraction from scanned PDFs is limited. For better results, please upload the original document or a text-based PDF.`;
    
    console.log('Scanned PDF processed with note');
    return message;
  } catch (error) {
    console.error('Error processing scanned PDF:', error);
    return '[Could not process scanned PDF]';
  }
}

function detectImageMimeType(buffer: Uint8Array): string {
  // Check magic numbers to detect image type
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
    return 'image/jpeg';
  }
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
    return 'image/png';
  }
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
    return 'image/gif';
  }
  if (buffer[0] === 0x42 && buffer[1] === 0x4D) {
    return 'image/bmp';
  }
  if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46) {
    return 'image/webp';
  }
  return 'image/png'; // default fallback
}

async function extractTextFromPDF(buffer: Uint8Array): Promise<string> {
  try {
    // Use pdfjs-serverless for Deno/edge function compatibility (no workers needed)
    const { getDocument } = await import('https://esm.sh/pdfjs-serverless@0.3.2');
    
    // Load PDF document
    const pdf = await getDocument({ 
      data: buffer,
      useSystemFonts: true 
    }).promise;
    
    let fullText = '';
    
    // Extract text from each page
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map((item: any) => item.str).join(' ');
      fullText += pageText + '\n\n';
    }
    
    console.log(`Extracted ${fullText.length} characters from ${pdf.numPages} pages`);
    
    return fullText;
  } catch (error) {
    console.error('Error parsing PDF:', error);
    throw new Error('Failed to extract text from PDF. The file may be corrupted or use an unsupported format.');
  }
}

async function analyzeImageWithVision(buffer: Uint8Array, fileName: string): Promise<string> {
  try {
    console.log('Analyzing image with AI vision...');
    
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')!;
    
    // Convert buffer to base64
    const base64 = btoa(
      buffer.reduce((data, byte) => data + String.fromCharCode(byte), '')
    );
    const mimeType = detectImageMimeType(buffer);
    const dataUrl = `data:${mimeType};base64,${base64}`;
    
    // Use Lovable AI vision model to analyze the image
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Analyze this image in detail. Describe what you see, including any text, diagrams, charts, UI elements, or other content. Be comprehensive and specific so someone can understand what this image contains without seeing it.'
              },
              {
                type: 'image_url',
                image_url: {
                  url: dataUrl
                }
              }
            ]
          }
        ]
      })
    });
    
    if (!response.ok) {
      throw new Error(`Vision API error: ${response.status}`);
    }
    
    const data = await response.json();
    const analysis = data.choices?.[0]?.message?.content;
    
    if (analysis) {
      console.log(`Vision analysis completed: ${analysis.length} characters`);
      return `[Image: ${fileName}]\n\nImage Analysis:\n${analysis}`;
    }
    
    return '';
  } catch (error) {
    console.error('Error analyzing image with vision:', error);
    return '';
  }
}

async function extractTextFromDocx(buffer: Uint8Array): Promise<string> {
  try {
    console.log('Extracting text from Word document...');
    
    // Use mammoth to extract text from .docx files
    const mammoth = await import('https://esm.sh/mammoth@1.6.0');
    
    // Create a new ArrayBuffer from the Uint8Array
    const arrayBuffer = new ArrayBuffer(buffer.length);
    const view = new Uint8Array(arrayBuffer);
    view.set(buffer);
    
    const result = await mammoth.extractRawText({ arrayBuffer });
    
    console.log(`Extracted ${result.value.length} characters from Word document`);
    
    if (result.messages && result.messages.length > 0) {
      console.log('Mammoth messages:', result.messages);
    }
    
    return result.value;
  } catch (error) {
    console.error('Error parsing Word document:', error);
    throw new Error('Failed to extract text from Word document. The file may be corrupted or use an unsupported format.');
  }
}

function chunkText(text: string, chunkSize: number, overlap: number): string[] {
  const chunks: string[] = [];
  const words = text.split(/\s+/);
  
  for (let i = 0; i < words.length; i += (chunkSize - overlap)) {
    const chunk = words.slice(i, i + chunkSize).join(' ');
    if (chunk.length > 0) {
      chunks.push(chunk);
    }
  }
  
  return chunks;
}