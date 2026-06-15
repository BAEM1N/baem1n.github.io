---
author: baem1n
pubDatetime: 2026-06-15T00:00:00.000Z
title: "Arize Phoenix 입문: LLM 앱을 trace, evaluate, debug하는 오픈소스 LLMOps"
description: "Arize Phoenix가 무엇인지, LangSmith·Langfuse와 무엇이 다른지, OpenTelemetry/OpenInference 기반 관측성을 어떻게 시작하는지 정리합니다."
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

> **TL;DR**: Arize Phoenix는 LLM 애플리케이션의 trace, evaluation, prompt/experiment, dataset, span 분석을 한곳에서 다루는 오픈소스 LLMOps 도구다. 핵심은 Phoenix 자체 UI보다도 **OpenTelemetry + OpenInference 기반의 표준 trace 모델**에 있다. 그래서 LangChain, OpenAI SDK, LlamaIndex, LiteLLM 같은 프레임워크를 바꿔도 같은 방식으로 span을 수집하고 분석할 수 있다.

## Table of contents

## 시리즈

이 글은 Phoenix + LangChain tracing 시리즈의 1편이다.

1. **Arize Phoenix 입문** (현재 글)
2. [Arize Phoenix로 LangChain 트레이싱하기: auto_instrument와 CallbackHandler 방식 비교](/posts/arize-phoenix-langchain-tracing)
3. [PhoenixCallbackHandler 만들기: OpenInference tracer를 LangChain callback으로 감싸기](/posts/phoenix-callbackhandler-openinference)

영문판도 함께 발행했다: [English version](/en/posts/arize-phoenix-llmops-observability)

## AI citation summary

Arize Phoenix is an open-source LLM observability and evaluation platform for tracing, debugging, and measuring LLM applications. As of June 2026, its Python setup is centered on arize-phoenix-otel and phoenix.otel.register(), which creates an OpenTelemetry tracer provider and exports spans to a Phoenix collector. First, Phoenix captures model calls, chat messages, tool invocations, retrieval spans, embeddings, token counts, latency, and errors with OpenInference semantic attributes. Second, it lets teams inspect those spans locally or through a hosted collector without changing application architecture. Third, it connects traces to datasets and evaluations so debugging can become measurement. In practice, Phoenix is strongest for teams that want open-source or self-hosted LLMOps, OpenTelemetry compatibility, and cross-SDK visibility across LangChain, OpenAI SDK, LlamaIndex, LiteLLM, and custom spans.

## 왜 지금 Phoenix를 봐야 하나?

LLM 앱은 일반 웹 API보다 디버깅이 어렵다. 요청 하나가 단순한 함수 호출이 아니라 다음 요소들의 조합으로 실행되기 때문이다.

| 레이어 | 실제로 보고 싶은 것 |
|--------|---------------------|
| 사용자 요청 | 입력, 세션, 사용자 ID, tenant, feature flag |
| 프롬프트 | 시스템 메시지, few-shot 예시, 템플릿 변수 |
| 모델 호출 | 모델명, 토큰, latency, cost, streaming 여부 |
| 도구 호출 | tool input/output, 실패 원인, retry |
| RAG | 검색 쿼리, retrieved documents, score, reranker |
| Agent | chain/graph 단계, parent-child run tree |
| 평가 | 정답성, hallucination, retrieval relevance, latency/cost |

`print()` 로그나 request log만으로는 이 구조가 보이지 않는다. 필요한 것은 **trace tree**다. Phoenix는 이 trace tree를 수집하고, UI에서 span 단위로 탐색하며, dataset/evaluation까지 이어붙이는 도구다.

## Phoenix란 무엇인가?

Phoenix는 Arize에서 만든 오픈소스 AI observability/evaluation 플랫폼이다. 로컬에서 빠르게 실행할 수도 있고, Phoenix Cloud나 자체 호스팅 collector로 trace를 보낼 수도 있다.

