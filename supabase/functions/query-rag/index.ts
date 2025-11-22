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
    const { query, conversation_id } = await req.json();

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const openAIKey = Deno.env.get('OPENAI_API_KEY')!;
    const lovableKey = Deno.env.get('LOVABLE_API_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get user ID from conversation
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('user_id')
      .eq('id', conversation_id)
      .single();

    if (convError) throw convError;
    const userId = conversation.user_id;

    // Step 1: Generate embedding for the query
    const embeddingResponse = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: query,
      }),
    });

    if (!embeddingResponse.ok) {
      throw new Error('Failed to generate query embedding');
    }

    const embeddingData = await embeddingResponse.json();
    const queryEmbedding = embeddingData.data[0].embedding;

    // Step 2: Search for relevant chunks
    const { data: chunks, error: searchError } = await supabase.rpc('search_chunks', {
      query_embedding: queryEmbedding,
      match_threshold: 0.35,
      match_count: 6,
      filter_user_id: userId,
    });

    if (searchError) throw searchError;

    if (!chunks || chunks.length === 0) {
      const response = "I don't have any information to answer that question. Please upload relevant documents first.";
      
      await supabase
        .from('messages')
        .insert({
          conversation_id,
          user_id: userId,
          role: 'assistant',
          content: response,
          sources: [],
        });

      return new Response(
        JSON.stringify({ answer: response, sources: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Step 3: Build context from chunks
    const context = chunks.map((chunk: any, idx: number) => 
      `[Source ${idx + 1}]: ${chunk.chunk_text}`
    ).join('\n\n');

    // Get document metadata for sources
    const documentIds = [...new Set(chunks.map((c: any) => c.document_id))];
    const { data: documents } = await supabase
      .from('documents')
      .select('id, file_name')
      .in('id', documentIds);

    const sources = chunks.map((chunk: any) => ({
      document_id: chunk.document_id,
      chunk_index: chunk.chunk_index,
      file_name: documents?.find(d => d.id === chunk.document_id)?.file_name || 'Unknown',
      similarity: chunk.similarity,
    }));

    // Step 4: Generate answer using Lovable AI
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: `You are Cerebro, a precise knowledge retrieval assistant. Your role is to answer questions based ONLY on the provided context.

CRITICAL RULES:
1. Only use information from the provided context
2. If the context doesn't contain enough information, say "I don't have sufficient information to answer that question"
3. Always be accurate and never hallucinate
4. Cite specific sources when possible
5. If asked about something outside the context, politely decline and ask the user to upload relevant documents

Answer Format:
- Start with a concise 2-3 sentence answer
- Follow with detailed information organized with bullet points
- Be clear, analytical, and neutral`
          },
          {
            role: 'user',
            content: `Context from documents:\n\n${context}\n\nQuestion: ${query}`
          }
        ],
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI gateway error:', aiResponse.status, errorText);
      throw new Error('Failed to generate answer');
    }

    const aiData = await aiResponse.json();
    const answer = aiData.choices[0].message.content;

    // Store assistant message
    await supabase
      .from('messages')
      .insert({
        conversation_id,
        user_id: userId,
        role: 'assistant',
        content: answer,
        sources: sources,
      });

    return new Response(
      JSON.stringify({ answer, sources }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in query-rag:', error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});