-- The tables behind the samples (PostgreSQL). Episode 006 — "Design a payment system".

CREATE TABLE payments (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  merchant_id text   NOT NULL,
  idem_key    text   NOT NULL,
  amount      bigint NOT NULL CHECK (amount > 0),   -- cents
  status      text   NOT NULL DEFAULT 'created',
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (merchant_id, idem_key)                    -- a key belongs to one merchant's account
);

-- Append-only: entries are never updated or deleted. Debits positive, credits negative.
CREATE TABLE entries (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  payment_id bigint NOT NULL REFERENCES payments (id),
  account    text   NOT NULL,
  amount     bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Every webhook delivery, stored once; a worker applies them.
CREATE TABLE inbox (
  event_id    text PRIMARY KEY,
  body        text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  applied_at  timestamptz
);
