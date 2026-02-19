# Contributing to Ashim OS

## Contribution Standard
- Ship changes with tests and clear acceptance criteria.
- Keep boundaries explicit: UI, orchestration, engine, repositories.
- Avoid plaintext key handling and BYOK bypasses.
- Prefer deterministic behavior over implicit magic in runtime paths.

## Local Setup
1. Install dependencies: `npm install`
2. Configure environment in `.env.local` (see `.env.example`)
3. Start app: `npm run dev`

## Workspace Development Guide

### Source Boundaries
- UI surfaces: `components/*`, `src/components/*`
- Orchestration/hooks: `hooks/*`, `src/hooks/*`
- Domain logic: `src/*` (team, workflows, marketplace, voice, etc.)
- Shared engine modules: `packages/engine/*` and `src/engine/*` re-exports
- Data access only via repositories: `src/data/repositories/*`

### BYOK Rules
- Never persist plaintext keys.
- Always resolve runtime key through BYOK manager/runtime helper.
- If adding a provider path, include fingerprint/status visibility in BYOK health surfaces.

### Repository Rules
- Do not add direct `supabase.from()` outside `src/data/*`.
- `npm run lint:db-boundary` enforces this.

### Team/RBAC Rules
- Gate workspace-sensitive actions through permission checks.
- Keep personal/shared memory partition logic explicit.
- New team features require tests for role boundaries (`owner`, `admin`, `member`, `viewer`).

### Voice/Ambient Rules
- Voice features must emit durable system outputs (knowledge/activity/history/evidence).
- Consent-first behavior is mandatory for camera/audio contextual features.

## Pre-PR Checklist
Run before opening a PR:
```bash
npm run lint
npm run lint:db-boundary
npm run typecheck
npm run test
npm run build
npm run perf:budget
npm run benchmark
npm run test:plugin
```

## Pre-commit Hooks
Husky + lint-staged are configured in `.husky/pre-commit`.
Hook commands:
- `npx lint-staged`
- `npm run lint:db-boundary`
- `npm run typecheck`

## Testing Expectations
- Add or update tests for behavior changes.
- Priority suites:
  - `src/workflows/__tests__/*`
  - `src/team/__tests__/*`
  - `src/voice/__tests__/*`
  - `src/marketplace/__tests__/*`
  - `src/data/repositories/__tests__/*`

## Documentation Expectations
Update docs for any user-facing or architecture changes:
- `README.md`
- `CHANGELOG.md`
- Relevant docs under `docs/`

## Security and Incident Reporting
If you find a security issue:
- Do not open a public issue with exploit details.
- Share reproducible details privately with repository maintainers.
- Include impacted paths, severity assumptions, and mitigation suggestions.

## Code of Conduct
By contributing, you agree to follow `CODE_OF_CONDUCT.md`.
