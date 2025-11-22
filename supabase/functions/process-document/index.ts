import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Tesseract from 'https://esm.sh/tesseract.js@5.0.4';

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
          
          console.log(`Processing document: ${fileName} (${fileType}, ${buffer.length} bytes)`);
          
          // Check file type and apply appropriate extraction
          if (fileType === 'application/pdf') {
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
          } else if (fileType.startsWith('image/')) {
            console.log('Processing image with OCR...');
            text = await ocrImage(buffer);
            
            if (text.trim().length === 0) {
              throw new Error('Could not extract text from image - OCR found no text');
            }
          } else {
            // For non-PDF, non-image files, decode as text
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
            .eq('user_id', userId)
            .not('folder', 'is', null);
          
          const existingFolders = existingDocs 
            ? [...new Set(existingDocs.map(d => d.folder).filter(Boolean))]
            : [];

          // Classify document into folder
          console.log(`[${fileName}] Classifying document topic`);
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
                fileName,
                existingFolders,
              }),
            });
            
            if (classifyResponse.ok) {
              const classifyData = await classifyResponse.json();
              folder = classifyData.folder || 'Uncategorized';
              console.log(`[${fileName}] Classified as: ${folder}`);
            }
          } catch (classifyError) {
            console.error(`[${fileName}] Classification error:`, classifyError);
          }

          // Chunk the text with smaller size to avoid token limit (8192 tokens = ~6000 words)
          const chunks = chunkText(text, 200, 50);

          // Update progress - chunking complete, starting embeddings
          await supabase
            .from('documents')
            .update({ 
              processing_progress: 50, 
              processing_stage: 'embedding' 
            })
            .eq('id', documentId);

          // Batch embeddings for better performance (smaller batches to avoid token limits)
          const batchSize = 5;
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
              user_id: userId,
              chunk_text: chunk,
              chunk_index: i + idx,
              token_count: Math.ceil(chunk.length / 4),
              embedding: embeddingData.data[idx].embedding,
              folder: folder,
              metadata: { file_name: fileName, folder: folder },
            }));

            await supabase.from('document_chunks').insert(chunksToInsert);
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

async function ocrImage(buffer: Uint8Array): Promise<string> {
  try {
    console.log('Starting OCR on image...');
    
    // Convert buffer to base64 data URL
    const base64 = btoa(String.fromCharCode(...buffer));
    const mimeType = detectImageMimeType(buffer);
    const dataUrl = `data:${mimeType};base64,${base64}`;
    
    // Initialize Tesseract worker
    const worker = await Tesseract.createWorker('eng');
    
    // Perform OCR
    const { data: { text } } = await worker.recognize(dataUrl);
    
    await worker.terminate();
    
    console.log(`OCR extracted ${text.length} characters`);
    return text;
  } catch (error) {
    console.error('Error performing OCR on image:', error);
    return '';
  }
}

async function ocrScannedPDF(buffer: Uint8Array): Promise<string> {
  try {
    console.log('Processing scanned PDF with OCR...');
    
    // Use pdf-parse to extract images/pages
    const pdfParse = await import('https://esm.sh/pdf-parse@1.1.1');
    const data = await pdfParse.default(buffer);
    
    // For scanned PDFs, we'll OCR the PDF as images
    // This is a simplified approach - in production you'd want to extract individual page images
    let fullText = `[Scanned PDF - ${data.numpages} pages]\n\n`;
    
    // Initialize Tesseract worker once for all pages
    const worker = await Tesseract.createWorker('eng');
    
    // Convert PDF pages to images and OCR them
    // Note: This is a simplified version. For better results, you'd extract each page as an image
    const base64 = btoa(String.fromCharCode(...buffer));
    const dataUrl = `data:application/pdf;base64,${base64}`;
    
    try {
      const { data: { text } } = await worker.recognize(dataUrl);
      fullText += text;
    } catch (ocrError) {
      console.error('OCR failed on PDF:', ocrError);
      fullText += '[OCR processing failed - PDF may require manual extraction]';
    }
    
    await worker.terminate();
    
    console.log(`OCR extracted ${fullText.length} characters from scanned PDF`);
    return fullText;
  } catch (error) {
    console.error('Error performing OCR on scanned PDF:', error);
    return '[OCR failed - could not process scanned PDF]';
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
    // Use pdfjs-dist for better Deno compatibility
    const pdfjsLib = await import('https://esm.sh/pdfjs-dist@4.0.379/legacy/build/pdf.mjs');
    
    // Load PDF document
    const loadingTask = pdfjsLib.getDocument({ data: buffer });
    const pdf = await loadingTask.promise;
    
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