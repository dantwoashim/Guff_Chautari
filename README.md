# Ashim

Ashim is a final-year college capstone project: a BYOK (Bring Your Own Key) AI workspace focused on chat, workflow support, memory recall, and productivity tools.

## Project Context
This repository documents the final implementation submitted as a capstone project.

Development approach:
- Pre-development phase (before coding): problem research, user needs analysis, and architecture design.
- Implementation phase: completed in an 8-week development window (about 2 months).

## What the Project Solves
- Consolidates chat, memory, and workflow actions in one interface.
- Keeps model access user-owned through BYOK.
- Provides a practical local/self-hosted deployment path.

## Core Features
- Chat interface with conversation persistence.
- Workflow and automation runtime foundations.
- Memory retrieval and context-aware response support.
- BYOK key management and validation.
- API gateway routes for conversations, workflows, memory, and operations.

## High-Level Architecture
- Frontend: React + Vite
- State: Zustand
- Backend/data integration: Supabase client + repository boundaries
- Runtime modules: `src/engine/*`, `src/workflows/*`, `src/data/repositories/*`
- Deployment: Docker + Nginx + Docker Compose

Detailed architecture: `docs/architecture-spec.md`

## Quick Start
### Prerequisites
- Node.js 20+
- npm 10+
- Supabase project (`URL` and `anon key`)

### Local Run
```bash
npm install
cp .env.example .env.local
npm run dev
```

### Required env values
```bash
VITE_SUPABASE_URL=YOUR_SUPABASE_URL
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
VITE_ENABLE_MOCK_CONNECTORS=false
```

## Self-Hosting
```bash
./scripts/self-host-setup.sh
npm run deploy:preflight
npm run deploy:up
```

Self-host guide: `docs/self-host-guide.md`

## Free Cloud Deployment
Use free tiers:
- GitHub (code hosting)
- Cloudflare Pages (frontend hosting)
- Supabase free tier (backend/auth)

Step-by-step guide: `docs/site/deploy-free.md`

## Quality Gates
```bash
npm run lint
npm run lint:db-boundary
npm run typecheck
npm run test
npm run build
npm run ci
```

## Documentation
- Project report: `docs/project-report.md`
- Architecture: `docs/architecture-spec.md`
- API reference: `docs/api-reference.md`
- Setup docs index: `docs/site/index.md`

## License
See `LICENSE`.
