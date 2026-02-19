# Self-Host Deployment Guide

This guide describes the local self-host deployment flow used in the final capstone submission.

## Stack
- `app`: production build served by Nginx
- `supabase-db`: Postgres container
- optional monitoring: Prometheus + Grafana profile

## Prerequisites
- Docker Engine + Docker Compose v2
- Node.js 20+
- npm 10+

## Required environment values
In `.env.self-host`:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_ENABLE_MOCK_CONNECTORS=false`

## Recommended flow
```bash
./scripts/self-host-setup.sh
npm run deploy:preflight
npm run deploy:up
```

## Operations
Check status:
```bash
docker compose --env-file .env.self-host ps
```

Logs:
```bash
docker compose --env-file .env.self-host logs -f app
```

Stop stack:
```bash
npm run deploy:down
```

## Health
Default app health endpoint:
- `http://localhost:4173/healthz`

## Security notes
- Treat `.env.self-host` as sensitive.
- Keep mock connectors disabled in production-like environments.
- Rotate credentials if exposed.
