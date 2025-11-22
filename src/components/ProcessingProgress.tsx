import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Progress } from "./ui/progress";
import { Button } from "./ui/button";
import { FileText, PackagePlus, Sparkles, CheckCircle2, Clock, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface ProcessingProgressProps {
  documentId: string;
  fileName: string;
  fileSize?: number;
  onComplete?: () => void;
}

interface ProcessingStatus {
  progress: number;
  stage: string;
  status: string;
  fileSize?: number;
}

// Estimate processing time based on file size (in seconds)
const estimateStageTime = (stage: string, fileSize: number = 0): number => {
  const sizeInMB = fileSize / (1024 * 1024);
  
  switch (stage) {
    case 'pending':
      return 2;
    case 'extracting':
      // PDF extraction: ~3-5 seconds per MB
      return Math.max(5, Math.min(30, sizeInMB * 4));
    case 'chunking':
      // Chunking is very fast
      return Math.max(2, sizeInMB * 0.5);
    case 'embedding':
      // Embedding generation: ~10-20 seconds per MB (depends on chunks)
      return Math.max(10, Math.min(60, sizeInMB * 15));
    default:
      return 5;
  }
};

const calculateTimeRemaining = (progress: number, stage: string, fileSize: number = 0): string => {
  if (progress >= 100) return "0s";
  
  // Calculate remaining progress percentage for current stage
  const stageRanges: Record<string, { start: number; end: number }> = {
    pending: { start: 0, end: 10 },
    extracting: { start: 10, end: 33 },
    chunking: { start: 33, end: 50 },
    embedding: { start: 50, end: 100 },
  };
  
  const currentRange = stageRanges[stage] || { start: 0, end: 100 };
  const stageProgress = currentRange.end - currentRange.start;
  const currentStageProgress = progress - currentRange.start;
  const stageCompletion = currentStageProgress / stageProgress;
  
  // Get estimated time for current stage
  const stageTime = estimateStageTime(stage, fileSize);
  const remainingStageTime = stageTime * (1 - stageCompletion);
  
  // Add estimated time for remaining stages
  let totalRemaining = remainingStageTime;
  const stages = ['pending', 'extracting', 'chunking', 'embedding'];
  const currentStageIndex = stages.indexOf(stage);
  
  for (let i = currentStageIndex + 1; i < stages.length; i++) {
    totalRemaining += estimateStageTime(stages[i], fileSize);
  }
  
  // Format time
  if (totalRemaining < 60) {
    return `${Math.ceil(totalRemaining)}s`;
  } else {
    const minutes = Math.floor(totalRemaining / 60);
    const seconds = Math.ceil(totalRemaining % 60);
    return `${minutes}m ${seconds}s`;
  }
};

const stageIcons = {
  pending: FileText,
  extracting: FileText,
  chunking: PackagePlus,
  embedding: Sparkles,
  complete: CheckCircle2,
};

const stageLabels = {
  pending: "Preparing...",
  extracting: "Extracting text",
  chunking: "Chunking content",
  embedding: "Generating embeddings",
  complete: "Complete!",
};

export function ProcessingProgress({ documentId, fileName, fileSize, onComplete }: ProcessingProgressProps) {
  const [status, setStatus] = useState<ProcessingStatus>({
    progress: 0,
    stage: 'pending',
    status: 'processing',
    fileSize,
  });
  const [isCancelling, setIsCancelling] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    // Fetch initial status
    const fetchStatus = async () => {
      const { data } = await supabase
        .from('documents')
        .select('processing_progress, processing_stage, status, file_size, error_message')
        .eq('id', documentId)
        .single();
      
      if (data) {
        setStatus({
          progress: data.processing_progress || 0,
          stage: data.processing_stage || 'pending',
          status: data.status,
          fileSize: data.file_size || fileSize,
        });

        if (data.status === 'ready') {
          onComplete?.();
        } else if (data.status === 'error' && data.error_message) {
          toast({
            title: "Processing failed",
            description: data.error_message,
            variant: "destructive",
          });
        }
      }
    };

    fetchStatus();

    // Subscribe to realtime updates
    const channel = supabase
      .channel(`document-${documentId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'documents',
          filter: `id=eq.${documentId}`,
        },
        (payload) => {
          const newData = payload.new as any;
          setStatus(prev => ({
            progress: newData.processing_progress || 0,
            stage: newData.processing_stage || 'pending',
            status: newData.status,
            fileSize: prev.fileSize || newData.file_size,
          }));

          if (newData.status === 'ready') {
            onComplete?.();
          } else if (newData.status === 'error' && newData.error_message) {
            toast({
              title: "Processing failed",
              description: newData.error_message,
              variant: "destructive",
            });
            // Auto-remove after showing error
            setTimeout(() => onComplete?.(), 3000);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [documentId, onComplete]);

  const handleCancelClick = () => {
    setShowCancelDialog(true);
  };

  const handleConfirmCancel = async () => {
    setShowCancelDialog(false);
    setIsCancelling(true);
    try {
      // Delete document chunks first
      await supabase
        .from('document_chunks')
        .delete()
        .eq('document_id', documentId);
      
      // Delete the document
      await supabase
        .from('documents')
        .delete()
        .eq('id', documentId);

      toast({
        title: "Processing cancelled",
        description: "The document upload has been cancelled",
      });

      onComplete?.();
    } catch (error) {
      console.error('Error cancelling upload:', error);
      toast({
        title: "Cancellation failed",
        description: "Could not cancel the upload",
        variant: "destructive",
      });
    } finally {
      setIsCancelling(false);
    }
  };

  const Icon = stageIcons[status.stage as keyof typeof stageIcons] || FileText;
  const label = stageLabels[status.stage as keyof typeof stageLabels] || "Processing...";
  const timeRemaining = calculateTimeRemaining(status.progress, status.stage, status.fileSize);

  // Don't show if completed successfully
  if (status.status === 'ready') {
    return null;
  }

  // Show error state
  if (status.status === 'error') {
    return (
      <div className="p-4 border border-destructive rounded-lg bg-destructive/10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <X className="h-4 w-4 text-destructive" />
            <span className="text-sm font-medium truncate">{fileName}</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCancelClick}
            className="h-6 w-6 p-0"
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
        <p className="text-xs text-destructive mt-2">Processing failed - check console for details</p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-3 p-4 border border-border rounded-lg bg-card">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Icon className="h-4 w-4 text-primary animate-pulse" />
            <span className="text-sm font-medium truncate">{fileName}</span>
          </div>
          <div className="flex items-center gap-2 ml-2">
            <span className="text-xs text-muted-foreground">{status.progress}%</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCancelClick}
              disabled={isCancelling}
              className="h-6 w-6 p-0"
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        </div>
      
        <div className="space-y-2">
          <Progress value={status.progress} className="h-2" />
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">{label}</p>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              <span>~{timeRemaining}</span>
            </div>
          </div>
        </div>
      </div>

      <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel upload?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to cancel processing "{fileName}"? This action cannot be undone and you'll need to upload the file again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continue Processing</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmCancel} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Cancel Upload
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
