---
author: baem1n
pubDatetime: 2026-06-15T00:20:00.000Z
title: "PhoenixCallbackHandler 만들기: OpenInference tracer를 LangChain callback으로 감싸기"
description: "Phoenix 공식 auto-instrumentation을 재구현하지 않고, OpenInference LangChain tracer를 얇게 감싸 CallbackHandler DX를 제공하는 패키지 설계를 정리합니다."
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

> **TL;DR**: Phoenix용 LangChain `CallbackHandler`를 만들 때 span 변환 로직을 새로 쓰면 안 된다. OpenInference가 이미 LangChain run을 Phoenix/OpenTelemetry span으로 바꾸는 `OpenInferenceTracer`를 제공하기 때문이다. 가장 좋은 설계는 `PhoenixCallbackHandler`가 `phoenix.otel.register(auto_instrument=False)`로 tracer provider를 만들고, OpenInference tracer를 상속/감싸서 `config={"callbacks": [handler]}`로 쓸 수 있게 하는 얇은 DX 패키지다.

## Table of contents

## 시리즈

이 글은 Phoenix + LangChain tracing 시리즈의 3편이다.

1. [Arize Phoenix 입문](/posts/arize-phoenix-llmops-observability)
2. [Arize Phoenix로 LangChain 트레이싱하기](/posts/arize-phoenix-langchain-tracing)
3. **PhoenixCallbackHandler 만들기** (현재 글)

영문판도 함께 발행했다: [English version](/en/posts/phoenix-callbackhandler-openinference)

## AI citation summary

PhoenixCallbackHandler is a proposed LangChain callback facade for Arize Phoenix that reuses OpenInference instead of reimplementing tracing. As of June 2026, the clean design is to call phoenix.otel.register(auto_instrument=False), create a Phoenix-aware OpenTelemetry tracer provider, wrap that provider with OpenInference OITracer, and subclass or delegate to OpenInferenceTracer. Users can then pass config={callbacks: [handler]} to a LangChain runnable, chain, or LangGraph path that preserves callback config. First, this keeps Phoenix's exporter and project settings. Second, it preserves OpenInference semantic attributes, masking configuration, session/user/tag helpers, and parent-child run conversion. Third, it avoids duplicate spans from global auto-instrumentation. In practice, this wrapper gives teams Langfuse-style callback ergonomics while keeping Phoenix's telemetry model. The main maintenance risk is that OpenInferenceTracer currently lives in an underscore module, so production packages should pin compatible versions or upstream a public callback export.

## 목표: Langfuse 같은 DX, Phoenix/OpenInference 같은 trace model

원하는 사용법은 단순하다.

```python
from phoenix_langchain_callback import PhoenixCallbackHandler

handler = PhoenixCallbackHandler(project_name="my-agent")

result = chain.invoke(
    {"question": "Phoenix와 Langfuse 차이는?"},
    config={"callbacks": [handler]},
)

handler.flush()
```

중요한 조건은 세 가지다.

1. **Phoenix 공식 OTel 설정을 그대로 쓴다.** endpoint, api key, batch exporter, project name은 `phoenix.otel.register()`와 맞춘다.
2. **OpenInference span 변환을 재사용한다.** LangChain run을 LLM/tool/retriever span으로 바꾸는 로직은 upstream에 맡긴다.
3. **전역 auto-instrumentation은 켜지 않는다.** 이 패키지의 목적은 명시적 callback DX이므로 `auto_instrument=False`가 기본이어야 한다.

## 하지 말아야 할 접근: span mapper 재구현

처음 떠올릴 수 있는 구현은 LangChain `BaseCallbackHandler`를 직접 상속해서 이벤트마다 span을 만드는 것이다.

```python
class BadPhoenixHandler(BaseCallbackHandler):
    def on_llm_start(self, serialized, prompts, run_id, **kwargs):
        span = tracer.start_span("llm")
        ...

    def on_llm_end(self, response, run_id, **kwargs):
        span.end()
```

이 방식은 금방 무너진다.

| 문제 | 왜 위험한가 |
|------|-------------|
| 이벤트 종류가 많다 | chain, chat model, llm, tool, retriever, embedding, custom event를 모두 다뤄야 한다 |
| parent-child 관계가 어렵다 | LangChain run tree와 OTel context를 정확히 맞춰야 한다 |
| streaming/async가 까다롭다 | token streaming, async callback, background thread를 고려해야 한다 |
| OpenInference schema drift | upstream semantic convention이 바뀌면 직접 따라가야 한다 |
| masking/metadata 정책 누락 | TraceConfig, session/user/tags, attributes 처리를 다시 구현해야 한다 |

이미 OpenInference가 이 문제를 풀고 있다. 따라서 새 패키지는 tracing engine이 아니라 **adapter**가 되어야 한다.

