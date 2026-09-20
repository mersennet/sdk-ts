/**
 * MersennetOrders - High-level API for Mersennet order book operations.
 * Uses mersennet_orders_* RPC methods and the CLOB precompile for view calls.
 */

import {
  MersennetPrecompile,
  encodeWithdrawCollateral,
  encodePlaceOrder,
  encodeCancelOrder,
  encodeDepositCollateral,
  encodeSetAgent,
  encodeRevokeAgent,
  encodeLiquidate,
} from './precompile';
import type { MersennetProvider } from './provider';
import type {
  BatchOrderParams,
  Order,
  OrderBook,
  Position,
} from './types';

/**
 * A transaction request the caller must sign. Field units match a standard
 * legacy Ethereum transaction; `to` is the CLOB precompile.
 */
export interface TxRequest {
  to: string;
  data: string;
  nonce: number;
  gasLimit: number;
  gasPrice: string; // hex wei
  chainId: number;
  value: string; // hex wei, always '0x0' for the precompile (non-payable)
}

/**
 * Signs a {@link TxRequest} and returns the raw signed transaction hex
 * (0x-prefixed). Plug in ethers/viem or any secp256k1 signer. The SDK stays
 * dependency-free by delegating signing to the caller.
 */
export type TxSigner = (tx: TxRequest) => Promise<string>;

/** Result of a signed order/collateral submission. */
/** A listed market as reported by `mersennet_orders_getMarkets`. */
export interface Market {
  id: number;
  symbol: string;
  /** Chain units (decimal string). */
  tickSize: string;
  lotSize: string;
  lastPrice: string;
  /** On-chain price = human price × priceScale (1 = integer prices). */
  priceScale: number;
  status: string;
}

/** `mersennet_orders_getProtocol`. */
export interface ClobProtocol {
  height: number;
  switches: { agentDelegationHeight: number; frameCallerHeight: number; priceScaleHeight: number; settlementHeight: number };
  agentDelegationActive: boolean;
  frameCallerActive: boolean;
  settlementActive: boolean;
  /** Hex: wei moved per collateral unit (1 before the settlement switch, 1e18 after). */
  weiPerCollateralUnit: string;
  initialMarginBps: number;
  maintenanceMarginBps: number;
  settlementInitialMarginBps: number;
  settlementMaintenanceMarginBps: number;
  insuranceFund: string;
  badDebt: string;
  markets: Array<{ id: number; symbol: string; priceScale: number }>;
}

/** `mersennet_orders_getAgents`. */
export interface AgentsView {
  owner: string;
  agentDelegationHeight: number;
  active: boolean;
  frameCallerHeight: number;
  frameCallerActive: boolean;
  height: number;
  agents: Array<{ agent: string; expiresAtBlock: number; expired: boolean }>;
}

export interface SubmitResult {
  accepted: boolean;
  txHash: string;
}

/** Parse RPC response to Order[] */
function parseOrders(raw: unknown): Order[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((o: Record<string, unknown>) => ({
    id: String(o.id ?? '0x0'),
    owner: String(o.owner ?? ''),
    market_id: String(o.market_id ?? '0x0'),
    side: (o.side === 'sell' ? 'sell' : 'buy') as 'buy' | 'sell',
    price: String(o.price ?? '0x0'),
    size: String(o.size ?? '0x0'),
    tif: (o.tif === 'ioc' ? 'ioc' : o.tif === 'fok' ? 'fok' : 'gtc') as
      | 'gtc'
      | 'ioc'
      | 'fok',
  }));
}

/** Parse RPC response to OrderBook */
function parseOrderBook(raw: unknown): OrderBook {
  const obj = raw as Record<string, unknown>;
  const bids = (Array.isArray(obj?.bids) ? obj.bids : []).map(
    (l: Record<string, unknown>) => ({
      price: String(l.price ?? '0x0'),
      size: String(l.size ?? '0x0'),
    })
  );
  const asks = (Array.isArray(obj?.asks) ? obj.asks : []).map(
    (l: Record<string, unknown>) => ({
      price: String(l.price ?? '0x0'),
      size: String(l.size ?? '0x0'),
    })
  );
  return { bids, asks };
}

const TIF_CODE: Record<'gtc' | 'ioc' | 'fok', number> = { gtc: 0, ioc: 1, fok: 2 };

/**
 * Mersennet Orders API.
 *
 * Orders, cancels and collateral moves are signed transactions to the CLOB
 * precompile — the node executes them with `caller = the tx signer`, so there
 * is no way to act for another account. Pass a {@link TxSigner} (e.g. wrapping
 * ethers/viem) to the mutating methods.
 */
export class MersennetOrders {
  private provider: MersennetProvider;

  constructor(provider: MersennetProvider) {
    this.provider = provider;
  }

