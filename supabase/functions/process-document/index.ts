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

          // Limit text length
          text = text.substring(0, 100000);

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

          // Chunk the text
          const chunks = chunkText(text, 350, 80);

          // Batch embeddings for better performance
          const batchSize = 10;
          for (let i = 0; i < chunks.length; i += batchSize) {
            const batch = chunks.slice(i, i + batchSize);
            
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
    // Use pdf-parse library via esm.sh
    const pdfParse = await import('https://esm.sh/pdf-parse@1.1.1');
    const data = await pdfParse.default(buffer);
    
    let fullText = data.text;
    console.log(`Extracted ${fullText.length} characters from ${data.numpages} pages`);
    
    // Try to detect and format tables
    const lines = fullText.split('\n');
    let formattedText = '';
    let inTable = false;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Simple table detection: lines with multiple spaces or tabs between words
      const hasMultipleSpaces = /\s{3,}/.test(line) || /\t/.test(line);
      const hasNumbers = /\d/.test(line);
      
      if (hasMultipleSpaces && hasNumbers && line.trim().length > 10) {
        if (!inTable) {
          formattedText += '\n[TABLE]\n';
          inTable = true;
        }
        // Format as table row
        const cells = line.split(/\s{2,}|\t/).filter(cell => cell.trim());
        formattedText += cells.join(' | ') + '\n';
      } else {
        if (inTable) {
          formattedText += '[/TABLE]\n\n';
          inTable = false;
        }
        formattedText += line + '\n';
      }
    }
    
    return formattedText;
  } catch (error) {
    console.error('Error parsing PDF:', error);
    // Fallback to basic text decoding
    return new TextDecoder().decode(buffer);
  }
}

function detectTable(items: any[]): boolean {
  // Simple table detection: check if items are arranged in grid-like pattern
  if (items.length < 10) return false;
  
  const yPositions = items
    .filter((item: any) => 'transform' in item)
    .map((item: any) => Math.round(item.transform[5]));
  
  const uniqueYPositions = [...new Set(yPositions)];
  
  // If we have multiple rows with similar Y positions, likely a table
  return uniqueYPositions.length > 2 && uniqueYPositions.length < items.length / 2;
}

function formatTable(items: any[]): string {
  // Group items by Y position (rows)
  const rows: Map<number, any[]> = new Map();
  
  items.forEach((item: any) => {
    if ('transform' in item && 'str' in item && item.str.trim()) {
      const y = Math.round(item.transform[5]);
      if (!rows.has(y)) {
        rows.set(y, []);
      }
      rows.get(y)!.push(item);
    }
  });
  
  // Sort rows by Y position and format as table
  let tableText = '';
  const sortedRows = Array.from(rows.entries()).sort((a, b) => b[0] - a[0]);
  
  sortedRows.forEach(([_, rowItems]) => {
    // Sort items in row by X position
    rowItems.sort((a, b) => a.transform[4] - b.transform[4]);
    const rowText = rowItems.map(item => item.str).join(' | ');
    tableText += rowText + '\n';
  });
  
  return tableText;
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