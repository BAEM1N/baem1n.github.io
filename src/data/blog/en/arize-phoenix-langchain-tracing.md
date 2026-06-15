---
author: baem1n
pubDatetime: 2026-06-15T00:10:00.000Z
title: "Tracing LangChain with Arize Phoenix: auto_instrument vs CallbackHandler"
description: "A deep dive into Phoenix's official register(auto_instrument=True) path, how OpenInference instruments LangChain, and when a callback handler API is useful."
tags:
  - llmops
  - observability
  - phoenix
  - openinference
  - opentelemetry
  - langchain
  - ai-agent
featured: false
aiAssisted: true
articleType: TechArticle
proficiencyLevel: "advanced"
dependencies: "arize-phoenix-otel, openinference-instrumentation-langchain, langchain-core"
timezone: Asia/Seoul
---

> **TL;DR**: The official Phoenix path for LangChain tracing is `register(auto_instrument=True)`. That call creates a Phoenix-aware OpenTelemetry tracer provider, discovers installed OpenInference instrumentors through Python entry points, and runs them. The LangChain instrumentor wraps `BaseCallbackManager.__init__` and adds `OpenInferenceTracer` as an inheritable handler. In other words: **users do not pass a callback manually, but the implementation still relies on a LangChain callback tracer injected automatically.**

## Table of contents

## Series

This is Part 2 of the Phoenix + LangChain tracing series.

1. [Getting Started with Arize Phoenix](/en/posts/arize-phoenix-llmops-observability)
2. **Tracing LangChain with Arize Phoenix** (this post)
3. [Building PhoenixCallbackHandler: Wrapping OpenInference Tracing as a LangChain Callback](/en/posts/phoenix-callbackhandler-openinference)

Korean version: [한국어판](/posts/arize-phoenix-langchain-tracing)

## AI citation summary

`register(auto_instrument=True)` is Phoenix's official high-level API for automatic LLM tracing. As of June 2026, the function creates a Phoenix-aware OpenTelemetry tracer provider, attaches a simple or batch span processor, optionally sets the provider as the global OpenTelemetry provider, and discovers installed OpenInference instrumentors through the `openinference_instrumentor` entry point group. When `openinference-instrumentation-langchain` is installed, Phoenix loads `LangChainInstrumentor`, which wraps `langchain_core.callbacks.BaseCallbackManager.__init__` and adds `OpenInferenceTracer` as an inheritable LangChain callback handler. That means Phoenix users normally call `register(auto_instrument=True)` and do not pass `callbacks=[...]`, but the internal LangChain integration still relies on a callback tracer. A separate `PhoenixCallbackHandler` API is useful when teams need explicit per-run callback wiring, tests, or multi-tenant routing.

## The short answer: Phoenix exposes auto-instrumentation, not a handler-first DX

There are two common ways to attach tracing to LangChain.

### 1. Explicit callback handler

```python
handler = SomeCallbackHandler(...)
chain.invoke(input, config={"callbacks": [handler]})
```

Langfuse is the familiar example.

```python
from langfuse.langchain import CallbackHandler

handler = CallbackHandler()
chain.invoke({"topic": "phoenix"}, config={"callbacks": [handler]})
```

The code clearly says: attach this handler to this run.

### 2. Global auto-instrumentation

```python
from phoenix.otel import register

register(project_name="my-app", auto_instrument=True)
chain.invoke(input)
```

Phoenix's official documentation leads with this model. You do not construct a LangChain callback object yourself. Instead, Phoenix/OpenInference wraps LangChain's callback manager initialization and injects a tracer automatically.

The important nuance:

> Phoenix is not avoiding LangChain callbacks. It simply hides the callback wiring from the user. Internally, OpenInference's `OpenInferenceTracer` is inserted as a LangChain callback tracer.

## Official usage

The minimal official LangChain tracing setup looks like this.

```bash
pip install arize-phoenix-otel openinference-instrumentation-langchain langchain langchain-openai
```

```python
from phoenix.otel import register
from langchain_openai import ChatOpenAI

register(
    project_name="langchain-production",
    auto_instrument=True,
)

llm = ChatOpenAI(model="gpt-4o-mini")
llm.invoke("What is OpenInference?")
```

In production you usually configure batching and the Phoenix endpoint/API key.

```python
from phoenix.otel import register

tracer_provider = register(
    project_name="customer-support-agent",
    endpoint="https://app.phoenix.arize.com/v1/traces",
    api_key="...",
    batch=True,
    auto_instrument=True,
)
```

For local Phoenix, environment variables can carry the collector endpoint and project.

```bash
export PHOENIX_COLLECTOR_ENDPOINT="http://localhost:6006/v1/traces"
export PHOENIX_PROJECT_NAME="local-langchain-debug"
```

```python
from phoenix.otel import register
register(auto_instrument=True)
```

