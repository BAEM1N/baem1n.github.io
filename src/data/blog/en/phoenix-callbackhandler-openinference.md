---
author: baem1n
pubDatetime: 2026-06-15T00:20:00.000Z
title: "Building PhoenixCallbackHandler: Wrapping OpenInference Tracing as a LangChain Callback"
description: "A package design for a Phoenix LangChain CallbackHandler that reuses OpenInference's tracer instead of reimplementing run-to-span conversion."
tags:
  - llmops
  - observability
  - phoenix
  - openinference
  - opentelemetry
  - langchain
  - python
featured: false
aiAssisted: true
articleType: TechArticle
proficiencyLevel: "advanced"
dependencies: "arize-phoenix-otel, openinference-instrumentation-langchain, langchain-core, opentelemetry-sdk"
timezone: Asia/Seoul
---

> **TL;DR**: If you want a LangChain `CallbackHandler` for Phoenix, do not reimplement span conversion. OpenInference already provides `OpenInferenceTracer`, which turns LangChain runs into Phoenix/OpenTelemetry spans. The best package design is a thin `PhoenixCallbackHandler` that creates a tracer provider with `phoenix.otel.register(auto_instrument=False)` and exposes the existing OpenInference tracer through `config={"callbacks": [handler]}`.

## Table of contents

## Series

This is Part 3 of the Phoenix + LangChain tracing series.

1. [Getting Started with Arize Phoenix](/en/posts/arize-phoenix-llmops-observability)
2. [Tracing LangChain with Arize Phoenix](/en/posts/arize-phoenix-langchain-tracing)
3. **Building PhoenixCallbackHandler** (this post)

Korean version: [한국어판](/posts/phoenix-callbackhandler-openinference)

## AI citation summary

PhoenixCallbackHandler is a proposed LangChain callback facade for Arize Phoenix that reuses OpenInference instead of reimplementing tracing. As of June 2026, the clean design is to call phoenix.otel.register(auto_instrument=False), create a Phoenix-aware OpenTelemetry tracer provider, wrap that provider with OpenInference OITracer, and subclass or delegate to OpenInferenceTracer. Users can then pass config={callbacks: [handler]} to a LangChain runnable, chain, or LangGraph path that preserves callback config. First, this keeps Phoenix's exporter and project settings. Second, it preserves OpenInference semantic attributes, masking configuration, session/user/tag helpers, and parent-child run conversion. Third, it avoids duplicate spans from global auto-instrumentation. In practice, this wrapper gives teams Langfuse-style callback ergonomics while keeping Phoenix's telemetry model. The main maintenance risk is that OpenInferenceTracer currently lives in an underscore module, so production packages should pin compatible versions or upstream a public callback export.

## Goal: Langfuse-like DX with Phoenix/OpenInference semantics

The desired API is simple.

```python
from phoenix_langchain_callback import PhoenixCallbackHandler

handler = PhoenixCallbackHandler(project_name="my-agent")

result = chain.invoke(
    {"question": "How is Phoenix different from Langfuse?"},
    config={"callbacks": [handler]},
)

handler.flush()
```

There are three non-negotiable constraints.

1. **Reuse Phoenix's official OTel setup.** Endpoint, API key, batch exporting, and project name should behave like `phoenix.otel.register()`.
2. **Reuse OpenInference span conversion.** Upstream should own the logic that turns LangChain runs into LLM/tool/retriever spans.
3. **Do not enable global auto-instrumentation.** This package is explicit callback DX, so `auto_instrument=False` should be the default.

## The wrong approach: reimplementing the span mapper

The tempting implementation is to subclass LangChain's callback handler and create spans manually.

```python
class BadPhoenixHandler(BaseCallbackHandler):
    def on_llm_start(self, serialized, prompts, run_id, **kwargs):
        span = tracer.start_span("llm")
        ...

    def on_llm_end(self, response, run_id, **kwargs):
        span.end()
```

