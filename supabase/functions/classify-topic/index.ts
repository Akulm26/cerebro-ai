import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { text, fileName } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    // Use first 2000 characters for classification
    const textSample = text.substring(0, 2000);

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: 'You are a document classifier. Analyze the document and assign it to ONE folder category. Return ONLY the folder name, nothing else. Common categories: Work Notes, Research, AI & ML, Product Management, User Research, Engineering, Design, Marketing, Sales, Finance, Legal, HR, Personal, Meeting Notes, Projects, Ideas, Learning, Reference, Documentation, Reports, Strategy, Planning, Templates, Misc.'
          },
          {
            role: 'user',
            content: `Document name: ${fileName}\n\nDocument content:\n${textSample}`
          }
        ],
        max_tokens: 50,
      }),
    });

    if (!response.ok) {
      console.error('AI classification failed:', response.status, await response.text());
      return new Response(
        JSON.stringify({ folder: 'Uncategorized' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    const folder = data.choices[0]?.message?.content?.trim() || 'Uncategorized';

    return new Response(
      JSON.stringify({ folder }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in classify-topic:', error);
    return new Response(
      JSON.stringify({ folder: 'Uncategorized' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  }
});
