-- Gmail auto-sync setup. Run once in the Supabase SQL editor.

-- Google refresh tokens (AES-encrypted by the app before insert).
CREATE TABLE IF NOT EXISTS gmail_tokens (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  refresh_token TEXT NOT NULL,
  email TEXT,
  last_synced_at TIMESTAMPTZ,
  backfill_done BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS on with NO policies: only the service-role key (server routes) can touch it.
ALTER TABLE gmail_tokens ENABLE ROW LEVEL SECURITY;

-- Realtime on purchases so open tabs get live "new invoice" notifications
-- when the background cron inserts rows.
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE purchases;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