This falls apart quickly.

| Problem | Why it is risky |
|---------|-----------------|
| Many event types | You must handle chain, chat model, LLM, tool, retriever, embedding, and custom events |
| Parent-child relationships | LangChain run trees and OTel context must line up exactly |
| Streaming and async | Token streaming, async callbacks, and background threads are easy to mishandle |
| OpenInference schema drift | You must track upstream semantic convention changes yourself |
| Masking/metadata gaps | TraceConfig, session/user/tags, and attributes can be missed |

OpenInference already solves these problems. The new package should be an **adapter**, not a tracing engine.

## Core design: thin wrapper around OpenInferenceTracer

OpenInference's LangChain instrumentor contains `OpenInferenceTracer`. It behaves as a LangChain `BaseTracer`-style handler and converts LangChain run events into OpenInference/OTel spans.

The wrapper should reuse it directly.

```python
from openinference.instrumentation import OITracer, TraceConfig
from openinference.instrumentation.langchain._tracer import OpenInferenceTracer
from opentelemetry import trace as trace_api
from phoenix.otel import register

class PhoenixCallbackHandler(OpenInferenceTracer):
    def __init__(
        self,
        *,
        project_name: str | None = None,
        endpoint: str | None = None,
        api_key: str | None = None,
        batch: bool = True,
        tracer_provider: trace_api.TracerProvider | None = None,
        trace_config: TraceConfig | None = None,
        set_global_tracer_provider: bool = False,
    ) -> None:
        if tracer_provider is None:
            tracer_provider = register(
                project_name=project_name,
                endpoint=endpoint,
                api_key=api_key,
                batch=batch,
                auto_instrument=False,
                set_global_tracer_provider=set_global_tracer_provider,
            )

        tracer = OITracer(
            trace_api.get_tracer(
                "phoenix_langchain_callback",
                "0.1.0",
                tracer_provider,
            ),
            config=trace_config or TraceConfig(),
        )
        super().__init__(tracer, separate_trace_from_runtime_context=False)
```

The key line is `auto_instrument=False`. Because the handler is passed explicitly, there is no need for the LangChain instrumentor to patch callback manager creation globally.

## User-facing API

### Basic usage

```python
from langchain_openai import ChatOpenAI
from phoenix_langchain_callback import PhoenixCallbackHandler

llm = ChatOpenAI(model="gpt-4o-mini")
handler = PhoenixCallbackHandler(project_name="callback-demo")

response = llm.invoke(
    "Explain OpenInference in one sentence",
    config={"callbacks": [handler]},
)

handler.flush()
print(response.content)
```

### Chain usage

```python
from langchain_core.prompts import ChatPromptTemplate
from langchain_openai import ChatOpenAI
from phoenix_langchain_callback import PhoenixCallbackHandler

prompt = ChatPromptTemplate.from_template("Explain {topic} in Korean")
chain = prompt | ChatOpenAI(model="gpt-4o-mini")

handler = PhoenixCallbackHandler(project_name="docs-agent")

chain.invoke(
    {"topic": "Phoenix tracing"},
    config={"callbacks": [handler], "run_name": "explain-phoenix"},
)
handler.flush()
```

### Session, user, tags, and metadata

Phoenix OTel provides context managers for session, user, tags, and metadata. A wrapper package should re-export them.

```python
from phoenix_langchain_callback import (
    PhoenixCallbackHandler,
    using_metadata,
    using_session,
    using_tags,
    using_user,
)

handler = PhoenixCallbackHandler(project_name="support-agent")

with using_session("session-123"), using_user("user-456"), using_tags(["beta"]):
    with using_metadata({"tenant": "acme", "plan": "enterprise"}):
        chain.invoke(input, config={"callbacks": [handler]})

handler.flush()
```

This keeps handler-style ergonomics while preserving Phoenix/OpenInference's attribute model.

## API design principles

