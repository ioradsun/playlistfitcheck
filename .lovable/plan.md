Let's keep this feature with enable/disable functionality in admin.

# Crypto Tipping with $DEGEN on CrowdFit

## Overview

Add a $DEGEN (Base chain ERC-20) tipping button to every CrowdFit post using Coinbase OnchainKit. Users connect their crypto wallet, and can tip post authors directly on-chain.

## How It Works

1. Users connect a crypto wallet (MetaMask, Coinbase Wallet, etc.) via an OnchainKit provider
2. A small tip icon appears on each post card (next to like/comment)
3. Clicking it opens a tipping modal where the user picks an amount and confirms the on-chain $DEGEN transfer
4. The tip goes directly to the post author's wallet address (stored in their profile)

## Implementation Steps

### Step 1: Database - Add wallet address to profiles

- Add a `wallet_address` column (text, nullable) to the `profiles` table
- Update RLS to allow public read of wallet addresses (already permissive for profiles)

### Step 2: Install Dependencies

- `@coinbase/onchainkit` - React components for wallet connection, token transfers
- `wagmi` + `viem` - Ethereum interaction libraries (OnchainKit peer dependencies)
- `@tanstack/react-query` is already installed

### Step 3: Wallet Provider Setup

- Create a `WalletProvider` wrapper in `src/components/crypto/WalletProvider.tsx`
- Configure OnchainKit with Base chain and the $DEGEN token contract (`0x4ed4e862860bed51a9570b96d89af5e1b0efefed`)
- Wrap the app in this provider (in `App.tsx`)

### Step 4: Wallet Connection UI

- Add a "Connect Wallet" button in the user's Profile page to link their wallet
- Save the connected wallet address to the `profiles.wallet_address` column
- Show wallet status in the navbar or profile area

### Step 5: Tip Button on Post Cards

- Add a small coin/tip icon to `SongFitPostCard.tsx` action row (next to heart and comment)
- Clicking opens a small modal/popover with preset tip amounts (e.g., 10, 50, 100 $DEGEN)
- Uses OnchainKit's transaction components to execute the ERC-20 transfer on Base
- If the post author has no wallet address set, show a disabled state with "Author hasn't connected a wallet"

### Step 6: Profile Page Updates

- Add wallet connection/disconnection on the Profile settings page
- Display wallet address (truncated) on public profiles for transparency

## Technical Details

### $DEGEN Token Info

- Chain: Base (chainId 8453)
- Contract: `0x4ed4e862860bed51a9570b96d89af5e1b0efefed`
- Decimals: 18
- Symbol: DEGEN

### Key Files to Create/Modify

- **New**: `src/components/crypto/WalletProvider.tsx` - OnchainKit + wagmi config
- **New**: `src/components/crypto/TipButton.tsx` - Tip icon + modal with transfer logic
- **New**: `src/components/crypto/ConnectWalletButton.tsx` - Wallet connection component
- **Modified**: `App.tsx` - Wrap with WalletProvider
- **Modified**: `SongFitPostCard.tsx` - Add TipButton to action row
- **Modified**: `Profile.tsx` - Add wallet connection section
- **Modified**: `PublicProfile.tsx` - Show wallet address if set
- **Migration**: Add `wallet_address` column to profiles

### Requirements

- A **WalletConnect Project ID** (free from cloud.walletconnect.com) will be needed and stored as a `VITE_` env variable since it's a public/publishable key
- Users need a Base-compatible wallet with $DEGEN tokens to tip

### Limitations

- Tips are on-chain transactions requiring gas fees (small on Base, typically less than $0.01)
- No off-chain tipping or points system - all transfers are real token movements
- Users without wallets can still use CrowdFit normally; tipping is optional