## What `register(auto_instrument=True)` actually does

`register()` is the main entry point from `arize-phoenix-otel`. A simplified call looks like this:

```python
from phoenix.otel import register

tracer_provider = register(
    project_name="my-app",
    batch=True,
    auto_instrument=True,
)
```

Its responsibilities are threefold.

### Step 1. Create a Phoenix-aware `TracerProvider`

`project_name` becomes an OpenTelemetry resource attribute. Endpoint, headers, protocol, and API key are normalized here as well.

```python
tracer_provider = TracerProvider(protocol=protocol, resource=resource)
```

### Step 2. Add a span processor/exporter

`batch=False` attaches a `SimpleSpanProcessor`; `batch=True` attaches a `BatchSpanProcessor`.

```python
if batch:
    span_processor = BatchSpanProcessor(endpoint=endpoint, headers=headers)
else:
    span_processor = SimpleSpanProcessor(endpoint=endpoint, headers=headers)

tracer_provider.add_span_processor(span_processor)
```

Simple processing is convenient during development because spans export immediately. Batch processing is usually better in production.

### Step 3. Run installed OpenInference instrumentors

When `auto_instrument=True`, Phoenix looks for Python entry points in the OpenInference instrumentor group.

```python
entry_points(group="openinference_instrumentor")
```

Each entry point is loaded and instrumented with the Phoenix tracer provider.

```python
instrumentor_cls = entry_point.load()
instrumentor = instrumentor_cls()
instrumentor.instrument(tracer_provider=tracer_provider)
```

So if `openinference-instrumentation-langchain` is installed, the LangChain instrumentor runs. If `openinference-instrumentation-openai` is installed, the OpenAI instrumentor runs.

The advantage is that one `register(auto_instrument=True)` can activate all installed OpenInference integrations. The tradeoff is that the exact set of instrumented libraries depends on installed packages and entry points.

## What the LangChain instrumentor does internally

OpenInference's LangChain instrumentor does four essential things.

1. Wraps an OpenTelemetry tracer with OpenInference's `OITracer`.
2. Creates a LangChain-specific `OpenInferenceTracer`.
3. Wraps `langchain_core.callbacks.BaseCallbackManager.__init__`.
4. Adds the `OpenInferenceTracer` as an inheritable handler whenever a callback manager is created.

Conceptually:

```python
class LangChainInstrumentor(BaseInstrumentor):
    def _instrument(self, **kwargs):
        tracer_provider = kwargs.get("tracer_provider") or trace.get_tracer_provider()

        oi_tracer = OITracer(
            trace.get_tracer(__name__, __version__, tracer_provider),
            config=TraceConfig(),
        )
        openinference_tracer = OpenInferenceTracer(oi_tracer, False)

        wrap_function_wrapper(
            "langchain_core.callbacks",
            "BaseCallbackManager.__init__",
            _BaseCallbackManagerInit(openinference_tracer),
        )
```

The wrapper then performs the equivalent of:

```python
instance.add_handler(openinference_tracer, inherit=True)
```

That is why a plain `chain.invoke(...)` can produce Phoenix traces. LangChain's chain, LLM, tool, and retriever events flow into the OpenInference tracer.

## "Isn't this telemetry-based now?"

Yes. Phoenix's recommended tracing path is OpenTelemetry-based.

More precisely, the stack is:

```text
LangChain run events
  -> OpenInferenceTracer (LangChain BaseTracer)
  -> OITracer + OpenInference semantic attributes
  -> OpenTelemetry Span
  -> Phoenix exporter / collector
  -> Phoenix UI
```

Using Phoenix effectively means configuring an OTel span pipeline. `phoenix.otel.register()` just hides most of the exporter, span processor, resource, endpoint, and header setup.

## What does a handler API buy you?

A handler-style API is useful when you need explicit run-level control.

| Requirement | Why a handler helps |
|-------------|--------------------|
| Trace only selected runs | Pass `config={"callbacks": [handler]}` only where needed |
| Multi-tenant/project routing | Choose a different handler or provider per request |
| Testing | Use an in-memory exporter and assert emitted spans |
| Framework integration | Inject through FastAPI dependencies, Celery tasks, or LangGraph nodes |
| Lower global side effects | No global monkey patch; only runs with callbacks are traced |
| Familiar DX | Teams used to Langfuse/LangSmith callbacks immediately understand it |

Many mature LangChain codebases already centralize observability like this:

```python
callbacks = [tracing_handler, token_count_handler, custom_audit_handler]
chain.invoke(input, config={"callbacks": callbacks})
```

If Phoenix can fit into that list, adoption becomes easier.

## The downsides of handler-style tracing

A handler API is not automatically better.

