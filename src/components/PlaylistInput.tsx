import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Zap, BarChart3, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { PlaylistInput as PlaylistInputType } from "@/lib/playlistHealthEngine";
import { SAMPLE_PLAYLIST, SAMPLE_EDITORIAL } from "@/lib/playlistHealthEngine";

interface Props {
  onAnalyze: (data: PlaylistInputType) => void;
}

function extractPlaylistId(url: string): string | null {
  const match = url.match(/playlist\/([a-zA-Z0-9]+)/);
  return match ? match[1] : null;
}

export function PlaylistInputSection({ onAnalyze }: Props) {
  const [url, setUrl] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(true);

  // Form fields
  const [playlistName, setPlaylistName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [description, setDescription] = useState("");
  const [followersTotal, setFollowersTotal] = useState("");
  const [tracksTotal, setTracksTotal] = useState("");
  const [lastUpdatedDays, setLastUpdatedDays] = useState("");
  const [churnRate30d, setChurnRate30d] = useState("");
  const [bottomDumpScore, setBottomDumpScore] = useState("");
  const [isSpotifyEditorial, setIsSpotifyEditorial] = useState(false);
  const [submissionLanguage, setSubmissionLanguage] = useState(false);

  const hasData = !!(tracksTotal || followersTotal || lastUpdatedDays || churnRate30d || bottomDumpScore);

  const handleAnalyze = () => {
    if (!hasData) {
      setShowAdvanced(true);
      return;
    }
    const trimmedUrl = url.trim();

    const data: PlaylistInputType = {
      playlistUrl: trimmedUrl || "manual-entry",
      playlistId: trimmedUrl ? extractPlaylistId(trimmedUrl) : null,
      playlistName: playlistName || undefined,
      ownerName: ownerName || undefined,
      description: description || undefined,
      followersTotal: followersTotal ? Number(followersTotal) : undefined,
      tracksTotal: tracksTotal ? Number(tracksTotal) : undefined,
      lastUpdatedDays: lastUpdatedDays ? Number(lastUpdatedDays) : undefined,
      churnRate30d: churnRate30d ? Number(churnRate30d) : undefined,
      bottomDumpScore: bottomDumpScore ? Number(bottomDumpScore) : undefined,
      playlistOwnerIsSpotifyEditorial: isSpotifyEditorial,
      submissionLanguageDetected: submissionLanguage,
    };

    onAnalyze(data);
  };

  return (
    <motion.div
      className="w-full max-w-2xl mx-auto space-y-6"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <div className="text-center space-y-3">
        <motion.div
          className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-mono"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
        >
          <BarChart3 size={14} />
          Deterministic Scoring Engine
        </motion.div>
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">
          Playlist <span className="text-gradient-primary">Health</span> Check
        </h1>
        <p className="text-muted-foreground max-w-md mx-auto">
          Enter your playlist data to score curation quality, update cadence, and pitch suitability.
        </p>
      </div>

      {/* URL input */}
      <div className="glass-card rounded-xl p-4 flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
          <Input
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="Paste Spotify playlist URL..."
            className="pl-10 bg-transparent border-0 focus-visible:ring-0 text-foreground placeholder:text-muted-foreground"
          />
        </div>
        <Button onClick={handleAnalyze} className="glow-primary">
          <Zap size={16} className="mr-1" /> Analyze
        </Button>
      </div>

      {/* Expand / collapse for data form */}
      <button
        onClick={() => setShowAdvanced(!showAdvanced)}
        className="w-full flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors py-1"
      >
        {showAdvanced ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        {showAdvanced ? "Hide" : "Enter"} playlist data manually
      </button>

      <AnimatePresence>
        {showAdvanced && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            <div className="glass-card rounded-xl p-6 space-y-5">
              <h3 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
                Playlist Data
              </h3>

              {/* Row 1: Name + Owner */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="playlistName" className="text-xs text-muted-foreground">Playlist Name</Label>
                  <Input
                    id="playlistName"
                    value={playlistName}
                    onChange={e => setPlaylistName(e.target.value)}
                    placeholder="e.g. Chill Vibes"
                    className="bg-muted/50 border-border"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ownerName" className="text-xs text-muted-foreground">Owner Name</Label>
                  <Input
                    id="ownerName"
                    value={ownerName}
                    onChange={e => setOwnerName(e.target.value)}
                    placeholder="e.g. indie_curator_mike"
                    className="bg-muted/50 border-border"
                  />
                </div>
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <Label htmlFor="description" className="text-xs text-muted-foreground">Description</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Playlist description text..."
                  className="bg-muted/50 border-border min-h-[60px] resize-none"
                />
              </div>

              {/* Row 2: Core metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="followers" className="text-xs text-muted-foreground">Followers</Label>
                  <Input
                    id="followers"
                    type="number"
                    value={followersTotal}
                    onChange={e => setFollowersTotal(e.target.value)}
                    placeholder="8420"
                    className="bg-muted/50 border-border font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="tracks" className="text-xs text-muted-foreground">Tracks</Label>
                  <Input
                    id="tracks"
                    type="number"
                    value={tracksTotal}
                    onChange={e => setTracksTotal(e.target.value)}
                    placeholder="62"
                    className="bg-muted/50 border-border font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="lastUpdated" className="text-xs text-muted-foreground">Days Since Update</Label>
                  <Input
                    id="lastUpdated"
                    type="number"
                    value={lastUpdatedDays}
                    onChange={e => setLastUpdatedDays(e.target.value)}
                    placeholder="3"
                    className="bg-muted/50 border-border font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="churn" className="text-xs text-muted-foreground">Churn Rate (0–1)</Label>
                  <Input
                    id="churn"
                    type="number"
                    step="0.01"
                    min="0"
                    max="1"
                    value={churnRate30d}
                    onChange={e => setChurnRate30d(e.target.value)}
                    placeholder="0.12"
                    className="bg-muted/50 border-border font-mono"
                  />
                </div>
              </div>

              {/* Bottom dump */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="bottomDump" className="text-xs text-muted-foreground">Bottom Dump (0–1)</Label>
                  <Input
                    id="bottomDump"
                    type="number"
                    step="0.01"
                    min="0"
                    max="1"
                    value={bottomDumpScore}
                    onChange={e => setBottomDumpScore(e.target.value)}
                    placeholder="0.18"
                    className="bg-muted/50 border-border font-mono"
                  />
                </div>
              </div>

              {/* Toggles */}
              <div className="flex flex-wrap gap-6">
                <div className="flex items-center gap-2">
                  <Switch
                    id="editorial"
                    checked={isSpotifyEditorial}
                    onCheckedChange={setIsSpotifyEditorial}
                  />
                  <Label htmlFor="editorial" className="text-xs text-muted-foreground cursor-pointer">
                    Spotify Editorial
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id="submission"
                    checked={submissionLanguage}
                    onCheckedChange={setSubmissionLanguage}
                  />
                  <Label htmlFor="submission" className="text-xs text-muted-foreground cursor-pointer">
                    Submission Language Detected
                  </Label>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Demo buttons */}
      <div className="flex items-center justify-center gap-3 text-xs text-muted-foreground">
        <span>Try a demo:</span>
        <button
          onClick={() => onAnalyze(SAMPLE_PLAYLIST)}
          className="text-primary hover:underline underline-offset-2 font-mono"
        >
          Indie Playlist
        </button>
        <span>·</span>
        <button
          onClick={() => onAnalyze(SAMPLE_EDITORIAL)}
          className="text-primary hover:underline underline-offset-2 font-mono"
        >
          Spotify Editorial
        </button>
      </div>
    </motion.div>
  );
}
