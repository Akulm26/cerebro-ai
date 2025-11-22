import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

interface CreateMasterFolderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folders: string[];
  userId: string;
  onCreateComplete: () => void;
}

export const CreateMasterFolderDialog = ({ 
  open, 
  onOpenChange, 
  folders,
  userId,
  onCreateComplete 
}: CreateMasterFolderDialogProps) => {
  const [masterFolderName, setMasterFolderName] = useState("");
  const [selectedFolders, setSelectedFolders] = useState<string[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const { toast } = useToast();

  const handleCreate = async () => {
    if (!masterFolderName.trim()) {
      toast({
        title: "Name required",
        description: "Please enter a master folder name",
        variant: "destructive",
      });
      return;
    }

    if (selectedFolders.length === 0) {
      toast({
        title: "Selection required",
        description: "Please select at least one folder to nest under the master folder",
        variant: "destructive",
      });
      return;
    }

    setIsCreating(true);

    try {
      const trimmedName = masterFolderName.trim();

      // Update all selected folders to have this master folder as parent
      for (const folder of selectedFolders) {
        // Update documents
        const { error: docError } = await supabase
          .from('documents')
          .update({ parent_folder: trimmedName })
          .eq('user_id', userId)
          .eq('folder', folder === "Uncategorized" ? null : folder);

        if (docError) throw docError;

        // Update document chunks
        const { error: chunkError } = await supabase
          .from('document_chunks')
          .update({ parent_folder: trimmedName })
          .eq('user_id', userId)
          .eq('folder', folder === "Uncategorized" ? null : folder);

        if (chunkError) throw chunkError;
      }

      toast({
        title: "Master folder created",
        description: `"${trimmedName}" now contains ${selectedFolders.length} folder(s)`,
      });

      onCreateComplete();
      onOpenChange(false);
      setMasterFolderName("");
      setSelectedFolders([]);
    } catch (error: any) {
      toast({
        title: "Creation failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsCreating(false);
    }
  };

  const toggleFolder = (folder: string) => {
    setSelectedFolders(prev => 
      prev.includes(folder) 
        ? prev.filter(f => f !== folder)
        : [...prev, folder]
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create Master Folder</DialogTitle>
          <DialogDescription>
            Create a master folder to organize multiple folders together
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">Master Folder Name</Label>
            <Input
              id="name"
              placeholder="e.g., Work Projects"
              value={masterFolderName}
              onChange={(e) => setMasterFolderName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Select folders to nest</Label>
            <div className="border rounded-md p-2 max-h-48 overflow-y-auto space-y-1">
              {folders.length === 0 ? (
                <p className="text-sm text-muted-foreground p-2">No folders available</p>
              ) : (
                folders.map((folder) => (
                  <div key={folder} className="flex items-center space-x-2 p-2 hover:bg-muted rounded">
                    <input
                      type="checkbox"
                      id={`folder-${folder}`}
                      checked={selectedFolders.includes(folder)}
                      onChange={() => toggleFolder(folder)}
                      className="w-4 h-4"
                    />
                    <label htmlFor={`folder-${folder}`} className="text-sm flex-1 cursor-pointer">
                      {folder}
                    </label>
                  </div>
                ))
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Selected: {selectedFolders.length} folder(s)
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isCreating}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={isCreating || !masterFolderName.trim() || selectedFolders.length === 0}>
            {isCreating ? (
              <>
                <Loader2 className="mr-2 w-4 h-4 animate-spin" />
                Creating...
              </>
            ) : (
              "Create Master Folder"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};