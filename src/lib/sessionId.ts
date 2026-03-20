// Generates a unique session ID that persists across page reloads via localStorage
const STORAGE_KEY = "fmly_session_id";
let _sessionId: string | null = null;

export function getSessionId(): string {
  if (!_sessionId) {
    try {
      _sessionId = localStorage.getItem(STORAGE_KEY);
    } catch {}
    if (!_sessionId) {
      _sessionId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      try {
        localStorage.setItem(STORAGE_KEY, _sessionId);
      } catch {}
    }
  }
  return _sessionId;
}
