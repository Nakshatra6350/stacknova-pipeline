-- Why your OTP dies in 30 seconds: the SQL behind the guide.
-- psql -f otp.sql, on an empty database. The expected tag or row is in each comment.
DROP TABLE IF EXISTS otp_accounts, otp_tries, sms_codes, recovery_codes;
DROP FUNCTION IF EXISTS wrong_code;
CREATE EXTENSION IF NOT EXISTS pgcrypto; -- for hmac()

-- 1. A code works once: spend its step
CREATE TABLE otp_accounts (
  account_id bigint PRIMARY KEY,
  secret     bytea  NOT NULL,
  last_step  bigint NOT NULL DEFAULT 0
);
INSERT INTO otp_accounts (account_id, secret) VALUES (7, 'sealed'), (8, 'sealed');

UPDATE otp_accounts SET last_step = 59781920
WHERE account_id = 7 AND last_step < 59781920;  -- UPDATE 1: you're in
UPDATE otp_accounts SET last_step = 59781920
WHERE account_id = 7 AND last_step < 59781920;  -- UPDATE 0: already spent
UPDATE otp_accounts SET last_step = 59781920
WHERE account_id = 8 AND last_step < 59781920;  -- UPDATE 1: another account
UPDATE otp_accounts SET last_step = 59781921
WHERE account_id = 7 AND last_step < 59781921;  -- UPDATE 1: the next step's code

-- 2. Five wrong tries lock one account for 15 minutes
CREATE TABLE otp_tries (
  account_id   bigint PRIMARY KEY,
  failed       int NOT NULL DEFAULT 0,
  locked_until timestamptz
);
-- a helper for this file: real code runs the INSERT below after a wrong code
CREATE FUNCTION wrong_code(a bigint) RETURNS TABLE (failed int, locked boolean)
LANGUAGE sql AS $$
  INSERT INTO otp_tries AS t (account_id, failed) VALUES (a, 1)
  ON CONFLICT (account_id) DO UPDATE SET
    failed = t.failed + 1,
    locked_until = CASE WHEN t.failed + 1 >= 5
                        THEN now() + interval '15 minutes' END
  RETURNING t.failed, t.locked_until IS NOT NULL
$$;
SELECT * FROM wrong_code(7);  -- 1 | f
SELECT * FROM wrong_code(7);  -- 2 | f
SELECT * FROM wrong_code(7);  -- 3 | f
SELECT * FROM wrong_code(7);  -- 4 | f
SELECT * FROM wrong_code(7);  -- 5 | t

SELECT locked_until > now() AS locked
FROM otp_tries WHERE account_id = 7;  -- t: refuse before checking the code
SELECT count(*) AS other_accounts_locked
FROM otp_tries WHERE account_id = 8;  -- 0: account 8 is untouched
DELETE FROM otp_tries WHERE account_id = 7;  -- DELETE 1: after a right code

-- 3. SMS codes: the server makes one, stores only its HMAC, and it expires
CREATE TABLE sms_codes (
  phone      text PRIMARY KEY,           -- one live code per phone
  code_hmac  bytea NOT NULL,
  expires_at timestamptz NOT NULL,
  tries      int NOT NULL DEFAULT 0
);
INSERT INTO sms_codes (phone, code_hmac, expires_at)
VALUES ('+15555550100', hmac('482913', 'server-key', 'sha256'),
        now() + interval '5 minutes')
ON CONFLICT (phone) DO UPDATE SET
  code_hmac = EXCLUDED.code_hmac, expires_at = EXCLUDED.expires_at, tries = 0;

-- a wrong code: nothing to delete, so count the try
DELETE FROM sms_codes WHERE phone = '+15555550100'
  AND code_hmac = hmac('000000', 'server-key', 'sha256')
  AND expires_at > now() AND tries < 5;          -- DELETE 0: wrong
UPDATE sms_codes SET tries = tries + 1
WHERE phone = '+15555550100';                    -- UPDATE 1
-- the right code: deleting the row is what makes it work once
DELETE FROM sms_codes WHERE phone = '+15555550100'
  AND code_hmac = hmac('482913', 'server-key', 'sha256')
  AND expires_at > now() AND tries < 5;          -- DELETE 1: you're in
DELETE FROM sms_codes WHERE phone = '+15555550100'
  AND code_hmac = hmac('482913', 'server-key', 'sha256')
  AND expires_at > now() AND tries < 5;          -- DELETE 0: already used

-- 4. Recovery codes: stored hashed, each works once
CREATE TABLE recovery_codes (
  account_id bigint NOT NULL,
  code_hash  bytea  NOT NULL,
  used_at    timestamptz,
  PRIMARY KEY (account_id, code_hash)
);
INSERT INTO recovery_codes (account_id, code_hash)
VALUES (7, sha256('4HX2-9QTM-7KPV-R3WZ')), (7, sha256('T8NC-2JFD-6YBL-Q5GA'));

UPDATE recovery_codes SET used_at = now()
WHERE account_id = 7 AND code_hash = sha256('4HX2-9QTM-7KPV-R3WZ')
  AND used_at IS NULL;                           -- UPDATE 1: you're in
UPDATE recovery_codes SET used_at = now()
WHERE account_id = 7 AND code_hash = sha256('4HX2-9QTM-7KPV-R3WZ')
  AND used_at IS NULL;                           -- UPDATE 0: already used
UPDATE recovery_codes SET used_at = now()
WHERE account_id = 8 AND code_hash = sha256('T8NC-2JFD-6YBL-Q5GA')
  AND used_at IS NULL;                           -- UPDATE 0: someone else's

-- 5. Clean up: nobody needs a spent SMS code, or one that has expired
DELETE FROM sms_codes WHERE expires_at < now() - interval '1 day';  -- DELETE 0
