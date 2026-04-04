---
author: baem1n
pubDatetime: 2026-04-04T09:00:00.000Z
title: "DeepCoWork #10: LLM Provider Integration -- 5 Backends, Model Auto-Detection, Build Variants"
description: "Unifying 5 LLM providers behind one interface, with build-time provider control and local model auto-detection -- the design journey."
tags:
  - llm
  - anthropic
  - ollama
  - openrouter
  - ai-agent
aiAssisted: true
---

> **TL;DR**: A single `build_llm()` factory function unifies 5 LLM providers (2 cloud + 3 local), with local models auto-detected via the `/v1/models` API.

## Table of contents

## The 5 Providers

| Provider | Type | Default Model | API Format |
|----------|------|---------------|------------|
| Anthropic | Cloud | claude-sonnet-4-6 | Anthropic native |
| OpenRouter | Cloud | anthropic/claude-sonnet-4-5 | OpenAI compatible |
| Ollama | Local | llama3.1 | OpenAI compatible |
| LM Studio | Local | loaded-model | OpenAI compatible |
| vLLM | Local | meta-llama/Llama-3.1-8B | OpenAI compatible |

## build_llm(): Single Factory

```python
def build_llm() -> Any:
    provider = config.LLM_PROVIDER or os.getenv("LLM_PROVIDER", "anthropic")

    if provider == "openrouter":
        return ChatOpenAI(model=..., base_url=config.OPENROUTER_BASE_URL, ...)
    elif provider in ("ollama", "lmstudio", "vllm"):
        return ChatOpenAI(model=..., api_key="local", base_url=..., ...)
    else:  # anthropic
        return ChatAnthropic(model=..., ...)
```

Key: `ChatOpenAI`'s `base_url` parameter supports any [OpenAI-compatible API](https://platform.openai.com/docs/api-reference) local server. Only Anthropic uses a dedicated SDK (`ChatAnthropic`). Ollama's [OpenAI compatibility mode](https://ollama.com/blog/openai-compatibility) is the foundation of this integration.

## Build Variants (Deploy Mode)

`VITE_DEPLOY_MODE` controls provider visibility at build time:

```typescript
export const PROVIDERS = (() => {
  const all = [
    { value: "anthropic", cloud: true, local: false },
    { value: "openrouter", cloud: true, local: false },
    { value: "ollama", cloud: false, local: true },
    { value: "lmstudio", cloud: false, local: true },
    { value: "vllm", cloud: false, local: true },
  ];
  if (DEPLOY_MODE === "local") return all.filter((p) => p.local);
  if (DEPLOY_MODE === "cloud") return all.filter((p) => p.cloud);
  return all;
})();
```

| Command | Result |
|---------|--------|
| `npm run build` | All providers |
| `VITE_DEPLOY_MODE=local npm run build` | Ollama, LM Studio, vLLM only |
| `VITE_DEPLOY_MODE=cloud npm run build` | Anthropic, OpenRouter only |

The "local" build completely removes the API key input UI.

## Local Model Auto-Detection

The SettingsModal auto-fetches model lists from local servers using a two-stage approach:
1. `/v1/models` -- OpenAI-compatible API (all local servers)
2. `/api/tags` -- Ollama-specific API (fallback)

Both use a 5-second timeout with `AbortSignal.timeout(5000)`.

## Settings Persistence

Settings are saved to `~/.cowork.env` and survive app restarts. Provider, model, and API key changes persist automatically.

## Agent Rebuild

When the provider or model changes, all active agents rebuild immediately through `rebuild_all_agents_safe()`, which uses an `asyncio.Lock` to prevent concurrent rebuilds.

## Benchmark

| Metric | Value |
|--------|-------|
| Model list fetch latency (Ollama local) | ~120ms |
| Model list fetch latency (LM Studio local) | ~80ms |
| Model list fetch timeout | 5 seconds |
| Provider switch to agent rebuild | ~200ms |
| build_llm() execution time | ~15ms |

## Lessons Learned

Passing a tool name (`"write_file"`) to `create_react_agent`'s `interrupt_before` parameter produced a `ValueError`. LangGraph's `interrupt_before` only accepts **node names**, not tool names. This misunderstanding cost hours of debugging and was a key reason for choosing DeepAgents SDK, whose `interrupt_on` works with tool names directly.

The second issue was Ollama's model list API. Ollama originally used the `/api/tags` endpoint, but added OpenAI-compatible `/v1/models` from v0.1.24. Calling only `/v1/models` returned 404 on older Ollama versions. A two-stage fallback strategy (try `/v1/models` first, fall back to `/api/tags`) solved it.

Third, we learned the hard way that not including `HTTP-Referer` and `X-Title` headers in OpenRouter requests leads to faster 429 rate limiting. Should have read the OpenRouter docs more carefully from the start.

## FAQ

### Can I run Ollama on a remote server?

Yes. Change the server URL to a remote address like `http://192.168.1.100:11434/v1`. CORS configuration may be needed.

### Why include OpenRouter?

OpenRouter unifies multiple LLM providers under one API. You can use Claude, GPT-4, Gemini, and more with a single API key -- convenient for testing and comparison.

### Does changing the model affect in-progress conversations?

No. Current streams are unaffected. The new model applies from the next message.

---

## Series

1. [DeepCoWork: I Built an AI Agent Desktop App](/posts/deepcowork-01-introduction)
2. [Tauri 2 + Python Sidecar](/posts/deepcowork-02-tauri-sidecar)
3. [DeepAgents SDK Internals](/posts/deepcowork-03-deep-agents-sdk)
4. [System Prompt Design per Mode](/posts/deepcowork-04-system-prompts)
5. [SSE Streaming Pipeline](/posts/deepcowork-05-sse-streaming)
6. [HITL Approval Flow](/posts/deepcowork-06-hitl-approval)
7. [Multi-Agent ACP Mode](/posts/deepcowork-07-acp-multi-agent)
8. [Agent Memory 4 Layers](/posts/deepcowork-08-agent-memory)
9. [Skills System](/posts/deepcowork-09-skills-system)
10. **[This post]** LLM Provider Integration
11. [Security Checklist](/posts/deepcowork-11-security)
12. [GitHub Actions Cross-Platform Build](/posts/deepcowork-12-ci-cd)
