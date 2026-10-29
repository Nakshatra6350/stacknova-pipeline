-- The same race, outside cinemas: the free guide's everyday scenarios (look v4 pilot).
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scenarios.sql
-- Each pair of statements is what two requests send; the comment shows what Postgres answers.
DROP SCHEMA IF EXISTS scenarios CASCADE;
CREATE SCHEMA scenarios;
SET search_path = scenarios;

-- 1. The last item in stock: never sell below zero
CREATE TABLE products (id int PRIMARY KEY,
                       stock int NOT NULL CHECK (stock >= 0));
INSERT INTO products VALUES (7, 1);
UPDATE products SET stock = stock - 1
 WHERE id = 7 AND stock >= 1;                    -- UPDATE 1: sold
UPDATE products SET stock = stock - 1
 WHERE id = 7 AND stock >= 1;                    -- UPDATE 0: sold out

-- 2. A wallet: spend only what is there
CREATE TABLE wallets (id int PRIMARY KEY,
                      balance numeric(12, 2) NOT NULL CHECK (balance >= 0));
INSERT INTO wallets VALUES (1, 50.00);
UPDATE wallets SET balance = balance - 40
 WHERE id = 1 AND balance >= 40;                 -- UPDATE 1: paid
UPDATE wallets SET balance = balance - 40
 WHERE id = 1 AND balance >= 40;                 -- UPDATE 0: not enough

-- 3. A one-time coupon
CREATE TABLE coupons (code text PRIMARY KEY, used_by text);
INSERT INTO coupons VALUES ('WELCOME10', NULL);
UPDATE coupons SET used_by = 'ana'
 WHERE code = 'WELCOME10' AND used_by IS NULL;   -- UPDATE 1
UPDATE coupons SET used_by = 'bo'
 WHERE code = 'WELCOME10' AND used_by IS NULL;   -- UPDATE 0

-- 4. A username: let the unique constraint decide
CREATE TABLE users (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
                    username text NOT NULL UNIQUE);
INSERT INTO users (username) VALUES ('nova')
    ON CONFLICT (username) DO NOTHING;           -- INSERT 0 1
INSERT INTO users (username) VALUES ('nova')
    ON CONFLICT (username) DO NOTHING;           -- INSERT 0 0: taken

-- 5. A like counter: let the database add
CREATE TABLE posts (id int PRIMARY KEY, likes int NOT NULL DEFAULT 0);
INSERT INTO posts VALUES (1, 0);
UPDATE posts SET likes = likes + 1 WHERE id = 1; -- not a number read earlier
UPDATE posts SET likes = likes + 1 WHERE id = 1;
SELECT likes FROM posts WHERE id = 1;            -- 2

-- 6. Hold a seat for 10 minutes while the person pays
CREATE TABLE show_seats (id int PRIMARY KEY, holder text, held_until timestamptz,
                         paid boolean NOT NULL DEFAULT false);
INSERT INTO show_seats (id) VALUES (42);
-- hold: only if the seat is free, or the last hold ran out unpaid
UPDATE show_seats SET holder = 'ana', held_until = now() + interval '10 minutes'
 WHERE id = 42 AND NOT paid
   AND (holder IS NULL OR held_until < now());   -- UPDATE 1: Ana holds it
UPDATE show_seats SET holder = 'bo', held_until = now() + interval '10 minutes'
 WHERE id = 42 AND NOT paid
   AND (holder IS NULL OR held_until < now());   -- UPDATE 0: held
-- (test only) ten minutes pass and Ana never pays
UPDATE show_seats SET held_until = now() - interval '1 second' WHERE id = 42;
UPDATE show_seats SET holder = 'bo', held_until = now() + interval '10 minutes'
 WHERE id = 42 AND NOT paid
   AND (holder IS NULL OR held_until < now());   -- UPDATE 1: Bo holds it
-- confirm after payment: only if the hold is still yours and still running
UPDATE show_seats SET paid = true
 WHERE id = 42 AND holder = 'ana'
   AND held_until > now();                       -- UPDATE 0: too late
UPDATE show_seats SET paid = true
 WHERE id = 42 AND holder = 'bo'
   AND held_until > now();                       -- UPDATE 1: Bo's seat
