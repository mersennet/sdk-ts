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

  /** Deposit collateral (signed tx; escrows the signer's native MRSN). */
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

    const size = BigInt('0x' + sizeHex);
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