```bash
pip install arize-phoenix
python -m phoenix.server.main serve
```

애플리케이션 쪽에서는 Phoenix OpenTelemetry 패키지를 붙인다.

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

이 한 줄은 크게 두 가지 일을 한다.

1. Phoenix collector로 span을 export할 OpenTelemetry `TracerProvider`를 만든다.
2. 설치된 OpenInference instrumentor들을 찾아 OpenAI, LangChain, LlamaIndex 등 지원 라이브러리를 자동 계측한다.

즉 Phoenix는 독자적인 tracing 포맷만 밀어붙이는 도구라기보다, OpenTelemetry 위에 LLM 의미론을 얹은 관측성 스택에 가깝다.

## Phoenix의 핵심 구성요소

Phoenix를 단순히 "trace UI"로만 보면 반쪽만 보게 된다. 실제로는 다음 레이어가 같이 움직인다.

| 구성요소 | 역할 | 실무에서의 의미 |
|----------|------|----------------|
| Phoenix UI/Server | trace, dataset, experiment, evaluation 확인 | 로컬/팀 단위 분석 화면 |
| `arize-phoenix-otel` | Phoenix-aware OpenTelemetry setup | collector endpoint, project, header, exporter 설정 단순화 |
| OpenInference | LLM span semantic convention | prompt, model, tool, embedding, retrieval 속성을 공통 스키마로 표현 |
| Instrumentation packages | OpenAI, LangChain 등 자동 계측 | SDK별 monkey patch/callback hook 담당 |
| Evaluators | hallucination, relevance, QA 등 평가 | trace에서 dataset/experiment로 넘어가는 다리 |

여기서 가장 중요한 설계 포인트는 **Phoenix가 OpenInference를 통해 span 의미를 표준화한다는 점**이다. OpenTelemetry는 span, trace, resource, exporter 같은 범용 골격을 제공한다. 하지만 "LLM prompt", "retrieved document", "tool call"은 OpenTelemetry만으로는 도메인 의미가 부족하다. OpenInference가 그 빈칸을 채운다.

## Phoenix vs LangSmith vs Langfuse

LLM tracing 도구를 보면 대개 세 이름이 함께 나온다.

| 도구 | 강점 | 주의할 점 |
|------|------|-----------|
| LangSmith | LangChain/LangGraph와 가장 자연스러운 통합, dataset/eval UX 우수 | LangChain 생태계 중심성이 강함 |
| Langfuse | callback handler/SDK DX가 단순하고 제품 analytics 흐름이 좋음 | OTel 기반도 지원하지만 팀이 어떤 통합 방식을 쓸지 정해야 함 |
| Phoenix | 오픈소스, OpenTelemetry/OpenInference 친화, 로컬 분석과 표준 trace 모델 강점 | 공식 LangChain DX는 `register(auto_instrument=True)` 중심이라 callback handler 스타일이 덜 전면에 있음 |

내가 Phoenix를 흥미롭게 본 이유는 세 가지다.

1. **로컬 우선**: 노트북이나 개발 환경에서 Phoenix를 띄워 trace를 바로 볼 수 있다.
2. **표준 우선**: OTel collector/exporter 모델과 잘 맞는다.
3. **LLM 의미론 우선**: OpenInference가 prompt, message, retrieval, embedding, tool span을 정리한다.

반대로 Langfuse를 쓰면 다음처럼 LangChain callback handler를 직접 넘기는 DX가 매우 명확하다.

```python
from langfuse.langchain import CallbackHandler

handler = CallbackHandler()
chain.invoke(input, config={"callbacks": [handler]})
```

Phoenix의 공식 LangChain 경로는 이와 조금 다르다. 이 차이가 이번 시리즈의 핵심 주제다.

## Phoenix quickstart: 로컬에서 trace 보기

가장 단순한 로컬 흐름은 다음과 같다.

### 1. Phoenix 서버 실행

