import { useState } from "react";
import { useAccount, useConnect, useContractWrite, useWaitForTransaction } from "wagmi";
import { parseUnits } from "viem";
import { Coins, Loader2, Wallet } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const DEGEN_CONTRACT = "0x4ed4e862860bed51a9570b96d89af5e1b0efefed" as const;
const ERC20_ABI = [
  {
    name: "transfer",
    type: "function" as const,
    stateMutability: "nonpayable" as const,
    inputs: [
      { name: "to", type: "address" as const },
      { name: "amount", type: "uint256" as const },
    ],
    outputs: [{ name: "", type: "bool" as const }],
  },
] as const;

const TIP_AMOUNTS = [10, 50, 100];

interface TipButtonProps {
  recipientAddress?: string | null;
  recipientName?: string;
  postId: string;
  recipientUserId: string;
  onTipLogged?: (amount: number) => void;
}

export function TipButton({ recipientAddress, recipientName, postId, recipientUserId, onTipLogged }: TipButtonProps) {
  const { user } = useAuth();
  const { isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const [open, setOpen] = useState(false);
  const [selectedAmount, setSelectedAmount] = useState<number | null>(null);

  const { write, data, isLoading: isPending } = useContractWrite({
    address: DEGEN_CONTRACT,
    abi: ERC20_ABI,
    functionName: "transfer" as any,
    onSuccess: async () => {
      toast.success(`Tipped ${selectedAmount} $DEGEN to ${recipientName || "author"}!`);
      // Log tip to database
      if (selectedAmount && user) {
        try {
          await supabase.from("songfit_tips").insert({
            post_id: postId,
            tipper_user_id: user.id,
            recipient_user_id: recipientUserId,
            amount: selectedAmount,
          });
          onTipLogged?.(selectedAmount);
        } catch (e) {
          console.error("Failed to log tip:", e);
        }
      }
      setOpen(false);
    },
    onError: (err: any) => {
      toast.error(err.message?.slice(0, 80) || "Transaction failed");
    },
  } as any);

  const { isLoading: isConfirming } = useWaitForTransaction({ hash: data?.hash });

  const handleTip = (amount: number) => {
    if (!recipientAddress || !write) return;
    setSelectedAmount(amount);
    (write as any)({
      args: [recipientAddress as `0x${string}`, parseUnits(amount.toString(), 18)],
    });
  };

  // No wallet address on author
  if (!recipientAddress) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button className="p-2.5 opacity-30 cursor-not-allowed" disabled>
            <Coins size={20} className="text-muted-foreground" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">Author hasn't connected a wallet</TooltipContent>
      </Tooltip>
    );
  }

  // User not logged in
  if (!user) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button className="p-2.5 opacity-50 cursor-not-allowed" disabled>
            <Coins size={20} className="text-muted-foreground" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">Sign in to tip</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="p-2.5 hover:opacity-70 active:scale-90 transition-all">
          <Coins size={20} className="text-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-3" align="start">
        <p className="text-xs font-semibold mb-2">Tip $DEGEN</p>
        {!isConnected ? (
          <div className="space-y-2">
            <p className="text-[11px] text-muted-foreground">Connect your wallet to tip</p>
            {connectors.slice(0, 3).map((c) => (
              <Button
                key={c.id}
                variant="outline"
                size="sm"
                className="w-full gap-1.5 text-xs"
                onClick={() => connect({ connector: c })}
              >
                <Wallet size={12} />
                {c.name}
              </Button>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex gap-1.5">
              {TIP_AMOUNTS.map((amt) => (
                <Button
                  key={amt}
                  variant="outline"
                  size="sm"
                  className="flex-1 text-xs font-mono"
                  disabled={isPending || isConfirming}
                  onClick={() => handleTip(amt)}
                >
                  {isPending || isConfirming ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    `${amt}`
                  )}
                </Button>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground text-center">
              on Base · gas {"<"} $0.01
            </p>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
