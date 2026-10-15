// Runs the episode's samples against an in-memory stand-in for PostgreSQL: node --test
// The stand-in knows only the statements the samples send, and answers them the way
// PostgreSQL would ({ rows, rowCount }, a unique key refused by ON CONFLICT DO NOTHING).
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';

import { balance, post, Unbalanced } from './ledger.mjs';
import { createPayment, IllegalMove, KeyReused, transition } from './payments.mjs';
import { onEvent, verify } from './webhook.mjs';

function fakeDb() {
  const payments = [];
  const entries = [];
  const inbox = new Map();
  const sent = [];
  const answer = (rows, rowCount = rows.length) => ({ rows, rowCount });
  return {
    sent,
    payments,
    async query(sql, params) {
      sent.push(sql);
      const text = sql.replace(/\s+/g, ' ').trim();
      if (text.startsWith('INSERT INTO payments')) {
        const [merchantId, key, amount] = params;
        if (payments.some((p) => p.merchant_id === merchantId && p.idem_key === key)) {
          return answer([]);
        }
        // node-postgres returns bigint columns as strings.
        const row = { id: payments.length + 1, merchant_id: merchantId, idem_key: key,
          amount: String(amount), status: 'created' };
        payments.push(row);
        return answer([{ ...row }]);
      }
      if (text.startsWith('SELECT * FROM payments')) {
        const [merchantId, key] = params;
        return answer(payments.filter((p) => p.merchant_id === merchantId && p.idem_key === key)
          .map((p) => ({ ...p })));
      }
      if (text.startsWith('UPDATE payments SET status')) {
        const [id, from, to] = params;
        const row = payments.find((p) => p.id === id && p.status === from);
        if (row) row.status = to;
        return answer([], row ? 1 : 0);
      }
      if (text.startsWith('INSERT INTO entries')) {
        const [paymentId, accounts, amounts] = params;
        accounts.forEach((account, i) => entries.push({ paymentId, account, amount: amounts[i] }));
        return answer([], accounts.length);
      }
      if (text.startsWith('SELECT coalesce(sum(amount), 0)')) {
        const total = entries.filter((e) => e.account === params[0])
          .reduce((s, e) => s + e.amount, 0);
        return answer([{ balance: String(total) }]);
      }
      if (text.startsWith('INSERT INTO inbox')) {
        const [eventId, body] = params;
        if (inbox.has(eventId)) return answer([]);
        inbox.set(eventId, body);
        return answer([], 1);
      }
      throw new Error(`the stand-in does not know: ${text}`);
    },
    inbox,
  };
}

test('a retry with the same key gets the same payment, not a second one', async () => {
  const db = fakeDb();
  const first = await createPayment(db, 'm_1', 'order-77', 4900);
  const retry = await createPayment(db, 'm_1', 'order-77', 4900);
  assert.equal(retry.id, first.id);
  assert.equal(db.payments.length, 1);
});

test('keys are scoped to the merchant: two merchants may use the same key', async () => {
  const db = fakeDb();
  const a = await createPayment(db, 'm_1', 'order-77', 4900);
  const b = await createPayment(db, 'm_2', 'order-77', 1200);
  assert.notEqual(a.id, b.id);
  assert.equal(db.payments.length, 2);
});

test('the same key with another amount is refused', async () => {
  const db = fakeDb();
  await createPayment(db, 'm_1', 'order-77', 4900);
  await assert.rejects(createPayment(db, 'm_1', 'order-77', 5900), KeyReused);
});

test('amounts are whole cents', async () => {
  const db = fakeDb();
  await assert.rejects(createPayment(db, 'm_1', 'k', 49.99), RangeError);
  await assert.rejects(createPayment(db, 'm_1', 'k', 0), RangeError);
  assert.equal(db.sent.length, 0);
});

test('of two workers that saw the same status, only one moves the payment', async () => {
  const db = fakeDb();
  const p = await createPayment(db, 'm_1', 'k', 4900);
  assert.equal(await transition(db, p.id, 'created', 'pending'), true);
  assert.equal(await transition(db, p.id, 'pending', 'authorized'), true);
  assert.equal(await transition(db, p.id, 'pending', 'authorized'), false); // the late one
  assert.equal(db.payments[0].status, 'authorized');
});

test('a move the state machine does not allow never reaches the database', async () => {
  const db = fakeDb();
  const p = await createPayment(db, 'm_1', 'k', 4900);
  const before = db.sent.length;
  await assert.rejects(transition(db, p.id, 'created', 'captured'), IllegalMove);
  await assert.rejects(transition(db, p.id, 'refunded', 'captured'), IllegalMove);
  assert.equal(db.sent.length, before);
});

test('a movement whose entries do not net to zero is refused', async () => {
  const db = fakeDb();
  await assert.rejects(post(db, 1, [
    { account: 'psp_receivable', amount: 4900 },
    { account: 'merchant_payable', amount: -4900 },
    { account: 'fee_revenue', amount: -147 },
  ]), Unbalanced);
  assert.equal(db.sent.length, 0);
});

test('a balanced movement is written, and balances are sums of entries', async () => {
  const db = fakeDb();
  await post(db, 1, [
    { account: 'psp_receivable', amount: 4900 },
    { account: 'merchant_payable', amount: -4753 },
    { account: 'fee_revenue', amount: -147 },
  ]);
  assert.equal(db.sent.length, 1); // one statement: all entries or none
  assert.equal(await balance(db, 'psp_receivable'), 4900);
  assert.equal(await balance(db, 'fee_revenue'), -147);
});

const SECRET = 'whsec_test_only';
function sign(body, t, key = SECRET) {
  const v1 = createHmac('sha256', key).update(`${t}.${body}`).digest('hex');
  return `t=${t},v1=${v1}`;
}

test('a signature checks the body, the secret and the time', () => {
  const body = '{"id":"evt_1","type":"payment_intent.succeeded"}';
  const now = 1_800_000_000_000;
  const t = now / 1000;
  assert.equal(verify(SECRET, sign(body, t), body, now), true);
  assert.equal(verify(SECRET, sign(body, t), body.replace('evt_1', 'evt_2'), now), false);
  assert.equal(verify(SECRET, sign(body, t, 'another secret'), body, now), false);
  assert.equal(verify(SECRET, sign(body, t - 301), body, now), false); // too old: a replay
  assert.equal(verify(SECRET, 'v1=abc', body, now), false); // no timestamp
});

test('an event delivered twice is stored once; a forged one is refused', async () => {
  const db = fakeDb();
  const body = '{"id":"evt_9","type":"payment_intent.succeeded"}';
  const header = sign(body, Math.floor(Date.now() / 1000));
  assert.equal(await onEvent(db, SECRET, header, body), 200);
  assert.equal(await onEvent(db, SECRET, header, body), 200);
  assert.equal(db.inbox.size, 1);
  assert.equal(await onEvent(db, SECRET, header.replace('v1=', 'v1=00'), body), 400);
  assert.equal(db.inbox.size, 1);
});
