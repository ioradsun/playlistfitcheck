import { useAccount, useConnect, useDisconnect } from "wagmi";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Wallet, Unplug, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { useEffect, useState } from "react";

export function ConnectWalletButton() {
  const { user, profile, refreshProfile } = useAuth();
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!user || !address) return;
    const saved = (profile as any)?.wallet_address;
    if (saved === address) return;
    supabase
      .from("profiles")
      .update({ wallet_address: address } as any)
      .eq("id", user.id)
      .then(({ error }) => {
        if (error) toast.error("Failed to save wallet");
        else refreshProfile();
      });
  }, [address, user]);

  const handleDisconnect = async () => {
    disconnect();
    if (user) {
      await supabase
        .from("profiles")
        .update({ wallet_address: null } as any)
        .eq("id", user.id);
      refreshProfile();
    }
  };

  const truncate = (addr: string) => `${addr.slice(0, 6)}…${addr.slice(-4)}`;

  const copyAddress = () => {
    if (!address) return;
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (isConnected && address) {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20 text-sm font-mono">
          <Wallet size={14} className="text-primary" />
          <span>{truncate(address)}</span>
          <button onClick={copyAddress} className="ml-1 text-muted-foreground hover:text-foreground">
            {copied ? <Check size={12} /> : <Copy size={12} />}
          </button>
        </div>
        <Button variant="ghost" size="sm" onClick={handleDisconnect} className="gap-1.5 text-muted-foreground">
          <Unplug size={14} /> Disconnect
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {connectors.map((connector) => (
        <Button
          key={connector.id}
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => connect({ connector })}
        >
          <Wallet size={14} />
          {connector.name}
        </Button>
      ))}
    </div>
  );
}
