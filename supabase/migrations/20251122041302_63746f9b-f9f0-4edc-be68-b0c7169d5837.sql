-- Add folder/topic organization to documents
ALTER TABLE documents 
ADD COLUMN IF NOT EXISTS folder text,
ADD COLUMN IF NOT EXISTS source_type text DEFAULT 'file';

-- Add index for folder queries
CREATE INDEX IF NOT EXISTS idx_documents_folder ON documents(folder);
CREATE INDEX IF NOT EXISTS idx_documents_source_type ON documents(source_type);

-- Update document_chunks to include folder for better querying
ALTER TABLE document_chunks
ADD COLUMN IF NOT EXISTS folder text;

-- Create index on folder in chunks for faster retrieval
CREATE INDEX IF NOT EXISTS idx_chunks_folder ON document_chunks(folder);