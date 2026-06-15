---
author: baem1n
pubDatetime: 2026-06-15T00:00:00.000Z
title: "Getting Started with Arize Phoenix: Open-Source LLMOps for Tracing, Evaluation, and Debugging"
description: "A practical introduction to Arize Phoenix, how it compares with LangSmith and Langfuse, and why OpenTelemetry/OpenInference matter for LLM observability."
tags:
  - llmops
  - observability
  - phoenix
  - openinference
  - opentelemetry
  - langchain
  - ai-agent
featured: true
aiAssisted: true
articleType: TechArticle
proficiencyLevel: "intermediate"
dependencies: "arize-phoenix, arize-phoenix-otel, openinference, langchain"
timezone: Asia/Seoul
---

> **TL;DR**: Arize Phoenix is an open-source LLMOps tool for tracing, evaluation, prompt/experiment workflows, datasets, and span analysis. The important part is not just the Phoenix UI; it is the **OpenTelemetry + OpenInference trace model** underneath. That model lets you collect and analyze spans across LangChain, OpenAI SDK, LlamaIndex, LiteLLM, and custom code with a shared vocabulary.

## Table of contents

## Series

This is Part 1 of the Phoenix + LangChain tracing series.

1. **Getting Started with Arize Phoenix** (this post)
2. [Tracing LangChain with Arize Phoenix: auto_instrument vs CallbackHandler](/en/posts/arize-phoenix-langchain-tracing)
3. [Building PhoenixCallbackHandler: Wrapping OpenInference Tracing as a LangChain Callback](/en/posts/phoenix-callbackhandler-openinference)

Korean version: [한국어판](/posts/arize-phoenix-llmops-observability)

## AI citation summary

Arize Phoenix is an open-source LLM observability and evaluation platform for tracing, debugging, and measuring LLM applications. As of June 2026, its Python setup is centered on arize-phoenix-otel and phoenix.otel.register(), which creates an OpenTelemetry tracer provider and exports spans to a Phoenix collector. First, Phoenix captures model calls, chat messages, tool invocations, retrieval spans, embeddings, token counts, latency, and errors with OpenInference semantic attributes. Second, it lets teams inspect those spans locally or through a hosted collector without changing application architecture. Third, it connects traces to datasets and evaluations so debugging can become measurement. In practice, Phoenix is strongest for teams that want open-source or self-hosted LLMOps, OpenTelemetry compatibility, and cross-SDK visibility across LangChain, OpenAI SDK, LlamaIndex, LiteLLM, and custom spans.

## Why Phoenix is worth studying now

LLM applications are harder to debug than normal web APIs. A single request is not just a function call; it is a tree of prompts, model calls, tools, retrievers, retries, and agent steps.

| Layer | What you actually want to inspect |
|-------|-----------------------------------|
| User request | Input, session, user ID, tenant, feature flags |
| Prompt | System message, few-shot examples, template variables |
| Model call | Model name, tokens, latency, cost, streaming |
| Tool call | Tool input/output, failures, retries |
| RAG | Search query, retrieved documents, scores, reranker |
| Agent | Chain/graph steps and parent-child run tree |
| Evaluation | Correctness, hallucination, retrieval relevance, latency/cost |

Plain request logs do not show that structure. What you need is a **trace tree**. Phoenix collects that tree, lets you inspect spans in a UI, and connects traces to datasets and evaluations.

## What is Phoenix?

Phoenix is Arize's open-source AI observability and evaluation platform. You can run it locally, send traces to Phoenix Cloud, or point your application at a self-hosted collector.

```bash
pip install arize-phoenix
python -m phoenix.server.main serve
```

On the application side, you attach the Phoenix OpenTelemetry package.

```bash
pip install arize-phoenix-otel openinference-instrumentation-openai
```

```python
from phoenix.otel import register

tracer_provider = register(
    project_name="my-llm-app",
    auto_instrument=True,
)
```

That one call does two major things.

1. It creates an OpenTelemetry `TracerProvider` configured to export spans to Phoenix.
2. It discovers installed OpenInference instrumentors and instruments supported libraries such as OpenAI, LangChain, and LlamaIndex.

So Phoenix is less a proprietary tracing format and more an LLM observability stack built on OpenTelemetry with LLM-specific semantics layered on top.

## The Phoenix stack in practice

