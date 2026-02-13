import { useState, useEffect, useCallback, useRef } from "react";
import { motion, useDragControls } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { getSessionId } from "@/lib/sessionId";

function toEmbedUrl(url: string): string {
  if (!url) return url;
  if (url.includes("/embed/")) return url;
  const match = url.match(/open\.spotify\.com\/(track|artist|album|playlist|episode|show)\/([a-zA-Z0-9]+)/);
  if (match) {
    return `https://open.spotify.com/embed/${match[1]}/${match[2]}?utm_source=generator&theme=0`;
  }
  return url;
}

function logEngagement(trackId: string, trackName: string, artistName: string, action: string) {
  supabase.functions.invoke("track-engagement", {
    body: { trackId, trackName, artistName, action, sessionId: getSessionId() },
  }).catch(() => {});
}

const WidgetHeader = ({ title, thumbnailUrl, thumbnailLink, onPointerDown }: { title: string; thumbnailUrl?: string | null; thumbnailLink?: string | null; onPointerDown?: (e: React.PointerEvent) => void }) => (
  <div
    className="border-b border-border cursor-grab active:cursor-grabbing flex items-center gap-1.5 px-2 py-1.5"
    onPointerDown={onPointerDown}
  >
    {thumbnailUrl && (
      thumbnailLink ? (
        <a href={thumbnailLink} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="flex-shrink-0">
          <img src={thumbnailUrl} alt="" className="w-4 h-4 rounded object-cover hover:ring-1 hover:ring-primary transition-all" />
        </a>
      ) : (
        <img src={thumbnailUrl} alt="" className="w-4 h-4 rounded object-cover flex-shrink-0" />
      )
    )}
    <span className="font-mono text-[10px] text-muted-foreground truncate">{title}</span>
  </div>
);

export function PromoPlayer() {
  const [loading, setLoading] = useState(true);
  const [embedUrl, setEmbedUrl] = useState("");
  const [widgetTitle, setWidgetTitle] = useState("Featured Artist");
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [thumbnailLink, setThumbnailLink] = useState<string | null>(null);
  const constraintsRef = useRef<HTMLDivElement>(null);
  const dragControls = useDragControls();

  const fetchConfig = useCallback(async () => {
    try {
      const { data } = await supabase.from("widget_config").select("embed_url, widget_title, thumbnail_url, thumbnail_link").limit(1).single();
      if (data?.embed_url) setEmbedUrl(data.embed_url);
      if (data?.widget_title) setWidgetTitle(data.widget_title);
      if (data?.thumbnail_url) setThumbnailUrl(data.thumbnail_url);
      setThumbnailLink(data?.thumbnail_link ?? null);
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchConfig();
    const handler = () => fetchConfig();
    window.addEventListener("widget-config-updated", handler);
    return () => window.removeEventListener("widget-config-updated", handler);
  }, [fetchConfig]);

  useEffect(() => {
    if (embedUrl) {
      logEngagement("widget", "Widget", "System", "widget_open");
    }
  }, [embedUrl]);

  if (loading || !embedUrl) return null;

  return (
    <>
      <div ref={constraintsRef} className="fixed inset-0 z-30 pointer-events-none" />
      <motion.div
        drag
        dragControls={dragControls}
        dragListener={false}
        dragConstraints={constraintsRef}
        dragMomentum={false}
        className="fixed z-50 glass-card rounded-xl shadow-2xl overflow-hidden bottom-[50px] left-1/2 w-[200px]"
        style={{ x: "-50%" }}
        initial={{ opacity: 0, scale: 0.9, y: 20, x: "-50%" }}
        animate={{ opacity: 1, scale: 1, y: 0, x: "-50%" }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
      >
        <WidgetHeader title={widgetTitle} thumbnailUrl={thumbnailUrl} thumbnailLink={thumbnailLink} onPointerDown={(e) => dragControls.start(e)} />
        <iframe
          src={toEmbedUrl(embedUrl)}
          width="100%"
          height="80"
          frameBorder="0"
          allowFullScreen
          allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
          loading="lazy"
          style={{ borderRadius: "0 0 12px 12px" }}
        />
      </motion.div>
    </>
  );
}
