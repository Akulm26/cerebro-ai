import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Upload, Link as LinkIcon, Loader2 } from "lucide-react";

interface UploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  onUploadComplete?: () => void;
}

export const UploadDialog = ({ open, onOpenChange, userId, onUploadComplete }: UploadDialogProps) => {
  const [isUploading, setIsUploading] = useState(false);
  const [url, setUrl] = useState("");
  const { toast } = useToast();

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);

    try {
      const uploadPromises = Array.from(files).map(async (file) => {
        const { data, error } = await supabase.functions.invoke('process-document', {
          body: {
            fileName: file.name,
            fileType: file.type,
            fileSize: file.size,
            userId: userId,
          },
        });

        if (error) throw error;
        if (data.error) throw new Error(data.error);

        const documentId = data.documentId;

        // Process file content asynchronously without blocking
        const fileReader = new FileReader();
        fileReader.onload = async (event) => {
          const base64 = event.target?.result?.toString().split(',')[1];
          
          // Fire and forget - let it process in background
          supabase.functions.invoke('process-document', {
            body: {
              documentId,
              content: base64,
            },
          }).catch(console.error);
        };
        fileReader.readAsDataURL(file);
      });

      await Promise.all(uploadPromises);

      toast({
        title: "Upload started",
        description: "Your documents are being processed in the background",
      });

      e.target.value = '';
      onUploadComplete?.();
      onOpenChange(false);
    } catch (error: any) {
      toast({
        title: "Upload failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleUrlSubmit = async () => {
    if (!url.trim()) return;

    setIsUploading(true);

    try {
      const { data, error } = await supabase.functions.invoke('process-url', {
        body: {
          url: url.trim(),
          userId: userId,
        },
      });

      if (error) throw error;

      if (data.error) {
        throw new Error(data.error);
      }

      toast({
        title: "URL processing started",
        description: "The content is being fetched and processed",
      });

      setUrl("");
      onUploadComplete?.();
      onOpenChange(false);
    } catch (error: any) {
      toast({
        title: "URL processing failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Knowledge</DialogTitle>
          <DialogDescription>
            Upload documents or add URLs to your knowledge base. OCR supported for scanned PDFs and images.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="file" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="file">Upload Files</TabsTrigger>
            <TabsTrigger value="url">Add URL</TabsTrigger>
          </TabsList>

          <TabsContent value="file" className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="file">Choose files</Label>
              <Input
                id="file"
                type="file"
                multiple
                accept=".pdf,.docx,.txt,.md,.png,.jpg,.jpeg"
                onChange={handleFileUpload}
                disabled={isUploading}
              />
              <p className="text-xs text-muted-foreground">
                Supported: PDF, DOCX, TXT, MD, PNG, JPG (max 20MB each)<br />
                <span className="text-primary">✓ OCR enabled for scanned PDFs and images</span>
              </p>
            </div>
            {isUploading && (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
                <span className="ml-2 text-sm text-muted-foreground">Processing...</span>
              </div>
            )}
          </TabsContent>

          <TabsContent value="url" className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="url">URL</Label>
              <Input
                id="url"
                type="url"
                placeholder="https://example.com/article"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                disabled={isUploading}
              />
              <p className="text-xs text-muted-foreground">
                Supported: Google Docs (public), Notion pages (public), web articles
              </p>
            </div>
            <Button
              onClick={handleUrlSubmit}
              disabled={isUploading || !url.trim()}
              className="w-full bg-gradient-primary hover:opacity-90"
            >
              {isUploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing
                </>
              ) : (
                <>
                  <LinkIcon className="mr-2 h-4 w-4" />
                  Add URL
                </>
              )}
            </Button>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};