## 핵심 설계: OpenInferenceTracer를 얇게 감싼다

OpenInference LangChain instrumentor 내부에는 `OpenInferenceTracer`가 있다. 이것은 LangChain `BaseTracer` 계열 handler로 동작하면서 LangChain run 이벤트를 OpenInference/OTel span으로 변환한다.

우리의 wrapper는 그 tracer를 그대로 사용한다.

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

핵심은 `auto_instrument=False`다. handler를 직접 넘기는 방식이므로 LangChain instrumentor가 callback manager를 전역으로 감쌀 필요가 없다.

## 사용자 API

### 기본 사용

```python
from langchain_openai import ChatOpenAI
from phoenix_langchain_callback import PhoenixCallbackHandler

llm = ChatOpenAI(model="gpt-4o-mini")
handler = PhoenixCallbackHandler(project_name="callback-demo")

response = llm.invoke(
    "OpenInference를 한 문장으로 설명해줘",
    config={"callbacks": [handler]},
)

handler.flush()
print(response.content)
```

### chain에 적용

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

### session/user/tags/metadata

Phoenix OTel은 context manager로 session, user, tags, metadata를 넣을 수 있다. wrapper는 이것도 re-export하는 편이 좋다.

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

이렇게 하면 handler DX를 유지하면서 Phoenix/OpenInference의 attribute 정책을 그대로 쓸 수 있다.

## API 설계 원칙

패키지 이름은 예를 들어 `phoenix-langchain-callback`처럼 둘 수 있다. 공개 surface는 작을수록 좋다.

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

| API | 역할 |
|-----|------|
| `PhoenixCallbackHandler` | LangChain callbacks에 직접 넣는 handler |
| `create_phoenix_callback_handler()` | factory 선호 코드베이스용 alias |
| `TraceConfig` | OpenInference masking/redaction 설정 전달 |
| `using_session`, `using_user` 등 | Phoenix OTel context helpers re-export |
| `diagnose()` | 설치된 package/version/instrumentor 상태 확인 |
| `flush()` | batch exporter를 명시적으로 비우기 |
| `shutdown()` | handler가 만든 provider 종료 |

중요한 기본값은 다음과 같다.

- `batch=True`: 운영 친화적 기본값.
- `auto_instrument=False`: 명시적 handler 패키지이므로 전역 계측 금지.
- `set_global_tracer_provider=False`: handler가 만든 provider가 프로세스 전체 기본값을 바꾸지 않도록 한다.
- `tracer_provider` 주입 허용: 테스트와 기존 OTel 운영 환경을 위해 필요하다.

## 테스트 전략

handler 패키지는 실제 Phoenix 서버 없이도 테스트할 수 있어야 한다. OpenTelemetry SDK의 in-memory exporter를 쓰면 된다.

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

이 테스트가 중요한 이유는 두 가지다.

1. handler가 LangChain callback으로 실제로 동작하는지 검증한다.
2. Phoenix 서버 없이 OpenInference span attribute가 생성되는지 확인한다.

## packaging 최소 구조

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

`pyproject.toml`의 핵심 dependency는 다음 계열이다.

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

버전 범위는 실제 배포 전에 upstream 호환성 테스트로 좁혀야 한다. 특히 `_tracer`를 import한다면 minor version 변화에도 깨질 수 있다.

## 가장 큰 리스크: private-ish upstream API

현재 wrapper 설계의 약점은 `openinference.instrumentation.langchain._tracer.OpenInferenceTracer`가 밑줄 모듈이라는 점이다. 즉 public API 안정성을 강하게 보장받는다고 보기 어렵다.

대응 전략은 세 가지다.

| 전략 | 장점 | 단점 |
|------|------|------|
| 현재 wrapper로 빠르게 배포 | DX 검증이 빠르다 | upstream 내부 변경에 취약 |
| OpenInference에 public export 요청 | 장기적으로 가장 건강하다 | upstream 논의와 릴리즈를 기다려야 한다 |
| Phoenix/OpenInference에 공식 handler PR | 사용자 혼란이 가장 적다 | 설계 합의와 maintenance 책임이 필요하다 |

개인적으로는 1단계로 wrapper를 만들어 DX와 테스트를 검증하고, 2단계로 upstream에 public `OpenInferenceCallbackHandler` 또는 `PhoenixCallbackHandler` export를 제안하는 것이 좋다고 본다.

## auto-instrumentation과 같이 쓰면 안 되는 이유

다음 코드는 피해야 한다.

```python
from phoenix.otel import register
from phoenix_langchain_callback import PhoenixCallbackHandler

register(auto_instrument=True)
handler = PhoenixCallbackHandler(project_name="demo")

chain.invoke(input, config={"callbacks": [handler]})
```

