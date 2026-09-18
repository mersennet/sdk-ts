const test = require('node:test');
const assert = require('node:assert');
const {
  buildPortfolioAttestation,
  verifyAttestation,
  computePortfolioDigest,
} = require('../dist/attestation');

// Cross-language digest vector. This MUST equal the value pinned in the
// Python (test_reconstruction.py) and Go (reconstruction_test.go) suites,
// proving the three SDKs produce byte-identical attestation digests.
const CROSS_LANG_DIGEST =
  '0x574bebc386931031d68b18ccb0af7ac37b14278217badf0a73fc85146816c1f5';

function sampleResult() {
  return {
    perAsset: { 0: 150n, 1: 7n },
    unspentNoteCount: 3,
    spentNoteCount: 1,
    totalNoteCount: 4,
    notes: [],
    grantId: '0xGRANT',
    blockNumber: 4242,
    shieldedStateRoot: '0xROOT',
    totalEncryptedNoteCount: 4,
    fetchedEncryptedNoteCount: 4,
    skippedMalformedCount: 0,
    spentNullifierCount: 1,
  };
}

test('digest matches the cross-language vector', () => {
  const d = computePortfolioDigest('0xg', '0xc', 1, '0xr', { 0: 9n, 1: 5n }, 2, 0);
  assert.strictEqual(d, CROSS_LANG_DIGEST);
});

test('digest is asset-order independent', () => {
  const a = computePortfolioDigest('0xg', '0xc', 1, '0xr', { 1: 5n, 0: 9n }, 2, 0);
  const b = computePortfolioDigest('0xg', '0xc', 1, '0xr', { 0: 9n, 1: 5n }, 2, 0);
  assert.strictEqual(a, b);
});

test('build + verify roundtrip', async () => {
  const att = await buildPortfolioAttestation(sampleResult(), {
    grantorCommitment: '0xC',
    issuedAt: 1000,
  });
  const { ok, reason } = await verifyAttestation(att);
  assert.ok(ok, reason);
  assert.strictEqual(att.perAsset['0'], '150');
  assert.strictEqual(att.version, 'mersennet-attestation-v1');
});

test('tampering breaks verification', async () => {
  const att = await buildPortfolioAttestation(sampleResult(), { grantorCommitment: '0xC', issuedAt: 1 });
  att.perAsset['0'] = '999999';
  const { ok } = await verifyAttestation(att);
  assert.strictEqual(ok, false);
});

test('onchain digest mismatch is flagged and fails verification', async () => {
  const att = await buildPortfolioAttestation(sampleResult(), {
    grantorCommitment: '0xC',
    onchainPortfolioDigest: '0xdeadbeef',
    issuedAt: 1,
  });
  assert.strictEqual(att.digestMatchesOnchain, false);
  const { ok } = await verifyAttestation(att);
  assert.strictEqual(ok, false);
});

test('signature hook', async () => {
  const sign = (digest) => '0xSIG:' + digest.slice(-8);
  const verify = (digest, sig) => sig === '0xSIG:' + digest.slice(-8);
  const att = await buildPortfolioAttestation(sampleResult(), {
    grantorCommitment: '0xC',
    attester: 'auditor-1',
    sign,
    issuedAt: 1,
  });
  assert.ok(att.signature.startsWith('0xSIG:'));
  const { ok, reason } = await verifyAttestation(att, verify);
  assert.ok(ok, reason);
});
