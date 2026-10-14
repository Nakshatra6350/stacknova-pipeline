// A payment is a row in PostgreSQL that moves through a fixed set of states. `db` is any client
// with query(sql, params) resolving to { rows, rowCount } (node-postgres has this shape).
// Amounts are integers in the currency's minor unit (cents), never floats. One currency keeps
// the sample short; a real table has a currency column beside the amount.
// Episode 006 — "Design a payment system". createPayment is shown in segment s04,
// transition in s05.

export class KeyReused extends Error {}
export class IllegalMove extends Error {}

/** Which status may follow which. Any other move is a bug, not a payment. */
export const NEXT = {
  created: ['pending'],
  pending: ['authorized', 'failed'],
  authorized: ['captured', 'voided'],
  captured: ['refunded'],
};

function find(db, merchantId, key) {
  return db
    .query('SELECT * FROM payments WHERE merchant_id = $1 AND idem_key = $2', [merchantId, key])
    .then((res) => res.rows[0]);
}

/**
 * Creates a payment once per idempotency key. The key is scoped to the merchant's account:
 * two merchants may pick the same key and never meet. A retry gets the payment the first
 * request made; the same key with another amount is a mistake, and is refused.
 */
export async function createPayment(db, merchantId, key, amount) {
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new RangeError('amount: whole cents');
  const ins = await db.query(
    `INSERT INTO payments (merchant_id, idem_key, amount)
     VALUES ($1, $2, $3)
     ON CONFLICT (merchant_id, idem_key) DO NOTHING
     RETURNING *`, [merchantId, key, amount]);
  if (ins.rowCount === 1) return ins.rows[0]; // first time
  const old = await find(db, merchantId, key);
  if (Number(old.amount) !== amount) throw new KeyReused(key);
  return old; // a retry gets the same payment
}

/**
 * Moves a payment from one status to the next, if nobody moved it first. The status in the
 * WHERE clause makes the check and the write one step: of two workers that both saw
 * `pending`, one updates a row and the other updates none.
 */
export async function transition(db, id, from, to) {
  if (!NEXT[from]?.includes(to)) {
    throw new IllegalMove(`${from} -> ${to}`);
  }
  const res = await db.query(
    `UPDATE payments SET status = $3
     WHERE id = $1 AND status = $2`, [id, from, to]);
  return res.rowCount === 1; // 0: someone moved it first
}
