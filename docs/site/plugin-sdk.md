# Plugin SDK Guide

## Goal
Support local extension modules that can add tools and panels while staying within runtime policy boundaries.

## Key Types
- `AshimPlugin`: plugin entry contract.
- `manifest.permissions`: declared capability requirements.
- `panelDefinitions`: UI surfaces provided by plugin.
- `toolDefinitions`: callable tool contracts.

See: `packages/sdk/src/types.ts`

## Runtime Flow
1. Register plugin in `src/plugins/reference/<plugin>/plugin.tsx`.
2. Load plugin in Plugin Studio.
3. Approve permissions.
4. Install and run.

## Safety Model
- Tool calls are policy-checked before execution.
- Denied actions are surfaced in runtime events.
- iframe-based panels are sandboxed.

## Test Command
```bash
npm run test:plugin
```
