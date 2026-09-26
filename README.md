<p align="center"><a href="https://mersennet.com"><img src="https://raw.githubusercontent.com/mersennet/.github/main/profile/mark.svg" width="72" alt="Mersennet"></a></p>
<h1 align="center">Mersennet TypeScript SDK</h1>
<p align="center">
  <a href="https://www.npmjs.com/package/@mersennet/sdk"><img src="https://img.shields.io/npm/v/@mersennet/sdk?style=flat-square&color=7dff9b&label=npm" alt="npm"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-7dff9b?style=flat-square" alt="MIT license"></a>
  <a href="https://github.com/mersennet/sdk-ts/actions/workflows/ci.yml"><img src="https://github.com/mersennet/sdk-ts/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI"></a>
  <a href="https://docs.mersennet.com/developers/sdks/javascript/"><img src="https://img.shields.io/badge/docs-mersennet-1c1c1c?style=flat-square" alt="Docs"></a>
  <a href="https://t.me/Mersennet"><img src="https://img.shields.io/badge/telegram-%40Mersennet-26A5E4?style=flat-square" alt="Telegram"></a>
</p>

`@mersennet/sdk` — the official TypeScript client for
[Mersennet](https://mersennet.com), the private, verifiable network.

- **JSON-RPC provider** — `eth_*` plus the `mersennet_*` shielded namespace
- **MersennetOrders client** — place/cancel orders on the native on-chain order book
- **ShieldedClient** — viewing keys, owner-side note scanning, client-side
  balance/position reconstruction, in-browser Noir proving (pluggable backend)
- **WebSocket subscriptions** — blocks, orders, fills

## Install

```bash
npm install @mersennet/sdk
```

Every GitHub release is published to npm as [`@mersennet/sdk`](https://www.npmjs.com/package/@mersennet/sdk)
with a provenance statement (`npm audit signatures` checks the tarball against the
tagged source). Installing straight from a tag also works:
`npm install github:mersennet/sdk-ts#semver:^0.1` (builds on install, Node ≥ 20).

## Quick start

```ts
import { MersennetProvider, ShieldedClient, ViewingKeyHelpers } from '@mersennet/sdk';

const provider = new MersennetProvider('https://rpc.mersennet.com');
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

---

<p align="center">
  Part of the <a href="https://github.com/mersennet">Mersennet</a> ecosystem —
  <a href="https://trade.mersennet.com">trade</a> ·
  <a href="https://explorer.mersennet.com">explorer</a> ·
  <a href="https://docs.mersennet.com">docs</a> ·
  <a href="https://mersennet.com/downloads/">run a node</a> ·
  <a href="https://t.me/Mersennet">Telegram</a><br>
  <sub>© 2026 Mersennet Foundation · MIT License · security@mersennet.com</sub>
</p>
