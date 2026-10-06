# Architecture Decision — OpenAI Primary LLM / NVIDIA NIM Fallback

**Date:** 2026-10-06  
**Repository:** `urbanrealty36-ops/OrchestreeAI-Final-Web-App-1`  
**Branch:** `refactor/openai-primary-nvidia-fallback`

## Owner decision

The single canonical OrchestreeAI Model Router is changed to this text/reasoning provider policy:

1. **OpenAI API — Primary**
2. **NVIDIA NIM — Fallback**

There is no third text/reasoning provider in the canonical runtime chain.

## Explicitly retired from the text/reasoning router

- OpenRouter
- Google Gemini

Their provider adapters, provider selection paths, and Web UI provider-selection controls must not be restored.

## What remains canonical

The Model Router itself is **not eliminated**. AGENTS.md requires a single canonical gateway rather than provider calls distributed throughout the application.

The canonical path remains:

`Application → Model Router → OpenAI → NVIDIA NIM fallback`

The browser never receives provider credentials and never decides which provider is used.

## Memory / RAG

Embedding generation is moved to the canonical OpenAI adapter so Memory/RAG does not depend on the retired Gemini adapter.

The embedding model is configured through:

- `OPENAI_EMBEDDING_MODEL`

The existing 1536-dimensional application contract is preserved.

## Configuration

Provider configuration is server-side only:

- `OPENAI_API_KEY`
- `OPENAI_BASE_URL`
- `OPENAI_MODEL`
- `OPENAI_EMBEDDING_MODEL`
- `NVIDIA_NIM_API_KEY`
- `NVIDIA_NIM_BASE_URL`
- `NVIDIA_NIM_MODEL`

No credential is committed to the repository.

## Web application

The Generative UI no longer exposes an OpenRouter/Gemini/provider selector. Provider selection is backend policy.

The UI may display the policy as:

**OpenAI (Primary) → NVIDIA NIM (Fallback)**

## Compatibility

`apps/backend/orchestree/core/model_router/router.py` contains only compatibility exports to the canonical implementation. It contains no independent provider or routing logic.

## PRD reconciliation

The current Master PRD v2.2 previously specified NVIDIA NIM → OpenRouter for text and Gemini for multimodal/long-context. This owner decision supersedes that provider-order decision for the current Web PWA implementation. Other architecture, security, orchestration, billing, memory, and data-boundary requirements remain unchanged unless separately changed by an explicit owner decision.

## Acceptance

The change is not considered production GREEN until:

- unit tests pass;
- frontend type/build checks pass;
- backend import/startup checks pass with real deployment configuration;
- OpenAI primary generation is verified against the real API;
- NVIDIA NIM fallback is verified by a controlled real-provider failure path;
- Memory/RAG embedding is verified through OpenAI;
- no OpenRouter/Gemini provider remains registered in the canonical router;
- no provider credential is exposed to browser code;
- existing AGENTS.md security and tenant-isolation gates remain GREEN.

## Generative Studio / Multimodal extension

The same canonical Model Router now owns OpenAI generative model dispatch for the Web PWA:

- **Image / visual design:** `OPENAI_IMAGE_MODEL` through the OpenAI Images API.
- **Video:** `OPENAI_VIDEO_MODEL` through the OpenAI Videos API (Sora family); video jobs remain asynchronous and are retrieved/downloaded through the same gateway.
- **Content:** `OPENAI_CONTENT_MODEL` through the OpenAI Responses API.
- **Document generation / document design:** `OPENAI_DOCUMENT_MODEL` through the OpenAI Responses API.
- **Design planning / structured design generation:** `OPENAI_DESIGN_MODEL` through the OpenAI Responses API when the output is text/structure; visual design rendering uses `OPENAI_IMAGE_MODEL`.

These are routing capabilities of the existing Model Router, not separate provider routers. Generative Studio domains must not call OpenAI provider endpoints directly.

The browser may request a generation intent/type, but cannot select an arbitrary provider or model. Model IDs and credentials remain server-side.
