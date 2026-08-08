-- Multi-account Gmail sync. Run once in the Supabase SQL editor
-- (after supabase_gmail.sql).
--
-- gmail_tokens was one row per user; it is now one row per (user, gmail address)
-- so a user can sync invoices from several mailboxes into one dashboard.

UPDATE gmail_tokens SET email = '' WHERE email IS NULL;

ALTER TABLE gmail_tokens
  ALTER COLUMN email SET DEFAULT '',
  ALTER COLUMN email SET NOT NULL;

ALTER TABLE gmail_tokens DROP CONSTRAINT gmail_tokens_pkey;
ALTER TABLE gmail_tokens ADD PRIMARY KEY (user_id, email);