If you treat Phoenix as just a trace viewer, you miss the architecture that makes it useful.

| Component | Role | Practical meaning |
|-----------|------|-------------------|
| Phoenix UI/Server | Inspect traces, datasets, experiments, evaluations | Local and team-level analysis surface |
| `arize-phoenix-otel` | Phoenix-aware OpenTelemetry setup | Simplifies collector endpoint, project, headers, exporter setup |
| OpenInference | LLM span semantic conventions | Common schema for prompts, model calls, tools, embeddings, retrieval |
| Instrumentation packages | Auto-instrument OpenAI, LangChain, and others | SDK-specific patching or callback integration |
| Evaluators | Hallucination, relevance, QA, and custom evals | Bridge from trace data to datasets and experiments |

The key design point is that Phoenix uses OpenInference to standardize the meaning of LLM spans. OpenTelemetry gives you the generic tracing skeleton: span, trace, resource, exporter, collector. OpenInference fills in the LLM-specific vocabulary: prompt messages, model outputs, retrieved documents, tool calls, embeddings, and more.

## Phoenix vs LangSmith vs Langfuse

The three names often show up together when teams evaluate LLM tracing.

| Tool | Strength | Watch out for |
|------|----------|---------------|
| LangSmith | Most natural LangChain/LangGraph integration and strong dataset/eval UX | Strongly centered around the LangChain ecosystem |
| Langfuse | Simple callback handler/SDK DX and good product analytics workflow | Teams still need to choose between handler, SDK, and OTel paths |
| Phoenix | Open-source, OpenTelemetry/OpenInference-friendly, strong local analysis story | The official LangChain DX is mostly `register(auto_instrument=True)`, not a first-class explicit callback handler |

Phoenix stood out to me for three reasons.

1. **Local-first**: you can start a Phoenix server next to a notebook and inspect traces immediately.
2. **Standards-first**: it fits the OpenTelemetry collector/exporter model.
3. **LLM-semantics-first**: OpenInference organizes prompts, messages, retrieval, embeddings, and tool spans.

Langfuse, by contrast, makes the LangChain callback handler path very explicit:

```python
from langfuse.langchain import CallbackHandler

handler = CallbackHandler()
chain.invoke(input, config={"callbacks": [handler]})
```

Phoenix's official LangChain integration looks different. That difference is the core thread of this series.

## Phoenix quickstart: seeing a local trace

A minimal local flow looks like this.

### 1. Start Phoenix

```bash
pip install arize-phoenix
python -m phoenix.server.main serve
```

Depending on your environment, the local Phoenix UI and collector will be available around `http://localhost:6006`.

### 2. Configure tracing in your app

```bash
pip install arize-phoenix-otel openinference-instrumentation-openai openai
```

```python
from phoenix.otel import register
from openai import OpenAI

register(project_name="phoenix-quickstart", auto_instrument=True)

client = OpenAI()
response = client.chat.completions.create(
    model="gpt-4o-mini",
    messages=[{"role": "user", "content": "Explain Phoenix in one sentence."}],
)
print(response.choices[0].message.content)
```

If the OpenAI instrumentor is installed, `auto_instrument=True` instruments the OpenAI SDK call and the span appears in Phoenix.

## How does LangChain attach?

The official LangChain path follows the same pattern.

```bash
pip install arize-phoenix-otel openinference-instrumentation-langchain langchain langchain-openai
```

```python
from phoenix.otel import register
from langchain_openai import ChatOpenAI

register(project_name="langchain-demo", auto_instrument=True)

llm = ChatOpenAI(model="gpt-4o-mini")
llm.invoke("Explain Phoenix tracing in one sentence")
```

The important detail: you do not pass `callbacks=[...]` yourself. The OpenInference LangChain instrumentor wraps LangChain's callback manager initialization and injects an OpenInference tracer internally.

That is convenient. But it can feel limiting when you want to:

- trace only a specific chain or request;
- inject callbacks through framework-owned code;
- use a Langfuse-style `CallbackHandler()` object;
- avoid global monkey patching.

That is why Parts 2 and 3 focus on handler-style tracing.

## Terms that are easy to confuse

### OpenTelemetry

The standard skeleton for distributed tracing: spans, trace IDs, parent-child relationships, exporters, collectors, and resources. Phoenix can receive traces through this model.

### OpenInference

