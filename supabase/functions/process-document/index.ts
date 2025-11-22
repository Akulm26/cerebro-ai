import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
      const buffer = Uint8Array.from(atob(content), c => c.charCodeAt(0));
      let text = new TextDecoder().decode(buffer);

      // Simple text extraction (for MVP - can be enhanced with proper parsers)
      text = text.substring(0, 100000); // Limit to 100k chars for MVP

      // Chunk the text
      const chunks = chunkText(text, 350, 80);

      // Generate embeddings for each chunk
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        
        const embeddingResponse = await fetch('https://api.openai.com/v1/embeddings', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openAIKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'text-embedding-3-small',
            input: chunk,
          }),
        });

        if (!embeddingResponse.ok) {
          throw new Error('Failed to generate embedding');
        }

        const embeddingData = await embeddingResponse.json();
        const embedding = embeddingData.data[0].embedding;

        await supabase
          .from('document_chunks')
          .insert({
            document_id: documentId,
            user_id: userId,
            chunk_text: chunk,
            chunk_index: i,
            token_count: Math.ceil(chunk.length / 4),
            embedding: embedding,
            metadata: { file_name: fileName },
          });
      }

      // Update document status
      await supabase
        .from('documents')
        .update({
          status: 'ready',
          chunk_count: chunks.length,
          text_length: text.length,
        })
        .eq('id', documentId);

      return new Response(
        JSON.stringify({ success: true, chunks: chunks.length }),
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