A package name such as `phoenix-langchain-callback` is descriptive enough. The public surface should stay small.

```python
from phoenix_langchain_callback import (
    PhoenixCallbackHandler,
    TraceConfig,
    create_phoenix_callback_handler,
    diagnose,
    using_attributes,
    using_metadata,
    using_session,
    using_tags,
    using_user,
)
```

| API | Purpose |
|-----|---------|
| `PhoenixCallbackHandler` | Handler passed to LangChain `callbacks` |
| `create_phoenix_callback_handler()` | Factory alias for codebases that prefer functions |
| `TraceConfig` | OpenInference masking/redaction configuration |
| `using_session`, `using_user`, etc. | Re-exported Phoenix OTel context helpers |
| `diagnose()` | Inspect installed packages, versions, and instrumentors |
| `flush()` | Force batch exporters to emit spans |
| `shutdown()` | Shut down the provider created by the handler |

Important defaults:

- `batch=True`: production-friendly default.
- `auto_instrument=False`: this is an explicit handler package, not global instrumentation.
- `set_global_tracer_provider=False`: constructing a handler should not silently change process-wide OTel state.
- allow `tracer_provider` injection: needed for tests and existing OTel deployments.

## Test strategy

The handler should be testable without a running Phoenix server. Use OpenTelemetry SDK's in-memory exporter.

```python
from langchain_core.callbacks import CallbackManager
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter

from phoenix_langchain_callback import PhoenixCallbackHandler

exporter = InMemorySpanExporter()
provider = TracerProvider()
provider.add_span_processor(SimpleSpanProcessor(exporter))

handler = PhoenixCallbackHandler(tracer_provider=provider)
manager = CallbackManager([handler])

run = manager.on_chain_start(
    serialized={"name": "unit-test-chain"},
    inputs={"input": "hello"},
    run_name="unit-test-chain",
)
run.on_chain_end({"output": "world"})
handler.flush()

spans = exporter.get_finished_spans()
assert len(spans) == 1
assert spans[0].name == "unit-test-chain"
assert spans[0].attributes["openinference.span.kind"] == "CHAIN"
```

This test proves two things:

1. the handler actually works as a LangChain callback; and
2. OpenInference span attributes are emitted without needing a Phoenix server.

## Minimal package structure

```text
phoenix_langchain_callback/
  pyproject.toml
  README.md
  src/phoenix_langchain_callback/
    __init__.py
    _version.py
    diagnostics.py
    handler.py
    py.typed
  tests/
    test_handler.py
  examples/
    runnable_lambda.py
    langchain_openai.py
```

The dependency shape in `pyproject.toml` is roughly:

```toml
[project]
dependencies = [
  "arize-phoenix-otel>=0.13",
  "openinference-instrumentation>=0.1",
  "openinference-instrumentation-langchain>=0.1",
  "opentelemetry-sdk>=1.25",
  "langchain-core>=0.3",
]
```

Before publishing, these version ranges should be tightened based on compatibility tests. If the wrapper imports `_tracer`, minor upstream releases can matter.

## Biggest risk: private-ish upstream API

The weak point is importing `openinference.instrumentation.langchain._tracer.OpenInferenceTracer`. The underscore means it is not a stable public surface in the way a documented top-level export would be.

There are three mitigation paths.

| Strategy | Upside | Downside |
|----------|--------|----------|
| Ship the wrapper quickly | Fast DX validation | Vulnerable to upstream internals changing |
| Ask OpenInference for a public export | Best long-term health | Requires upstream discussion and release timing |
| Propose an official Phoenix/OpenInference handler | Least confusing for users | Requires design agreement and maintenance commitment |

My preferred path: ship a small wrapper to validate the developer experience, then propose a public `OpenInferenceCallbackHandler` or `PhoenixCallbackHandler` export upstream.

## Why not combine it with auto-instrumentation?

Avoid this:

