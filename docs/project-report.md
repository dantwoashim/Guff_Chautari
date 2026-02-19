# Ashim Capstone Project Report

## 1. Introduction
Ashim was developed as a final-year college project to explore how a BYOK AI assistant can be implemented in a practical, production-like web application. The goal was to build a usable system, not only a prototype UI.

The project combines:
- conversation management,
- memory and context retrieval,
- workflow execution foundations,
- self-host deployment support.

## 2. Pre-Development Work (Before Coding)
Before implementation began, the project started with a focused preparation phase:
- Problem framing: defining a realistic scope for a semester capstone.
- Requirement analysis: identifying must-have features versus optional features.
- Architecture design: deciding module boundaries for UI, engine, workflow runtime, and data repositories.
- Technology selection: choosing React + Vite, TypeScript, Supabase integration, and Docker-based deployment.

This design-first approach reduced rework during implementation.

## 3. Implementation Timeline
Implementation was completed in an 8-week build window (about 2 months).

### Week 1-2
- Project scaffolding and environment setup.
- Authentication and base app shell.
- Repository and module structure finalized.

### Week 3-4
- Core chat flow and persistence.
- BYOK integration and key handling.
- Initial API route wiring.

### Week 5-6
- Memory/context modules and workflow runtime features.
- Data boundary cleanup and test expansion.
- UI refinements for main interaction paths.

### Week 7-8
- Reliability fixes and regression testing.
- Build/deploy preparation (Docker + self-host script).
- Documentation and final submission hardening.

## 4. System Architecture Summary
The project follows a layered architecture:
- Presentation layer: React UI components and app shell.
- Application layer: hooks and orchestration logic.
- Domain/runtime layer: engine, workflow, memory, provider, and policy modules.
- Data layer: repository-pattern access and Supabase integration.

This separation supports maintainability, testing, and future extension.

## 5. Practical Outcome
The final result is a working full-stack capstone codebase with:
- local development workflow,
- test/lint/typecheck quality gates,
- deployment scripts for self-host setup,
- clear architecture and API documentation.

## 6. Scope Notes
This submission prioritizes engineering quality and modular architecture over feature quantity. The structure is designed so future batches can extend the project safely.
