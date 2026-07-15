/**
 * Compliance / view-key attestation (selective disclosure, ADR-019).
 *
 * A grantee holding a scoped viewing grant (an exchange, auditor, or regulated
 * counterparty) reconstructs a grantor's shielded portfolio locally
 * (`scanAndReconstructBalances`) and then produces a **portable, tamper-evident
 * attestation**: a compact document asserting the balances observed as of a
 * specific block and shielded state root, bound to the grant.
 *
 * The attestation is the selective-disclosure output: the grantor reveals
 * exactly the scope the grant permits, to exactly the party the grant names,
 * and the recipient can hand the signed artifact to a third party who can
 * verify integrity without any chain access.
 *
 * Design goals (shared verbatim with the Python and Go SDKs):
 *  - Deterministic digest: a canonical serialization hashed with SHA-256, so
 *    the same portfolio yields the same digest across all three SDKs.
 *  - Cross-checkable: carries the node's `mersennet_viewPortfolioDigest` when
 *    available and flags whether the local reconstruction matches.
 *  - Dependency-free signing: signing/verification are injected callbacks.
 */

import { createHash } from 'crypto';
import type { BalanceReconstructionResult } from './reconstruction';

export const ATTESTATION_VERSION = 'mersennet-attestation-v1';

/** Signs a digest (hex) and returns a signature (hex). */
export type AttestationSigner = (digestHex: string) => string | Promise<string>;
/** Verifies a signature over a digest by the named attester. */
export type AttestationVerifier = (
  digestHex: string,
  signatureHex: string,
  attester?: string
) => boolean | Promise<boolean>;

export interface ComplianceAttestation {
  version: string;
  grantId: string;
  grantorCommitment: string;
  blockNumber: number;
  shieldedStateRoot: string;
  /** assetId -> balance, as decimal strings (JSON-safe for bigints). */
  perAsset: Record<string, string>;
  unspentNoteCount: number;
  spentNullifierCount: number;
  portfolioDigest: string;
  issuedAt: number;
  scope: string;
  onchainPortfolioDigest?: string;
  digestMatchesOnchain?: boolean;
  attester?: string;
  signature?: string;
}

function canonicalPreimage(
  grantId: string,
  grantorCommitment: string,
  blockNumber: number,
  shieldedStateRoot: string,
  perAsset: Record<number, bigint>,
  unspentNoteCount: number,
  spentNullifierCount: number
): string {
  const ids = Object.keys(perAsset)
    .map((k) => Number(k))
    .sort((a, b) => a - b);
  const assets = ids.map((id) => `${id}:${perAsset[id].toString()}`).join('|');
  return [
    ATTESTATION_VERSION,
    grantId.toLowerCase(),
    grantorCommitment.toLowerCase(),
    String(blockNumber),
    shieldedStateRoot.toLowerCase(),
    assets,
    String(unspentNoteCount),
    String(spentNullifierCount),
  ].join('\n');
}

/**
 * Deterministic 0x-hex SHA-256 digest over the disclosed facts. Identical
 * across the TypeScript/Python/Go SDKs.
 */
export function computePortfolioDigest(
  grantId: string,
  grantorCommitment: string,
  blockNumber: number,
  shieldedStateRoot: string,
  perAsset: Record<number, bigint>,
  unspentNoteCount: number,
  spentNullifierCount: number
): string {
  const preimage = canonicalPreimage(
    grantId,
    grantorCommitment,
    blockNumber,
    shieldedStateRoot,
    perAsset,
    unspentNoteCount,
    spentNullifierCount
  );
  return '0x' + createHash('sha256').update(preimage, 'utf8').digest('hex');
}

export interface BuildAttestationOptions {
  grantorCommitment?: string;
  scope?: string;
  /** From `mersennet_viewPortfolioDigest`; enables the local-vs-chain cross-check. */
  onchainPortfolioDigest?: string;
  attester?: string;
  sign?: AttestationSigner;
  /** Unix seconds; defaults to now. */
  issuedAt?: number;
}

/**
 * Build a compliance attestation from a reconstructed balance result
 * (typically from `scanAndReconstructBalances`).
 */
export async function buildPortfolioAttestation(
  result: BalanceReconstructionResult,
  options: BuildAttestationOptions = {}
): Promise<ComplianceAttestation> {
  const grantorCommitment = options.grantorCommitment ?? '0x';
  const scope = options.scope ?? 'balances:read';

  const digest = computePortfolioDigest(
    result.grantId,
    grantorCommitment,
    result.blockNumber,
    result.shieldedStateRoot,
    result.perAsset,
    result.unspentNoteCount,
    result.spentNullifierCount
  );

  const perAsset: Record<string, string> = {};
  for (const id of Object.keys(result.perAsset).map(Number).sort((a, b) => a - b)) {
    perAsset[String(id)] = result.perAsset[id].toString();
  }

  let digestMatchesOnchain: boolean | undefined;
  if (options.onchainPortfolioDigest !== undefined) {
    digestMatchesOnchain =
      options.onchainPortfolioDigest.toLowerCase() === digest.toLowerCase();
  }

  const signature = options.sign ? await options.sign(digest) : undefined;

  return {
    version: ATTESTATION_VERSION,
    grantId: result.grantId,
    grantorCommitment,
    blockNumber: result.blockNumber,
    shieldedStateRoot: result.shieldedStateRoot,
    perAsset,
    unspentNoteCount: result.unspentNoteCount,
    spentNullifierCount: result.spentNullifierCount,
    portfolioDigest: digest,
    issuedAt: options.issuedAt ?? Math.floor(Date.now() / 1000),
    scope,
    onchainPortfolioDigest: options.onchainPortfolioDigest,
    digestMatchesOnchain,
    attester: options.attester,
    signature,
  };
}

export interface VerifyResult {
  ok: boolean;
  reason: string;
}

/**
 * Verify an attestation's integrity (recompute the digest from its own
 * disclosed fields) and, if a verifier is supplied and a signature is present,
 * its signature.
 */
export async function verifyAttestation(
  attestation: ComplianceAttestation,
  verifySig?: AttestationVerifier
): Promise<VerifyResult> {
  const perAsset: Record<number, bigint> = {};
  for (const [k, v] of Object.entries(attestation.perAsset)) {
    perAsset[Number(k)] = BigInt(v);
  }

  const recomputed = computePortfolioDigest(
    attestation.grantId,
    attestation.grantorCommitment,
    attestation.blockNumber,
    attestation.shieldedStateRoot,
    perAsset,
    attestation.unspentNoteCount,
    attestation.spentNullifierCount
  );

  if (recomputed.toLowerCase() !== attestation.portfolioDigest.toLowerCase()) {
    return { ok: false, reason: 'digest mismatch: attestation fields do not hash to the embedded digest' };
  }
  if (attestation.digestMatchesOnchain === false) {
    return { ok: false, reason: 'reconstructed digest did not match the on-chain portfolio digest' };
  }
  if (verifySig) {
    if (!attestation.signature) {
      return { ok: false, reason: 'signature required but missing' };
    }
    const valid = await verifySig(attestation.portfolioDigest, attestation.signature, attestation.attester);
    if (!valid) {
      return { ok: false, reason: 'signature verification failed' };
    }
  }
  return { ok: true, reason: 'ok' };
}
