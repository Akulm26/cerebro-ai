# Database Schema Documentation

## Overview

The application uses PostgreSQL with the pgvector extension for vector similarity search. All tables implement Row-Level Security (RLS) to ensure user data isolation.

## Database Extensions

```sql
-- Enable vector extension for embeddings
CREATE EXTENSION IF NOT EXISTS vector;
```

## Tables

### profiles

Stores user profile information, created automatically on user signup.

**Schema**:
```sql
CREATE TABLE profiles (
  id uuid PRIMARY KEY,  -- Matches auth.users.id
  email text NOT NULL,
  full_name text,
  avatar_url text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
```

**Indexes**:
```sql
CREATE INDEX idx_profiles_id ON profiles(id);
```

**RLS Policies**:
```sql
-- Users can view their own profile
CREATE POLICY "Users can view their own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

-- Users can update their own profile
CREATE POLICY "Users can update their own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- Users can insert their own profile
CREATE POLICY "Users can insert their own profile"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);
```

**Triggers**:
```sql
-- Auto-update updated_at
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

---

### documents

Stores document metadata and processing status.

**Schema**:
```sql
CREATE TABLE documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id),
  file_name text NOT NULL,
  file_type text NOT NULL,
  file_size bigint,
  status text NOT NULL DEFAULT 'processing',
  folder text,
  parent_folder text,
  chunk_count integer DEFAULT 0,
  text_length integer,
  processing_progress integer DEFAULT 0,
  processing_stage text DEFAULT 'pending',
  error_message text,
  content_url text,
  source_type text DEFAULT 'file',
  metadata jsonb DEFAULT '{}'::jsonb,
  upload_date timestamp with time zone NOT NULL DEFAULT now(),
  created_date timestamp with time zone
);
```

**Indexes**:
```sql
CREATE INDEX idx_documents_user_id ON documents(user_id);
CREATE INDEX idx_documents_status ON documents(status);
CREATE INDEX idx_documents_folder ON documents(folder);
CREATE INDEX idx_documents_parent_folder ON documents(parent_folder);
CREATE INDEX idx_documents_upload_date ON documents(upload_date DESC);
```

**Status Values**:
- `processing`: Document is being processed
- `ready`: Document is processed and searchable
- `error`: Processing failed

**Processing Stages**:
- `pending`: Waiting to start
- `extracting`: Extracting text from file
- `chunking`: Splitting text into chunks
- `embedding`: Generating vector embeddings
- `complete`: All processing done

**RLS Policies**:
```sql
-- Users can view their own documents
CREATE POLICY "Users can view their own documents"
  ON documents FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own documents
CREATE POLICY "Users can insert their own documents"
  ON documents FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own documents
CREATE POLICY "Users can update their own documents"
  ON documents FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own documents
CREATE POLICY "Users can delete their own documents"
  ON documents FOR DELETE
  USING (auth.uid() = user_id);
```

**Example Data**:
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "user_id": "user-uuid",
  "file_name": "Strategy.pdf",
  "file_type": "application/pdf",
  "file_size": 1234567,
  "status": "ready",
  "folder": "Strategy",
  "parent_folder": null,
  "chunk_count": 45,
  "text_length": 15000,
  "processing_progress": 100,
  "processing_stage": "complete",
  "error_message": null,
  "source_type": "file",
  "upload_date": "2024-01-15T10:30:00Z"
}
```

---

### document_chunks

Stores chunked document text with vector embeddings.

**Schema**:
```sql
CREATE TABLE document_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id),
  chunk_text text NOT NULL,
  chunk_index integer NOT NULL,
  token_count integer,
  embedding vector(1536),  -- OpenAI text-embedding-3-small
  folder text,
  parent_folder text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
```

**Indexes**:
```sql
CREATE INDEX idx_chunks_document_id ON document_chunks(document_id);
CREATE INDEX idx_chunks_user_id ON document_chunks(user_id);
CREATE INDEX idx_chunks_folder ON document_chunks(folder);

-- HNSW index for fast vector similarity search
CREATE INDEX idx_chunks_embedding ON document_chunks 
USING hnsw (embedding vector_cosine_ops);
```

**HNSW Index Parameters**:
- **Method**: HNSW (Hierarchical Navigable Small World)
- **Distance Metric**: Cosine similarity
- **Build Time**: O(n log n)
- **Query Time**: O(log n)
- **Space Complexity**: O(n)

**RLS Policies**:
```sql
-- Users can view their own chunks
CREATE POLICY "Users can view their own chunks"
  ON document_chunks FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own chunks
CREATE POLICY "Users can insert their own chunks"
  ON document_chunks FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own chunks
CREATE POLICY "Users can delete their own chunks"
  ON document_chunks FOR DELETE
  USING (auth.uid() = user_id);
```

