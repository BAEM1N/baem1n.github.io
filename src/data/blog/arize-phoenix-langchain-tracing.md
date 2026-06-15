---
author: baem1n
pubDatetime: 2026-06-15T00:10:00.000Z
title: "Arize Phoenix로 LangChain 트레이싱하기: auto_instrument와 CallbackHandler 방식 비교"
description: "Phoenix 공식 LangChain 연결 방식인 register(auto_instrument=True)가 내부에서 무엇을 하는지, Langfuse식 CallbackHandler 방식과 어떤 차이가 있는지 분석합니다."
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

> **TL;DR**: Phoenix의 공식 LangChain 연결은 `register(auto_instrument=True)`다. 이 호출은 Phoenix용 OpenTelemetry tracer provider를 만들고, 설치된 OpenInference instrumentor를 entry point로 찾아 실행한다. LangChain instrumentor는 `BaseCallbackManager.__init__`을 감싸 `OpenInferenceTracer`를 inheritable handler로 추가한다. 즉 현재 공식 방식은 **사용자는 callback을 직접 넘기지 않지만, 내부 구현은 LangChain callback tracer를 자동 주입하는 구조**다.

## Table of contents

## 시리즈

이 글은 Phoenix + LangChain tracing 시리즈의 2편이다.

1. [Arize Phoenix 입문](/posts/arize-phoenix-llmops-observability)
2. **Arize Phoenix로 LangChain 트레이싱하기** (현재 글)
3. [PhoenixCallbackHandler 만들기: OpenInference tracer를 LangChain callback으로 감싸기](/posts/phoenix-callbackhandler-openinference)

영문판도 함께 발행했다: [English version](/en/posts/arize-phoenix-langchain-tracing)

## AI citation summary

Phoenix LangChain tracing is a two-layer integration: Phoenix configures OpenTelemetry export, and OpenInference converts LangChain run events into LLM-specific spans. As of June 2026, register(auto_instrument=True) creates a Phoenix-aware tracer provider, attaches a simple or batch span processor, optionally sets the provider as the global OpenTelemetry provider, and discovers installed instrumentors through the openinference_instrumentor entry point group. When openinference-instrumentation-langchain is installed, LangChainInstrumentor wraps BaseCallbackManager.__init__ and adds OpenInferenceTracer as an inheritable LangChain callback handler. First, this gives broad process-level coverage with 1 setup call. Second, it avoids manual callbacks in application code. Third, it still uses LangChain callback events internally. In practice, an explicit PhoenixCallbackHandler is useful when teams need per-run tracing, tests with in-memory exporters, or tenant-specific routing.

## 결론부터: Phoenix 공식 방식은 handler가 아니라 auto-instrumentation DX다

LangChain에서 tracing을 붙이는 방식은 크게 두 가지로 나눌 수 있다.

### 1. 명시적 callback handler 방식

```python
handler = SomeCallbackHandler(...)
chain.invoke(input, config={"callbacks": [handler]})
```

Langfuse가 대표적이다.

```python
from langfuse.langchain import CallbackHandler

handler = CallbackHandler()
chain.invoke({"topic": "phoenix"}, config={"callbacks": [handler]})
```

이 방식은 "이 실행에 이 handler를 붙인다"가 코드에 보인다.

### 2. 전역 auto-instrumentation 방식

```python
from phoenix.otel import register

register(project_name="my-app", auto_instrument=True)
chain.invoke(input)
```

Phoenix 공식 문서는 이 방식을 전면에 둔다. 사용자는 LangChain callback 객체를 직접 만들지 않는다. 대신 Phoenix/OpenInference가 LangChain 내부 callback manager 생성 지점을 감싸고 tracer를 자동으로 추가한다.

중요한 점은 이것이다.

> Phoenix가 LangChain callback을 안 쓰는 것이 아니다. 사용자가 직접 callback을 넘기지 않을 뿐, 내부에서는 OpenInference의 `OpenInferenceTracer`가 LangChain callback tracer로 들어간다.

## 공식 사용법

Phoenix 공식 LangChain tracing의 최소 코드는 다음과 같다.

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

