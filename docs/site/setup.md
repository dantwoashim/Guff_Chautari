# Setup Guide

## Prerequisites
- Node.js 20+
- npm 10+
- Supabase project credentials

## Environment
Create `.env.local`:
```bash
VITE_SUPABASE_URL=YOUR_SUPABASE_URL
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
VITE_ENABLE_MOCK_CONNECTORS=false
```

## Install and Run
```bash
npm install
npm run dev
```

## Validation Commands
```bash
npm run lint
npm run typecheck
npm run test
npm run build
```