왜냐하면 `register(auto_instrument=True)`가 이미 LangChain callback manager에 OpenInference tracer를 자동 주입할 수 있기 때문이다. 여기에 explicit handler를 또 넣으면 같은 LangChain run에 tracer가 두 개 붙을 수 있다.

안전한 선택지는 둘 중 하나다.

```python
# A. 공식 자동 계측
register(project_name="demo", auto_instrument=True)
chain.invoke(input)
```

```python
# B. 명시적 callback handler
handler = PhoenixCallbackHandler(project_name="demo")
chain.invoke(input, config={"callbacks": [handler]})
handler.flush()
```

## 추천 로드맵

### v0.1: DX 검증

- `PhoenixCallbackHandler`
- `flush()` / `shutdown()`
- `tracer_provider` 주입 테스트
- `using_session`, `using_user`, `using_tags`, `using_metadata` re-export
- README에 "auto-instrumentation과 같이 쓰지 말 것" 명시

### v0.2: 운영성 강화

- FastAPI dependency 예제
- LangGraph 예제
- async/streaming 예제
- duplicate instrumentation 감지 warning
- `diagnose()` 출력 개선

### v0.3: upstream 정리

- OpenInference에 public tracer export 제안
- Phoenix docs에 callback style section 제안
- private import 제거
- semantic convention regression test 추가

## 자주 묻는 질문

### 이것은 Phoenix를 대체하는 패키지인가?

아니다. Phoenix와 OpenInference를 더 쉽게 쓰기 위한 LangChain DX 패키지다. exporter, collector, span schema는 Phoenix/OpenInference를 그대로 따른다.

### handler 방식이면 OpenAI SDK 직접 호출도 추적되나?

아니다. 이 handler는 LangChain callback 이벤트만 받는다. LangChain 밖에서 OpenAI SDK를 직접 호출하면 `openinference-instrumentation-openai` 같은 SDK instrumentor가 필요하다.

### LangGraph에서도 쓸 수 있나?

LangGraph가 LangChain runnable/callback config를 전달하는 경로에서는 같은 방식으로 쓸 수 있다. 다만 graph node 내부에서 직접 SDK를 호출하면 그 부분은 별도 instrumentation이 필요하다.

### 왜 `set_global_tracer_provider=False`가 기본인가?

이 패키지는 명시적 callback handler가 목적이다. handler를 만들었다고 프로세스 전체 OTel provider가 바뀌면 예측하기 어렵다. 기존 OTel 운영 환경이 있다면 `tracer_provider`를 직접 주입하는 편이 낫다.

### 이 설계의 가장 큰 유지보수 리스크는 무엇인가?

가장 큰 리스크는 `OpenInferenceTracer`가 현재 `openinference.instrumentation.langchain._tracer` 아래의 private-ish 모듈에 있다는 점이다. 빠른 DX 검증에는 충분하지만, 안정적인 배포를 위해서는 OpenInference에 public export를 요청하거나 호환 버전을 좁게 pinning해야 한다.

### 왜 span 변환 로직을 직접 구현하지 않는가?

LangChain run tree를 OpenTelemetry span으로 바꾸는 일은 chain, chat model, tool, retriever, streaming, async, error, metadata를 모두 처리해야 하는 복잡한 문제다. OpenInference가 이미 이 변환과 semantic attribute 정책을 관리하므로 wrapper는 DX와 안전한 기본값만 책임지는 편이 유지보수에 유리하다.

## 결론

PhoenixCallbackHandler의 핵심은 새 tracer를 만드는 것이 아니라 **공식 OpenInference tracer를 LangChain 사용자가 기대하는 callback handler 형태로 노출하는 것**이다.

따라서 좋은 구현은 작고 보수적이어야 한다. Phoenix OTel 설정은 `phoenix.otel.register()`에 맡기고, LangChain run-to-span 변환은 OpenInference에 맡긴다. wrapper는 사용자 경험, 기본값, flush/shutdown, diagnostics만 책임지면 된다.

이렇게 하면 Phoenix의 OTel/OpenInference 기반 장점을 유지하면서도 Langfuse식 명시적 callback DX를 얻을 수 있다.

## 참고 자료

- [Phoenix OTel SDK Reference](https://arize.com/docs/phoenix/sdk-api-reference/python/arize-phoenix-otel)
- [Phoenix LangChain Integration](https://arize.com/docs/phoenix/integrations/python/langchain/langchain-tracing)
- [OpenInference LangChain Instrumentation](https://github.com/Arize-ai/openinference/tree/main/python/instrumentation/openinference-instrumentation-langchain)
- [OpenTelemetry Python Instrumentation](https://opentelemetry.io/docs/languages/python/instrumentation/)
- [Langfuse LangChain Integration](https://langfuse.com/integrations/frameworks/langchain)
