-- Add parent_folder column to documents table for hierarchical folders
ALTER TABLE public.documents 
ADD COLUMN parent_folder text;

-- Add parent_folder column to document_chunks table to match
ALTER TABLE public.document_chunks 
ADD COLUMN parent_folder text;

-- Create index for faster parent folder queries
CREATE INDEX idx_documents_parent_folder ON public.documents(parent_folder);
CREATE INDEX idx_document_chunks_parent_folder ON public.document_chunks(parent_folder);