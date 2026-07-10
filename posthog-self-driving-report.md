# PostHog Self-driving Setup Report

_Generated: 2026-07-10_

## Summary

PostHog Self-driving has been configured for **ximb-mess-tracker** (Next.js 16, Vercel). Session Replay, Error Tracking, and Support signal sources are now armed; the scout troop is tuned to 4 active scouts (3 built-in + 1 custom). Findings will start appearing in your Self-driving inbox at **https://us.posthog.com/project/506382/inbox** within ~30 minutes.

---

## AI data processing

**Approved.** Organization-level AI data processing was confirmed before this run started.

---

## GitHub

**Already connected** — integration ID `184010`, account `rajpal07`. No action needed.

---

## Products enabled

| Product | Status | Notes |
|---|---|---|
| Session Replay | **Already enabled** | `session_recording_opt_in: true`. No `posthog.init` override to remove. |
| Error Tracking | **Already enabled** | `autocapture_exceptions_opt_in: true`. No `posthog.init` override to remove. |
| Support (Conversations) | **Enabled — inert** | Server flip applied. Tickets only arrive once an inbound channel is connected (see Follow-ups). |

`posthog.init` in `app/providers.tsx` was inspected — no `disable_session_recording` or `capture_exceptions: false` flags present. Server flips take full effect on the client without code changes.

---

## Signal sources

| source_product | source_type | Action |
|---|---|---|
| `session_replay` | `session_analysis_cluster` | **Enabled** (config `019f4cc9-f4eb-7d6a-b324-5be224769ed4`) |
| `signals_scout` | `cross_source_issue` | **Enabled** — scout gate, lets troop findings reach inbox (config `019f4ccb-2c23-70a2-a07d-f44ce3b77ed6`) |
| `error_tracking` | `issue_created` | **Enabled** (config `019f4ccb-3006-79f0-80c1-5b2b45c9b3a6`) |
| `error_tracking` | `issue_reopened` | **Enabled** (config `019f4ccb-3496-7b8a-a6b2-d57456ce8251`) |
| `error_tracking` | `issue_spiking` | **Enabled** (config `019f4ccb-3a42-7515-9385-941c6b5343c3`) |
| `conversations` | `ticket` | **Enabled — dormant** until an inbound channel is connected (config `019f4ccb-3e28-7dc0-847b-4a4075f39449`) |

---

## Connected tools

| Tool | Status |
|---|---|
| GitHub Issues | Not used (user did not select) |
| Linear | Not used (user did not select) |
| Zendesk | Not used (user did not select) |
| pganalyze | Not used (user did not select) |

---

## Scout troop

**4 active scouts** (runs daily on the coordinator's schedule):

| Scout | Status | Reason |
|---|---|---|
| `signals-scout-general` | **Enabled** | Always on — cross-product correlations and uncovered surfaces |
| `signals-scout-product-analytics` | **Enabled** | Product analytics onboarding completed; `$pageview` actively tracked |
| `signals-scout-web-analytics` | **Enabled** | Web analytics onboarding completed; public web app on Vercel with live traffic |
| `signals-scout-web-vitals-tracker` | **Enabled** (custom) | See Custom scouts section |

**Disabled scouts (23):**

| Scout | Reason |
|---|---|
| `signals-scout-error-tracking` | Covered by native `error_tracking` signal sources — intentional exclusion |
| `signals-scout-session-replay` | Covered by native `session_replay` signal source — intentional exclusion |
| `signals-scout-ai-observability` | No LLM/AI usage in this project |
| `signals-scout-apm` | No distributed tracing configured |
| `signals-scout-csp-violations` | No CSP reporting configured |
| `signals-scout-customer-analytics` | No group/accounts analytics in use |
| `signals-scout-data-pipelines` | No CDP destinations or hog flows |
| `signals-scout-data-warehouse` | No external warehouse sources connected |
| `signals-scout-experiments` | No active A/B experiments |
| `signals-scout-feature-flags` | No feature flags in active use |
| `signals-scout-health-checks` | General scout covers cross-product health |
| `signals-scout-inbox-validation` | Fresh setup — no shipped fixes to validate yet |
| `signals-scout-ingestion-warnings` | General scout covers ingestion health |
| `signals-scout-insight-alerts` | No configured insight alerts |
| `signals-scout-logs` | PostHog logs product not in use |
| `signals-scout-mcp-tool-calls` | No MCP tool call telemetry |
| `signals-scout-observability-gaps` | General scout covers event coverage gaps |
| `signals-scout-replay-vision` | No Replay Vision scanners configured |
| `signals-scout-revenue-analytics` | No payment SDK or revenue data |
| `signals-scout-skills-store` | Not a priority for a fresh setup |
| `signals-scout-surveys` | No surveys in use |
| `signals-scout-anomaly-detection` | Covered by active specialists |
| `signals-scout-web-vitals` | Replaced by the custom `signals-scout-web-vitals-tracker` |

To re-enable any disabled specialist if you add that surface later, go to **https://us.posthog.com/project/506382/inbox** → Scouts and flip the toggle.

---

## Custom scouts

### `signals-scout-web-vitals-tracker`

**What it watches:** Core Web Vitals (`$web_vitals` events) — LCP, INP, CLS, FCP — per page, daily.

**Discriminator:** A finding is filed only when the p75 for a metric on a page crosses a Google threshold (LCP > 2500ms, INP > 200ms, CLS > 0.1, FCP > 1800ms) **or** degrades >20% week-over-week, **and** the regression spans at least 2 days, **and** at least 5 distinct sessions contributed. Single-session spikes and dev-only traffic are explicitly disqualified.

**Why no built-in covers it:** `signals-scout-web-vitals` was disabled in step 6 (not among the top-2 most-used specialists). `$web_vitals` events are actively captured (`autocapture_web_vitals_opt_in: true`) so the surface has real data, and the custom scout provides focused, project-specific coverage with a tuned noise bar.

**Surfaces considered and ruled out:**
- _User engagement cliff_ — `$pageview` is the only engagement event; the `product-analytics` and `general` scouts already cover pageview-based insights. Ruled out: already covered by enabled built-in scouts.

**Declined proposals:** None — only one candidate was proposed.

**Noise escape hatch:** If this scout becomes noisy (filing on dev traffic or one-off spikes), set `emit: false` on config `019f4cd4-673b-73d4-95cc-0838f675bad8` in PostHog to switch it to dry-run mode.

---

## Follow-ups

- [ ] **Connect a Support inbound channel** — the Conversations product is enabled but produces no tickets until an email, inbox, or Slack channel is connected. Do this in PostHog Settings → Support to start routing tickets to the inbox.
- [ ] **Instrument custom events** — this project has no custom domain events (`posthog.capture(...)` calls). Adding events for key user actions (sign-in, invoice upload success/failure, manual entry added) would give the `product-analytics` and `general` scouts much richer data to work with.
- [ ] **Enable Error Tracking source maps** — `autocapture_exceptions_opt_in` is on, but without source maps, stack traces in error reports will show minified code. Run `npx @posthog/wizard@latest upload-source-maps` from the project root (add `--region us` if needed).

---

## What happens next

The scout coordinator picks up the new configs within ~30 minutes of this run completing. Scouts run on a 24-hour cycle; the first scans will fire by tomorrow. Findings are clustered into reports and appear in your inbox at **https://us.posthog.com/project/506382/inbox**. Immediately-actionable reports can be handed off to coding tasks directly from the inbox.
