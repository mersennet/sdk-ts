const assert = require('node:assert/strict');
const test = require('node:test');

const { MersennetProvider, MersennetRpcError } = require('../dist');

const REVERT = '0x08c379a0'
  + '0000000000000000000000000000000000000000000000000000000000000020'
  + '000000000000000000000000000000000000000000000000000000000000000e'
  + '756e6b6e6f776e206d61726b6574000000000000000000000000000000000000';

function stubFetch(body) {
  const prev = global.fetch;
  global.fetch = async (_url, opts) => {
    const { id } = JSON.parse(opts.body);
    return { json: async () => ({ jsonrpc: '2.0', id, ...body }) };
  };
  return () => { global.fetch = prev; };
}

test('a reverted eth_call throws with the node\'s code and revert bytes', async () => {
  const restore = stubFetch({ error: { code: 3, message: 'execution reverted: unknown market', data: REVERT } });
  try {
    const p = new MersennetProvider('http://node.test.invalid');
    await assert.rejects(p.call({ to: '0x0000000000000000000000000000000000000100', data: '0x' }), (e) => {
      assert.ok(e instanceof MersennetRpcError);
      assert.ok(e instanceof Error);
      assert.equal(e.code, 3);
      assert.equal(e.data, REVERT);
      assert.equal(e.message, 'RPC error 3: execution reverted: unknown market');
      return true;
    });
    await assert.rejects(p.estimateGas({ to: '0x0000000000000000000000000000000000000100', data: '0x01' }), (e) => e.code === 3 && e.data === REVERT);
  } finally {
    restore();
  }
});

test('an error without data keeps the message format', async () => {
  const restore = stubFetch({ error: { code: -32000, message: 'out of gas' } });
  try {
    const p = new MersennetProvider('http://node.test.invalid');
    await assert.rejects(p.call({ to: '0x0000000000000000000000000000000000000100' }), (e) => e.code === -32000 && e.data === undefined && e.message === 'RPC error -32000: out of gas');
  } finally {
    restore();
  }
});

test('a successful call still answers its result', async () => {
  const restore = stubFetch({ result: '0x2a' });
  try {
    const p = new MersennetProvider('http://node.test.invalid');
    assert.equal(await p.call({ to: '0x0000000000000000000000000000000000000100' }), '0x2a');
  } finally {
    restore();
  }
});