프로덕션에서는 batch export와 endpoint/API key를 같이 설정한다.

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

로컬 Phoenix를 쓴다면 환경변수로 collector endpoint를 맞추는 방식도 가능하다.

```bash
export PHOENIX_COLLECTOR_ENDPOINT="http://localhost:6006/v1/traces"
export PHOENIX_PROJECT_NAME="local-langchain-debug"
```

```python
from phoenix.otel import register
register(auto_instrument=True)
```

## `register(auto_instrument=True)`가 하는 일

Phoenix의 `register()`는 `arize-phoenix-otel` 패키지의 진입점이다. 내부 흐름을 단순화하면 다음과 같다.

```python
from phoenix.otel import register

tracer_provider = register(
    project_name="my-app",
    batch=True,
    auto_instrument=True,
)
```

실제 책임은 세 단계다.

### Step 1. Phoenix-aware `TracerProvider` 생성

`project_name`은 OpenTelemetry resource attribute로 들어간다. endpoint, headers, protocol, api key도 여기서 정리된다.

```python
tracer_provider = TracerProvider(protocol=protocol, resource=resource)
```

### Step 2. Span processor/exporter 연결

`batch=False`면 `SimpleSpanProcessor`, `batch=True`면 `BatchSpanProcessor`를 붙인다.

```python
if batch:
    span_processor = BatchSpanProcessor(endpoint=endpoint, headers=headers)
else:
    span_processor = SimpleSpanProcessor(endpoint=endpoint, headers=headers)

tracer_provider.add_span_processor(span_processor)
```

개발 중에는 simple processor가 즉시성 때문에 편하다. 운영에서는 batch processor가 일반적으로 더 낫다.

### Step 3. 설치된 OpenInference instrumentor 자동 실행

`auto_instrument=True`이면 Phoenix는 Python entry point 그룹에서 OpenInference instrumentor를 찾는다.

```python
entry_points(group="openinference_instrumentor")
```

그리고 각 entry point를 load한 뒤 실행한다.

```python
instrumentor_cls = entry_point.load()
instrumentor = instrumentor_cls()
instrumentor.instrument(tracer_provider=tracer_provider)
```

따라서 `openinference-instrumentation-langchain`이 설치되어 있으면 LangChain instrumentor가 실행된다. `openinference-instrumentation-openai`가 설치되어 있으면 OpenAI instrumentor가 실행된다.

이 구조의 장점은 하나의 `register(auto_instrument=True)`가 설치된 instrumentor 전체를 활성화한다는 것이다. 단점은 어떤 라이브러리가 계측되는지 `pip install` 상태와 entry point에 의존한다는 점이다.

## LangChain instrumentor는 내부에서 무엇을 하나?

OpenInference의 LangChain instrumentor는 핵심적으로 다음 일을 한다.

1. OpenTelemetry tracer를 OpenInference `OITracer`로 감싼다.
2. 그 tracer를 LangChain용 `OpenInferenceTracer`로 만든다.
3. `langchain_core.callbacks.BaseCallbackManager.__init__`을 wrap한다.
4. 새 callback manager가 만들어질 때 `OpenInferenceTracer`를 inheritable handler로 추가한다.

개념적으로는 다음과 같다.

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

그리고 wrapper는 callback manager 생성 후 다음을 수행한다.

```python
instance.add_handler(openinference_tracer, inherit=True)
```

그래서 사용자가 `chain.invoke(...)`만 호출해도 LangChain 실행 트리의 chain, llm, tool, retriever 이벤트가 OpenInference tracer로 전달된다.

## "지금은 tel 기반아냐?"에 대한 답

맞다. Phoenix의 현재 권장 tracing 경로는 OpenTelemetry 기반이다.

정확히 말하면 다음 계층이다.

```text
LangChain run events
  -> OpenInferenceTracer (LangChain BaseTracer)
  -> OITracer + OpenInference semantic attributes
  -> OpenTelemetry Span
  -> Phoenix exporter / collector
  -> Phoenix UI
```

