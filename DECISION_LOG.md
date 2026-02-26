# Decision Log – Monday.com BI Agent
*Himanshu Wagh · 6-hour assignment*

---

## What I built and why it's shaped the way it is

The brief said "founders need quick answers across monday.com boards". The failure mode I wanted to avoid: an agent that *looks* smart but actually just echoes stale, pre-fetched data dressed up as insight. So the one non-negotiable I held from the start was **every question hits the API fresh** — no in-memory board cache, no preload on startup, nothing.

From that constraint, the rest of the architecture followed logically:

- If every query is a live fetch, the backend needs to be fast and stateless → **Next.js API routes** (no separate server to spin up, deploy as one unit).
- If data is messy (it always is with CSVs), normalization has to happen before Claude sees anything → **dedicated normalization layer** in `src/lib/normalization.ts` with per-row issue tracking.
- If Claude is the reasoning layer, it should only reason — not guess at data → **two explicit tools** (`get_deals`, `get_work_orders`) so the model is forced to call the API rather than hallucinate.

---

## Stack decisions — the actual reasoning

**Next.js 16 (App Router) + TypeScript**
I chose Next because a single codebase for the chat UI and the `/api/query` backend meant I wasn't burning time wiring two separate repos together. App Router gave me async API routes next to the page component, which suited the ask → tool-call → answer flow well. TypeScript was non-optional — column IDs are string literals, and a single typo in a column ID silently returns null data. Types catch that at compile time, not at demo time.

**Claude (Haiku by default) with native tool use**
I considered just passing raw board data in the prompt and asking for a summary. Decided against it early: without tool-use constraints, models frequently reason from stale context or blend board A data with board B. Defining `get_deals` and `get_work_orders` as strict tools means Claude *must* call them, and I can intercept, normalize, filter, and log what was returned before it composes the answer. That's also where the visible trace comes from — it's a natural byproduct of the tool-call loop, not a separate logging step bolted on.

I defaulted to Haiku for cost and latency; the system prompt is explicit enough that it handles the BI queries well. Anyone running this for heavier cross-board analysis can set `CLAUDE_MODEL=claude-sonnet-4-20250514` in env.

**monday.com GraphQL API — plain `fetch`, no SDK**
The monday.com npm SDK adds abstraction I don't need here and introduces a dependency that can drift. The GraphQL API is well-documented and a single `boards(ids:, items_page(limit: 500))` query returns everything I need. Column IDs are mapped in `src/lib/monday/config.ts` so if the board schema changes, there's one place to update. I did look at MCP — it's interesting but adds operational overhead (separate process, transport layer) for two boards and six hours. Plain fetch was the right call.

**Data normalization choices**
The CSV data has messy amounts (`12L`, `1.2Cr`, `Rs 45000`), inconsistent sectors (`agri`, `agriculture`, `Agri Sector` all mean the same thing), and missing dates. I wrote `parseMoney` and `parseDate` to handle the common variants and attached an `issues: string[]` array to every normalized row. Claude's system prompt instructs it to surface caveats when data is incomplete — so a founder asking about pipeline value gets "Rs 4.2Cr across 18 deals (3 deals had no amount recorded)" rather than a silently wrong total.

I consciously didn't try to *fix* bad data. I flagged it and let the model communicate it. Trying to infer missing values would introduce its own errors, and founders need to know their data is dirty so they can fix the source.

---

## Tradeoffs I made

| Decision | Tradeoff accepted |
|----------|------------------|
| Fetch all items, filter in memory | Simpler query, works fine for 500-item boards from a CSV import. For 5 000+ items, I'd push sector/date filters into the GraphQL `where` clause. Documented as next step. |
| No auth on the prototype | The evaluator needs to access it without setup. For production I'd add auth and scope board access per user. |
| Haiku as default model | ~10× cheaper than Sonnet, fast enough for BI queries with a tight system prompt. Configurable via env for anyone who wants heavier reasoning. |
| No streaming | Simpler client code. The stepped thinking animation (6 steps, 1.4s each) masks the latency well for the response sizes we're producing. |
| `localStorage` for session history | No database needed. Sessions persist across refreshes, auto-restore if activity was within 30 minutes. Good enough for a demo, wouldn't do this in production. |

---

## What I'd do next with more time

1. **Cursor-based pagination** on the monday.com query — the current `limit: 500` misses items on large boards.
2. **GraphQL-level filtering** — pass sector and date range into the `where` clause so we fetch less and stay under token limits on big boards.
3. **Streaming responses** — pipe Claude's output token-by-token to the client so answers feel instant rather than loading all at once.
4. **MCP** — if this grew to pull from Jira, Google Sheets, or Salesforce alongside monday.com, MCP would be the right abstraction to unify those tool calls under one protocol.

---

## What I'm satisfied with

The thing I care most about in this kind of agent is **trust** — a founder should be able to look at an answer and verify where it came from. The right-side trace panel (board queried, filters applied, row count, data quality flags, direct link to the monday board) exists for exactly that reason. It's not a debug panel — it's the audit trail that makes the answer trustworthy rather than just plausible.
