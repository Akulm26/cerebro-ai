import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

interface MergeFoldersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folders: string[];
  userId: string;
  onMergeComplete: () => void;
}

export const MergeFoldersDialog = ({ 
  open, 
  onOpenChange, 
  folders,
  userId,
  onMergeComplete 
}: MergeFoldersDialogProps) => {
  const [sourceFolder, setSourceFolder] = useState<string>("");
  const [targetFolder, setTargetFolder] = useState<string>("");
  const [isMerging, setIsMerging] = useState(false);
  const { toast } = useToast();

  const handleMerge = async () => {
    if (!sourceFolder || !targetFolder) {
      toast({
        title: "Selection required",
        description: "Please select both source and target folders",
        variant: "destructive",
      });
      return;
    }

    if (sourceFolder === targetFolder) {
      toast({
        title: "Invalid selection",
        description: "Source and target folders must be different",
        variant: "destructive",
      });
      return;
    }

    setIsMerging(true);

    try {
      // Update documents
      const { error: docError } = await supabase
        .from('documents')
        .update({ 
          folder: targetFolder === "Uncategorized" ? null : targetFolder 
        })
        .eq('user_id', userId)
        .eq('folder', sourceFolder === "Uncategorized" ? null : sourceFolder);

      if (docError) throw docError;

      // Update document chunks
      const { error: chunkError } = await supabase
        .from('document_chunks')
        .update({ 
          folder: targetFolder === "Uncategorized" ? null : targetFolder 
        })
        .eq('user_id', userId)
        .eq('folder', sourceFolder === "Uncategorized" ? null : sourceFolder);

      if (chunkError) throw chunkError;

      toast({
        title: "Folders merged",
        description: `All documents from "${sourceFolder}" moved to "${targetFolder}"`,
      });

      onMergeComplete();
      onOpenChange(false);
      setSourceFolder("");
      setTargetFolder("");
    } catch (error: any) {
      toast({
        title: "Merge failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsMerging(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Merge Folders</DialogTitle>
          <DialogDescription>
            Move all documents from one folder into another. The source folder will be removed.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="source">Source Folder (will be removed)</Label>
            <Select value={sourceFolder} onValueChange={setSourceFolder}>
              <SelectTrigger id="source">
                <SelectValue placeholder="Select source folder" />
              </SelectTrigger>
              <SelectContent>
                {folders.map((folder) => (
                  <SelectItem key={folder} value={folder}>
                    {folder}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="target">Target Folder (keep documents here)</Label>
            <Select value={targetFolder} onValueChange={setTargetFolder}>
              <SelectTrigger id="target">
                <SelectValue placeholder="Select target folder" />
              </SelectTrigger>
              <SelectContent>
                {folders.map((folder) => (
                  <SelectItem key={folder} value={folder}>
                    {folder}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isMerging}>
            Cancel
          </Button>
          <Button onClick={handleMerge} disabled={isMerging || !sourceFolder || !targetFolder}>
            {isMerging ? (
              <>
                <Loader2 className="mr-2 w-4 h-4 animate-spin" />
                Merging...
              </>
            ) : (
              "Merge Folders"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};