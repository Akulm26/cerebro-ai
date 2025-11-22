import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";
import { FileText, Loader2, Trash2, AlertCircle, RefreshCw, Link as LinkIcon, Image, FileType, ChevronDown, ChevronRight, Folder, Edit2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Document {
  id: string;
  file_name: string;
  file_type: string;
  status: string;
  upload_date: string;
  chunk_count: number;
  error_message: string | null;
  folder: string | null;
}

interface FolderGroup {
  folder: string;
  documents: Document[];
}

export const DocumentSidebar = ({ userId }: { userId: string }) => {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  const [renamingFolder, setRenamingFolder] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState("");
  const [isRenaming, setIsRenaming] = useState(false);
  const { toast } = useToast();

  const getDocumentIcon = (doc: Document) => {
    // Check if it's a URL
    if (doc.file_type === 'url' || doc.file_name.startsWith('http')) {
      return <LinkIcon className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />;
    }
    
    // Check if it's an image
    if (doc.file_type.includes('image') || /\.(jpg|jpeg|png|gif|webp)$/i.test(doc.file_name)) {
      return <Image className="w-4 h-4 text-purple-500 flex-shrink-0 mt-0.5" />;
    }
    
    // Default to document icon for PDFs and other files
    return <FileType className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />;
  };

  const toggleFolder = (folderName: string) => {
    setExpandedFolders(prev => ({
      ...prev,
      [folderName]: !prev[folderName]
    }));
  };

  const handleRenameFolder = async () => {
    if (!renamingFolder || !newFolderName.trim()) return;

    const trimmedName = newFolderName.trim();
    const isUncategorized = renamingFolder === 'Uncategorized';

    // Optimistically update UI so the app feels instant
    setIsRenaming(true);
    setDocuments(prev =>
      prev.map(doc =>
        doc.folder === trimmedName
          ? doc
          : (isUncategorized && doc.folder === null) || doc.folder === renamingFolder
            ? { ...doc, folder: trimmedName }
            : doc
      )
    );

    try {
      let docsQuery = supabase
        .from('documents')
        .update({ folder: trimmedName })
        .eq('user_id', userId);

      let chunksQuery = supabase
        .from('document_chunks')
        .update({ folder: trimmedName })
        .eq('user_id', userId);

      if (isUncategorized) {
        docsQuery = docsQuery.is('folder', null);
        chunksQuery = chunksQuery.is('folder', null);
      } else {
        docsQuery = docsQuery.eq('folder', renamingFolder);
        chunksQuery = chunksQuery.eq('folder', renamingFolder);
      }

      const [{ error: docsError }, { error: chunksError }] = await Promise.all([
        docsQuery,
        chunksQuery,
      ]);

      if (docsError) throw docsError;
      if (chunksError) throw chunksError;

      toast({
        title: 'Folder renamed',
        description: `Folder renamed to "${trimmedName}"`,
      });
    } catch (error: any) {
      // Reload from backend to ensure consistency if something went wrong
      fetchDocuments();
      toast({
        title: 'Error renaming folder',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsRenaming(false);
      setRenamingFolder(null);
      setNewFolderName('');
    }
  };
  const startRenaming = (folderName: string) => {
    setRenamingFolder(folderName);
    setNewFolderName(folderName);
  };

  useEffect(() => {
    fetchDocuments();

    const channel = supabase
      .channel('documents')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'documents',
        filter: `user_id=eq.${userId}`
      }, () => {
        fetchDocuments();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  // Auto-expand all folders on first load
  useEffect(() => {
    if (documents.length > 0 && Object.keys(expandedFolders).length === 0) {
      // Group documents by folder
      const folderGroups = documents.reduce((acc: Record<string, Document[]>, doc) => {
        const folder = doc.folder || 'Uncategorized';
        if (!acc[folder]) {
          acc[folder] = [];
        }
        acc[folder].push(doc);
        return acc;
      }, {});

      const initialExpanded: Record<string, boolean> = {};
      Object.keys(folderGroups).forEach(folder => {
        initialExpanded[folder] = true;
      });
      setExpandedFolders(initialExpanded);
    }
  }, [documents, expandedFolders]);

  const fetchDocuments = async () => {
    try {
      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .eq('user_id', userId)
        .order('upload_date', { ascending: false });

      if (error) throw error;
      setDocuments(data || []);
    } catch (error: any) {
      toast({
        title: "Error loading documents",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (docId: string) => {
    if (!confirm('Are you sure you want to delete this document?')) return;
    
    try {
      // Delete chunks first
      const { error: chunksError } = await supabase
        .from('document_chunks')
        .delete()
        .eq('document_id', docId);

      if (chunksError) throw chunksError;

      // Delete document
      const { error } = await supabase
        .from('documents')
        .delete()
        .eq('id', docId);

      if (error) throw error;

      // Optimistically update local state so sidebar updates immediately
      setDocuments(prev => prev.filter(doc => doc.id !== docId));

      toast({
        title: "Document deleted",
        description: "Document and its chunks have been removed",
      });
    } catch (error: any) {
      toast({
        title: "Error deleting document",
        description: error.message,
        variant: "destructive",
      });
    }
  };
  const handleRetry = async (docId: string) => {
    try {
      const { error } = await supabase
        .from('documents')
        .update({ status: 'processing', error_message: null })
        .eq('id', docId);

      if (error) throw error;

      toast({
        title: "Retrying document",
        description: "Document processing has been restarted",
      });
    } catch (error: any) {
      toast({
        title: "Error retrying document",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <aside className="h-full border-r bg-doc-sidebar p-4 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </aside>
    );
  }

  // Group documents by folder
  const folderGroups = documents.reduce((acc: Record<string, Document[]>, doc) => {
    const folder = doc.folder || 'Uncategorized';
    if (!acc[folder]) {
      acc[folder] = [];
    }
    acc[folder].push(doc);
    return acc;
  }, {});

  const folders: FolderGroup[] = Object.entries(folderGroups)
    .map(([folder, docs]) => ({ folder, documents: docs }))
    .sort((a, b) => a.folder.localeCompare(b.folder));

  return (
    <aside className="h-full border-r bg-doc-sidebar flex flex-col">
      <div className="p-4 border-b flex-shrink-0">
        <h2 className="font-semibold text-lg">Knowledge Base</h2>
        <p className="text-sm text-muted-foreground mt-1">
          {documents.length} {documents.length === 1 ? 'document' : 'documents'} • {folders.length} {folders.length === 1 ? 'folder' : 'folders'}
        </p>
      </div>
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4">
          {documents.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p className="text-sm">No documents yet</p>
              <p className="text-xs mt-1">Upload files to get started</p>
            </div>
          ) : (
            folders.map((folderGroup) => (
              <Collapsible
                key={folderGroup.folder}
                open={expandedFolders[folderGroup.folder] ?? true}
                onOpenChange={() => toggleFolder(folderGroup.folder)}
                className="space-y-2"
              >
                <div className="flex items-center gap-1 w-full group">
                  <CollapsibleTrigger className="flex items-center gap-2 flex-1 hover:bg-muted/50 rounded-md px-2 py-1.5 transition-colors">
                    {expandedFolders[folderGroup.folder] ? (
                      <ChevronDown className="w-4 h-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    )}
                    <Folder className="w-4 h-4 text-amber-500" />
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex-1 text-left">
                      {folderGroup.folder} ({folderGroup.documents.length})
                    </h3>
                  </CollapsibleTrigger>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => {
                      e.stopPropagation();
                      startRenaming(folderGroup.folder);
                    }}
                    title="Rename folder"
                  >
                    <Edit2 className="w-3 h-3" />
                  </Button>
                </div>
                <CollapsibleContent className="space-y-2 pl-2">
                  {folderGroup.documents.map((doc) => (
                    <Card key={doc.id} className="p-3 hover:shadow-soft transition-shadow">
                      <div className="flex items-start gap-3">
                        {getDocumentIcon(doc)}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{doc.file_name}</p>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <span className="text-xs text-muted-foreground">{doc.file_type}</span>
                            {doc.status === 'processing' && (
                              <span className="text-xs text-amber-600 flex items-center gap-1">
                                <Loader2 className="w-3 h-3 animate-spin" />
                                Processing
                              </span>
                            )}
                            {doc.status === 'ready' && (
                              <span className="text-xs text-green-600">Ready</span>
                            )}
                            {doc.status === 'error' && (
                              <span className="text-xs text-destructive flex items-center gap-1">
                                <AlertCircle className="w-3 h-3" />
                                Failed
                              </span>
                            )}
                          </div>
                          {doc.status === 'error' && doc.error_message && (
                            <Alert className="mt-2 py-2 px-3">
                              <AlertDescription className="text-xs">
                                {doc.error_message}
                              </AlertDescription>
                            </Alert>
                          )}
                          <div className="mt-2 flex flex-wrap gap-1">
                            {doc.status === 'error' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 gap-1 text-muted-foreground hover:text-primary hover:bg-primary/10"
                                onClick={() => handleRetry(doc.id)}
                                title="Retry processing"
                              >
                                <RefreshCw className="w-3 h-3" />
                                <span className="text-xs">Retry</span>
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 gap-1 text-destructive hover:bg-destructive/10"
                              onClick={() => handleDelete(doc.id)}
                              title="Delete document"
                            >
                              <Trash2 className="w-3 h-3" />
                              <span className="text-xs">Delete</span>
                            </Button>
                          </div>
                        </div>
                      </div>
                    </Card>
                  ))}
                </CollapsibleContent>
              </Collapsible>
            ))
          )}
        </div>
      </ScrollArea>

      {/* Rename Folder Dialog */}
      <Dialog open={renamingFolder !== null} onOpenChange={(open) => !open && setRenamingFolder(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Folder</DialogTitle>
            <DialogDescription>
              Enter a new name for the folder "{renamingFolder}"
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="folder-name">Folder Name</Label>
              <Input
                id="folder-name"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleRenameFolder();
                  }
                }}
                placeholder="Enter folder name"
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenamingFolder(null)} disabled={isRenaming}>
              Cancel
            </Button>
            <Button onClick={handleRenameFolder} disabled={!newFolderName.trim() || isRenaming}>
              {isRenaming ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                "Rename"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </aside>
  );
};