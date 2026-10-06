import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, BookOpen, Brain, FileText, FolderOpen, LockKeyhole, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const sampleDocuments = [
  { name: "Product strategy overview.pdf", folder: "Strategy" },
  { name: "Customer discovery notes.docx", folder: "Research" },
  { name: "Q3 planning brief.pdf", folder: "Planning" },
];

const sampleAnswers = [
  {
    question: "What are the main priorities in the product strategy?",
    answer: "The strategy focuses on three priorities: make onboarding easier, improve collaboration for small teams, and use customer feedback to guide the roadmap. The planning brief recommends measuring activation and weekly team usage to track progress.",
    source: "Product strategy overview.pdf · Strategy",
  },
  {
    question: "What did customers ask for most often?",
    answer: "Customers most often asked for a clearer first-run experience, a simpler way to share work with teammates, and better visibility into progress. The discovery notes recommend testing these improvements with new users before expanding their scope.",
    source: "Customer discovery notes.docx · Research",
  },
  {
    question: "How will the team measure success this quarter?",
    answer: "The sample plan tracks onboarding completion, weekly active teams, and customer-reported satisfaction. It suggests reviewing these measures every two weeks and pairing the numbers with feedback from customer interviews.",
    source: "Q3 planning brief.pdf · Planning",
  },
];

const Demo = () => {
  const [activeAnswer, setActiveAnswer] = useState(0);
  const current = sampleAnswers[activeAnswer];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="flex min-h-16 items-center justify-between border-b bg-card px-4 md:px-8">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-gradient-primary p-2 text-primary-foreground">
            <Brain className="h-5 w-5" />
          </div>
          <span className="text-lg font-semibold">Cerebro</span>
          <Badge variant="secondary" className="ml-1 gap-1">
            <LockKeyhole className="h-3 w-3" /> Read-only demo
          </Badge>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/auth">Sign in to your account <ArrowRight className="h-4 w-4" /></Link>
        </Button>
      </header>

      <div className="grid min-h-[calc(100vh-4rem)] md:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="border-b bg-muted/30 p-5 md:border-b-0 md:border-r">
          <div className="mb-5 flex items-center gap-2 text-sm font-semibold">
            <FolderOpen className="h-4 w-4 text-primary" /> Sample knowledge
          </div>
          <div className="space-y-5">
            {["Strategy", "Research", "Planning"].map((folder) => (
              <section key={folder}>
                <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{folder}</h2>
                {sampleDocuments.filter((document) => document.folder === folder).map((document) => (
                  <div key={document.name} className="flex items-start gap-2 rounded-md px-2 py-2 text-sm">
                    <FileText className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span className="break-words">{document.name}</span>
                  </div>
                ))}
              </section>
            ))}
          </div>
        </aside>

        <main className="mx-auto flex w-full max-w-4xl flex-col px-5 py-8 md:px-10 md:py-12">
          <div className="mb-8 flex items-start gap-4">
            <div className="rounded-lg bg-accent/15 p-3 text-accent-foreground">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold">Explore a sample workspace</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                This example shows how Cerebro answers questions using source documents. It is separate from your account and contains no personal files.
              </p>
            </div>
          </div>

          <section aria-label="Sample questions" className="mb-8">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-medium">
              <BookOpen className="h-4 w-4 text-muted-foreground" /> Questions about the sample files
            </h2>
            <div className="flex flex-col items-start gap-2">
              {sampleAnswers.map((item, index) => (
                <Button
                  key={item.question}
                  type="button"
                  variant={activeAnswer === index ? "secondary" : "outline"}
                  className="h-auto max-w-full justify-start whitespace-normal py-2.5 text-left"
                  onClick={() => setActiveAnswer(index)}
                >
                  {item.question}
                </Button>
              ))}
            </div>
          </section>

          <Card className="max-w-3xl p-5 md:p-6">
            <p className="mb-4 text-sm font-medium text-muted-foreground">Sample answer</p>
            <p className="text-base leading-7">{current.answer}</p>
            <div className="mt-5 border-t pt-4">
              <p className="mb-2 text-xs font-semibold text-muted-foreground">SOURCE</p>
              <p className="flex items-center gap-2 break-words text-sm">
                <FileText className="h-4 w-4 shrink-0 text-primary" /> {current.source}
              </p>
            </div>
          </Card>

          <div className="mt-8 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            <LockKeyhole className="h-4 w-4 shrink-0" />
            <span>Sample content only. Sign in for your private knowledge workspace.</span>
            <Button asChild variant="link" className="h-auto p-0 text-sm">
              <Link to="/auth">Go to sign in</Link>
            </Button>
          </div>
        </main>
      </div>
    </div>
  );
};

export default Demo;