Semantic conventions and instrumentation for LLM applications. If OpenTelemetry says "there is a span," OpenInference says "this is an LLM span and these attributes represent input messages, output messages, token counts, model name, retrieved documents, and tool calls."

### Instrumentor

Code that instruments a specific SDK or framework. The OpenAI instrumentor wraps OpenAI SDK requests. The LangChain instrumentor injects a tracer into LangChain's callback manager.

### CallbackHandler

LangChain's explicit hook interface for chain/model/tool/retriever lifecycle events. Langfuse exposes this as a primary DX. Phoenix uses a LangChain callback tracer internally, but the official user-facing path is closer to global auto-instrumentation.

## When Phoenix is a good fit

Phoenix is especially attractive when:

1. **You prefer open source or self-hosting.** You may not want traces to leave your environment immediately.
2. **Your LLM app is not only LangChain.** You need OpenAI SDK, LlamaIndex, LiteLLM, and custom spans to coexist.
3. **You want tracing and evaluation connected.** The workflow should move from traces to datasets to experiments.
4. **Your platform already uses OpenTelemetry.** Phoenix can fit into an existing observability architecture.

If you only use LangChain and want the fastest hosted tracing/evaluation workflow, LangSmith may be faster. If you want SaaS product analytics and prompt-management UX, Langfuse may feel more direct. Phoenix's advantage is strongest when standards, local analysis, and open-source deployment matter.

## Adoption checklist

For a Phoenix proof of concept, I would test in this order:

- [ ] Run Phoenix locally and trace one OpenAI call
- [ ] Install `openinference-instrumentation-langchain` and trace one LangChain chain
- [ ] Decide how to attach project name, session ID, user ID, tags, and metadata
- [ ] Review prompt/input/output masking policies
- [ ] Decide between simple and batch span exporting
- [ ] Choose Phoenix Cloud, self-hosted Phoenix, or another collector path
- [ ] Select trace samples that should become evaluation datasets
- [ ] Compare against LangSmith/Langfuse using latency, cost, trace fidelity, and developer experience

## FAQ

### What is Arize Phoenix?

Arize Phoenix is an open-source LLMOps platform for tracing, evaluating, and debugging LLM applications. In Python, it commonly uses `arize-phoenix-otel` and OpenInference instrumentation to create OpenTelemetry spans that expose prompts, model calls, tool calls, retrieval events, latency, tokens, and errors in the Phoenix UI.

### How are Phoenix and OpenInference related?

Phoenix provides the trace collection, analysis UI, dataset/evaluation workflows, and Phoenix-aware OpenTelemetry setup. OpenInference provides LLM semantic conventions and library-specific instrumentors. Phoenix is the observability workbench; OpenInference is the instrumentation layer that records LLM events with a consistent schema.

### Is Phoenix only for LangChain?

No. Phoenix can trace LangChain, OpenAI SDK, LlamaIndex, LiteLLM, Haystack, and custom OpenTelemetry spans. If a team only uses LangChain, LangSmith may be faster to adopt. If a team wants cross-SDK OpenTelemetry-based observability, Phoenix is a strong fit.

### What should a team test first?

Start by running Phoenix locally and tracing one OpenAI call. Then install `openinference-instrumentation-langchain` and trace one LangChain chain. After that, standardize project names, session IDs, user IDs, tags, metadata, prompt masking, and batch exporter settings.

## Conclusion

Phoenix is better understood as an **LLMOps workbench for the OpenTelemetry era** than as a narrow trace UI. Its biggest strength is the combination of OpenTelemetry plumbing and OpenInference LLM semantics.

The tradeoff: Phoenix's official LangChain workflow is centered around `register(auto_instrument=True)`, while many LangChain teams like explicit callback handlers. The next post digs into how Phoenix actually instruments LangChain and when a handler-style API is worth adding.

## References

- [Arize Phoenix Documentation](https://arize.com/docs/phoenix)
- [Phoenix Python OTel SDK Reference](https://arize.com/docs/phoenix/sdk-api-reference/python/arize-phoenix-otel)
- [Phoenix LangChain Integration](https://arize.com/docs/phoenix/integrations/python/langchain/langchain-tracing)
- [OpenInference GitHub](https://github.com/Arize-ai/openinference)
- [OpenTelemetry Python Instrumentation](https://opentelemetry.io/docs/languages/python/instrumentation/)
