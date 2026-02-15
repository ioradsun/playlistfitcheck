import { type ReactNode } from "react";
import { WagmiConfig, createConfig, configureChains } from "wagmi";
import { base } from "wagmi/chains";
import { publicProvider } from "wagmi/providers/public";
import { InjectedConnector } from "wagmi/connectors/injected";
import { CoinbaseWalletConnector } from "wagmi/connectors/coinbaseWallet";
import { MetaMaskConnector } from "wagmi/connectors/metaMask";

const { chains, publicClient, webSocketPublicClient } = configureChains(
  [base],
  [publicProvider()]
);

const config = createConfig({
  autoConnect: true,
  connectors: [
    new CoinbaseWalletConnector({ chains, options: { appName: "tools.fm" } }),
    new MetaMaskConnector({ chains }),
    new InjectedConnector({ chains, options: { name: "Browser Wallet" } }),
  ],
  publicClient,
  webSocketPublicClient,
});

export function WalletProvider({ children }: { children: ReactNode }) {
  return <WagmiConfig config={config}>{children}</WagmiConfig>;
}
