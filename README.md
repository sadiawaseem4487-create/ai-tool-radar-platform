# AI Tool Radar Platform

Production-ready AI tools radar using n8n, Google Sheets, and a Next.js dashboard.

## Overview

This project automates discovery and scoring of new AI tools from multiple sources, stores results in Google Sheets, and serves a frontend dashboard for weekly triage.

- **Collector + scorer (n8n):** pulls from Hacker News, Product Hunt, GitHub, and arXiv
- **Storage:** Google Sheets (`appendOrUpdate` with `hash_id` for dedup)
- **Read API:** n8n webhook endpoint
- **Frontend:** Next.js dashboard with filters, table/cards view, pagination, CSV export, and triage states

## Repository Structure

- `AI Tool Radar - Collector copy.json` - n8n workflow export
- `ai-tool-radar-frontend/` - Next.js frontend application

## Security Notes

No real API keys are committed in the workflow JSON. The HTTP nodes use placeholders:

- `Bearer REPLACE_WITH_PRODUCTHUNT_TOKEN`
- `Bearer REPLACE_WITH_OPENROUTER_API_KEY`

Before running in your n8n instance, set these values in node headers (or move to n8n credentials/secrets).

## n8n Setup

1. Import `AI Tool Radar - Collector copy.json` into n8n.
2. Configure credentials in n8n:
   - Google Sheets OAuth2
   - Gmail OAuth2 (for digest email)
3. Replace Product Hunt and OpenRouter header placeholders with your actual tokens.
4. Ensure your Google Sheet has required columns, including:
   - `hash_id`
   - `title`, `source`, `summary`, `category`, `lab_relevance`, `practicality`, `novelty`, `final_score`, `recommended_action`, `why_it_matters`, `status`, `created_at`, `url`, `published_date`
5. Activate workflow and verify scheduled runs.

## Frontend Setup

```bash
cd "ai-tool-radar-frontend"
cp .env.example .env.local
```

Set in `.env.local`:

```env
NEXT_PUBLIC_RADAR_API_URL=https://YOUR-N8N-DOMAIN/webhook/ai-tool-radar
```

Run locally:

```bash
npm install
npm run dev
```

Build:

```bash
npm run build
```

## Production Readiness Included

- Retries and timeouts on external HTTP calls
- Safer AI JSON parsing and normalization
- Deterministic `hash_id` generation
- Upsert-by-`hash_id` behavior in Google Sheets node
- Webhook response metadata (`meta`) for frontend health/sync visibility

## Recommended Next Enhancements

- Add n8n error-trigger alert workflow (email/Slack)
- Move API tokens to secrets/credentials (no manual header pasting)
- Add write-back endpoint for frontend triage status updates

## Operations

- Release checklist: `RELEASE_CHECKLIST.md`
