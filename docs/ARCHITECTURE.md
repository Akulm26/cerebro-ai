# Architecture Documentation

## System Overview

Cerebro is a full-stack RAG (Retrieval-Augmented Generation) application built on a modern serverless architecture. The system enables users to upload documents, process them into searchable vector embeddings, and query them using natural language.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         CLIENT LAYER                                 │
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    React Application                         │   │
│  │                                                               │   │
│  │  Components:                                                  │   │
│  │  • DocumentSidebar  → Document & folder management          │   │
│  │  • ChatInterface    → Conversation UI                        │   │
│  │  • UploadDialog     → File & URL upload                      │   │
│  │  • Auth pages       → Authentication                         │   │
│  │                                                               │   │
│  │  State Management:                                            │   │
│  │  • React hooks (useState, useEffect)                         │   │
│  │  • React Query for server state                              │   │
│  │  • localStorage for client state persistence                 │   │
│  │                                                               │   │
│  │  Styling:                                                     │   │
│  │  • Tailwind CSS with custom design tokens                    │   │
│  │  • shadcn/ui component library                               │   │
│  │  • Dark/Light theme support                                  │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              │                                       │
│                              │ HTTP/WebSocket                        │
│                              ▼                                       │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                      SUPABASE CLIENT LAYER                           │
│                                                                       │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │  @supabase/supabase-js                                        │ │
│  │                                                                │ │
│  │  • Authentication management                                  │ │
│  │  • Database queries (auto-generated TypeScript types)        │ │
│  │  • Realtime subscriptions                                     │ │
│  │  • Edge function invocations                                  │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                              │                                       │
└──────────────────────────────┼───────────────────────────────────────┘
                               │
        ┌──────────────────────┼──────────────────────┐
        │                      │                      │
        ▼                      ▼                      ▼
┌───────────────┐      ┌───────────────┐     ┌──────────────┐
│   Auth        │      │   Database    │     │    Edge      │
│   Service     │      │   (Postgres)  │     │  Functions   │
└───────────────┘      └───────────────┘     └──────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                         BACKEND LAYER                                │
│                                                                       │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │                     Supabase Auth                              │ │
│  │                                                                 │ │
│  │  • User registration & login                                   │ │
│  │  • Session management                                          │ │
│  │  • Email verification                                          │ │
│  │  • Password reset                                              │ │
│  │  • JWT token generation                                        │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                       │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │                  PostgreSQL Database                           │ │
│  │                                                                 │ │
│  │  Tables:                                                        │ │
│  │  • profiles         → User profiles                            │ │
│  │  • documents        → Document metadata                        │ │
│  │  • document_chunks  → Chunked text + vector embeddings         │ │
│  │  • conversations    → Chat sessions                            │ │
│  │  • messages         → Chat message history                     │ │
│  │                                                                 │ │
│  │  Extensions:                                                    │ │
│  │  • pgvector         → Vector similarity search                 │ │
│  │                                                                 │ │
│  │  Functions:                                                     │ │
│  │  • search_chunks()  → Cosine similarity vector search          │ │
│  │                                                                 │ │
│  │  Security:                                                      │ │
│  │  • Row-Level Security (RLS) on all tables                      │ │
│  │  • User-isolated data access                                   │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                       │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │                    Edge Functions (Deno)                       │ │
│  │                                                                 │ │
│  │  process-document:                                              │ │
│  │  • Accepts file uploads                                        │ │
│  │  • Extracts text (PDF, DOCX, images)                           │ │
│  │  • Performs OCR on images/scanned PDFs                         │ │
│  │  • Chunks text (150 words, 30 overlap)                         │ │
│  │  • Generates vector embeddings                                 │ │
│  │  • Stores in database                                          │ │
│  │                                                                 │ │
│  │  classify-topic:                                                │ │
│  │  • Analyzes document content                                   │ │
│  │  • Assigns to existing or new folder                           │ │
│  │  • Uses AI for smart classification                            │ │
│  │                                                                 │ │
│  │  process-url:                                                   │ │
│  │  • Fetches web content                                         │ │
│  │  • Extracts main text                                          │ │
│  │  • Processes like documents                                    │ │
│  │                                                                 │ │
│  │  query-rag:                                                     │ │
│  │  • Receives user questions                                     │ │
│  │  • Generates query embeddings                                  │ │
│  │  • Performs semantic search                                    │ │
│  │  • Retrieves relevant chunks                                   │ │
│  │  • Generates contextualized answer                             │ │
│  │  • Stores conversation history                                 │ │
│  └────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
                               │
                               │ HTTP API calls
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      EXTERNAL SERVICES                               │
│                                                                       │
│  ┌───────────────────────┐         ┌───────────────────────┐       │
│  │   OpenAI API          │         │   Lovable AI Gateway  │       │
│  │                       │         │                       │       │
│  │ • text-embedding-3-   │         │ • google/gemini-2.5-  │       │
│  │   small               │         │   flash               │       │
│  │ • 1536 dimensions     │         │ • Chat completions    │       │
│  │ • ~$0.02/1M tokens    │         │ • No API key needed   │       │
│  └───────────────────────┘         └───────────────────────┘       │
└─────────────────────────────────────────────────────────────────────┘
```

## Component Architecture

### Frontend Components

#### Document Management
```
DocumentSidebar
├── Document List
│   ├── Master Folders
│   │   ├── Folder Groups
│   │   │   └── Documents
│   │   └── Rename/Edit Controls
│   ├── Standalone Folders
│   │   └── Documents
│   └── Empty Folders
├── Folder Operations
│   ├── CreateFolderDialog
│   ├── MergeFoldersDialog
│   └── CreateMasterFolderDialog
└── Drag & Drop Handlers
```

#### Chat Interface
```
ChatInterface
├── Message List
│   ├── User Messages
│   └── Assistant Messages (with sources)
├── Chat Input
│   └── Send Button
└── Conversation Management
    └── Message History
