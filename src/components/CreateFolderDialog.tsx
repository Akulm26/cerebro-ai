import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

interface CreateFolderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingFolders: string[];
  onFolderCreate: (folderName: string) => void;
}

export const CreateFolderDialog = ({ 
  open, 
  onOpenChange, 
  existingFolders,
  onFolderCreate 
}: CreateFolderDialogProps) => {
  const [folderName, setFolderName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const { toast } = useToast();

  const handleCreate = async () => {
    const trimmedName = folderName.trim();
    
    if (!trimmedName) {
      toast({
        title: "Name required",
        description: "Please enter a folder name",
        variant: "destructive",
      });
      return;
    }

    if (existingFolders.includes(trimmedName)) {
      toast({
        title: "Folder exists",
        description: "A folder with this name already exists",
        variant: "destructive",
      });
      return;
    }

    setIsCreating(true);

    try {
      onFolderCreate(trimmedName);
      
      toast({
        title: "Folder created",
        description: `"${trimmedName}" is ready for documents`,
      });

      onOpenChange(false);
      setFolderName("");
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create New Folder</DialogTitle>
          <DialogDescription>
            Create an empty folder to organize your documents. Drag documents into it or select it when uploading.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">Folder Name</Label>
            <Input
              id="name"
              placeholder="e.g., Research Papers"
              value={folderName}
              onChange={(e) => setFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleCreate();
                }
              }}
              autoFocus
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isCreating}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={isCreating || !folderName.trim()}>
            {isCreating ? (
              <>
                <Loader2 className="mr-2 w-4 h-4 animate-spin" />
                Creating...
              </>
            ) : (
              "Create Folder"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};