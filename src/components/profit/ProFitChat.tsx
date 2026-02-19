import { useState, useCallback, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ArrowLeft, Send, Loader2, CheckCircle, AlertTriangle, HelpCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { ArtistData, Blueprint, ChatMessage } from "./types";

interface ProFitChatProps {
  artist: ArtistData;
  blueprint: Blueprint;
  onBack: () => void;
}

const GUIDED_CHIPS = [
  "Turn this into a weekly checklist",
  "Write outreach scripts for venues",
  "Write a DM to collab with similar artists",
  "Build a 3-offer services menu",
  "Build a merch/digital product offer",
  "Make a content plan for TikTok/IG",
  "Aggressive growth version",
  "Low-risk stable version",
];

export const ProFitChat = ({ artist, blueprint, onBack }: ProFitChatProps) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || loading) return;
    const userMsg: ChatMessage = { role: "user", content: text };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke("profit-chat", {
        body: {
          message: text,
          blueprint,
          artistData: artist,
          chatHistory: [...messages, userMsg],
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const assistantMsg: ChatMessage = {
        role: "assistant",
        content: data.recommendation || "",
        structured: data,
      };
      setMessages(prev => [...prev, assistantMsg]);
    } catch (e: any) {
      toast.error(e.message || "Failed to get response");
    } finally {
      setLoading(false);
    }
  }, [loading, messages, blueprint, artist]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  return (
    <motion.div
      className="w-full max-w-5xl mx-auto flex flex-col h-[calc(100vh-8rem)]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 pb-3">
        <Button variant="ghost" size="icon" onClick={onBack}><ArrowLeft size={18} strokeWidth={1.5} /></Button>
        <h2 className="text-sm font-semibold truncate">Strategy Chat: {artist.name}</h2>
      </div>

      <div className="flex-1 flex gap-4 min-h-0">
        {/* Left: Blueprint summary */}
        <Card className="hidden md:block w-72 flex-shrink-0 overflow-auto">
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-xs">Blueprint Summary</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-3 text-xs">
            <div>
              <Badge className="text-[10px] mb-1">{blueprint.tier.name}</Badge>
              <p className="text-muted-foreground">{blueprint.artistSnapshot.bestLane}</p>
            </div>
            <div>
              <p className="font-medium mb-1">#1 Focus</p>
              <p className="text-muted-foreground">{blueprint.singleROIFocus.focus}</p>
            </div>
            <div>
              <p className="font-medium mb-1">Scorecard</p>
              {blueprint.scorecard.map(s => (
                <div key={s.pillar} className="flex justify-between text-muted-foreground">
                  <span>{s.pillar}</span>
                  <span className="text-primary font-medium">{s.score}/10</span>
                </div>
              ))}
            </div>
            <div>
              <p className="font-medium mb-1">Top Moves</p>
              {blueprint.topMoves.map(m => (
                <p key={m.rank} className="text-muted-foreground">#{m.rank} {m.title}</p>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Right: Chat */}
        <div className="flex-1 flex flex-col min-w-0">
          <ScrollArea className="flex-1 pr-2" ref={scrollRef}>
            <div className="space-y-4 pb-4">
              {messages.length === 0 && (
                <div className="text-center text-sm text-muted-foreground py-8">
                  Ask a question or pick a prompt below to refine your strategy.
                </div>
              )}
              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  {msg.role === "user" ? (
                    <div className="bg-primary text-primary-foreground rounded-lg px-3 py-2 max-w-[80%] text-sm">
                      {msg.content}
                    </div>
                  ) : msg.structured ? (
                    <Card className="max-w-[90%] text-sm">
                      <CardContent className="p-4 space-y-3">
                        <p className="font-medium">{msg.structured.recommendation}</p>
                        {msg.structured.whyTierFit.length > 0 && (
                          <div>
                            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1"><CheckCircle size={12} /> Why this fits</p>
                            <ul className="text-xs text-muted-foreground mt-1 space-y-0.5">
                              {msg.structured.whyTierFit.map((w, j) => <li key={j}>• {w}</li>)}
                            </ul>
                          </div>
                        )}
                        {msg.structured.nextSteps.length > 0 && (
                          <div>
                            <p className="text-xs font-medium text-muted-foreground">Steps</p>
                            <ol className="text-xs mt-1 list-decimal list-inside space-y-0.5">
                              {msg.structured.nextSteps.map((s, j) => <li key={j}>{s}</li>)}
                            </ol>
                          </div>
                        )}
                        {msg.structured.pitfalls.length > 0 && (
                          <div>
                            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1"><AlertTriangle size={12} /> Pitfalls</p>
                            <ul className="text-xs text-muted-foreground mt-1 space-y-0.5">
                              {msg.structured.pitfalls.map((p, j) => <li key={j}>⚠ {p}</li>)}
                            </ul>
                          </div>
                        )}
                        {msg.structured.nextActionQuestion && (
                          <p className="text-xs text-primary flex items-center gap-1">
                            <HelpCircle size={12} /> {msg.structured.nextActionQuestion}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="bg-muted rounded-lg px-3 py-2 max-w-[80%] text-sm">
                      {msg.content}
                    </div>
                  )}
                </div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="bg-muted rounded-lg px-3 py-2 text-sm flex items-center gap-2">
                    <Loader2 size={14} className="animate-spin" /> Thinking...
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>

          {/* Guided chips */}
          <div className="flex flex-wrap gap-1.5 pb-2 pt-1">
            {GUIDED_CHIPS.map(chip => (
              <button
                key={chip}
                onClick={() => sendMessage(chip)}
                disabled={loading}
                className="text-[10px] px-2 py-1 rounded-full border border-border/50 bg-card hover:bg-muted transition-colors disabled:opacity-50"
              >
                {chip}
              </button>
            ))}
          </div>

          {/* Input */}
          <form onSubmit={handleSubmit} className="flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about your strategy..."
              disabled={loading}
              className="flex-1"
            />
            <Button type="submit" size="icon" disabled={loading || !input.trim()}>
              <Send size={16} />
            </Button>
          </form>
        </div>
      </div>
    </motion.div>
  );
};