```

#### Upload System
```
UploadDialog
├── File Upload Tab
│   ├── File Input (multiple)
│   └── Processing Progress
└── URL Upload Tab
    └── URL Input
```

### Backend Architecture

#### Edge Function Flow

**Document Processing Pipeline:**
```
1. Client Upload
   └─> process-document (Stage 1)
       └─> Create document record
           └─> Return documentId
       
2. Content Processing
   └─> process-document (Stage 2)
       ├─> Extract text/OCR
       ├─> classify-topic
       │   └─> AI-powered classification
       ├─> Chunk text
       ├─> Generate embeddings (OpenAI)
       └─> Store chunks with embeddings
```

**Query Processing Pipeline:**
```
User Query
└─> query-rag
    ├─> Generate query embedding (OpenAI)
    ├─> search_chunks() DB function
    │   └─> Cosine similarity search
    ├─> Rerank results by similarity
    ├─> Build context from top chunks
    ├─> Generate answer (Gemini via Lovable AI)
    └─> Store conversation messages
```

## Data Flow

### Document Upload Flow
```
1. User selects files
   ↓
2. Client creates document records
   ↓
3. Client reads files as base64
   ↓
4. Client invokes process-document (async)
   ↓
5. Edge function extracts text
   ↓
6. Edge function classifies into folder
   ↓
7. Edge function chunks text
   ↓
8. Edge function generates embeddings (batched)
   ↓
9. Edge function stores chunks + embeddings
   ↓
10. Database updates document status
    ↓
11. Realtime update notifies client
    ↓
12. UI refreshes document list
```

### Chat Query Flow
```
1. User types question
   ↓
2. Client sends to query-rag edge function
   ↓
3. Edge function generates query embedding
   ↓
4. Edge function performs vector search
   ↓
5. Database returns similar chunks
   ↓
6. Edge function reranks by similarity
   ↓
7. Edge function builds context
   ↓
8. Edge function calls Lovable AI Gateway
   ↓
9. AI generates answer with citations
   ↓
10. Edge function stores messages
    ↓
11. Client displays answer + sources
```

## Database Design

### Entity Relationships
```
users (auth.users)
  ↓ 1:1
profiles
  ↓ 1:N
  ├─> documents
  │     ↓ 1:N
  │   document_chunks
  │
  ├─> conversations
  │     ↓ 1:N
  │   messages
