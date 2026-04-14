import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { createAppKit } from '@reown/appkit/react';
import { mainnet, sepolia, type AppKitNetwork } from '@reown/appkit/networks';

// Get a free Project ID at https://cloud.reown.com
export const projectId =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? '3b6b3f3b9f3b3f3b9f3b3f3b9f3b3f3b';

// Both networks registered so wagmi can connect to whichever CHAIN_ID points to.
// Production sets NEXT_PUBLIC_CHAIN_ID=1 (mainnet); local dev uses 11155111 (Sepolia).
const networks: [AppKitNetwork, ...AppKitNetwork[]] = [mainnet, sepolia];

export const wagmiAdapter = new WagmiAdapter({ networks, projectId });

createAppKit({
  adapters:  [wagmiAdapter],
  networks,
  projectId,
  metadata: {
    name:        'Maritime',
    description: 'Buy tokenised stocks with stablecoins',
    url:         'https://maritime.app',
    icons:       ['https://maritime.app/icon.png'],
  },
  features: {
    analytics:   false,
    email:       false,
    socials:     false,
  },
  themeMode: 'dark',
  themeVariables: {
    '--w3m-accent': '#00c805',
  },
});

export const wagmiConfig = wagmiAdapter.wagmiConfig;
