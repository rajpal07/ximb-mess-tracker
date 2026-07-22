# XIMB Mess Tracker

**Your mess P&L, sorted. Automatically.**

> Imagine you eat at your college mess every day. At the end of the month, you get a big bill, but you have no idea what you actually ate or how much you spent each day. That's the problem this app solves.
>
> **XIMB Mess Tracker watches your email inbox, finds your mess invoices, reads them like a human would, and builds your daily spending diary, all by itself.** You just sign in. That's it.

---

## What Does It Do?

Think of this app like a **smart diary that writes itself**.

| What you used to do manually | What the app does automatically |
|---|---|
| Open emails, find invoices | **Scans your Gmail** for invoice emails |
| Open each PDF, read line items | **Reads the PDF** and extracts every item |
| Write down "Dal, Rs 30, Rice, Rs 20" | **Logs each item** with date, name, and price |
| Add up daily totals on a calculator | **Auto-calculates** daily, monthly, and payable totals |
| Do this every single day | **Runs every day by itself** (even while you sleep) |

**Zero manual work. Zero missed invoices. Zero math errors.**

---

## The Automation Pipeline

This is the heart of the app. A fully automated pipeline that turns messy emails into clean financial data.

### How It Works (Like Explaining to a 5-Year-Old)

1. **You get an email.** The mess canteen sends you an invoice PDF to your Gmail.
2. **The app checks your mailbox.** Every day (or when you press "sync now"), it opens your Gmail and looks for emails from the mess canteen.
3. **It grabs the PDF attachment.** If the email has a file called `invoice-something.pdf`, it downloads it.
4. **It reads the PDF like a human.** The parser opens the PDF, finds the date, finds each food item and its price, and understands the table structure.
5. **It saves everything.** Each item (like "Paneer Butter Masala, Rs 45") gets saved to your personal database.
6. **You see your spending.** Open the app and your entire month's spending is laid out, day by day, item by item.

**You didn't lift a finger.**

---

## Tech Stack

| Layer | Technology | Why |
|---|---|---|
| **Frontend** | Next.js 16 + React 19 | Fast, modern, works on phones |
| **Styling** | Tailwind CSS 4 + HeroUI | Beautiful, responsive design |
| **Auth** | Supabase Auth (Google OAuth + PKCE) | Secure sign-in with Google |
| **Database** | Supabase (PostgreSQL) | Real-time, row-level security |
| **Gmail API** | Google Gmail REST API | Reads invoice emails automatically |
| **PDF Parser** | unpdf (serverless) | Extracts text from invoice PDFs |
| **Encryption** | AES-256-GCM | Gmail tokens encrypted at rest |
| **Hosting** | Vercel (Serverless) | Auto-scales, edge-fast |
| **Cron Jobs** | Vercel Cron | Daily background sync for all users |
| **Analytics** | PostHog (self-hosted proxy) | Privacy-respecting usage tracking |
| **Real-time** | Supabase Realtime | Live updates across devices |

---

## Project Structure

```
ximb-mess-tracker/
├── app/
│   ├── page.tsx                    # Main dashboard (the whole UI)
│   ├── layout.tsx                  # Root layout with SEO meta
│   ├── globals.css                 # Design system & styles
│   ├── GmailSync.tsx               # Gmail auto-sync UI component
│   ├── providers.tsx               # PostHog analytics provider
│   ├── PostHogPageView.tsx         # Page view tracking
│   ├── api/
│   │   ├── gmail/
│   │   │   ├── sync/route.ts       # Sync one user's Gmail (on-demand)
│   │   │   ├── sync-all/route.ts   # Cron: sync ALL users (daily)
│   │   │   └── store-token/route.ts # Save encrypted Gmail token
│   │   └── parse-invoice/route.ts  # Manual PDF upload parser
│   └── utils/
│       ├── gmail.ts                # Gmail API helpers (fetch, download PDFs)
│       ├── gmailSync.ts            # Core sync engine (Gmail to DB pipeline)
│       ├── invoiceParser.ts        # PDF text extraction & item parsing
│       ├── crypto.ts               # AES-256-GCM encrypt/decrypt
│       ├── supabaseAdmin.ts        # Server-side Supabase client
│       └── supabaseClient.ts       # Client-side Supabase client
├── vercel.json                     # Cron schedule config
├── supabase_schema.sql             # Purchases + settings tables
├── supabase_gmail.sql              # Gmail tokens table + realtime
└── package.json
```

