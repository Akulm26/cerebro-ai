# API Documentation

This document details all edge functions and their APIs.

## Base URL

All edge functions are accessed via:
```
https://[project-id].supabase.co/functions/v1/[function-name]
```

## Authentication

All requests require authentication via Supabase Auth JWT token:
```
Authorization: Bearer <JWT_TOKEN>
```

The token is automatically included when using the Supabase client:
```typescript
import { supabase } from '@/integrations/supabase/client';

const { data, error } = await supabase.functions.invoke('function-name', {
  body: { /* payload */ }
});
```

## Edge Functions

### 1. process-document

Handles document upload and processing in two stages.

#### Stage 1: Create Document Record

Creates an initial document entry in the database.

**Endpoint**: `POST /functions/v1/process-document`

**Request Body**:
```json
{
  "fileName": "document.pdf",
  "fileType": "application/pdf",
  "fileSize": 1234567,
  "userId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Response**:
```json
{
  "documentId": "123e4567-e89b-12d3-a456-426614174000"
}
```

**Status Codes**:
- `200`: Success
- `400`: Invalid request
- `401`: Unauthorized
- `500`: Server error

---

#### Stage 2: Process Document Content

Processes the document content through extraction, chunking, embedding, and storage.

**Endpoint**: `POST /functions/v1/process-document`

**Request Body**:
```json
{
  "documentId": "123e4567-e89b-12d3-a456-426614174000",
  "content": "base64_encoded_file_content",
  "fileName": "document.pdf",
  "fileType": "application/pdf"
}
```

**Response**:
```json
{
  "success": true
}
```

**Processing Steps**:
1. **Text Extraction**
   - PDF: Uses pdf-parse library
   - DOCX: Uses mammoth library
   - Images: AI vision analysis with OCR fallback
   - Plain text: Direct decoding

2. **Classification** (via classify-topic)
   - Analyzes first 2000 characters
   - Matches to existing folders or creates new
   - Returns folder name

3. **Chunking**
   - Chunk size: 150 words
   - Overlap: 30 words
   - Preserves context across boundaries

4. **Embedding Generation**
   - Model: OpenAI text-embedding-3-small
   - Dimensions: 1536
   - Batch size: 3 chunks per API call
   - Encoding: float

5. **Storage**
   - Inserts chunks with embeddings to document_chunks table
   - Updates document status to 'ready'
   - Sets chunk_count, text_length, folder

**Progress Updates**:
The function updates `processing_progress` (0-100) and `processing_stage`:
- `10%`: extracting
- `33%`: chunking
- `50%`: embedding
- `50-95%`: embedding (incremental)
- `100%`: complete

**Error Handling**:
```json
{
  "error": "Error message",
  "status": "error"
}
```

Updates document record with error status and message.

**Supported File Types**:
- `application/pdf`
- `application/vnd.openxmlformats-officedocument.wordprocessingml.document` (DOCX)
- `text/plain`
- `text/markdown`
- `image/png`, `image/jpeg`, `image/jpg`

---

### 2. classify-topic

Classifies document content into appropriate folders using AI.

**Endpoint**: `POST /functions/v1/classify-topic`

**Request Body**:
```json
{
  "text": "The strategic plan outlines our company's vision...",
  "fileName": "Strategic Plan 2024.pdf",
  "existingFolders": ["Strategy", "Research", "Marketing"]
}
```

**Parameters**:
- `text` (string, required): Document content sample (first 2000 chars)
- `fileName` (string, required): Original file name
- `existingFolders` (array, optional): List of existing folder names

**Response**:
```json
{
  "folder": "Strategy"
}
```

**Classification Logic**:
1. Prefers matching to existing folders
2. Creates new folder only if content doesn't fit existing ones
3. Falls back to "Uncategorized" on error

**AI Model**: google/gemini-2.5-flash via Lovable AI Gateway

**Prompt Strategy**:
```
If existing folders provided:
  "IMPORTANT: The user already has these folders - PREFER matching 
   to one of these if relevant: [folder list]
   Only create a new folder name if the document clearly does not 
   fit any existing folder."

If no existing folders:
  "Common categories: Work Notes, Research, AI & ML, Product Management,
   User Research, Engineering, Design, Marketing, Sales, Finance, Legal,
   HR, Personal, Meeting Notes, Projects, Ideas, Learning, Reference,
   Documentation, Reports, Strategy, Planning, Templates, OS, Misc."
