# AI Tool Radar Frontend

This is a Next.js frontend dashboard for your existing n8n workflow webhook.

## 1) Configure environment

Copy `.env.example` to `.env.local` and set your webhook URL:

```bash
cp .env.example .env.local
```

Set:

```env
NEXT_PUBLIC_RADAR_API_URL=https://YOUR-N8N-DOMAIN/webhook/ai-tool-radar
```

## 2) Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## 3) Build check

```bash
npm run build
```

## 4) Deploy

Deploy on Vercel and add the same environment variable there:

- `NEXT_PUBLIC_RADAR_API_URL`