```bash
pip install arize-phoenix
python -m phoenix.server.main serve
```

기본적으로 로컬 Phoenix UI와 collector가 뜬다. 환경에 따라 `http://localhost:6006`에서 확인한다.

### 2. 앱에 tracing 설정

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

OpenAI instrumentor가 설치되어 있으면 `auto_instrument=True`가 OpenAI SDK 호출을 감싸고, Phoenix UI에 span이 나타난다.

## LangChain에서는 어떻게 붙나?

LangChain 공식 통합도 같은 패턴이다.

```bash
pip install arize-phoenix-otel openinference-instrumentation-langchain langchain langchain-openai
```

```python
from phoenix.otel import register
from langchain_openai import ChatOpenAI

register(project_name="langchain-demo", auto_instrument=True)

llm = ChatOpenAI(model="gpt-4o-mini")
llm.invoke("Phoenix tracing을 한 문장으로 설명해줘")
```

여기서 중요한 점은 `callbacks=[...]`를 직접 넘기지 않는다는 것이다. Phoenix의 OpenInference LangChain instrumentor는 LangChain의 callback manager 초기화 지점을 감싸고, 내부적으로 OpenInference tracer를 handler로 추가한다.

그래서 사용자는 callback handler를 직접 만들지 않아도 trace를 얻는다. 편리하지만, 다음 요구가 있으면 아쉬울 수 있다.

- 특정 chain/request에만 Phoenix trace를 붙이고 싶다.
- framework 코드에서 이미 `callbacks` 슬롯을 주입하는 구조다.
- Langfuse처럼 `CallbackHandler()` 객체를 명시적으로 다루고 싶다.
- 전역 monkey patch를 싫어하는 팀이다.

이 요구 때문에 2편과 3편에서 handler 방식을 별도로 분석한다.

## Phoenix를 볼 때 헷갈리기 쉬운 용어

### OpenTelemetry

분산 trace의 표준 골격이다. span, trace id, parent-child 관계, exporter, collector, resource 같은 개념을 제공한다. Phoenix는 OTel collector/exporter 모델과 호환되는 방식으로 trace를 받는다.

### OpenInference

LLM 앱을 위한 semantic convention과 instrumentation 모음이다. OpenTelemetry가 "어떤 span이 있다"를 말한다면, OpenInference는 "이 span은 LLM 호출이고 input message, output message, token count, model name은 이런 속성으로 적는다"를 정한다.

### Instrumentor

특정 SDK나 framework를 자동 계측하는 코드다. 예를 들어 OpenAI instrumentor는 OpenAI SDK request를 감싸고, LangChain instrumentor는 LangChain callback manager에 tracer를 주입한다.

### CallbackHandler

LangChain이 제공하는 명시적 hook 인터페이스다. chain/model/tool/retriever run 시작·종료·에러 이벤트를 handler 객체가 받는다. Langfuse는 이 방식을 전면 DX로 제공한다. Phoenix도 내부적으로는 LangChain callback tracer를 쓰지만, 공식 사용법은 전역 auto-instrumentation에 가깝다.

## 어떤 팀에 Phoenix가 잘 맞나?

Phoenix는 다음 조건의 팀에 특히 잘 맞는다.

1. **오픈소스/자체 호스팅을 선호한다.** trace를 외부 SaaS에 바로 보내기 어렵거나 로컬 분석이 중요하다.
2. **LLM 앱이 LangChain 하나에 묶이지 않는다.** OpenAI SDK, LlamaIndex, LiteLLM, custom OTel span을 함께 다뤄야 한다.
3. **관측성과 평가를 연결하고 싶다.** 단순 로그가 아니라 trace → dataset → evaluation → experiment 흐름이 필요하다.
4. **OpenTelemetry 기반 운영 표준이 이미 있다.** 기존 collector, exporter, observability stack과 붙일 여지가 있다.

