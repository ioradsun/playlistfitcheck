import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

const STORAGE_KEY = "tfm:vote_credits";
const FIRST_USE_KEY = "tfm:vote_gate_initialized";
const REQUIRED_VOTES = 3;

interface VoteGateContextValue {
  credits: number;
  required: number;
  canCreate: boolean;
  addCredit: () => void;
  spendCredits: () => void;
}

const VoteGateContext = createContext<VoteGateContextValue | null>(null);

function readCredits(): number {
  try {
    // First-ever visit — no gate. Grant full credits so first creation is free.
    // After first spend, FIRST_USE_KEY is set and the vote cycle begins.
    if (!localStorage.getItem(FIRST_USE_KEY)) {
      return REQUIRED_VOTES;
    }
    return parseInt(localStorage.getItem(STORAGE_KEY) ?? "0", 10) || 0;
  } catch { return REQUIRED_VOTES; }
}

function writeCredits(n: number): void {
  try { localStorage.setItem(STORAGE_KEY, String(n)); } catch {}
}

export function VoteGateProvider({ children }: { children: ReactNode }) {
  const [credits, setCredits] = useState(readCredits);

  const addCredit = useCallback(() => {
    setCredits(prev => {
      const next = prev + 1;
      writeCredits(next);
      return next;
    });
  }, []);

  const spendCredits = useCallback(() => {
    setCredits(0);
    writeCredits(0);
    // Mark that the user has created at least once — vote cycle begins
    try { localStorage.setItem(FIRST_USE_KEY, "1"); } catch {}
  }, []);

  return (
    <VoteGateContext.Provider value={{ credits, required: REQUIRED_VOTES, canCreate: credits >= REQUIRED_VOTES, addCredit, spendCredits }}>
      {children}
    </VoteGateContext.Provider>
  );
}

export function useVoteGate(): VoteGateContextValue {
  const ctx = useContext(VoteGateContext);
  if (!ctx) {
    // Outside provider (shareable pages, admin) — no gate
    return { credits: REQUIRED_VOTES, required: REQUIRED_VOTES, canCreate: true, addCredit: () => {}, spendCredits: () => {} };
  }
  return ctx;
}