---

## Environment Variables

| Variable | What It Does |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public Supabase key (safe for browsers) |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret Supabase key (server-only, bypasses RLS) |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `GMAIL_TOKEN_KEY` | 64-char hex key for encrypting Gmail tokens at rest |
| `CRON_SECRET` | Secret for authenticating Vercel Cron jobs |

### Generate `GMAIL_TOKEN_KEY`

```bash
# Option 1: OpenSSL
openssl rand -hex 32

# Option 2: Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## Getting Started

### 1. Clone & Install

```bash
git clone https://github.com/rajpal07/ximb-mess-tracker.git
cd ximb-mess-tracker
npm install
```

### 2. Set Up Supabase

1. Create a project at [supabase.com](https://supabase.com)
2. Run `supabase_schema.sql` in the SQL Editor (creates `purchases` and `settings` tables)
3. Run `supabase_gmail.sql` in the SQL Editor (creates `gmail_tokens` table + realtime)
4. Enable **Google** auth provider under Authentication > Providers
5. Copy your project URL, anon key, and service role key

### 3. Set Up Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create OAuth 2.0 credentials (Web Application)
3. Add authorized redirect URI: `https://<your-supabase-project>.supabase.co/auth/v1/callback`
4. Enable the **Gmail API** in your Google Cloud project
5. Copy your client ID and client secret

### 4. Configure Environment

```bash
cp .env.local.example .env.local
# Fill in all the values from steps 2 and 3
```

### 5. Run Locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and sign in with Google.

---

## How Gmail Auto-Sync Works (Technical)

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────┐
│  User signs  │────>│ Google OAuth  │────>│ Refresh token │────>│ Encrypted │
│  in with     │     │ returns       │     │ captured by   │     │ & stored  │
│  Google      │     │ refresh_token │     │ GmailSync.tsx │     │ in DB     │
└─────────────┘     └──────────────┘     └──────────────┘     └──────────┘
                                                                      │
                    ┌─────────────────────────────────────────────────┘
                    v
              ┌──────────┐     ┌──────────────┐     ┌──────────────┐
              │ Decrypt   │────>│ Gmail API:    │────>│ Download     │
              │ refresh   │     │ search for    │     │ invoice*.pdf │
              │ token     │     │ invoice emails│     │ attachments  │
              └──────────┘     └──────────────┘     └──────────────┘
                                                            │
                    ┌───────────────────────────────────────┘
                    v
              ┌──────────────┐     ┌──────────────┐     ┌──────────┐
              │ PDF parser:   │────>│ Extract date, │────>│ Upsert    │
              │ unpdf reads   │     │ item names,   │     │ into      │
              │ the text      │     │ prices        │     │ purchases │
              └──────────────┘     └──────────────┘     └──────────┘
```

**Three sync triggers:**
1. **On page load** - syncs when you open the app
2. **Every 60 seconds** - polls while the tab is open
3. **Daily cron** - Vercel Cron hits `/api/gmail/sync-all` at midnight for ALL users

---

## Features

- **One-click Google sign-in** - No passwords, no registration forms
- **Gmail auto-sync** - Invoices are found and parsed automatically
- **Manual PDF upload** - Drag & drop invoices if you prefer
- **Manual entry** - Add custom items by hand
- **Daily breakdown** - See fixed costs + variable extras for each day
- **Monthly P&L** - Total spent, advance paid, payable balance
- **Mobile-first** - Works beautifully on phones with expandable cards
- **Push notifications** - Get notified when new invoices are synced
- **Real-time** - Changes sync across all your devices instantly
- **Secure** - Row-level security, encrypted tokens, PKCE auth flow

---

## License

MIT

---

<p align="center">
  <b>Built for XIMB students who are tired of doing mess math by hand.</b><br>
  <i>Let the robots handle the boring stuff.</i>
</p>