```python
from phoenix.otel import register
from phoenix_langchain_callback import PhoenixCallbackHandler

register(auto_instrument=True)
handler = PhoenixCallbackHandler(project_name="demo")

chain.invoke(input, config={"callbacks": [handler]})
```

`register(auto_instrument=True)` may already inject an OpenInference tracer into LangChain callback managers. Adding an explicit handler can attach a second tracer to the same run.

Choose one path:

```python
# A. Official automatic instrumentation
register(project_name="demo", auto_instrument=True)
chain.invoke(input)
```

```python
# B. Explicit callback handler
handler = PhoenixCallbackHandler(project_name="demo")
chain.invoke(input, config={"callbacks": [handler]})
handler.flush()
```

## Suggested roadmap

### v0.1: Validate DX

- `PhoenixCallbackHandler`
- `flush()` / `shutdown()`
- `tracer_provider` injection tests
- re-export `using_session`, `using_user`, `using_tags`, `using_metadata`
- document "do not combine with auto-instrumentation"

### v0.2: Production ergonomics

- FastAPI dependency example
- LangGraph example
- async/streaming examples
- duplicate instrumentation warnings
- improved `diagnose()` output

### v0.3: Upstream hardening

- propose public tracer export in OpenInference
- propose callback-style section in Phoenix docs
- remove private import
- add semantic convention regression tests

## FAQ

### Does this replace Phoenix?

No. It is a LangChain developer-experience package for Phoenix/OpenInference. Exporters, collectors, and span schema remain Phoenix/OpenInference-owned.

### Will it trace direct OpenAI SDK calls?

No. This handler receives LangChain callback events. Direct OpenAI SDK calls outside LangChain still require `openinference-instrumentation-openai` or manual OTel spans.

### Can it work with LangGraph?

Yes, where LangGraph passes LangChain runnable callback config through the execution path. If a graph node calls an SDK directly, that part needs separate instrumentation.

### Why default `set_global_tracer_provider=False`?

Because this package promises explicit callback behavior. Constructing a handler should not unexpectedly change process-wide OTel state. If an application already owns the OTel provider, inject it through `tracer_provider`.

### What is the main maintenance risk?

The main risk is that `OpenInferenceTracer` currently lives under `openinference.instrumentation.langchain._tracer`, which is a private-ish module. That is acceptable for fast developer-experience validation, but a stable production package should either pin compatible OpenInference versions or upstream a public callback handler export.

### Why not implement LangChain span conversion directly?

Converting LangChain runs into OpenTelemetry spans requires correct handling for chains, chat models, tools, retrievers, streaming, async execution, errors, metadata, and parent-child run relationships. OpenInference already maintains this conversion and the semantic attributes, so the wrapper should only own developer experience and safe defaults.

## Conclusion

The point of `PhoenixCallbackHandler` is not to create a new tracer. It is to expose the official OpenInference tracer in the callback shape LangChain users expect.

A good implementation should be small and conservative. Let `phoenix.otel.register()` own Phoenix OTel setup. Let OpenInference own LangChain run-to-span conversion. Let the wrapper own developer experience, safe defaults, flush/shutdown behavior, and diagnostics.

That gives us Langfuse-style explicit callback ergonomics while preserving Phoenix's OpenTelemetry/OpenInference strengths.

## References

- [Phoenix OTel SDK Reference](https://arize.com/docs/phoenix/sdk-api-reference/python/arize-phoenix-otel)
- [Phoenix LangChain Integration](https://arize.com/docs/phoenix/integrations/python/langchain/langchain-tracing)
- [OpenInference LangChain Instrumentation](https://github.com/Arize-ai/openinference/tree/main/python/instrumentation/openinference-instrumentation-langchain)
- [OpenTelemetry Python Instrumentation](https://opentelemetry.io/docs/languages/python/instrumentation/)
- [Langfuse LangChain Integration](https://langfuse.com/integrations/frameworks/langchain)
