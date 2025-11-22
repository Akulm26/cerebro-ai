import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Progress } from "./ui/progress";
import { FileText, PackagePlus, Sparkles, CheckCircle2 } from "lucide-react";

interface ProcessingProgressProps {
  documentId: string;
  fileName: string;
  onComplete?: () => void;
}

interface ProcessingStatus {
  progress: number;
  stage: string;
  status: string;
}

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

export function ProcessingProgress({ documentId, fileName, onComplete }: ProcessingProgressProps) {
  const [status, setStatus] = useState<ProcessingStatus>({
    progress: 0,
    stage: 'pending',
    status: 'processing',
  });

  useEffect(() => {
    // Fetch initial status
    const fetchStatus = async () => {
      const { data } = await supabase
        .from('documents')
        .select('processing_progress, processing_stage, status')
        .eq('id', documentId)
        .single();
      
      if (data) {
        setStatus({
          progress: data.processing_progress || 0,
          stage: data.processing_stage || 'pending',
          status: data.status,
        });

        if (data.status === 'ready') {
          onComplete?.();
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
          setStatus({
            progress: newData.processing_progress || 0,
            stage: newData.processing_stage || 'pending',
            status: newData.status,
          });

          if (newData.status === 'ready') {
            onComplete?.();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [documentId, onComplete]);

  const Icon = stageIcons[status.stage as keyof typeof stageIcons] || FileText;
  const label = stageLabels[status.stage as keyof typeof stageLabels] || "Processing...";

  if (status.status === 'ready') {
    return null;
  }

  return (
    <div className="space-y-3 p-4 border border-border rounded-lg bg-card">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-primary animate-pulse" />
          <span className="text-sm font-medium">{fileName}</span>
        </div>
        <span className="text-xs text-muted-foreground">{status.progress}%</span>
      </div>
      
      <div className="space-y-2">
        <Progress value={status.progress} className="h-2" />
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}
