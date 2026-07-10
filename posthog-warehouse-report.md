# PostHog Data Warehouse Setup Report

**Date:** 2026-07-10  
**Project:** ximb-mess-tracker (PostHog Project ID: 506382)

---

## Changes Made

### Supabase Connected as PostHog Data Warehouse Source

A Postgres data warehouse source was created in PostHog, connecting the project's Supabase database so its tables can be queried alongside product analytics.

- **Source type:** Postgres (Supabase Session Pooler)
- **Source ID:** `019f4cac-e2c1-0000-bf2b-710f607bfba8`
- **Prefix:** `supabase`
- **Host:** `aws-1-ap-south-1.pooler.supabase.com` (port 6543)
- **Database:** `postgres`, schema: `public`

#### Tables Syncing

| Table | Sync type | Incremental field |
|---|---|---|
| `purchases` | Incremental | `created_at` (timestamp) |
| `settings` | Incremental | `updated_at` (timestamp) |

Both tables will be available in PostHog as `supabase_purchases` and `supabase_settings`.

---

## Files Modified or Created

| File | Change |
|---|---|
| `posthog-warehouse-report.md` | Created (this file) |

No application source files were modified. This skill only connects an external data source — it does not touch project code.

---

## Manual Steps to Take Next

1. **Wait for initial sync** — Go to PostHog → Data Warehouse → Sources and confirm the Supabase source shows "Completed" for its first sync. Incremental syncs will run automatically thereafter.

2. **Query your data** — In PostHog → SQL (or any insight), you can now query:
   - `supabase_purchases` — purchase records with `id`, `user_id`, `date`, `item`, `source_file`, `total`, `created_at`
   - `supabase_settings` — user settings with `user_id`, `mess_start_date`, `advance_by_month`, `custom_total_by_month`, `updated_at`

3. **Join with PostHog events** — You can JOIN warehouse tables with PostHog's `events` or `persons` tables using `user_id`/`distinct_id` to build cross-source insights.

4. **Allowlist PostHog IPs (if needed)** — If the sync fails due to a network error, add PostHog's egress IPs to your Supabase project's firewall allowlist. See the [PostHog Postgres docs](https://posthog.com/docs/cdp/sources/postgres) for the IP list.