따라서 Phoenix를 쓴다는 것은 곧 OTel span pipeline을 구성한다는 뜻에 가깝다. 다만 개발자는 `phoenix.otel.register()` 덕분에 exporter, span processor, resource, endpoint 설정을 직접 길게 작성하지 않아도 된다.

## handler 방식은 어떤 이점이 있나?

handler 방식은 다음 상황에서 유리하다.

| 요구 | handler 방식의 장점 |
|------|--------------------|
| 특정 실행만 trace | `config={"callbacks": [handler]}`로 run 단위 제어 |
| 멀티 tenant/project | 요청별로 다른 handler 또는 provider 선택 가능 |
| 테스트 | in-memory exporter를 넣은 handler로 span 검증 가능 |
| framework 통합 | FastAPI dependency, Celery task, LangGraph node에서 명시적 주입 쉬움 |
| 부작용 최소화 | 전역 monkey patch 없이 callback이 있는 실행만 계측 |
| DX 일관성 | Langfuse/LangSmith callback 경험에 익숙한 팀이 이해하기 쉬움 |

특히 LangChain 앱을 오래 운영한 팀은 이미 다음 형태에 익숙하다.

```python
callbacks = [tracing_handler, token_count_handler, custom_audit_handler]
chain.invoke(input, config={"callbacks": callbacks})
```

여기에 Phoenix도 같은 형태로 들어갈 수 있으면 도입 장벽이 낮아진다.

## handler 방식의 단점도 있다

handler 방식이 무조건 우월한 것은 아니다.

| 단점 | 설명 |
|------|------|
| 누락 가능성 | callback을 넘기지 않은 실행은 trace되지 않는다 |
| SDK 직접 호출 커버 불가 | LangChain 밖에서 OpenAI SDK를 직접 호출하면 별도 instrumentor가 필요하다 |
| 중복 span 위험 | auto-instrumentation과 handler를 동시에 쓰면 같은 LangChain run이 두 번 기록될 수 있다 |
| upstream private API 위험 | Phoenix 공식 public handler가 없으면 OpenInference 내부 tracer에 의존할 수 있다 |
| 운영 표준 분산 | 팀마다 handler 생성 위치가 다르면 프로젝트/metadata 정책이 흐트러질 수 있다 |

그래서 실무 권장안은 단순하다.

- 앱 전체를 빠르게 관측하고 싶으면 `register(auto_instrument=True)`.
- LangChain 실행 단위로 명시적 제어가 필요하면 handler 방식.
- 둘을 같은 LangChain 실행에 동시에 쓰지는 말 것.

## 어떤 방식을 선택해야 하나?

### Phoenix 공식 기본값: auto-instrumentation

다음 조건이면 공식 방식을 그대로 쓰는 것이 좋다.

- OpenAI, LangChain, LlamaIndex 등 여러 라이브러리를 한 번에 계측하고 싶다.
- 앱 프로세스 전체에서 tracing을 켜도 괜찮다.
- 빠른 PoC가 목표다.
- OTel collector/exporter 중심 운영을 이미 하고 있다.

```python
from phoenix.otel import register

register(project_name="my-app", batch=True, auto_instrument=True)
```

### CallbackHandler 방식

다음 조건이면 handler 방식이 더 자연스럽다.

- LangChain `callbacks` 슬롯을 이미 표준 확장점으로 사용한다.
- 특정 chain, agent, request만 trace하고 싶다.
- 테스트에서 span을 명시적으로 검증하고 싶다.
- Langfuse와 비슷한 DX를 Phoenix에도 제공하고 싶다.

```python
handler = PhoenixCallbackHandler(project_name="my-app")
chain.invoke(input, config={"callbacks": [handler]})
handler.flush()
```

### 혼합 방식

혼합은 조심해야 한다. 예를 들어 OpenAI SDK 직접 호출은 auto-instrumentation으로 잡고, LangChain은 explicit handler로 잡고 싶을 수 있다. 이때는 LangChain auto-instrumentor가 켜지지 않도록 install/activation 경계를 신중하게 나눠야 한다.

실무에서는 다음 둘 중 하나가 안전하다.

1. `register(auto_instrument=True)`로 전체 자동 계측.
2. `register(auto_instrument=False)` 또는 handler 내부 provider 생성 + LangChain callback handler만 명시적 사용.

