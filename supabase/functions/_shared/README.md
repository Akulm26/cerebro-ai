# RAG System Configuration

This directory contains shared configuration for the RAG (Retrieval-Augmented Generation) system.

## Configuration File: `rag-config.ts`

The `rag-config.ts` file centralizes all RAG parameters in one location for easy tuning and maintenance.

### Configuration Sections

#### 1. Embedding Configuration
- **model**: OpenAI embedding model (default: `text-embedding-3-small`)
- **batchSize**: Number of chunks to embed at once (default: 3)
  - Lower values are safer for token limits
  - Increase if you have higher rate limits

#### 2. Document Processing Configuration
- **maxTextLength**: Maximum characters to process per document (default: 100,000)
  - Prevents excessive processing time
  - Adjust based on your document sizes
- **chunkSize**: Words per chunk (default: 150 ≈ 200 tokens)
  - Smaller chunks = more precise matching
  - Larger chunks = more context per match
- **chunkOverlap**: Words of overlap between chunks (default: 30)
  - Prevents information loss at chunk boundaries

#### 3. Retrieval Configuration
- **initialMatchThreshold**: Similarity threshold for initial search (default: 0.25)
  - Lower = more recall, potentially less precision
  - Higher = more precision, potentially less recall
- **initialMatchCount**: Number of chunks to retrieve initially (default: 15)
  - More candidates for reranking
- **rerankThreshold**: Threshold for filtering after reranking (default: 0.28)
  - Filters out less relevant chunks before sending to AI
- **topChunksToUse**: Number of top chunks to include in context (default: 8)
  - More chunks = more context but higher token usage
  - Fewer chunks = lower costs but potentially incomplete answers

#### 4. AI Model Configuration
- **queryModel**: Model for answering queries (default: `google/gemini-2.5-flash`)
- **visionModel**: Model for image analysis (default: `google/gemini-2.5-flash`)
- **classificationModel**: Model for document classification (default: `google/gemini-2.5-flash`)

#### 5. System Prompts
- **querySystem**: System prompt for the query-answering AI
- **visionAnalysis**: Prompt for image analysis
- **noResultsResponse**: Response when no relevant documents are found

#### 6. Progress Stages
Progress percentages for document processing UI:
- **extracting**: 10%
- **chunking**: 33%
- **embeddingStart**: 50%
- **embeddingEnd**: 95%
- **complete**: 100%

### Tuning Guidelines

#### For Better Recall (finding more relevant documents)
- Lower `initialMatchThreshold` (e.g., 0.20)
- Increase `initialMatchCount` (e.g., 20)
- Lower `rerankThreshold` (e.g., 0.25)
- Increase `topChunksToUse` (e.g., 10)

#### For Better Precision (fewer irrelevant results)
- Raise `initialMatchThreshold` (e.g., 0.30)
- Decrease `initialMatchCount` (e.g., 10)
- Raise `rerankThreshold` (e.g., 0.35)
- Decrease `topChunksToUse` (e.g., 5)

#### For Cost Optimization
- Decrease `topChunksToUse` (fewer tokens to AI)
- Decrease `chunkSize` (smaller embeddings)
- Increase `batchSize` (fewer API calls, if rate limits allow)
- Consider using smaller/faster models

#### For Performance Optimization
- Increase `batchSize` (parallel processing)
- Decrease `maxTextLength` (faster processing)
- Use faster AI models

### Usage

Import the configuration in any edge function:

```typescript
import { RAGConfig } from "../_shared/rag-config.ts";

// Use configuration values
const embeddingModel = RAGConfig.embedding.model;
const chunkSize = RAGConfig.processing.chunkSize;
```

### Modifying Configuration

1. Edit `rag-config.ts` with your desired values
2. Test changes with a variety of queries
3. Monitor performance and accuracy metrics
4. Commit changes to version control

All edge functions automatically use the updated configuration without needing individual updates.