```

### Indexing Strategy
- **documents**: Index on `user_id`, `status`, `folder`
- **document_chunks**: Index on `user_id`, `document_id`
- **document_chunks**: HNSW index on `embedding` for vector search
- **messages**: Index on `conversation_id`, `created_at`

### Vector Search Optimization
- Uses pgvector extension with HNSW indexing
- Cosine distance for similarity (`1 - (embedding <=> query)`)
- Filters by user_id before vector search for security
- Returns top N results with similarity threshold

## Security Architecture

### Authentication Flow
```
1. User submits credentials
   ↓
2. Supabase Auth validates
   ↓
3. JWT token generated
   ↓
4. Token stored in localStorage
   ↓
5. Token included in all requests
   ↓
6. RLS policies validate token
   ↓
7. Data access granted/denied
```

### RLS Policy Structure
```sql
-- Example: documents table
CREATE POLICY "Users can view their own documents"
  ON documents FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own documents"
  ON documents FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own documents"
  ON documents FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own documents"
  ON documents FOR DELETE
  USING (auth.uid() = user_id);
```

### API Security
- Edge functions validate JWT tokens
- Service role key used only in backend
- CORS properly configured
- No direct SQL execution (uses Supabase client)
- Rate limiting via Supabase

## Scalability Considerations

### Horizontal Scaling
- Stateless edge functions scale automatically
- Database connections pooled by Supabase
- CDN caching for static assets
- Realtime connections managed by Supabase

### Performance Optimization
- Batch embedding generation (3 at a time)
- Lazy loading for documents
- Vector search with thresholds to limit results
- Chunking strategy balances context vs. performance
- Background processing for document uploads

### Cost Optimization
- Efficient chunk size (150 words)
- Batch processing reduces API calls
- Semantic search reduces irrelevant retrievals
- Lovable AI Gateway reduces direct OpenAI costs

## Technology Choices

### Why React + TypeScript?
- Type safety reduces bugs
- Large ecosystem and community
- Excellent dev tools and debugging
- Component reusability

### Why Supabase?
- Built-in authentication
- Real-time capabilities
- PostgreSQL with extensions (pgvector)
- Serverless edge functions (Deno)
- Automatic API generation
- Row-level security

### Why OpenAI Embeddings?
- High-quality embeddings (1536 dimensions)
- Good balance of cost and performance
- Well-supported and reliable
- Compatible with pgvector

### Why Gemini via Lovable AI Gateway?
- Fast response times (Flash model)
- Good reasoning capabilities
- No direct API key needed
- Cost-effective

### Why pgvector?
- Native PostgreSQL extension
- HNSW indexing for fast search
- Supports multiple distance metrics
- Battle-tested and reliable

## Deployment Architecture

### Lovable Platform
```
GitHub Repo
    ↓
Lovable Platform
    ↓
┌─────────────────────┐
│  Build Process      │
│  • npm install      │
│  • npm run build    │
│  • Deploy static    │
│  • Deploy functions │
└─────────────────────┘
    ↓
┌─────────────────────┐
│  Production         │
│  • CDN (static)     │
│  • Edge functions   │
│  • Database         │
│  • SSL/HTTPS        │
└─────────────────────┘
```

## Monitoring & Observability

### Logging Strategy
- Edge function logs in Supabase dashboard
- Client errors logged to console
- Database query logs available
- Authentication logs tracked

### Metrics to Monitor
- Document processing success/failure rates
- Average processing time per document
- Query response times
- Vector search performance
- API call costs (OpenAI)
- User session duration
- Error rates by type

### Health Checks
- Database connectivity
- Edge function availability
- External API status (OpenAI, Lovable AI)
- Authentication service status

## Future Architecture Considerations

### Potential Enhancements
1. **Caching Layer**: Redis for frequently queried chunks
2. **CDN**: Cloudflare for global edge distribution
3. **Message Queue**: For asynchronous document processing
4. **Analytics**: PostHog or similar for user behavior
5. **Monitoring**: Sentry for error tracking
6. **Load Balancer**: For high-traffic scenarios
7. **Multi-region**: Deploy edge functions globally

### Scaling Roadmap
1. **10-100 users**: Current architecture sufficient
2. **100-1000 users**: Add caching, monitoring
3. **1000-10000 users**: Multi-region deployment, dedicated DB
4. **10000+ users**: Microservices, dedicated embedding service

---

This architecture provides a solid foundation for a production RAG application with clear separation of concerns, security best practices, and room for future scaling.
