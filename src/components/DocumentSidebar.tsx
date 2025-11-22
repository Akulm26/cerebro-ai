import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";
import { FileText, Loader2, Trash2, AlertCircle, RefreshCw, Link as LinkIcon, Image, FileType, ChevronDown, ChevronRight, Folder, Edit2, Merge, FolderPlus, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MergeFoldersDialog } from "./MergeFoldersDialog";
import { CreateMasterFolderDialog } from "./CreateMasterFolderDialog";
import { CreateFolderDialog } from "./CreateFolderDialog";

interface Document {
  id: string;
  file_name: string;
  file_type: string;
  status: string;
  upload_date: string;
  chunk_count: number;
  error_message: string | null;
  folder: string | null;
  parent_folder: string | null;
}

interface FolderGroup {
  folder: string;
  documents: Document[];
  parentFolder: string | null;
}

interface MasterFolderGroup {
  masterFolderName: string;
  folders: FolderGroup[];
}

export const DocumentSidebar = ({ userId }: { userId: string }) => {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  const [expandedMasterFolders, setExpandedMasterFolders] = useState<Record<string, boolean>>({});
  const [renamingFolder, setRenamingFolder] = useState<string | null>(null);
  const [renamingMasterFolder, setRenamingMasterFolder] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState("");
  const [newMasterFolderName, setNewMasterFolderName] = useState("");
  const [isRenaming, setIsRenaming] = useState(false);
  const [showMergeDialog, setShowMergeDialog] = useState(false);
  const [showMasterDialog, setShowMasterDialog] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [draggedDoc, setDraggedDoc] = useState<Document | null>(null);
  const [emptyFolders, setEmptyFolders] = useState<string[]>(() => {
    // Load empty folders from localStorage on mount
    const stored = localStorage.getItem(`emptyFolders_${userId}`);
    return stored ? JSON.parse(stored) : [];
  });
  const { toast } = useToast();

  // Persist empty folders to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem(`emptyFolders_${userId}`, JSON.stringify(emptyFolders));
  }, [emptyFolders, userId]);

  // Fetch documents and setup realtime subscription
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

  // Remove empty folders that now have documents
  useEffect(() => {
    const foldersWithDocs = new Set(documents.map(d => d.folder || 'Uncategorized'));
    setEmptyFolders(prev => prev.filter(f => !foldersWithDocs.has(f)));
  }, [documents]);

  const getDocumentIcon = (doc: Document) => {
    if (doc.file_type === 'url' || doc.file_name.startsWith('http')) {
      return <LinkIcon className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />;
    }
    if (doc.file_type.includes('image') || /\.(jpg|jpeg|png|gif|webp)$/i.test(doc.file_name)) {
      return <Image className="w-4 h-4 text-purple-500 flex-shrink-0 mt-0.5" />;
    }
    return <FileType className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />;
  };

  const toggleFolder = (folderName: string) => {
    setExpandedFolders(prev => ({
      ...prev,
      [folderName]: !prev[folderName]
    }));
  };

  const toggleMasterFolder = (masterFolderName: string) => {
    setExpandedMasterFolders(prev => ({
      ...prev,
      [masterFolderName]: !prev[masterFolderName]
    }));
  };

  const handleDragStart = (e: React.DragEvent, doc: Document) => {
    setDraggedDoc(doc);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = async (e: React.DragEvent, targetFolder: string) => {
    e.preventDefault();
    if (!draggedDoc) return;

    const normalizedTargetFolder = targetFolder === 'Uncategorized' ? null : targetFolder;
    
    // Skip if dropping on the same folder
    if (draggedDoc.folder === normalizedTargetFolder) {
      setDraggedDoc(null);
      return;
    }

    try {
      // Update document
      const { error: docError } = await supabase
        .from('documents')
        .update({ folder: normalizedTargetFolder })
        .eq('id', draggedDoc.id);

      if (docError) throw docError;

      // Update document chunks
      const { error: chunkError } = await supabase
        .from('document_chunks')
        .update({ folder: normalizedTargetFolder })
        .eq('document_id', draggedDoc.id);

      if (chunkError) throw chunkError;

      // Optimistically update UI
      setDocuments(prev =>
        prev.map(doc =>
          doc.id === draggedDoc.id
            ? { ...doc, folder: normalizedTargetFolder }
            : doc
        )
      );

      toast({
        title: "Document moved",
        description: `Moved to ${targetFolder}`,
      });
    } catch (error: any) {
      toast({
        title: "Error moving document",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setDraggedDoc(null);
    }
  };

  const handleRenameFolder = async () => {
    if (!renamingFolder || !newFolderName.trim()) return;

    const trimmedName = newFolderName.trim();
    const isUncategorized = renamingFolder === 'Uncategorized';

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

  const startRenamingMaster = (masterFolderName: string) => {
    setRenamingMasterFolder(masterFolderName);
    setNewMasterFolderName(masterFolderName);
  };

  const handleRenameMasterFolder = async () => {
    if (!renamingMasterFolder || !newMasterFolderName.trim()) return;

    const trimmedName = newMasterFolderName.trim();

    setIsRenaming(true);
    setDocuments(prev =>
      prev.map(doc =>
        doc.parent_folder === renamingMasterFolder
          ? { ...doc, parent_folder: trimmedName }
          : doc
      )
    );

    try {
      const [{ error: docsError }, { error: chunksError }] = await Promise.all([
        supabase
          .from('documents')
          .update({ parent_folder: trimmedName })
          .eq('user_id', userId)
          .eq('parent_folder', renamingMasterFolder),
        supabase
          .from('document_chunks')
          .update({ parent_folder: trimmedName })
          .eq('user_id', userId)
          .eq('parent_folder', renamingMasterFolder),
      ]);

      if (docsError) throw docsError;
      if (chunksError) throw chunksError;

      toast({
        title: 'Master folder renamed',
        description: `Master folder renamed to "${trimmedName}"`,
      });
    } catch (error: any) {
      fetchDocuments();
      toast({
        title: 'Error renaming master folder',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsRenaming(false);
      setRenamingMasterFolder(null);
      setNewMasterFolderName('');
    }
  };

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
      const { error: chunksError } = await supabase
        .from('document_chunks')
        .delete()
        .eq('document_id', docId);

      if (chunksError) throw chunksError;

      const { error } = await supabase
        .from('documents')
        .delete()
        .eq('id', docId);

      if (error) throw error;

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

  // Group by master folders first, then by regular folders
  const masterFolderGroups = documents.reduce((acc: Record<string, FolderGroup[]>, doc) => {
    const masterFolder = doc.parent_folder || '__NO_MASTER__';
    const folder = doc.folder || 'Uncategorized';

    if (!acc[masterFolder]) {
      acc[masterFolder] = [];
    }

    let folderGroup = acc[masterFolder].find(fg => fg.folder === folder);
    if (!folderGroup) {
      folderGroup = { folder, documents: [], parentFolder: doc.parent_folder };
      acc[masterFolder].push(folderGroup);
    }

    folderGroup.documents.push(doc);
    return acc;
  }, {});

  const masterFolders: MasterFolderGroup[] = Object.entries(masterFolderGroups)
    .filter(([master]) => master !== '__NO_MASTER__')
    .map(([masterFolderName, folders]) => ({
      masterFolderName,
      folders: folders.sort((a, b) => a.folder.localeCompare(b.folder))
    }))
    .sort((a, b) => a.masterFolderName.localeCompare(b.masterFolderName));

  const standaloneFolders = masterFolderGroups['__NO_MASTER__']?.sort((a, b) => 
    a.folder.localeCompare(b.folder)
  ) || [];

  // Combine document folders with empty folders
  const allFolderNames = [
    ...new Set([
      ...documents.map(d => d.folder || 'Uncategorized'),
      ...emptyFolders
    ])
  ].sort();

  const handleCreateFolder = (folderName: string) => {
    setEmptyFolders(prev => [...prev, folderName]);
    setExpandedFolders(prev => ({ ...prev, [folderName]: true }));
  };

  const handleDeleteEmptyFolder = (folderName: string) => {
    setEmptyFolders(prev => prev.filter(f => f !== folderName));
    toast({
      title: "Folder removed",
      description: `"${folderName}" has been removed`,
    });
  };

  return (
    <aside className="h-full border-r bg-doc-sidebar flex flex-col">
      <div className="p-4 border-b flex-shrink-0">
        <h2 className="font-semibold text-lg">Knowledge Base</h2>
        <p className="text-sm text-muted-foreground mt-1">
          {documents.length} {documents.length === 1 ? 'document' : 'documents'} • {allFolderNames.length} {allFolderNames.length === 1 ? 'folder' : 'folders'}
        </p>
        <div className="grid grid-cols-2 gap-2 mt-3">
          <Button
            variant="outline"
            size="sm"
            className="text-xs"
            onClick={() => setShowCreateDialog(true)}
          >
            <Plus className="w-3 h-3 mr-1" />
            New Folder
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-xs"
            onClick={() => setShowMasterDialog(true)}
            disabled={allFolderNames.length === 0}
          >
            <FolderPlus className="w-3 h-3 mr-1" />
            Master
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="col-span-2 text-xs"
            onClick={() => setShowMergeDialog(true)}
            disabled={allFolderNames.length < 2}
          >
            <Merge className="w-3 h-3 mr-1" />
            Merge Folders
          </Button>
        </div>
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
            <>
              {/* Master Folders */}
              {masterFolders.map((masterGroup) => (
                <Collapsible
                  key={masterGroup.masterFolderName}
                  open={expandedMasterFolders[masterGroup.masterFolderName] ?? true}
                  onOpenChange={() => toggleMasterFolder(masterGroup.masterFolderName)}
                  className="space-y-2"
                >
                  <div className="flex items-center gap-1 w-full group">
                    <CollapsibleTrigger className="flex items-center gap-2 flex-1 hover:bg-muted/50 rounded-md px-2 py-1.5 transition-colors">
                      {expandedMasterFolders[masterGroup.masterFolderName] ? (
                        <ChevronDown className="w-4 h-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      )}
                      <Folder className="w-5 h-5 text-blue-500" />
                      <h3 className="text-sm font-bold text-foreground flex-1 text-left">
                        {masterGroup.masterFolderName}
                      </h3>
                    </CollapsibleTrigger>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => {
                        e.stopPropagation();
                        startRenamingMaster(masterGroup.masterFolderName);
                      }}
                      title="Rename master folder"
                    >
                      <Edit2 className="w-3 h-3" />
                    </Button>
                  </div>
                  <CollapsibleContent className="pl-4 space-y-2">
                    {masterGroup.folders.map((folderGroup) => (
                      <Collapsible
                        key={folderGroup.folder}
                        open={expandedFolders[folderGroup.folder] ?? true}
                        onOpenChange={() => toggleFolder(folderGroup.folder)}
                        className="space-y-2"
                      >
                        <div 
                          className="flex items-center gap-1 w-full group"
                          onDragOver={handleDragOver}
                          onDrop={(e) => handleDrop(e, folderGroup.folder)}
                        >
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
                            <Card 
                              key={doc.id} 
                              className="p-3 hover:shadow-soft transition-shadow cursor-move"
                              draggable
                              onDragStart={(e) => handleDragStart(e, doc)}
                            >
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
                    ))}
                  </CollapsibleContent>
                </Collapsible>
              ))}

              {/* Standalone Folders */}
              {standaloneFolders.map((folderGroup) => (
                <Collapsible
                  key={folderGroup.folder}
                  open={expandedFolders[folderGroup.folder] ?? true}
                  onOpenChange={() => toggleFolder(folderGroup.folder)}
                  className="space-y-2"
                >
                  <div 
                    className="flex items-center gap-1 w-full group"
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, folderGroup.folder)}
                  >
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
                      <Card 
                        key={doc.id} 
                        className="p-3 hover:shadow-soft transition-shadow cursor-move"
                        draggable
                        onDragStart={(e) => handleDragStart(e, doc)}
                      >
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
              ))}

              {/* Empty Folders */}
              {emptyFolders.map((folderName) => (
                <Collapsible
                  key={`empty-${folderName}`}
                  open={expandedFolders[folderName] ?? true}
                  onOpenChange={() => toggleFolder(folderName)}
                  className="space-y-2"
                >
                  <div 
                    className="flex items-center gap-1 w-full group"
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, folderName)}
                  >
                    <CollapsibleTrigger className="flex items-center gap-2 flex-1 hover:bg-muted/50 rounded-md px-2 py-1.5 transition-colors">
                      {expandedFolders[folderName] ? (
                        <ChevronDown className="w-4 h-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      )}
                      <Folder className="w-4 h-4 text-amber-500" />
                      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex-1 text-left">
                        {folderName} (0)
                      </h3>
                    </CollapsibleTrigger>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => {
                        e.stopPropagation();
                        startRenaming(folderName);
                      }}
                      title="Rename folder"
                    >
                      <Edit2 className="w-3 h-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteEmptyFolder(folderName);
                      }}
                      title="Delete empty folder"
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                  <CollapsibleContent className="space-y-2 pl-2">
                    <div className="text-center py-6 text-muted-foreground">
                      <Folder className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      <p className="text-xs">Empty folder</p>
                      <p className="text-xs mt-1">Drag documents here or upload with this folder selected</p>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              ))}
            </>
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

      {/* Rename Master Folder Dialog */}
      <Dialog open={renamingMasterFolder !== null} onOpenChange={(open) => !open && setRenamingMasterFolder(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Master Folder</DialogTitle>
            <DialogDescription>
              Enter a new name for the master folder "{renamingMasterFolder}"
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="master-folder-name">Master Folder Name</Label>
              <Input
                id="master-folder-name"
                value={newMasterFolderName}
                onChange={(e) => setNewMasterFolderName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleRenameMasterFolder();
                  }
                }}
                placeholder="Enter master folder name"
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenamingMasterFolder(null)} disabled={isRenaming}>
              Cancel
            </Button>
            <Button onClick={handleRenameMasterFolder} disabled={!newMasterFolderName.trim() || isRenaming}>
              {isRenaming ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                "Rename"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Merge Folders Dialog */}
      <MergeFoldersDialog
        open={showMergeDialog}
        onOpenChange={setShowMergeDialog}
        folders={allFolderNames}
        userId={userId}
        onMergeComplete={fetchDocuments}
      />

      {/* Create Master Folder Dialog */}
      <CreateMasterFolderDialog
        open={showMasterDialog}
        onOpenChange={setShowMasterDialog}
        folders={allFolderNames}
        userId={userId}
        onCreateComplete={fetchDocuments}
      />

      {/* Create Folder Dialog */}
      <CreateFolderDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        existingFolders={allFolderNames}
        onFolderCreate={handleCreateFolder}
      />
    </aside>
  );
};