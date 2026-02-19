# API Reference

Base path: `/v1`

## Authentication
Headers used by protected routes:
- `Authorization: Bearer <token>`
- `x-workspace-id: <workspace_id>` (for workspace-scoped actions)

## Health
- `GET /v1/health`

## Conversations
- `POST /v1/conversations`
- `GET /v1/conversations/:id/messages`
- `POST /v1/conversations/:id/messages`
- `DELETE /v1/conversations/:id`

## Knowledge
- `POST /v1/knowledge/ingest`
- `GET /v1/knowledge/search`
- `GET /v1/knowledge/sources`
- `POST /v1/knowledge/synthesize`

## Workflows
- `POST /v1/workflows`
- `POST /v1/workflows/:id/run`
- `GET /v1/workflows/:id/executions`
- `GET /v1/workflows/:id/checkpoints`
- `POST /v1/workflows/:id/checkpoints/:cid/resolve`

## Memory
- `GET /v1/memory/consents`
- `POST /v1/memory/consents/grant`
- `POST /v1/memory/consents/revoke`
- `POST /v1/memory/write`
- `GET /v1/memory/recall`
- `POST /v1/memory/consolidate`

## Pipeline
- `POST /v1/pipeline/stream/connect`
- `POST /v1/pipeline/run`

## Operations
- `POST /v1/certification/evaluate`
- `POST /v1/self-host/readiness`
- `POST /v1/release/gate`

## Billing and Creator
- `GET /v1/billing/subscription`
- `GET /v1/billing/usage`
- `GET /v1/billing/invoices`
- `POST /v1/billing/subscription/change-tier`
- `GET /v1/creator/earnings/summary`
- `POST /v1/creator/earnings/simulate-sale`
- `POST /v1/creator/earnings/simulate-renewal`
- `POST /v1/creator/earnings/run-payout`

## Enterprise Admin
- `GET /v1/admin/org/:id`
- `GET /v1/admin/org/:id/workspaces`
- `GET /v1/admin/org/:id/audit`
- `GET /v1/admin/org/:id/compliance`
- `POST /v1/admin/org/:id/sso`
- `GET /v1/admin/org/:id/billing`
- `POST /v1/admin/org/:id/billing/budgets`

## WebSocket Event Types
Defined in `src/api/websocket.ts`:
- `pipeline.stage_complete`
- `pipeline.token`
- `pipeline.done`
- `pipeline.error`
