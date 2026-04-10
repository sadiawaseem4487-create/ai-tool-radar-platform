# AI Tool Radar Release Checklist

Use this checklist before announcing a new production version.

## 1) n8n Workflow

- [ ] Import latest `AI Tool Radar - Collector copy.json`
- [ ] Verify workflow is **Active**
- [ ] Confirm schedule trigger time is correct for your timezone
- [ ] Confirm Product Hunt token is set in node header
- [ ] Confirm OpenRouter token is set in node header
- [ ] Confirm Google Sheets and Gmail credentials are connected

## 2) Google Sheet

- [ ] Verify required headers exist
  - `hash_id`, `title`, `source`, `summary`, `category`, `lab_relevance`, `practicality`, `novelty`, `final_score`, `recommended_action`, `why_it_matters`, `status`, `created_at`, `url`, `published_date`
- [ ] Confirm `Append or Update Row` uses match column `hash_id`
- [ ] Run once manually and confirm rows are upserted (no duplicates)

## 3) Webhook API

- [ ] Test production webhook endpoint
- [ ] Confirm response contains `meta` + `data`
- [ ] Confirm `meta.last_collector_run` is recent
- [ ] Confirm `meta.duplicate_rows_removed` is present

## 4) Frontend

- [ ] Set `.env.local` with production webhook URL
- [ ] Run `npm run build` successfully
- [ ] Verify dashboard loads data and health badge is `healthy`
- [ ] Verify filters, pagination, table/cards toggle, CSV export
- [ ] Verify shortcuts (`/`, `n`, `t`, `w`) work

## 5) Monitoring

- [ ] Check n8n execution logs for last 24h
- [ ] Confirm at least one successful scheduled run
- [ ] Confirm no credential/token errors

## 6) Post-Release Smoke Test (5 minutes)

- [ ] Open dashboard and click `Refresh Data`
- [ ] Verify top pick is populated
- [ ] Verify source quality table and trend render
- [ ] Verify dedup behavior by rerunning collector manually

## 7) Rollback Plan

- [ ] Keep previous workflow JSON export as backup
- [ ] If failure occurs, restore previous JSON and re-activate workflow
- [ ] Re-run webhook/API check and frontend smoke test