**Chunking Strategy**:
- **Chunk Size**: 150 words (~200 tokens)
- **Overlap**: 30 words between consecutive chunks
- **Reasoning**: Balances context preservation with search granularity

**Example Data**:
```json
{
  "id": "chunk-uuid",
  "document_id": "doc-uuid",
  "user_id": "user-uuid",
  "chunk_text": "Our business strategy for 2024 focuses on three key pillars: market expansion, product innovation, and customer success. We plan to enter new geographical markets...",
  "chunk_index": 5,
  "token_count": 180,
  "embedding": [0.023, -0.015, 0.041, ...],  // 1536 dimensions
  "folder": "Strategy",
  "parent_folder": null,
  "metadata": {
    "file_name": "Strategy.pdf",
    "folder": "Strategy"
  },
  "created_at": "2024-01-15T10:35:00Z"
}
```

---

### conversations

Stores chat conversation sessions.

**Schema**:
```sql
CREATE TABLE conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id),
  title text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
```

**Indexes**:
```sql
CREATE INDEX idx_conversations_user_id ON conversations(user_id);
CREATE INDEX idx_conversations_updated_at ON conversations(updated_at DESC);
```

**RLS Policies**:
```sql
-- Users can view their own conversations
CREATE POLICY "Users can view their own conversations"
  ON conversations FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own conversations
CREATE POLICY "Users can insert their own conversations"
  ON conversations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own conversations
CREATE POLICY "Users can update their own conversations"
  ON conversations FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own conversations
CREATE POLICY "Users can delete their own conversations"
  ON conversations FOR DELETE
  USING (auth.uid() = user_id);
```

**Triggers**:
```sql
-- Auto-update updated_at
CREATE TRIGGER update_conversations_updated_at
  BEFORE UPDATE ON conversations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

---

### messages

Stores individual chat messages within conversations.

**Schema**:
```sql
CREATE TABLE messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id),
  role text NOT NULL,  -- 'user' | 'assistant'
  content text NOT NULL,
  sources jsonb DEFAULT '[]'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
```

**Indexes**:
```sql
CREATE INDEX idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX idx_messages_user_id ON messages(user_id);
CREATE INDEX idx_messages_created_at ON messages(created_at DESC);
```

**RLS Policies**:
```sql
-- Users can view their own messages
CREATE POLICY "Users can view their own messages"
  ON messages FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own messages
CREATE POLICY "Users can insert their own messages"
  ON messages FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own messages
CREATE POLICY "Users can delete their own messages"
  ON messages FOR DELETE
  USING (auth.uid() = user_id);
```

**Sources Format**:
```json
{
  "sources": [
    {
      "chunk_text": "...",
      "document_id": "uuid",
      "chunk_index": 5,
      "similarity": 0.87,
      "metadata": {
        "file_name": "Strategy.pdf",
        "folder": "Strategy"
      }
    }
  ]
}
```

---

## Database Functions

### search_chunks

Performs vector similarity search on document chunks.

**Function Definition**:
```sql
CREATE OR REPLACE FUNCTION search_chunks(
  query_embedding vector(1536),
  match_threshold double precision,
  match_count integer,
  filter_user_id uuid
)
RETURNS TABLE (
  id uuid,
  document_id uuid,
  chunk_text text,
  chunk_index integer,
  similarity double precision,
  metadata jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    document_chunks.id,
    document_chunks.document_id,
    document_chunks.chunk_text,
    document_chunks.chunk_index,
    1 - (document_chunks.embedding <=> query_embedding) as similarity,
    document_chunks.metadata
  FROM document_chunks
  WHERE document_chunks.user_id = filter_user_id
    AND 1 - (document_chunks.embedding <=> query_embedding) > match_threshold
  ORDER BY document_chunks.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
```

**Parameters**:
- `query_embedding`: 1536-dimensional vector from query
- `match_threshold`: Minimum similarity score (0-1)
- `match_count`: Maximum number of results
- `filter_user_id`: User UUID for security

**Returns**:
- `id`: Chunk UUID
- `document_id`: Parent document UUID
- `chunk_text`: The actual text content
- `chunk_index`: Position in original document
- `similarity`: Cosine similarity score (0-1)
- `metadata`: Additional chunk metadata

**Performance**:
- Uses HNSW index for O(log n) search
- Typical query time: 10-50ms
- Scales to millions of chunks

**Usage Example**:
```sql
SELECT * FROM search_chunks(
  '[0.023, -0.015, ...]'::vector,  -- query embedding
  0.25,                              -- minimum similarity
  15,                                -- max results
  'user-uuid'::uuid                  -- user filter
);
```

### update_updated_at_column

Trigger function to automatically update `updated_at` timestamps.

**Function Definition**:
```sql
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
```

**Applied to**:
- `profiles.updated_at`
- `conversations.updated_at`

### handle_new_user

Trigger function to create profile when user signs up.

**Function Definition**:
```sql
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', '')
  );
  RETURN NEW;
