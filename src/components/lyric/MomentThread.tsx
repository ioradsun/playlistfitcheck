import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Comment } from "@/components/lyric/modes/types";

const DEFAULT_REACTIONS = ["🔥", "❤", "💯", "😭", "👏", "🤯"];

interface MomentThreadProps {
  header: ReactNode;
  comments: Comment[];
  profileMap: Record<string, { avatarUrl: string | null; displayName: string | null }>;
  currentUserId: string | null;
  replyTargetId: string | null;
  onBack: () => void;
  onReplyTarget: (commentId: string | null) => void;
  onReact: (commentId: string, emoji: string, toggle: boolean) => void;
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.max(0, now - then);
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d`;
  const mo = Math.floor(d / 30);
  return `${mo}mo`;
}

interface CommentRowProps {
  comment: Comment;
  profile: { avatarUrl: string | null; displayName: string | null } | null;
  isReply: boolean;
  isReplyTarget: boolean;
  onTap: () => void;
  onLongPress: () => void;
  onReactPillTap: (emoji: string) => void;
}

function CommentRow({ comment, profile, isReply, isReplyTarget, onTap, onLongPress, onReactPillTap }: CommentRowProps) {
  const pressTimerRef = useRef<number | null>(null);
  const didLongPressRef = useRef(false);

  const handlePointerDown = () => {
    didLongPressRef.current = false;
    pressTimerRef.current = window.setTimeout(() => {
      didLongPressRef.current = true;
      onLongPress();
    }, 500);
  };
  const clearTimer = () => {
    if (pressTimerRef.current) {
      window.clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
  };
  const handlePointerUp = () => {
    clearTimer();
    if (!didLongPressRef.current) onTap();
  };

  return (
    <div
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={clearTimer}
      onPointerLeave={clearTimer}
      style={{
        display: "flex",
        gap: 8,
        padding: "6px 8px",
        marginLeft: isReply ? 20 : 0,
        borderLeft: isReply ? "1px solid rgba(255,255,255,0.08)" : "none",
        background: isReplyTarget ? "rgba(74, 222, 128, 0.08)" : "transparent",
        borderRadius: 6,
        cursor: "pointer",
        userSelect: "none",
        WebkitUserSelect: "none",
        touchAction: "none",
      }}
    >
      {profile?.avatarUrl ? (
        <img
          src={profile.avatarUrl}
          style={{ width: 18, height: 18, borderRadius: "50%", flexShrink: 0, marginTop: 2 }}
        />
      ) : (
        <div
          style={{
            width: 18,
            height: 18,
            borderRadius: "50%",
            background: "rgba(255,255,255,0.08)",
            flexShrink: 0,
            marginTop: 2,
          }}
        />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 2 }}>
          <span style={{ fontSize: 11, fontFamily: "monospace", color: "rgba(255,255,255,0.6)" }}>
            {profile?.displayName ?? "anon"}
          </span>
          <span style={{ fontSize: 9, fontFamily: "monospace", color: "rgba(255,255,255,0.25)" }}>
            {relativeTime(comment.created_at)}
          </span>
        </div>
        <p style={{ margin: 0, fontSize: 12, fontFamily: "monospace", color: "rgba(255,255,255,0.75)", lineHeight: 1.4, wordBreak: "break-word" }}>
          {comment.text}
        </p>
        {Object.keys(comment.reactions.emojiCounts).length > 0 && (
          <div style={{ display: "flex", gap: 4, marginTop: 4, flexWrap: "wrap" }}>
            {Object.entries(comment.reactions.emojiCounts).map(([emoji, count]) => {
              const active = comment.reactions.userReactions.includes(emoji);
              return (
                <button
                  key={emoji}
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onReactPillTap(emoji); }}
                  onPointerDown={(e) => e.stopPropagation()}
                  style={{
                    fontSize: 10,
                    fontFamily: "monospace",
                    padding: "2px 6px",
                    borderRadius: 999,
                    background: active ? "rgba(255, 140, 40, 0.18)" : "rgba(255,255,255,0.04)",
                    border: `1px solid ${active ? "rgba(255, 140, 40, 0.4)" : "rgba(255,255,255,0.06)"}`,
                    color: "rgba(255,255,255,0.7)",
                    cursor: "pointer",
                  }}
                >
                  {emoji} {count}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export function MomentThread({
  header,
  comments,
  profileMap,
  currentUserId,
  replyTargetId,
  onBack,
  onReplyTarget,
  onReact,
}: MomentThreadProps) {
  void currentUserId;
  const [reactionPickerFor, setReactionPickerFor] = useState<string | null>(null);

  useEffect(() => {
    if (!reactionPickerFor) return;
    const handler = () => setReactionPickerFor(null);
    const t = window.setTimeout(() => {
      window.addEventListener("pointerdown", handler, { once: true });
    }, 50);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("pointerdown", handler);
    };
  }, [reactionPickerFor]);

  const topLevel = comments.filter((c) => c.parent_comment_id === null);
  const repliesByParent: Record<string, Comment[]> = {};
  for (const c of comments) {
    if (c.parent_comment_id) {
      if (!repliesByParent[c.parent_comment_id]) repliesByParent[c.parent_comment_id] = [];
      repliesByParent[c.parent_comment_id].push(c);
    }
  }

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", position: "relative" }}>
      <div style={{ flexShrink: 0, padding: "8px 12px", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
        <button
          type="button"
          onClick={onBack}
          style={{
            fontSize: 11,
            fontFamily: "monospace",
            color: "rgba(255,255,255,0.45)",
            background: "none",
            border: "none",
            padding: "4px 0",
            cursor: "pointer",
            marginBottom: 4,
          }}
        >
          ← back
        </button>
        {header}
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "8px 4px" }}>
        {topLevel.length === 0 ? (
          <p style={{ fontSize: 11, fontFamily: "monospace", color: "rgba(255,255,255,0.25)", textAlign: "center", padding: 24 }}>
            be the first to say something
          </p>
        ) : (
          topLevel.map((comment) => {
            const profile = comment.user_id ? profileMap[comment.user_id] ?? null : null;
            const replies = repliesByParent[comment.id] ?? [];
            const showPicker = reactionPickerFor === comment.id;
            return (
              <div key={comment.id} style={{ position: "relative" }}>
                <CommentRow
                  comment={comment}
                  profile={profile}
                  isReply={false}
                  isReplyTarget={replyTargetId === comment.id}
                  onTap={() => onReplyTarget(replyTargetId === comment.id ? null : comment.id)}
                  onLongPress={() => setReactionPickerFor(comment.id)}
                  onReactPillTap={(emoji) => {
                    const had = comment.reactions.userReactions.includes(emoji);
                    onReact(comment.id, emoji, !had);
                  }}
                />
                {showPicker && (
                  <div
                    style={{
                      position: "absolute",
                      left: 28,
                      top: -6,
                      display: "flex",
                      gap: 4,
                      padding: "4px 8px",
                      background: "rgba(20, 20, 24, 0.95)",
                      border: "1px solid rgba(255, 255, 255, 0.08)",
                      borderRadius: 999,
                      zIndex: 10,
                      boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
                    }}
                  >
                    {DEFAULT_REACTIONS.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          const had = comment.reactions.userReactions.includes(emoji);
                          onReact(comment.id, emoji, !had);
                          setReactionPickerFor(null);
                        }}
                        style={{
                          fontSize: 14,
                          background: "none",
                          border: "none",
                          padding: "2px 4px",
                          cursor: "pointer",
                          lineHeight: 1,
                        }}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                )}
                {replies.map((reply) => {
                  const rp = reply.user_id ? profileMap[reply.user_id] ?? null : null;
                  const replyShowPicker = reactionPickerFor === reply.id;
                  return (
                    <div key={reply.id} style={{ position: "relative" }}>
                      <CommentRow
                        comment={reply}
                        profile={rp}
                        isReply={true}
                        isReplyTarget={replyTargetId === reply.id}
                        onTap={() => onReplyTarget(replyTargetId === reply.id ? null : reply.id)}
                        onLongPress={() => setReactionPickerFor(reply.id)}
                        onReactPillTap={(emoji) => {
                          const had = reply.reactions.userReactions.includes(emoji);
                          onReact(reply.id, emoji, !had);
                        }}
                      />
                      {replyShowPicker && (
                        <div
                          style={{
                            position: "absolute",
                            left: 48,
                            top: -6,
                            display: "flex",
                            gap: 4,
                            padding: "4px 8px",
                            background: "rgba(20, 20, 24, 0.95)",
                            border: "1px solid rgba(255, 255, 255, 0.08)",
                            borderRadius: 999,
                            zIndex: 10,
                            boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
                          }}
                        >
                          {DEFAULT_REACTIONS.map((emoji) => (
                            <button
                              key={emoji}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                const had = reply.reactions.userReactions.includes(emoji);
                                onReact(reply.id, emoji, !had);
                                setReactionPickerFor(null);
                              }}
                              style={{
                                fontSize: 14,
                                background: "none",
                                border: "none",
                                padding: "2px 4px",
                                cursor: "pointer",
                                lineHeight: 1,
                              }}
                            >
                              {emoji}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
