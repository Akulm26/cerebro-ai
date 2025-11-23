/**
 * RAG System Configuration
 * Centralized configuration for all RAG parameters
 */

export const RAGConfig = {
  // Embedding Configuration
  embedding: {
    model: 'text-embedding-3-small',
    batchSize: 3, // Number of chunks to embed at once (smaller = safer for token limits)
  },

  // Document Processing Configuration
  processing: {
    maxTextLength: 100000, // Maximum characters to process per document
    chunkSize: 150, // Words per chunk (~200 tokens)
    chunkOverlap: 30, // Words of overlap between chunks
  },

  // Retrieval Configuration
  retrieval: {
    initialMatchThreshold: 0.25, // Lower threshold for better recall
    initialMatchCount: 15, // Number of chunks to retrieve initially
    rerankThreshold: 0.28, // Threshold for filtering after reranking
    topChunksToUse: 8, // Number of top chunks to include in context
  },

  // AI Model Configuration
  ai: {
    queryModel: 'google/gemini-2.5-flash', // Model for answering queries
    visionModel: 'google/gemini-2.5-flash', // Model for image analysis
    classificationModel: 'google/gemini-2.5-flash', // Model for document classification
  },

  // System Prompts
  prompts: {
    querySystem: `You are Cerebro, an intelligent knowledge assistant that helps users find information in their documents.

RESPONSE GUIDELINES:
1. Answer directly and comprehensively using information from the provided context
2. Structure your response with clear paragraphs and bullet points when appropriate
3. Cite specific documents/folders when referencing information (e.g., "According to Strategy.pdf...")
4. If the context partially answers the question, provide what you can and note what's missing
5. Only say you don't have information if the context is completely irrelevant
6. Use a professional but conversational tone
7. For complex queries, break down the answer into logical sections

IMPORTANT:
- Be thorough - use all relevant information from the context
- Make connections between different pieces of information when relevant
- If asked about multiple topics, address each one systematically`,

    visionAnalysis: 'Analyze this image in detail. Describe what you see, including any text, diagrams, charts, UI elements, or other content. Be comprehensive and specific so someone can understand what this image contains without seeing it.',
    
    noResultsResponse: "I don't have any information to answer that question. Could you upload more relevant documents or rephrase your question?",
  },

  // Progress Stages (for document processing)
  progressStages: {
    extracting: 10,
    chunking: 33,
    embeddingStart: 50,
    embeddingEnd: 95,
    complete: 100,
  },
} as const;

// Type exports for usage
export type RAGConfigType = typeof RAGConfig;
