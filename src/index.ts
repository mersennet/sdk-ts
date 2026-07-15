/**
 * @mersennet/sdk - TypeScript SDK for Mersennet
 *
 * Mersennet is a Layer 1 blockchain with JSON-RPC API and WebSocket subscriptions.
 * This SDK provides a typed interface for eth_*, mersennet_*, and mersennet_orders_* methods.
 *
 * @example
 * ```ts
 * import { MersennetProvider, MersennetOrders } from '@mersennet/sdk';
 *
 * const provider = new MersennetProvider('http://localhost:8545');
 * const orders = new MersennetOrders(provider);
 *
 * const book = await orders.getOrderBook(1);
 * const balance = await provider.getBalance('0x...');
 * ```
 */

export { MersennetProvider } from './provider';
export { MersennetOrders } from './orders';
export { MersennetSubscription } from './subscription';
export {
  MersennetPrecompile,
  PRECOMPILE_ADDRESS,
  SELECTORS,
  encodePlaceOrder,
  encodeCancelOrder,
  encodeDepositCollateral,
  encodeWithdrawCollateral,
  encodeGetPosition,
  encodeGetCollateral,
  encodeIsLiquidatable,
  encodeGetBestBidAsk,
} from './precompile';

export type {
  Block,
  Transaction,
  Receipt,
  LogEntry,
  Order,
  OrderBook,
  OrderBookLevel,
  OrderOutcome,
  Position,
  Trade,
  CallParams,
  CodeAttestation,
  ContractPublicationStatus,
  TransactionParams,
  BatchOrderParams,
  SubscriptionEvent,
  BookUpdate,
} from './types';

// Shielded SDK (Phase 6 of the privacy redesign). Use this when
// connecting to a chain that has activated the ZK privacy hard fork.
export {
  ShieldedClient,
  ViewingKeyHelpers,
  createMockNoteDecryptor,
  createOwnerViewingMaterial,
  scanGrantedNotes,
  parseEncryptedNotePayload,
  parseShieldedNotePlaintext,
} from './shielded';
export type {
  Note,
  EncryptedNote,
  GrantedDecryptedNote,
  GrantedNoteScanOptions,
  GrantedNoteScanResult,
  GrantedViewingMaterial,
  ShieldedBalance,
  ViewingKey,
  OrderPlacePublicInputs,
  ZkProver,
  ShieldedClientOptions,
} from './shielded';
export type { Fr } from './shielded';

// Client-side portfolio reconstruction (ADR-019 balances:read).
export {
  reconstructPortfolio,
  defaultNullifierDeriver,
  scanAndReconstructBalances,
} from './reconstruction';
export type {
  NullifierDeriver,
  PortfolioNote,
  ReconstructedPortfolio,
  ReconstructOptions,
  ScanReconstructOptions,
  BalanceReconstructionResult,
} from './reconstruction';

// Client-side Noir proving (Workstream F1). The backend is injected by the
// wallet and wraps @noir-lang/noir_js + @aztec/bb.js.
export { NoirWasmProver } from './noir-prover';
export type {
  NoirCircuitName,
  NoirInputValue,
  NoirProvingBackend,
  NoirWasmProverOptions,
} from './noir-prover';

// Client-side open-order & position reconstruction (Workstream F5,
// orders:read / positions:read).
export {
  reconstructOpenOrders,
  reconstructPositions,
} from './positions';
export type {
  OrderSide,
  OrderRecord,
  FillRecord,
  OpenOrder,
  ReconstructedPosition,
  ReconstructTradingOptions,
} from './positions';

// Compliance / view-key attestation (selective disclosure, ADR-019).
export {
  buildPortfolioAttestation,
  verifyAttestation,
  computePortfolioDigest,
  ATTESTATION_VERSION,
} from './attestation';
export type {
  ComplianceAttestation,
  BuildAttestationOptions,
  AttestationSigner,
  AttestationVerifier,
  VerifyResult,
} from './attestation';

// Privacy-fork migration UX helpers (Workstream F4).
export {
  deriveMigrationNote,
  matchesMigrationNote,
  defaultNoteCommitment,
  planMigration,
  confirmMigration,
  MIGRATION_RHO_LABEL,
  MIGRATION_PSI_LABEL,
} from './migration';
export type {
  MigrationNote,
  MigrationNoteParams,
  MigrationPlan,
  MigrationConfirmation,
  NoteCommitmentHasher,
} from './migration';
