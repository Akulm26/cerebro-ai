import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { User } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Brain, LogOut, Upload, MessageSquare } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { DocumentSidebar } from "@/components/DocumentSidebar";
import { ChatInterface } from "@/components/ChatInterface";
import { UploadDialog } from "@/components/UploadDialog";

const Chat = () => {
  const [user, setUser] = useState<User | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      if (!session) {
        navigate("/auth");
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (!session) {
        navigate("/auth");
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    toast({
      title: "Signed out",
      description: "You have been signed out successfully",
    });
  };

  if (!user) {
    return null;
  }

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="border-b bg-card shadow-soft">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-primary rounded-lg">
              <Brain className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-xl font-bold">Cerebro</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowUpload(true)}
              className="gap-2"
            >
              <Upload className="w-4 h-4" />
              Upload
            </Button>
            <Button variant="ghost" size="sm" onClick={handleSignOut} className="gap-2">
              <LogOut className="w-4 h-4" />
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        <DocumentSidebar userId={user.id} />
        <main className="flex-1 flex flex-col">
          <ChatInterface userId={user.id} />
        </main>
      </div>

      {/* Upload Dialog */}
      <UploadDialog
        open={showUpload}
        onOpenChange={setShowUpload}
        userId={user.id}
      />
    </div>
  );
};

export default Chat;