// Receiving the payment provider's webhooks. Events can arrive twice and out of order, and
// anyone can send a request to the endpoint, so: check the signature, store each event once
// in an inbox table, answer 200 at once, and let a worker apply the inbox later. The worker
// moves payments with transition() (payments.mjs), so an event that arrives late changes
// nothing. The signature scheme is Stripe's: an HMAC-SHA256 of "<timestamp>.<raw body>" with
// the endpoint's secret, sent as `Stripe-Signature: t=...,v1=...`.
// Episode 006 — "Design a payment system". onEvent is shown in segment s07.
import { createHmac, timingSafeEqual } from 'node:crypto';

const safeEqual = (a, b) => a.length === b.length && timingSafeEqual(a, b);

/** Whether the header signs this exact body, within five minutes of `now` (milliseconds). */
export function verify(key, header, raw, now = Date.now()) {
  const kv = header.split(',').map((p) => p.split('='));
  const t = Number(kv.find(([k]) => k === 't')?.[1]);
  if (!t || Math.abs(now / 1000 - t) > 300) return false;
  const want = createHmac('sha256', key)
    .update(`${t}.${raw}`).digest();
  return kv.some(([k, v]) => k === 'v1' &&
    safeEqual(Buffer.from(v, 'hex'), want));
}

/** Handles one delivery; returns the HTTP status to answer with. */
export async function onEvent(db, key, header, raw) {
  if (!verify(key, header, raw)) return 400; // forged or stale
  const event = JSON.parse(raw);
  await db.query(
    `INSERT INTO inbox (event_id, body) VALUES ($1, $2)
     ON CONFLICT (event_id) DO NOTHING`, [event.id, raw]);
  // 0 rows: seen before. Either way, the provider gets 200.
  return 200;
}
