-- Add progress tracking fields to documents table
ALTER TABLE documents 
ADD COLUMN IF NOT EXISTS processing_progress INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS processing_stage TEXT DEFAULT 'pending';

-- Add comment for clarity
COMMENT ON COLUMN documents.processing_progress IS 'Progress percentage (0-100) for document processing';
COMMENT ON COLUMN documents.processing_stage IS 'Current processing stage: pending, extracting, chunking, embedding, complete';