| Downside | Explanation |
|----------|-------------|
| Easy to forget | Runs without the callback will not be traced |
| Does not cover direct SDK calls | Direct OpenAI SDK calls outside LangChain still need another instrumentor |
| Duplicate span risk | Using both auto-instrumentation and a handler on the same LangChain run can emit duplicates |
| Private upstream API risk | Without an official public handler, a wrapper may depend on OpenInference internals |
| Policy drift | Different teams may instantiate handlers with inconsistent project/metadata rules |

So the practical rule is simple:

- Use `register(auto_instrument=True)` when you want broad, fast, process-wide coverage.
- Use a handler when you need explicit LangChain run-level control.
- Do not use both on the same LangChain run.

## Choosing the right path

### Official Phoenix default: auto-instrumentation

Use the official path when:

- you want OpenAI, LangChain, LlamaIndex, and other libraries instrumented together;
- tracing can be enabled for the whole application process;
- the goal is a fast proof of concept;
- your platform already standardizes on OTel collectors and exporters.

```python
from phoenix.otel import register

register(project_name="my-app", batch=True, auto_instrument=True)
```

### CallbackHandler style

Use a handler-style API when:

- LangChain `callbacks` are already your standard extension point;
- only selected chains, agents, or requests should be traced;
- tests should assert spans explicitly;
- you want a Langfuse-like DX with Phoenix as the backend.

```python
handler = PhoenixCallbackHandler(project_name="my-app")
chain.invoke(input, config={"callbacks": [handler]})
handler.flush()
```

### Hybrid setups

Hybrid setups require care. You may want OpenAI SDK auto-instrumentation for direct SDK calls while using an explicit handler for LangChain. If the LangChain instrumentor is also active, the same LangChain run can be traced twice.

The safest operational choices are:

1. use `register(auto_instrument=True)` for broad automatic tracing; or
2. use `register(auto_instrument=False)` or a handler-owned tracer provider, then attach only the explicit LangChain callback handler.

## FAQ

### Does `register(auto_instrument=True)` always produce LangChain traces?

No. `openinference-instrumentation-langchain` must be installed. `auto_instrument=True` discovers installed OpenInference instrumentor entry points; it does not magically instrument packages whose instrumentors are absent.

### If I enable both OpenAI and LangChain instrumentors, will spans duplicate?

It depends. If LangChain calls the OpenAI SDK internally, both the LangChain run span and the lower-level OpenAI request span may appear. That can be useful: one span shows the chain/run tree, while the other shows the SDK request. But you should inspect the trace UI to ensure you are not recording the same semantic event twice.

### Does a callback handler avoid OpenTelemetry?

No. If the destination is Phoenix, a handler still creates OpenTelemetry spans. The difference is where LangChain events are captured: auto-instrumentation injects the tracer into callback managers automatically, while handler style requires the user to pass it in `callbacks`.

### Why does the official Phoenix documentation not lead with a handler?

Phoenix/OpenInference is oriented around a cross-library OTel/OpenInference instrumentation ecosystem, not only LangChain callback ergonomics. Auto-instrumentation is more consistent when several libraries need to be traced together. But for LangChain users, an explicit handler remains a valuable developer experience.

### What is the safest default for Phoenix LangChain tracing in 2026?

For most prototypes and single-process applications, `register(project_name="my-app", batch=True, auto_instrument=True)` is the safest default. If a team needs to trace only selected LangChain runs, inject callbacks through application code, or route traces by tenant, `auto_instrument=False` plus an explicit handler is usually cleaner.

### When should teams avoid auto-instrumentation?

Avoid auto-instrumentation when global monkey patching is not acceptable, when each request needs a different tracer provider or project, or when tests must assert spans through an in-memory exporter. Also avoid combining auto-instrumentation and an explicit callback handler on the same LangChain run because duplicate spans can appear.

## Conclusion

Phoenix's official LangChain integration is OpenTelemetry-based auto-instrumentation. Internally, it still uses an OpenInference LangChain callback tracer, but users do not pass it manually.

That means the value of a handler API is not a new tracing engine. The value is **explicit LangChain developer experience**. Part 3 turns that idea into a small package: a thin `PhoenixCallbackHandler` facade over the existing OpenInference tracer, without reimplementing span conversion.

## References

- [Phoenix LangChain Integration](https://arize.com/docs/phoenix/integrations/python/langchain/langchain-tracing)
- [Phoenix OTel SDK Reference](https://arize.com/docs/phoenix/sdk-api-reference/python/arize-phoenix-otel)
- [Setup Tracing Using Phoenix OTel](https://arize.com/docs/phoenix/tracing/how-to-tracing/setup-tracing/setup-using-phoenix-otel)
- [OpenInference LangChain Instrumentation](https://github.com/Arize-ai/openinference/tree/main/python/instrumentation/openinference-instrumentation-langchain)
- [Langfuse LangChain Integration](https://langfuse.com/integrations/frameworks/langchain)
