---
author: baem1n
pubDatetime: 2026-04-16T00:00:00.000Z
title: "한국어 RAG 벤치마크 — 300 Q&A × 21 임베딩 × 30 LLM 실험 설계"
description: "allganize RAG-Evaluation-Dataset-KO 기반으로 파서·청킹·벡터스토어·임베딩·LLM 5단계를 분리 비교하는 RAG 벤치마크 실험 계획을 공유합니다."
tags:
  - rag
  - llm
  - langchain
  - benchmark
  - korean-nlp
featured: true
aiAssisted: true
---

> **TL;DR**: 한국어 RAG 파이프라인을 5단계(파서→청킹→벡터스토어→임베딩→LLM)로 분해해 각각 단일 변수 실험으로 돌렸다. 21개 임베딩, 7개 벡터스토어, 약 30개 LLM(로컬+OpenRouter+Friendli.ai)을 교차 평가하는 구조다. 임베딩 1위는 **google/gemma-embed-300m (MRR 0.6682)**, 하위 95% 비용 절감을 위해 Qwen3.5 양자화 모델은 `chat_template_kwargs: {enable_thinking: false}`를 반드시 넘겨야 한다.

## Table of contents

## 왜 또 RAG 벤치마크를 돌리는가

한국어 RAG 분야의 기존 벤치마크는 범위가 제한적이었다.

| 기존 연구 | 데이터 | Parser | Chunking | Embedding | VectorStore | LLM |
|-----------|--------|--------|----------|-----------|-------------|-----|
| allganize RAG-Evaluation-Dataset-KO | 300 Q&A | PyPDF 고정 | 1000/200 고정 | OpenAI ada-002 1종 | Chroma | gpt-4-turbo |
| AutoRAG-example | 비공개 | 미명시 | 미명시 | **16종** (API 혼합) | 미비교 | 미사용 |
| ssisOneTeam | 106 Q&A | 미명시 | 미명시 | **24종** (API 혼합) | 미비교 | 미사용 |
| **본 실험** | 300 Q&A | **3종** | **4종** | **21종 로컬 + 5종 API** | **7종** | **~30종 (로컬 + OpenRouter + Friendli.ai)** |

기존 실험들은 단일 컴포넌트만 바꾸거나 데이터가 작거나 상용 API 위주였다. 이 프로젝트는 **각 컴포넌트를 독립 변수로 잡고 나머지를 고정**하는 Phase 구조로, 어떤 구성 요소가 얼마나 기여하는지 측정한다.

## 실험 데이터셋