```

**Status Codes**:
- `200`: Success (always returns 200, even on classification failure)
- `500`: Server error (rare, returns "Uncategorized")

---

### 3. process-url

Fetches and processes content from web URLs.

**Endpoint**: `POST /functions/v1/process-url`

**Request Body**:
```json
{
  "url": "https://example.com/article",
  "userId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Parameters**:
- `url` (string, required): Valid HTTP/HTTPS URL
- `userId` (string, required): User UUID

**Response**:
```json
{
  "documentId": "123e4567-e89b-12d3-a456-426614174000",
  "status": "processing"
}
```

**Processing Flow**:
1. Validates URL format
2. Fetches web content
3. Extracts main text content
4. Creates document record
5. Processes like uploaded files (via process-document)

**Supported URLs**:
- Standard web pages
- Google Docs (public)
- Notion pages (public)
- Blog articles
- Documentation pages

**Status Codes**:
- `200`: Success
- `400`: Invalid URL
- `401`: Unauthorized
- `403`: URL not accessible
- `500`: Server error

**Error Response**:
```json
{
  "error": "Failed to fetch URL content"
}
```

---

### 4. query-rag

Answers questions using Retrieval-Augmented Generation.

**Endpoint**: `POST /functions/v1/query-rag`

**Request Body**:
```json
{
  "query": "What is our main business strategy for 2024?",
  "conversationId": "123e4567-e89b-12d3-a456-426614174000",
  "userId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Parameters**:
- `query` (string, required): User's question
- `conversationId` (string, required): Conversation UUID
- `userId` (string, required): User UUID

**Response**:
```json
{
  "answer": "Based on your Strategy.pdf document, the main business strategy for 2024 focuses on three key pillars:\n\n1. **Market Expansion**: Targeting new geographical regions...\n\n2. **Product Innovation**: Developing next-generation features...\n\n3. **Customer Success**: Investing in support infrastructure...",
  "sources": [
    {
      "chunk_text": "Our 2024 strategy emphasizes market expansion...",
      "document_id": "doc-uuid-1",
      "chunk_index": 5,
      "similarity": 0.87,
      "metadata": {
        "file_name": "Strategy.pdf",
        "folder": "Strategy"
      }
    },
    {
      "chunk_text": "Product innovation roadmap includes...",
      "document_id": "doc-uuid-2",
      "chunk_index": 12,
      "similarity": 0.82,
      "metadata": {
        "file_name": "Product Roadmap 2024.pdf",
        "folder": "Strategy"
      }
    }
  ]
}
```

**Processing Pipeline**:

1. **Query Embedding** (OpenAI)
```
User Query → text-embedding-3-small → 1536-dim vector
```

2. **Semantic Search** (PostgreSQL + pgvector)
```sql
-- Called via search_chunks() function
SELECT *
FROM document_chunks
WHERE user_id = $userId
  AND 1 - (embedding <=> $queryEmbedding) > 0.25
ORDER BY embedding <=> $queryEmbedding
LIMIT 15
```

3. **Reranking**
```
Filter: similarity >= 0.28
Sort: by similarity descending
Take: top 8 chunks
```

4. **Context Building**
```
Format each chunk as:
[Source 1 - filename.pdf]
chunk_text

[Source 2 - document.docx]
chunk_text
...
```

5. **Answer Generation** (Lovable AI Gateway)
```
Model: google/gemini-2.5-flash
System Prompt: "You are Cerebro, an intelligent knowledge assistant..."
User Prompt: Context + Question
```

6. **Message Storage**
```
Store user message → messages table
Store assistant message → messages table
```

**Search Configuration**:
```typescript
{
  match_threshold: 0.25,    // Initial similarity threshold
  match_count: 15,           // Candidate chunks to retrieve
  filter_threshold: 0.28,    // Post-retrieval filter
  top_k: 8                   // Final chunks for context
}
```

**System Prompt**:
```
You are Cerebro, an intelligent knowledge assistant that helps users 
find information in their documents.

RESPONSE GUIDELINES:
1. Answer directly and comprehensively using information from the 
   provided context
2. Structure your response with clear paragraphs and bullet points when 
   appropriate
3. Cite specific documents/folders when referencing information 
   (e.g., "According to Strategy.pdf...")
4. If the context partially answers the question, provide what you can 
   and note what's missing
5. Only say you don't have information if the context is completely 
   irrelevant
6. Use a professional but conversational tone
7. For complex queries, break down the answer into logical sections

IMPORTANT:
- Be thorough - use all relevant information from the context
- Make connections between different pieces of information when relevant
- If asked about multiple topics, address each one systematically
```

**Error Responses**:

No relevant documents:
```json
{
  "answer": "I don't have any information to answer that question. Could you upload more relevant documents or rephrase your question?",
  "sources": []
}
```

Processing error:
```json
{
  "error": "Failed to process query",
  "details": "Error message"
}
```

**Status Codes**:
- `200`: Success
- `400`: Missing required fields
- `401`: Unauthorized
- `500`: Server error

---

## Database Functions

### search_chunks

PostgreSQL function for vector similarity search.

**Function Signature**:
```sql
search_chunks(
  query_embedding vector(1536),
  match_threshold double precision,
  match_count integer,
  filter_user_id uuid
) RETURNS TABLE (
  id uuid,
  document_id uuid,
  chunk_text text,
  chunk_index integer,
  similarity double precision,
  metadata jsonb
)
```

**Usage Example**:
```typescript
const { data: chunks, error } = await supabase.rpc('search_chunks', {
  query_embedding: embeddingVector,
  match_threshold: 0.25,
  match_count: 15,
  filter_user_id: userId,
});
```

**Returns**:
Array of chunks sorted by similarity (descending)

**Performance**:
- Uses HNSW index for fast approximate nearest neighbor search
- Cosine similarity metric: `1 - (embedding <=> query)`
- Filters by user_id before vector search for security
- Typical query time: 10-50ms for 10K-100K chunks

---

## Rate Limits

### Supabase Default Limits
- **API Requests**: 500 requests per second (per project)
- **Database Connections**: 60 concurrent connections
- **Edge Function Invocations**: 500K per month (free tier)
- **Edge Function Memory**: 512MB per invocation
- **Edge Function Timeout**: 60 seconds

### External API Limits

**OpenAI Embeddings**:
- Tier 1: 3,000 requests per minute (RPM)
- Tier 1: 1,000,000 tokens per minute (TPM)
- Can request tier upgrade

**Lovable AI Gateway**:
- No published rate limits
- Usage-based billing

---

## Error Codes

### Common Error Codes

| Code | Description | Common Cause |
|------|-------------|--------------|
| 400 | Bad Request | Missing/invalid parameters |
| 401 | Unauthorized | Invalid/missing JWT token |
| 403 | Forbidden | RLS policy denied access |
| 404 | Not Found | Resource doesn't exist |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Function crashed |
| 503 | Service Unavailable | Database/service down |

### Custom Error Messages

**Document Processing**:
```json
{
  "error": "OpenAI API key is invalid or missing"
}
```
```json
{
  "error": "Could not extract text from PDF - file may be empty or corrupted"
}
```
```json
{
  "error": "OpenAI API rate limit exceeded - please try again later"
}
```

**Query Processing**:
```json
{
  "error": "Failed to generate answer: 503"
}
```

---

## Testing

### cURL Examples

**Upload Document (Stage 1)**:
```bash
curl -X POST \
  https://[project-id].supabase.co/functions/v1/process-document \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "fileName": "test.pdf",
    "fileType": "application/pdf",
    "fileSize": 12345,
    "userId": "user-uuid"
  }'
```

**Query RAG**:
```bash
curl -X POST \
  https://[project-id].supabase.co/functions/v1/query-rag \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "What is the main topic?",
    "conversationId": "conv-uuid",
    "userId": "user-uuid"
  }'
```

### Postman Collection

A Postman collection is available at `docs/postman_collection.json` with example requests for all endpoints.

---

## Webhooks

Currently, the application does not expose webhooks. All communication is request-response based.

Future webhook support planned for:
- Document processing completion
- Batch processing status
- Custom integrations

---

## Versioning

Current API version: **v1**

All endpoints are prefixed with `/functions/v1/`

Breaking changes will be introduced in new versions (v2, v3, etc.) with backward compatibility maintained for at least 6 months.

---

## Support

For API issues or questions:
- Check function logs in Supabase dashboard
- Review edge function code in `supabase/functions/`
- Open an issue on GitHub
- Check network requests in browser DevTools

---

**Last Updated**: 2024-01-20