END;
$$;
```

**Trigger**:
```sql
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();
```

---

## Entity Relationship Diagram

```
┌──────────────┐
│  auth.users  │ (Managed by Supabase Auth)
└──────┬───────┘
       │ 1:1
       ▼
┌──────────────┐
│   profiles   │
└──────┬───────┘
       │ 1:N
       ├─────────────────┬─────────────────┐
       ▼                 ▼                 ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│  documents   │  │conversations │  │              │
└──────┬───────┘  └──────┬───────┘  │              │
       │ 1:N             │ 1:N       │              │
       ▼                 ▼           │              │
┌──────────────┐  ┌──────────────┐  │              │
│document_     │  │   messages   │◄─┘              │
│chunks        │  └──────────────┘                 │
└──────────────┘                                   │
       │                                            │
       │ References documents.id                   │
       └────────────────────────────────────────────┘
```

---

## Data Lifecycle

### Document Upload & Processing
```
1. User uploads file
   └─> INSERT INTO documents (status='processing')
   
2. Backend processes file
   └─> UPDATE documents SET processing_progress=...
   
3. Chunks generated
   └─> INSERT INTO document_chunks (batch of 3)
   
4. Processing complete
   └─> UPDATE documents SET status='ready'
```

### Document Deletion
```
1. User deletes document
   └─> DELETE FROM document_chunks WHERE document_id=...
   └─> DELETE FROM documents WHERE id=...
   
   (CASCADE automatically deletes chunks)
```

### Conversation Flow
```
1. User starts chat
   └─> INSERT INTO conversations
   
2. User sends message
   └─> INSERT INTO messages (role='user')
   
3. System responds
   └─> INSERT INTO messages (role='assistant', sources=[...])
```

---

## Maintenance

### Vacuum Strategy
```sql
-- Regular vacuum to reclaim space
VACUUM ANALYZE document_chunks;
VACUUM ANALYZE documents;
VACUUM ANALYZE messages;
```

### Index Maintenance
```sql
-- Rebuild HNSW index if query performance degrades
REINDEX INDEX idx_chunks_embedding;
```

### Monitoring Queries

**Check table sizes**:
```sql
SELECT 
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

**Check index usage**:
```sql
SELECT
  schemaname,
  tablename,
  indexname,
  idx_scan,
  idx_tup_read,
  idx_tup_fetch
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY idx_scan DESC;
```

**Check embedding quality**:
```sql
-- Average similarity of top matches
SELECT 
  AVG(similarity) as avg_similarity,
  MIN(similarity) as min_similarity,
  MAX(similarity) as max_similarity
FROM (
  SELECT 
    1 - (embedding <=> '[...]'::vector) as similarity
  FROM document_chunks
  ORDER BY embedding <=> '[...]'::vector
  LIMIT 10
) subquery;
```

---

## Backup & Recovery

### Automated Backups (Supabase)
- Daily full backups (retained for 7 days on free tier)
- Point-in-time recovery available on paid plans
- Backups stored in separate region for disaster recovery

### Manual Backup
```bash
# Export specific tables
pg_dump -h [db_host] -U postgres \
  -t public.documents \
  -t public.document_chunks \
  -t public.conversations \
  -t public.messages \
  -t public.profiles \
  > backup.sql

# Export with data
pg_dump -h [db_host] -U postgres \
  --data-only \
  -t public.documents \
  > data_backup.sql
```

### Restore
```bash
# Restore from backup
psql -h [db_host] -U postgres < backup.sql
```

---

## Security Best Practices

### RLS Enforcement
```sql
-- Enable RLS on all user tables
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
```

### Secure Functions
```sql
-- Use SECURITY DEFINER sparingly
-- Always set search_path
CREATE FUNCTION example()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Function body
END;
$$;
```

### API Access
- Service role key only in backend functions
- Anon key for client-side access
- JWT validation on all requests
- RLS policies enforce user isolation

---

## Migration Guide

### Adding New Tables
```sql
-- 1. Create table
CREATE TABLE new_table (...);

-- 2. Enable RLS
ALTER TABLE new_table ENABLE ROW LEVEL SECURITY;

-- 3. Create policies
CREATE POLICY "user_policy" ON new_table
  FOR ALL USING (auth.uid() = user_id);

-- 4. Create indexes
CREATE INDEX idx_new_table_user_id ON new_table(user_id);

-- 5. Update TypeScript types
-- Run: npx supabase gen types typescript --project-id [id]
```

### Modifying Existing Tables
```sql
-- Add column
ALTER TABLE documents ADD COLUMN new_field text;

-- Add index
CREATE INDEX idx_documents_new_field ON documents(new_field);

-- Update RLS policies if needed
DROP POLICY IF EXISTS "old_policy" ON documents;
CREATE POLICY "new_policy" ON documents ...;
```

---

**Last Updated**: 2024-01-20