[allganize/RAG-Evaluation-Dataset-KO](https://huggingface.co/datasets/allganize/RAG-Evaluation-Dataset-KO) 300 Q&A를 사용했다. 5개 도메인(금융, 공공, 의료, 법률, 상거래) 각 60건씩이고, 정답 PDF(58개)와 정답 페이지가 모두 주어진다.

### 데이터 구성

| 항목 | 수량 |
|------|------|
| 질문 | 300 |
| PDF | 58 |
| 도메인 | 5 (각 60 Q&A) |
| Context type | paragraph 148, image 57, table 50, text 45 |

## 실험 Phase 구조

각 단계의 **최적 설정은 이전 Phase 결과**에서 고정한다. 한 번에 한 변수만 바꿔 인과를 분리한다.

### Phase 1: Parser 비교 (3종)

**고정:** Chunking=1000/200, Embedding=qwen3-embed-8b, VectorStore=pgvector  
**변수:** PyPDF, pymupdf4llm, pymupdf

| Parser | MRR | Hit@5 | 청크 수 |
|--------|-----|-------|---------|
| **pymupdf4llm** (1위) | 0.4715 | 58.3% | 1,920 |
| pymupdf | 0.4663 | 63.3% | 1,263 |
| pypdf | 0.4472 | 60.7% | 1,224 |

마크다운 변환 기반 pymupdf4llm이 MRR 1위. 이후 Phase는 이것으로 고정.

### Phase 2: Chunking 비교 (4종)

**고정:** Parser=pymupdf4llm, 나머지는 Phase 1과 동일  
**변수:** chunk_size × overlap

| 전략 | chunk_size | overlap | MRR | 청크 수 |
|------|-----------|---------|-----|---------|
| **small** (1위) | 500 | 100 | **0.5315** | 3,166 |
| baseline | 1,000 | 200 | 0.4713 | 1,920 |
| medium | 1,500 | 200 | 0.4458 | 1,468 |
| large | 2,000 | 300 | 0.4302 | 1,370 |

작은 청크가 MRR에서 압도적 1위. llama.cpp 임베딩 서버의 512 토큰 제한과도 맞물려 정보 손실이 가장 적다.

### Phase 3: VectorStore 비교 (7종)

**고정:** Parser=pymupdf4llm, Chunking=500/100, Embedding=qwen3-embed-8b  
**변수:** 벡터스토어 7종

| VectorStore | MRR | Insert | Query Latency |
|-------------|-----|--------|--------------|
| **FAISS** | 0.5304 | **0.8s** | **0.7ms** |
| LanceDB | 0.5304 | 6.0s | 6.3ms |
| Qdrant | 0.5304 | 58.6s | 112.8ms |
| Milvus | 0.5304 | 22.4s | 53.7ms |
| Weaviate | 0.5298 | 12.0s | 23.3ms |
| Chroma | 0.5271 | 16.7s | 40.0ms |
| pgvector | 0.5304 | 92.3s | 142.9ms |

**검색 정확도는 7종 전부 동일 (MRR 0.527~0.530)**. 같은 벡터를 넣으면 같은 결과가 나온다. 차이는 오직 속도다. FAISS가 insert 0.8초 · 지연 0.7ms로 압도적.

### Phase 4: Embedding 비교 (21종)

**고정:** Parser=pymupdf4llm, Chunking=500/100, VectorStore=FAISS  
**변수:** 21개 임베딩 모델 (전부 로컬 GGUF)

MRR 1위: **google/gemma-embed-300m (0.6682)** — 모델 크기 314MB로 대형 7~8B 모델을 압도. 자세한 결과는 [임베딩 벤치마크 결과 포스트](/posts/rag-embedding-benchmark-results) 참조.

### Phase 5: LLM 생성 비교 (약 30종)

**고정:** Parser=pymupdf4llm, Chunking=500/100, Embedding=gemma-embed-300m, VectorStore=FAISS  
**변수:** LLM

| 카테고리 | 모델 수 | 실행 위치 |
|----------|--------|----------|
| 로컬 (AI-395) | 4 (qwen3.5-27b/35b-a3b × think/nothink) | llama.cpp |
| 로컬 (DGX Spark) | 15+ (qwen 계열, exaone, gpt-oss, gemma4 등) | Ollama |
| OpenRouter | 23 (GPT-5.4, Claude 4.6, Gemini 3.1, Grok 4.20 등) | API |
| Friendli.ai | 5 (K-EXAONE 236B, Qwen3-235B 등) | API |

**실험 A**: 21 임베딩 × 4 로컬 LLM → 임베딩 영향 측정  
**실험 B**: gemma-embed-300m 고정 × 약 30 LLM → LLM 영향 측정

## 인프라 구성

| 서버 | 역할 | 사양 |
|------|------|------|
| AI-395 | 임베딩 + LLM (llama.cpp 게이트웨이) | MI100 96GB VRAM |
| DGX Spark | LLM (Ollama) | GB10 128GB unified, 3.7TB SSD |
| T7910 | 벡터스토어 7종 Docker | Dual Xeon 72T, 128GB RAM |
| Mac Mini | 실험 스크립트 오케스트레이션 | M2 16GB |

## 핵심 함정 3가지

### 1. llama.cpp 임베딩 서버 512 토큰 제한

청크가 512 토큰을 넘으면 **에러 없이 빈 응답**을 돌려준다. 성공률 75%로 떨어지는 주범. 500자(약 350 토큰)로 트렁케이트하면 해결된다.

```python
def get_embeddings_batch(texts, max_chars=500):
    truncated = [t[:max_chars] for t in texts]
    ...
```

### 2. Qwen3.5 thinking 모드 비활성화

Qwen3.5 계열은 기본적으로 thinking을 강제 수행해 output 토큰 2,000개를 낭비한다.

```python
# 잘못된 방법 (시스템 프롬프트)
messages = [{"role": "system", "content": "/no_think"}, ...]
# → reasoning_content에 thinking이 남아 토큰 낭비

# 올바른 방법 (chat_template_kwargs)
req = {
    "model": "qwen3.5-27b",
    "messages": [...],
    "chat_template_kwargs": {"enable_thinking": False},
}
```

llama.cpp + Qwen3.5에서 `chat_template_kwargs`를 써야만 thinking이 실제로 꺼진다. nothink 모드에서 출력 토큰 ~90개, think 모드 ~2,500개 (차이 27배).

### 3. pgvector의 HNSW 2000차원 제한

Qwen3-Embed-8B는 4096차원. pgvector의 HNSW · IVFFlat 인덱스는 둘 다 2000차원 제한이라 인덱스 없이 순차 검색이 불가피했다.

```sql
-- 2000차원 이하일 때만 인덱스 사용
CREATE INDEX ON bench_chunks USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 200);
```

## 병렬화 설계

GPU 활용 극대화를 위해 llama.cpp는 `-np 8` (8 슬롯), Ollama는 `OLLAMA_NUM_PARALLEL=8`로 설정했다.

```python
# LangChain 기반 배치 호출
llm = ChatOpenRouter(model="openai/gpt-5.4-mini", max_tokens=4096)
results = llm.batch(prompts, config={"max_concurrency": 20})
```

양쪽 서버에서 `ThreadPoolExecutor(max_workers=8)`로 동시 요청, 300개 생성 1조합당 평균 20~50분. 총 52 LLM × 300건은 AI-395와 Spark에 분산하면 약 3~4일이면 끝난다.

## 자주 묻는 질문

### Phase를 왜 순차적으로 고정하나?

전체 조합(3×4×7×21×30=5,292)을 다 돌리면 소요 시간·비용이 현실적이지 않다. 각 Phase에서 1위만 다음 단계로 넘겨 실험 수를 선형(3+4+7+21+30=65)으로 줄인다.

### Phase 4 임베딩 1위가 왜 7B가 아니라 300M인가?

한국어 RAG에서는 **모델 크기보다 훈련 목적과 데이터가 중요**하다. gemma-embed-300m(768dim, Apache 2.0)은 Google이 검색 특화로 훈련했고, qwen3-embed-8b(4096dim)는 범용 임베딩이다. 또한 512 토큰 제한으로 대형 모델의 긴 컨텍스트 강점이 사라진 영향도 있다.

### 왜 FAISS가 속도 1위인가?

FAISS는 인-프로세스 라이브러리라 **네트워크 오버헤드가 없다**. Chroma/Qdrant/Milvus/Weaviate는 HTTP/gRPC 왕복이 추가된다. 검색 정확도가 같다면 RAG 파이프라인에서 FAISS가 최적.

### LLM은 왜 로컬 + API 하이브리드인가?

- 로컬(AI-395 + Spark): 비용 0, 양자화(Q4_K_M) 영향 측정
- OpenRouter: GPT-5.4, Claude Opus 4.6 등 상용 최상위 모델
- Friendli.ai: 한국 K-EXAONE 236B MoE, OpenRouter에 없는 대형 한국 모델

양쪽을 비교해야 "로컬 양자화 → 상용 full precision"의 gap을 볼 수 있다.

## 다음 단계

1. 임베딩 결과 상세 분석 → [임베딩 벤치마크 결과 포스트](/posts/rag-embedding-benchmark-results)
2. 실험 B LLM 비교 결과 (진행 중)
3. RAGAS 기반 LLM-as-judge 평가
4. 도메인별 최적 조합 분석

전체 코드와 데이터는 [GitHub RAG-Evaluation 저장소](https://github.com/baem1n/RAG-Evaluation)에 공개한다.
