# Mersennet TypeScript SDK

`@mersennet/sdk` — the official TypeScript client for
[Mersennet](https://mersennet.com), the private, verifiable network.

- **JSON-RPC provider** — `eth_*` plus the `prime_*` shielded namespace
- **PrimeOrders client** — place/cancel orders on the native on-chain order book
- **ShieldedClient** — viewing keys, owner-side note scanning, client-side
  balance/position reconstruction, in-browser Noir proving (pluggable backend)
- **WebSocket subscriptions** — blocks, orders, fills

## Install

```bash
npm install @mersennet/sdk
```

## Quick start

```ts
import { PrimeProvider, ShieldedClient, ViewingKeyHelpers } from '@mersennet/sdk';

const provider = new PrimeProvider('https://rpc.mersennet.com');
const vk = ViewingKeyHelpers.fromSeed('my recovery phrase');
const wallet = new ShieldedClient({ provider, viewingKey: vk });

await wallet.placeOrder({ marketId: 1n, side: 'buy', price: 1043n, size: 40n });
const { perAsset } = await wallet.getBalance(); // decrypted locally
```

## Networks

| Network | Chain ID | RPC |
|---|---|---|
| Testnet | 131071 (0x1ffff) | see [network info](https://docs.mersennet.com/getting-started/network-info) |
| Mainnet | 8191 (0x1fff) | at launch |

## Development

```bash
npm install
npx tsc          # build
node --test tests/*.test.js
```

Docs: [docs.mersennet.com/developers/sdks/javascript](https://docs.mersennet.com/developers/sdks/javascript)
