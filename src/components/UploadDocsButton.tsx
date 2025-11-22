import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FileText, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export const UploadDocsButton = ({ userId }: { userId: string }) => {
  const [isUploading, setIsUploading] = useState(false);
  const { toast } = useToast();

  const uploadDocumentation = async () => {
    setIsUploading(true);
    
    try {
      // Fetch the architecture documentation
      const response = await fetch('/docs/ARCHITECTURE.md');
      const content = await response.text();
      
      if (!content || content.length < 100) {
        throw new Error('Failed to load documentation');
      }

      // Create document record
      const { data: doc, error: docError } = await supabase
        .from('documents')
        .insert({
          user_id: userId,
          file_name: 'ARCHITECTURE.md',
          file_type: 'text/markdown',
          status: 'processing',
          folder: 'Documentation',
          source_type: 'file',
        })
        .select()
        .single();

      if (docError) throw docError;

      // Process the document
      const { error: processError } = await supabase.functions.invoke('process-document', {
        body: {
          documentId: doc.id,
          content: btoa(unescape(encodeURIComponent(content))),
          fileName: 'ARCHITECTURE.md',
          fileType: 'text/markdown',
          userId: userId,
        }
      });

      if (processError) throw processError;

      toast({
        title: "Documentation uploaded",
        description: "Architecture documentation has been added to your knowledge base",
      });
    } catch (error) {
      console.error('Upload error:', error);
      toast({
        title: "Upload failed",
        description: error instanceof Error ? error.message : "Failed to upload documentation",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Button
      onClick={uploadDocumentation}
      disabled={isUploading}
      variant="outline"
      size="sm"
      className="gap-2"
    >
      {isUploading ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          Uploading...
        </>
      ) : (
        <>
          <FileText className="h-4 w-4" />
          Add Architecture Docs
        </>
      )}
    </Button>
  );
};
