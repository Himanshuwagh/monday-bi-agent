# Pipeline Intel – Monday.com BI Agent

**🚀 Live Demo: [https://skylark-bi-agent.hwagh.com/](https://skylark-bi-agent.hwagh.com/)**

AI agent that answers founder-level business questions using **live** monday.com data from Deals and Work Orders boards. No preload, no cache; every query hits the API.

## What it does

- **Chat UI**: Ask in plain language (e.g. “How’s pipeline for energy this quarter?”).
- **Live monday.com**: Each turn calls `get_deals` / `get_work_orders` via Monday GraphQL API.
- **Messy data**: Handles missing values, normalizes formats, surfaces data-quality caveats.
- **Trace**: Right pane shows which boards were queried, filters, row counts, and links to open boards.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment variables

Create `.env.local` in the project root:

| Variable | Description |
|----------|-------------|
| `MONDAY_API_TOKEN` | monday.com API token (from Profile → API) |
| `MONDAY_DEALS_BOARD_ID` | Board ID of your Deals board (number from board URL) |
| `MONDAY_WORK_ORDERS_BOARD_ID` | Board ID of your Work Orders board |
| `CLAUDE_API_KEY` | Anthropic API key for Claude |
| `CLAUDE_MODEL` | (Optional) e.g. `claude-sonnet-4-20250514`; default is Haiku |

## Link to boards

After the app loads, the right pane shows **monday.com boards** with direct “Open →” links to the Deals and Work Orders boards (built from the board IDs in env). No extra setup.

## Deploy

Use any Node 18+ host (e.g. Vercel, Railway). Set the same env vars in the dashboard. No build step beyond `npm run build`.

## Tech stack

Next.js 16 (App Router), Anthropic Messages API with tool use, monday.com GraphQL API. See **DECISION_LOG.md** for why and what we’d improve.