  /** Build, sign and submit a precompile transaction; return {accepted, txHash}. */
  private async signAndSend(
    owner: string,
    data: string,
    gasLimit: number,
    signer: TxSigner
  ): Promise<SubmitResult> {
    const [nonce, gasPrice, chainId] = await Promise.all([
      this.provider.getTransactionCount(owner, 'pending'),
      this.provider.getGasPrice(),
      this.provider.getChainId(),
    ]);
    const raw = await signer({
      to: MersennetPrecompile.ADDRESS,
      data,
      nonce,
      gasLimit,
      gasPrice: '0x' + BigInt(gasPrice).toString(16),
      chainId,
      value: '0x0',
    });
    const txHash = await this.provider.sendRawTransaction(raw);
    return { accepted: true, txHash };
  }

  /**
   * Submit a single order as a signed transaction to the CLOB precompile.
   * `owner` must be the signer's address. Returns the tx hash; fills settle in
   * the block and are observable via the order book / trade events.
   */
  async submitOrder(
    owner: string,
    marketId: number,
    side: 'buy' | 'sell',
    price: string,
    size: string,
    tif: 'gtc' | 'ioc' | 'fok' = 'gtc',
    signer?: TxSigner
  ): Promise<SubmitResult> {
    if (!signer) {
      throw new Error(
        'submitOrder now requires a signer: orders are signed txs to the CLOB precompile (the unsigned owner-field RPC was removed for security)'
      );
    }
    const data = encodePlaceOrder(
      marketId,
      side === 'buy',
      BigInt(price.startsWith('0x') ? price : BigInt(price).toString()),
      BigInt(size.startsWith('0x') ? size : BigInt(size).toString()),
      TIF_CODE[tif]
    );
    return this.signAndSend(owner, data, 300_000, signer);
  }

  /** Cancel an order by ID (signed; the chain enforces order ownership). */
  async cancelOrder(
    owner: string,
    orderId: number,
    signer: TxSigner
  ): Promise<SubmitResult> {
    const data = encodeCancelOrder(BigInt(orderId));
    return this.signAndSend(owner, data, 200_000, signer);
  }

  /** Get order book for a market. */
  async getOrderBook(marketId: number): Promise<OrderBook> {
    const result = (await this.provider.request('mersennet_orders_getOrderBook', [
      '0x' + marketId.toString(16),
    ])) as unknown;
    if (result == null) return { bids: [], asks: [] };
    return parseOrderBook(result);
  }

  /** Get open orders for an owner. */
  async getOpenOrders(owner: string): Promise<Order[]> {
    const result = (await this.provider.request('mersennet_orders_getOpenOrders', [
      owner,
    ])) as unknown;
    return parseOrders(result);
  }

  /**
   * Collateral units per MRSN in the current era: 10^18 before the settlement
   * switch (a unit was one wei) and 1 from it (a unit is one MRSN). Read from
   * `getProtocol().weiPerCollateralUnit`, so callers can pass MRSN amounts
   * through `toCollateralUnits` and never depend on the switch height.
   */
  async collateralUnitsPerMrsn(): Promise<bigint> {
    const p = await this.getProtocol();
    let wei = 1n;
    try { wei = BigInt(p.weiPerCollateralUnit ?? 1); } catch { wei = 1n; }
    return 10n ** 18n / (wei > 0n ? wei : 1n);
  }

  /** Human MRSN amount (e.g. "10.5") → integer collateral units for the current era (floor). */
  async toCollateralUnits(mrsn: string | number): Promise<bigint> {
    const s = String(mrsn).trim();
    if (!/^\d+(\.\d+)?$/.test(s)) throw new Error(`invalid MRSN amount: ${mrsn}`);
    const [int, frac = ''] = s.split('.');
    const wei = BigInt(int) * 10n ** 18n + BigInt((frac + '0'.repeat(18)).slice(0, 18));
    return wei / (10n ** 18n / (await this.collateralUnitsPerMrsn()));
  }

  /**
   * Deposit collateral (signed tx; escrows the signer's native MRSN).
   * `amount` is in collateral units — use `toCollateralUnits("100")` to
   * deposit 100 MRSN in any era.
   */
  async depositCollateral(
    owner: string,
    amount: string,
    signer: TxSigner
  ): Promise<SubmitResult> {
    const data = encodeDepositCollateral(BigInt(amount));
    return this.signAndSend(owner, data, 200_000, signer);
  }

  /** Withdraw collateral (signed tx; the chain validates margin first). */
  async withdrawCollateral(
    owner: string,
    amount: string,
    signer: TxSigner
  ): Promise<SubmitResult> {
    const data = encodeWithdrawCollateral(BigInt(amount));
    return this.signAndSend(owner, data, 200_000, signer);
  }

  /**
   * Get position for owner in a market. Uses precompile via eth_call.
   */
  async getPosition(owner: string, marketId: number): Promise<Position> {
    const data = MersennetPrecompile.encodeGetPosition(marketId);
    const output = (await this.provider.call({
      from: owner,
      to: MersennetPrecompile.ADDRESS,
      data,
    })) as string;

    if (!output || output === '0x' || output.length < 130) {
      return { size: '0', entry_price: '0' };
    }

    const hex = output.startsWith('0x') ? output.slice(2) : output;
    const sizeHex = hex.slice(0, 64);
    const entryPriceHex = hex.slice(64, 128);

    // `size` is an int128 (two's complement in a 32-byte word): shorts are negative.
    let size = BigInt('0x' + sizeHex);
    if (size >= 1n << 255n) size -= 1n << 256n;
    const entryPrice = BigInt('0x' + entryPriceHex);

    return {
      size: size.toString(),
      entry_price: entryPrice.toString(),
    };
  }

