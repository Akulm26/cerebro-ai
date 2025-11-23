import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { RAGConfig } from "../_shared/rag-config.ts";

interface Source {
  document_name: string;
  folder: string;
  similarity: number;
}

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
        model: RAGConfig.embedding.model,
        input: query,
      }),
    });

    if (!embeddingResponse.ok) {
      throw new Error('Failed to generate query embedding');
    }

    const embeddingData = await embeddingResponse.json();
    const queryEmbedding = embeddingData.data[0].embedding;

    // Step 2: Semantic search with lower threshold for better recall
    console.log(`Searching for chunks with query: "${query}"`);
    const { data: chunks, error: searchError } = await supabase.rpc('search_chunks', {
      query_embedding: queryEmbedding,
      match_threshold: RAGConfig.retrieval.initialMatchThreshold,
      match_count: RAGConfig.retrieval.initialMatchCount,
      filter_user_id: userId,
    });

    if (searchError) {
      console.error('Search error:', searchError);
      throw searchError;
    }

    console.log(`Found ${chunks?.length || 0} chunks`);

    if (!chunks || chunks.length === 0) {
      const response = RAGConfig.prompts.noResultsResponse;
      
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

    // Step 3: Rerank and select top chunks with moderate filtering
    const rerankedChunks = chunks
      .filter((chunk: any) => chunk.similarity >= RAGConfig.retrieval.rerankThreshold)
      .sort((a: any, b: any) => b.similarity - a.similarity)
      .slice(0, RAGConfig.retrieval.topChunksToUse);

    console.log(`Using ${rerankedChunks.length} chunks after reranking (similarities: ${rerankedChunks.map((c: any) => c.similarity.toFixed(3)).join(', ')})`);

    // Step 4: Build context from top chunks
    const context = rerankedChunks.map((chunk: any, idx: number) => {
      const metadata = chunk.metadata || {};
      const docName = metadata.file_name || 'Unknown';
      const folder = metadata.folder || chunk.folder || 'Uncategorized';
      return `[Source ${idx + 1}] (From: ${folder} / ${docName})\n${chunk.chunk_text}`;
    }).join('\n\n');

    // Get unique documents for sources
    const documentIds = [...new Set(rerankedChunks.map((c: any) => c.document_id))];
    const { data: documents } = await supabase
      .from('documents')
      .select('id, file_name, folder')
      .in('id', documentIds);

    const sources: Source[] = rerankedChunks.map((chunk: any) => {
      const doc = documents?.find(d => d.id === chunk.document_id);
      return {
        document_name: doc?.file_name || 'Unknown',
        folder: doc?.folder || chunk.metadata?.folder || 'Uncategorized',
        similarity: chunk.similarity,
      };
    });

    // Step 5: Generate answer using Lovable AI
    console.log('Generating AI response...');
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: RAGConfig.ai.queryModel,
        messages: [
          {
            role: 'system',
            content: RAGConfig.prompts.querySystem
          },
          {
            role: 'user',
            content: `Based on the following information from the user's knowledge base, please answer the question.

CONTEXT:
${context}

QUESTION: ${query}

Provide a comprehensive answer based on the context above. If the context doesn't fully answer the question, provide what information is available and note what's missing.`
          }
        ],
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI gateway error:', aiResponse.status, errorText);
      throw new Error(`Failed to generate answer: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const answer = aiData.choices[0].message.content;
    console.log(`Generated answer (${answer.length} chars)`);

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