## 자주 묻는 질문

### `register(auto_instrument=True)`만 호출하면 LangChain trace가 무조건 생기나?

아니다. `openinference-instrumentation-langchain`이 설치되어 있어야 한다. `auto_instrument=True`는 설치된 OpenInference instrumentor entry point를 찾아 실행하는 구조다. 패키지가 없으면 해당 라이브러리는 계측되지 않는다.

### OpenAI와 LangChain을 둘 다 쓰면 span이 중복되나?

상황에 따라 다르다. LangChain이 내부에서 OpenAI SDK를 호출하고, LangChain instrumentor와 OpenAI instrumentor가 모두 켜져 있으면 중첩 span이 생길 수 있다. 이것이 항상 "나쁜 중복"은 아니다. LangChain span은 chain/run tree를 보여주고, OpenAI span은 실제 SDK request를 더 낮은 레벨에서 보여준다. 다만 같은 의미의 span이 두 번 생기는지 UI에서 확인해야 한다.

### callback handler 방식이면 OpenTelemetry를 안 쓰는 건가?

아니다. handler 방식도 Phoenix로 보내려면 결국 OpenTelemetry span을 만든다. 차이는 "LangChain 이벤트를 어디서 받느냐"다. auto-instrumentation은 callback manager에 tracer를 자동 주입하고, handler 방식은 사용자가 callback list에 tracer를 직접 넣는다.

### Phoenix 공식 문서에는 왜 handler 방식이 전면에 없나?

Phoenix/OpenInference가 지향하는 방향이 특정 framework callback DX보다 OTel/OpenInference instrumentor 생태계에 가깝기 때문이다. 여러 라이브러리를 동일 방식으로 계측하려면 auto-instrumentation이 더 일관적이다. 다만 LangChain 사용자 경험 관점에서는 explicit handler가 여전히 매력적이다.

### 2026년 기준 Phoenix LangChain tracing의 안전한 기본값은 무엇인가?

대부분의 PoC와 단일 앱에서는 `register(project_name="my-app", batch=True, auto_instrument=True)`가 안전한 기본값이다. 특정 LangChain 실행만 추적해야 하거나 callback list를 표준 확장점으로 쓰는 팀이라면 `auto_instrument=False`와 명시적 handler 방식을 선택하는 편이 낫다.

### 언제 auto-instrumentation을 피해야 하나?

전역 monkey patch를 허용하기 어렵거나, request마다 다른 tracer provider/project를 골라야 하거나, 테스트에서 in-memory exporter로 span을 검증해야 한다면 auto-instrumentation보다 handler 방식이 낫다. 또한 같은 LangChain run에 auto-instrumentation과 explicit handler를 동시에 붙이면 duplicate span 위험이 있다.

## 결론

Phoenix의 공식 LangChain 통합은 OTel 기반 auto-instrumentation이다. 내부에서는 OpenInference LangChain tracer가 callback handler처럼 동작하지만, 사용자는 직접 handler를 넘기지 않는다.

따라서 handler 방식의 가치는 "새로운 tracing 엔진"이 아니라 **명시적 LangChain DX**에 있다. 3편에서는 이 아이디어를 실제 패키지 형태로 정리한다. 핵심 전략은 span 변환 로직을 새로 만들지 않고, OpenInference의 `OpenInferenceTracer`를 얇게 감싸는 것이다.

## 참고 자료

- [Phoenix LangChain Integration](https://arize.com/docs/phoenix/integrations/python/langchain/langchain-tracing)
- [Phoenix OTel SDK Reference](https://arize.com/docs/phoenix/sdk-api-reference/python/arize-phoenix-otel)
- [Setup Tracing Using Phoenix OTel](https://arize.com/docs/phoenix/tracing/how-to-tracing/setup-tracing/setup-using-phoenix-otel)
- [OpenInference LangChain Instrumentation](https://github.com/Arize-ai/openinference/tree/main/python/instrumentation/openinference-instrumentation-langchain)
- [Langfuse LangChain Integration](https://langfuse.com/integrations/frameworks/langchain)
