-- Idempotency in SQL: the free guide's statements (look v4 #2, Pay twice).
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f keys.sql
-- Each statement is what one request sends; the comment is what Postgres says.
DROP SCHEMA IF EXISTS keys CASCADE;
CREATE SCHEMA keys;
SET search_path = keys;

-- 1. Idempotent by design: set a value, don't change it
CREATE TABLE orders (id int PRIMARY KEY, status text NOT NULL);
CREATE TABLE wallets (id int PRIMARY KEY, balance numeric(12, 2) NOT NULL);
INSERT INTO orders VALUES (7, 'pending');
INSERT INTO wallets VALUES (1, 100.00);
UPDATE orders SET status = 'paid' WHERE id = 7;
UPDATE orders SET status = 'paid' WHERE id = 7;   -- twice: still 'paid'
UPDATE wallets SET balance = balance - 40 WHERE id = 1;
UPDATE wallets SET balance = balance - 40 WHERE id = 1;  -- twice: 20.00
SELECT status, balance FROM orders, wallets;      -- paid | 20.00

-- 2. One row per key, per account
CREATE TABLE idempotency_keys (
  account_id   text  NOT NULL,
  key          text  NOT NULL,
  request_hash text  NOT NULL,
  response     jsonb,               -- NULL while the first request runs
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, key)
);

-- 3. Claim the key: only the first insert wins
INSERT INTO idempotency_keys (account_id, key, request_hash)
VALUES ('ana', 'KX7Q2M', 'h1') ON CONFLICT DO NOTHING;  -- INSERT 0 1: charge
INSERT INTO idempotency_keys (account_id, key, request_hash)
VALUES ('ana', 'KX7Q2M', 'h1') ON CONFLICT DO NOTHING;  -- INSERT 0 0: retry

-- 4. Another account's key is another key
INSERT INTO idempotency_keys (account_id, key, request_hash)
VALUES ('bo', 'KX7Q2M', 'h9') ON CONFLICT DO NOTHING;   -- INSERT 0 1

-- 5. A retry arrives: what does it get?
SELECT request_hash = 'h1' AS same_payment,
       response IS NOT NULL AS finished
  FROM idempotency_keys
 WHERE account_id = 'ana' AND key = 'KX7Q2M';           -- t | f: 409

-- 6. The charge is done: save the reply, once
UPDATE idempotency_keys
   SET response = '{"charge_id": 1042, "amount_cents": 4999}'
 WHERE account_id = 'ana' AND key = 'KX7Q2M'
   AND response IS NULL;                                -- UPDATE 1
SELECT response->>'charge_id' AS replay
  FROM idempotency_keys
 WHERE account_id = 'ana' AND key = 'KX7Q2M';           -- 1042

-- 7. Forget keys after 24 hours
UPDATE idempotency_keys SET created_at = now() - interval '25 hours'
 WHERE account_id = 'bo';                       -- test only: a day passes
DELETE FROM idempotency_keys
 WHERE created_at < now() - interval '24 hours';        -- DELETE 1

-- 8. Queues and webhooks: remember each event you handled
CREATE TABLE processed_events (
  event_id   text PRIMARY KEY,
  handled_at timestamptz NOT NULL DEFAULT now()
);
BEGIN;
INSERT INTO processed_events (event_id)
VALUES ('evt_1') ON CONFLICT DO NOTHING;                -- INSERT 0 1: new
UPDATE orders SET status = 'shipped' WHERE id = 7;     -- the effect
COMMIT;
-- the same event, delivered again
INSERT INTO processed_events (event_id)
VALUES ('evt_1') ON CONFLICT DO NOTHING;                -- INSERT 0 0: skip