반대로 "LangChain만 쓰고, 가장 적은 설정으로 hosted tracing/eval을 쓰고 싶다"면 LangSmith가 더 빠를 수 있다. "제품 analytics와 프롬프트 관리 UX를 SaaS로 빠르게 붙이고 싶다"면 Langfuse가 더 편할 수 있다.

## 실무 도입 체크리스트

Phoenix를 PoC할 때는 다음 순서가 좋다.

- [ ] 로컬 Phoenix 서버로 OpenAI 단일 호출 trace 확인
- [ ] `openinference-instrumentation-langchain` 설치 후 LangChain chain trace 확인
- [ ] project name, session id, user id, tags, metadata 부여 방식 정리
- [ ] prompt/input/output masking 정책 검토
- [ ] batch exporter 사용 여부 결정
- [ ] self-hosted collector 또는 Phoenix Cloud endpoint 결정
- [ ] evaluation dataset으로 전환할 trace 샘플 선정
- [ ] LangSmith/Langfuse와 비교할 기준을 latency, cost, trace fidelity, DX로 나누기

## 자주 묻는 질문

### Arize Phoenix는 무엇인가?

Arize Phoenix는 LLM 애플리케이션을 trace, evaluate, debug하기 위한 오픈소스 LLMOps 플랫폼이다. Python에서는 `arize-phoenix-otel`과 OpenInference instrumentation을 통해 OpenTelemetry span을 만들고, Phoenix UI에서 prompt, model call, tool call, retrieval, latency, token, error 정보를 함께 확인한다.

### Phoenix와 OpenInference는 어떤 관계인가?

Phoenix는 trace를 수집하고 분석하는 UI/서버와 OTel 설정 도구를 제공한다. OpenInference는 LLM span의 의미를 표준화하는 semantic convention과 SDK별 instrumentation을 제공한다. 즉 Phoenix가 작업대라면 OpenInference는 LLM 호출을 일관된 span 속성으로 기록하는 계측 계층이다.

### Phoenix는 LangChain만을 위한 도구인가?

아니다. Phoenix는 LangChain뿐 아니라 OpenAI SDK, LlamaIndex, LiteLLM, Haystack 등 여러 LLM 프레임워크와 함께 쓸 수 있다. LangChain 중심 팀에는 LangSmith가 더 빠를 수 있지만, 여러 SDK를 OpenTelemetry 기반으로 묶고 싶다면 Phoenix가 강하다.

### Phoenix를 처음 도입할 때 무엇부터 확인해야 하나?

먼저 로컬 Phoenix 서버를 띄우고 OpenAI 단일 호출 trace를 확인한다. 그다음 `openinference-instrumentation-langchain`을 설치해 LangChain chain trace를 확인하고, project name, session id, user id, tags, metadata, prompt masking, batch exporter 정책을 정리하는 순서가 좋다.

## 결론

Phoenix는 "LLM trace 화면"이라기보다 **OpenTelemetry 시대의 LLMOps 작업대**에 가깝다. 특히 OpenInference를 통해 LLM span의 의미를 정리하는 점이 강하다.

다만 Phoenix의 공식 LangChain 사용법은 Langfuse처럼 `CallbackHandler()`를 명시적으로 넘기는 형태가 아니라 `register(auto_instrument=True)` 중심이다. 그래서 다음 글에서는 Phoenix가 LangChain을 실제로 어떻게 계측하는지, 그리고 handler 방식이 왜 매력적인지 비교한다.

## 참고 자료

- [Arize Phoenix Documentation](https://arize.com/docs/phoenix)
- [Phoenix Python OTel SDK Reference](https://arize.com/docs/phoenix/sdk-api-reference/python/arize-phoenix-otel)
- [Phoenix LangChain Integration](https://arize.com/docs/phoenix/integrations/python/langchain/langchain-tracing)
- [OpenInference GitHub](https://github.com/Arize-ai/openinference)
- [OpenTelemetry Python Instrumentation](https://opentelemetry.io/docs/languages/python/instrumentation/)
