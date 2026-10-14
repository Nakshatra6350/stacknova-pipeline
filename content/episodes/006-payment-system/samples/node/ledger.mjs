// A double-entry ledger: every movement of money is a set of entries that sum to zero.
// Debits are positive and credits negative, in cents. Entries are only ever added: a mistake
// is corrected by new entries that reverse it, so the history stays whole. A balance is the
// sum of an account's entries.
// Episode 006 — "Design a payment system". Shown in segment s08.

export class Unbalanced extends Error {}

/**
 * Writes one movement. A single INSERT is atomic in PostgreSQL, so either every entry is
 * written or none is. Example, a $49.00 payment with a 3% fee:
 *   psp_receivable +4900, merchant_payable -4753, fee_revenue -147
 */
export async function post(db, paymentId, entries) {
  const sum = entries.reduce((s, e) => s + e.amount, 0);
  if (sum !== 0) throw new Unbalanced(sum); // must net to zero
  await db.query(
    `INSERT INTO entries (payment_id, account, amount)
     SELECT $1, * FROM unnest($2::text[], $3::bigint[])`,
    [paymentId, entries.map((e) => e.account),
     entries.map((e) => e.amount)]);
}

/** An account's balance: the sum of its entries. */
export async function balance(db, account) {
  const res = await db.query(
    'SELECT coalesce(sum(amount), 0) AS balance FROM entries WHERE account = $1', [account]);
  return Number(res.rows[0].balance);
}