  /**
   * Get collateral balance for owner. Uses precompile via eth_call.
   */
  async getCollateral(owner: string): Promise<string> {
    const data = MersennetPrecompile.encodeGetCollateral();
    const output = (await this.provider.call({
      from: owner,
      to: MersennetPrecompile.ADDRESS,
      data,
    })) as string;

    if (!output || output === '0x' || output.length < 66) {
      return '0';
    }

    const hex = output.startsWith('0x') ? output.slice(2) : output;
    return BigInt('0x' + hex.slice(0, 64)).toString();
  }

  /** Check if account is liquidatable (RPC). */
  async isLiquidatable(owner: string): Promise<boolean> {
    const result = (await this.provider.request('mersennet_orders_isLiquidatable', [
      owner,
    ])) as boolean;
    return result;
  }

  // ------------------------------------------------------------------
  // Protocol parameters, markets and price scale
  // ------------------------------------------------------------------

  /**
   * Every CLOB consensus switch and live parameter: margin bps, wei per
   * collateral unit, insurance fund, bad debt, each market's priceScale.
   */
  async getProtocol(): Promise<ClobProtocol> {
    return (await this.provider.request('mersennet_orders_getProtocol', [])) as ClobProtocol;
  }

  /** Listed markets with tick/lot sizes and `priceScale` (on-chain price = human × priceScale). */
  async getMarkets(): Promise<Market[]> {
    const raw = (await this.provider.request('mersennet_orders_getMarkets', [])) as Array<Record<string, unknown>>;
    return (raw || []).map((m) => ({
      id: Number(m.id),
      symbol: String(m.symbol),
      tickSize: BigInt(String(m.tickSize ?? '0x1')).toString(),
      lotSize: BigInt(String(m.lotSize ?? '0x1')).toString(),
      lastPrice: BigInt(String(m.lastPrice ?? '0x0')).toString(),
      priceScale: Number(m.priceScale ?? 1),
      status: String(m.status ?? 'active'),
    }));
  }

  /** Human price → on-chain price for `market` (rounds to the nearest unit). */
  static toChainPrice(human: number | string, market: Pick<Market, 'priceScale'>): bigint {
    return BigInt(Math.round(Number(human) * (market.priceScale || 1)));
  }

  /** On-chain price → human price for `market`. */
  static toHumanPrice(chain: bigint | string, market: Pick<Market, 'priceScale'>): number {
    return Number(BigInt(chain)) / (market.priceScale || 1);
  }

  // ------------------------------------------------------------------
  // Agent delegation (one-click trading keys)
  // ------------------------------------------------------------------

  /** Grants issued by `owner`, plus whether delegation is active on the network. */
  async getAgents(owner: string): Promise<AgentsView> {
    return (await this.provider.request('mersennet_orders_getAgents', [owner])) as AgentsView;
  }

  /** Let `agent` trade for `owner` until `expiresAtBlock` (0 = no expiry). Signed by the owner. */
  async setAgent(owner: string, agent: string, expiresAtBlock: number, signer: TxSigner): Promise<SubmitResult> {
    return this.signAndSend(owner, encodeSetAgent(agent, expiresAtBlock), 150_000, signer);
  }

  /** Revoke an agent. Signed by the owner that granted it. */
  async revokeAgent(owner: string, agent: string, signer: TxSigner): Promise<SubmitResult> {
    return this.signAndSend(owner, encodeRevokeAgent(agent), 150_000, signer);
  }

  // ------------------------------------------------------------------
  // Liquidations (keeper)
  // ------------------------------------------------------------------

  /** Accounts below maintenance margin at the head (empty before the settlement switch). */
  async getLiquidatable(): Promise<string[]> {
    const r = (await this.provider.request('mersennet_orders_getLiquidatable', [])) as { accounts?: string[] };
    return r?.accounts ?? [];
  }

  /** Liquidate `account` (anyone may call; the keeper earns half of the 1% fee into its collateral). */
  async liquidate(keeper: string, account: string, signer: TxSigner): Promise<SubmitResult> {
    return this.signAndSend(keeper, encodeLiquidate(account), 600_000, signer);
  }

  /**
   * Submit multiple orders in sequence (each a signed tx).
   */
  async submitBatchOrder(params: BatchOrderParams, signer: TxSigner): Promise<void> {
    for (const o of params.orders) {
      await this.submitOrder(
        params.owner,
        o.marketId,
        o.side,
        o.price,
        o.size,
        o.tif ?? 'gtc',
        signer
      );
    }
  }
}
