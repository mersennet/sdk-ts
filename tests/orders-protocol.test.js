// The new CLOB surface: selectors match the precompile ABI, price helpers
// respect priceScale, and the RPC wrappers parse the node's shapes.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { SELECTORS, encodeSetAgent, encodeRevokeAgent, encodeLiquidate, encodeAgentOf, MersennetOrders } = require('../dist/index.js');

test('new selectors match the precompile ABI', () => {
  assert.equal(SELECTORS.setAgent, '0xb845309c');
  assert.equal(SELECTORS.revokeAgent, '0x7da6ac0d');
  assert.equal(SELECTORS.agentOf, '0xac3c0e30');
  assert.equal(SELECTORS.liquidate, '0x2f865568');
});

test('encoders lay out address and uint64 words', () => {
  const agent = '0x000000000000000000000000000000000000abcd';
  const d = encodeSetAgent(agent, 1710400);
  assert.equal(d.length, 2 + 8 + 64 + 64);
  assert.ok(d.startsWith('0xb845309c'));
  assert.ok(d.endsWith((1710400).toString(16).padStart(64, '0')));
  assert.equal(encodeRevokeAgent(agent).length, 2 + 8 + 64);
  assert.equal(encodeAgentOf(agent).slice(0, 10), '0xac3c0e30');
  assert.equal(encodeLiquidate(agent).slice(0, 10), '0x2f865568');
});

test('price helpers honour priceScale', () => {
  const m = { priceScale: 100 };
  assert.equal(MersennetOrders.toChainPrice('115.37', m), 11537n);
  assert.equal(MersennetOrders.toHumanPrice(11537n, m), 115.37);
  assert.equal(MersennetOrders.toChainPrice(77000, { priceScale: 1 }), 77000n);
});

test('getMarkets / getProtocol / getLiquidatable parse the node shapes', async () => {
  const fake = { request: async (method) => {
    if (method === 'mersennet_orders_getMarkets') return [{ id: 1, symbol: 'MRSN', tickSize: '0x1', lotSize: '0x1', lastPrice: '0x2cec', priceScale: 100, status: 'active' }];
    if (method === 'mersennet_orders_getProtocol') return { height: 5, switches: { settlementHeight: 10 }, settlementActive: false, weiPerCollateralUnit: '0x1', markets: [] };
    if (method === 'mersennet_orders_getLiquidatable') return { height: 5, accounts: ['0xabc'] };
    throw new Error('unexpected ' + method);
  } };
  const o = new MersennetOrders(fake);
  const [m] = await o.getMarkets();
  assert.deepEqual(m, { id: 1, symbol: 'MRSN', tickSize: '1', lotSize: '1', lastPrice: '11500', priceScale: 100, status: 'active' });
  assert.equal((await o.getProtocol()).switches.settlementHeight, 10);
  assert.deepEqual(await o.getLiquidatable(), ['0xabc']);
});
