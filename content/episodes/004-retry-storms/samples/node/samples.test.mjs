// Runs the episode's samples against a local server that fails on purpose: node --test
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';

import { callWithBackoff } from './backoff.mjs';
import { Breaker } from './breaker.mjs';
import { RetryBudget } from './budget.mjs';
import { callNaive } from './naive.mjs';

// A server that answers 503 to the first `failures` requests, then 200.
async function flaky(failures) {
  let seen = 0;
  const server = createServer((req, res) => {
    seen += 1;
    res.statusCode = seen <= failures ? 503 : 200;
    res.end();
  });
  await new Promise((done) => server.listen(0, done));
  const url = `http://127.0.0.1:${server.address().port}/`;
  return { url, count: () => seen, close: () => new Promise((done) => server.close(done)) };
}

test('the naive retry gives up after three tries with no answer', async () => {
  await assert.rejects(callNaive('http://127.0.0.1:9/', {}), TypeError);
});

test('backoff retries a 503 until it succeeds', async () => {
  const server = await flaky(2);
  try {
    const answer = await callWithBackoff(server.url, {}, new RetryBudget(), { base: 5, cap: 20 });
    assert.equal(answer.status, 200);
    assert.equal(server.count(), 3);
  } finally {
    await server.close();
  }
});

test('an empty budget stops the retries and fails fast', async () => {
  const server = await flaky(100);
  try {
    const budget = new RetryBudget(1);
    const answer = await callWithBackoff(server.url, {}, budget, { base: 5, cap: 20 });
    assert.equal(answer.status, 503);
    assert.equal(server.count(), 2); // the first try and the one retry the budget allowed
    assert.equal(budget.canRetry(), false);
  } finally {
    await server.close();
  }
});

test('the budget refills a tenth of a token per success', () => {
  const budget = new RetryBudget(1);
  assert.equal(budget.canRetry(), true);
  for (let i = 0; i < 10; i++) budget.onSuccess();
  assert.equal(budget.canRetry(), true);
});

test('the breaker opens after the threshold and fails fast', async () => {
  const breaker = new Breaker({ threshold: 2, cooldownMs: 60_000 });
  const failing = () => Promise.reject(new Error('down'));
  await assert.rejects(breaker.call(failing), /down/);
  await assert.rejects(breaker.call(failing), /down/);
  let called = false;
  await assert.rejects(breaker.call(async () => { called = true; }), /circuit open/);
  assert.equal(called, false);
});

test('after the cooldown one probe closes the breaker', async () => {
  const breaker = new Breaker({ threshold: 1, cooldownMs: 10 });
  await assert.rejects(breaker.call(() => Promise.reject(new Error('down'))), /down/);
  await new Promise((done) => setTimeout(done, 20));
  assert.equal(await breaker.call(async () => 'ok'), 'ok');
  assert.equal(await breaker.call(async () => 'ok again'), 'ok again');
});
