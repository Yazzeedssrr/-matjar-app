const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const { webcrypto, createHmac } = require('node:crypto');
// The handler has only these simple annotations; run its actual source on Node 20+.
const source = readFileSync('supabase/functions/stripe-webhook/index.ts', 'utf8')
  .replace(/^import .*;\n/, '')
  .replace(/: (?:Uint8Array|RequestInit|Request|string|any)\b/g, '');
function setup(result = 'ok', fail = false) {
  let handler;
  const calls = [];
  vm.runInNewContext(source, {
    Deno: { serve: fn => handler = fn, env: { get: name => ({ STRIPE_WEBHOOK_SECRET: 'test-secret', SUPABASE_URL: 'https://example.test', SUPABASE_SERVICE_ROLE_KEY: 'test-only' })[name] } },
    crypto: webcrypto, TextEncoder, Headers, Request, Response, Date,
    console: { error() {} },
    fetch: async (url, init) => {
      calls.push({ url, body: JSON.parse(init.body) });
      return new Response(fail ? 'failed' : JSON.stringify(result), { status: fail ? 500 : 200 });
    },
  });
  return { handler, calls };
}
function request(event, timestamp = String(Math.floor(Date.now() / 1000))) {
  const payload = JSON.stringify(event);
  const signature = createHmac('sha256', 'test-secret').update(timestamp + '.' + payload).digest('hex');
  return new Request('https://example.test/webhook', { method: 'POST', body: payload, headers: { 'stripe-signature': 't=' + timestamp + ',v1=' + signature } });
}
const event = { id: 'evt_test', type: 'checkout.session.completed', data: { object: {} } };
test('verified webhook delegates one atomic RPC', async () => {
  const { handler, calls } = setup();
  assert.equal((await handler(request(event))).status, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://example.test/rest/v1/rpc/process_stripe_checkout_event');
  assert.deepEqual(calls[0].body.p_event, event);
});
test('processed duplicate acknowledged', async () => {
  const { handler } = setup('duplicate');
  assert.equal(await (await handler(request(event))).text(), 'duplicate');
});
test('database failure returns retryable 500', async () => {
  const { handler } = setup('ok', true);
  assert.equal((await handler(request(event))).status, 500);
});
test('stale and nonnumeric timestamps rejected without writes', async () => {
  const { handler, calls } = setup();
  assert.equal((await handler(request(event, '1'))).status, 400);
  assert.equal((await handler(request(event, 'NaN'))).status, 400);
  assert.equal(calls.length, 0);
});
test('unsigned request rejected', async () => {
  const { handler, calls } = setup();
  assert.equal((await handler(new Request('https://example.test', { method: 'POST', body: '{}' }))).status, 400);
  assert.equal(calls.length, 0);
});
