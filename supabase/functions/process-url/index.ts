import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { DOMParser } from "https://deno.land/x/deno_dom@v0.1.38/deno-dom-wasm.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url, userId } = await req.json();

    // Check for Google Docs URLs
    if (url.includes('docs.google.com')) {
      throw new Error('Google Docs URLs are not supported. Please download the document as PDF or DOCX and upload it directly using the file upload feature.');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const openAIKey = Deno.env.get('OPENAI_API_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch the URL with a proper user agent
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    const html = await response.text();
    
    // Parse HTML and extract text
    const doc = new DOMParser().parseFromString(html, 'text/html');
    
    if (!doc) {
      throw new Error('Failed to parse HTML');
    }
    
    // Remove script and style elements
    const scripts = doc.querySelectorAll('script, style');
    scripts.forEach(el => el.parentNode?.removeChild(el));
    
    // Get text content
    let text = doc.body?.textContent || '';
    text = text.replace(/\s+/g, ' ').trim();
    text = text.substring(0, 100000); // Limit to 100k chars

    if (text.length < 100) {
      throw new Error('Could not extract sufficient content from URL. The page may require JavaScript or may be behind authentication.');
    }

    // Check for common error messages that indicate failed extraction
    const errorIndicators = [
      'javascript is not enabled',
      'browser version is no longer supported',
      'enable javascript',
      'please enable cookies'
    ];
    
    const lowerText = text.toLowerCase();
    if (errorIndicators.some(indicator => lowerText.includes(indicator))) {
      throw new Error('This URL requires JavaScript or authentication. Please download the content and upload it as a file instead.');
    }

    // Get existing folders for better classification
    const { data: existingDocs } = await supabase
      .from('documents')
      .select('folder')
      .eq('user_id', userId)
      .not('folder', 'is', null);
    
    const existingFolders = existingDocs 
      ? [...new Set(existingDocs.map(d => d.folder).filter(Boolean))]
      : [];

    // Classify the content
    let folder = 'Uncategorized';
    try {
      const classifyResponse = await fetch(`${supabaseUrl}/functions/v1/classify-topic`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify({
          text,
          fileName: new URL(url).hostname,
          existingFolders,
        }),
      });
      
      if (classifyResponse.ok) {
        const classifyData = await classifyResponse.json();
        folder = classifyData.folder || 'Uncategorized';
      }
    } catch (error) {
      console.error('Classification failed:', error);
    }

    // Create document entry
    const urlObj = new URL(url);
    const fileName = urlObj.hostname + urlObj.pathname.replace(/\//g, '_');

    const { data: doc_record, error: docError } = await supabase
      .from('documents')
      .insert({
        user_id: userId,
        file_name: fileName,
        file_type: 'url',
        content_url: url,
        status: 'processing',
        folder,
      })
      .select()
      .single();

    if (docError) throw docError;

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
        throw new Error(`Failed to generate embedding: ${embeddingResponse.status} - ${errorData}`);
      }

      const embeddingData = await embeddingResponse.json();
      
      // Insert chunks with embeddings
      const chunksToInsert = batch.map((chunk, idx) => ({
        document_id: doc_record.id,
        user_id: userId,
        chunk_text: chunk,
        chunk_index: i + idx,
        token_count: Math.ceil(chunk.length / 4),
        embedding: embeddingData.data[idx].embedding,
        metadata: { file_name: fileName, source_url: url },
      }));

      await supabase.from('document_chunks').insert(chunksToInsert);
    }

    // Update document status
    await supabase
      .from('documents')
      .update({
        status: 'ready',
        chunk_count: chunks.length,
        text_length: text.length,
      })
      .eq('id', doc_record.id);

    return new Response(
      JSON.stringify({ success: true, documentId: doc_record.id, chunks: chunks.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in process-url:', error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

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