---
author: baem1n
pubDatetime: 2026-04-19T02:00:00.000Z
title: "한국어 RAG 임베딩 27종 벤치마크 — koe5가 8B 모델을 이기는 이유"
description: "allganize 300 Q&A 데이터로 27개 오픈 GGUF 임베딩 모델의 MRR, Hit@k, 실패 모드를 전수 측정한 결과. 한국어 파인튜닝된 nlpai-lab/KoE5(600M)가 MRR 0.6871로 1위, 가장 큰 8B 모델들을 모두 이겼다."
tags:
  - rag
  - embedding
  - benchmark
  - korean-nlp
  - llm
featured: false
draft: false
aiAssisted: true
---

> **TL;DR**: 27개 오픈 GGUF 임베딩 모델을 allganize 한국어 300 Q&A에 돌린 결과, 1위는 **nlpai-lab/KoE5 (MRR 0.6871, 600M, 1024dim)**. 2위는 **google/gemma-embed-300m (MRR 0.6650, 314MB)**. 7B~27B 대형 모델들은 모두 중하위권에 몰렸다 — 대용량 ≠ 고성능. 이전 실험에서 발견된 500자 트렁케이션 버그를 제거하고, Microsoft Harrier 시리즈는 공식 `last-token pooling`을 적용해 재측정했다.

## Table of contents

## 실험 설정

- **데이터**: [allganize/RAG-Evaluation-Dataset-KO](https://huggingface.co/datasets/allganize/RAG-Evaluation-Dataset-KO) — 300 Q&A × 58 PDF × 5 도메인
- **Parser**: pymupdf4llm (마크다운 변환)
- **Chunking**: 500자 / overlap 100 (총 3,166 청크)
- **VectorStore**: FAISS (in-memory, cosine similarity)
- **Top-k**: 5
- **트렁케이트**: **제거** (이전 실험의 500자 cap이 대형 모델을 불공정하게 페널티화함)
- **ctx-size**: 8192 (모든 모델 통일)
- **Harrier pooling**: `last`-token (Microsoft 공식 스펙)
- **지표**: MRR, Hit@1/5 (페이지 단위), File Hit@5 (파일 단위)

전체 실험 설계는 [RAG 벤치마크 실험 설계 포스트](/posts/rag-evaluation-experiment-design) 참조.

## 전체 결과 (MRR 순)

| 순위 | 모델 | dim | 크기 | MRR | p@1 | p@5 | f@5 |
|----|------|-----|------|-----|-------|-------|--------|
| 🥇 | **nlpai-lab/KoE5** | 1024 | 600MB | **0.6871** | **60.7%** | **80.7%** | 91.3% |
| 🥈 | google/gemma-embed-300m | 768 | 314MB | 0.6650 | 57.3% | 79.7% | **91.7%** |
| 🥉 | PIXIE/Rune-v1.0 | 1024 | 1.0GB | 0.6627 | 58.7% | 76.0% | **92.0%** |
| 4 | Snowflake/arctic-embed-ko | 1024 | 606MB | 0.6612 | 58.3% | 75.0% | 91.7% |
| 5 | Snowflake/arctic-l-v2 | 1024 | 606MB | 0.6495 | 58.3% | 73.0% | 89.0% |
| 6 | jinaai/jina-v4-retrieval | 4096 | 3.1GB | 0.6449 | 54.7% | 78.7% | 91.7% |
| 7 | nomic-ai/nomic-embed-v2-moe | 768 | 489MB | 0.6435 | 56.7% | 75.3% | 90.0% |
| 8 | nlpai-lab/KURE-v1 | 1024 | 606MB | 0.6267 | 54.7% | 74.3% | 91.0% |
| 9 | Microsoft/harrier-oss-v1-0.6b | 1024 | 610MB | 0.6131 | 53.3% | 70.3% | 88.7% |
| 10 | ibm-granite/granite-278m | 768 | 290MB | 0.5969 | 50.3% | 72.0% | 87.3% |
| 11 | intfloat/multilingual-e5-large | 1024 | 576MB | 0.5882 | 50.7% | 70.7% | 90.7% |
| 12 | Qwen/Qwen3-Embedding-4B | 4096 | 4.0GB | 0.5850 | 48.0% | 73.0% | 89.7% |
| 13 | BAAI/bge-m3 | 1024 | 606MB | 0.5630 | 48.7% | 66.7% | 89.7% |
| 14 | Qwen/Qwen3-Embedding-0.6B | 1024 | 610MB | 0.5564 | 46.3% | 67.0% | 87.7% |
| 15 | jinaai/jina-v4-code | 4096 | 3.1GB | 0.5334 | 42.3% | 67.7% | 88.0% |
| 16 | Microsoft/harrier-oss-v1-270m | 640 | 279MB | 0.5291 | 43.7% | 65.3% | 88.3% |
| 17 | **Qwen/Qwen3-Embedding-8B** | 4096 | **7.5GB** | 0.5271 | 44.3% | 64.7% | 86.3% |
| 18 | ibm-granite/granite-107m | 768 | 116MB | 0.4786 | 38.0% | 60.3% | 83.0% |
| 19 | NVIDIA/nemotron-embed-8b | 4096 | 7.5GB | 0.4617 | 36.3% | 59.0% | 88.0% |
| 20 | NVIDIA/llama-embed-nemotron-8b | 4096 | 7.5GB | 0.4617 | 36.3% | 59.0% | 88.0% |
| 21 | jinaai/v5-small-retrieval | 1024 | 610MB | 0.3898 | 31.7% | 48.3% | 74.3% |
| 22 | jinaai/jina-code-1.5b | 1024 | 1.6GB | 0.3248 | 23.0% | 46.3% | 82.0% |
| 23 | intfloat/e5-mistral-7b-instruct | 4096 | 7.1GB | 0.2843 | 22.7% | 36.0% | 69.3% |
| 24 | jinaai/v5-nano-matching | 512 | 223MB | 0.1791 | 12.7% | 26.3% | 62.0% |
| 25 | mixedbread-ai/mxbai-embed-large | 1024 | 606MB | 0.1157 | 8.7% | 15.7% | 38.7% |
| 26 | google/LaBSE | 768 | 492MB | 0.0472 | 2.7% | 8.0% | 27.3% |
| 27 | **Microsoft/harrier-oss-v1-27b** | 5376 | **27GB** | 0.0170 | 1.0% | 2.3% | 15.7% |

![임베딩 Top 10 MRR 랭킹](../../assets/images/blog/rag-embedding/top10-mrr-ko.png)

### 핵심 관찰 4가지

1. **Top 8이 전부 소형/중형 (290MB~1.0GB)**. 가장 큰 27B/8B 모델들은 모두 하위권.
2. **한국어 파인튜닝 3종이 상위 8 안에**: KoE5(1위), snowflake-arctic-ko(4위), kure-v1(8위).
3. **Nemotron 2종이 완전히 같은 MRR 0.4617**: nemotron-embed-8b와 llama-embed-nemotron-8b는 사실상 동일 모델.
4. **harrier-27b는 GGUF가 사실상 깨진 상태**: 5376차원 중 97%가 "dead dim" (variance < 0.0001) → 임베딩이 모든 문서를 서로 비슷하다고 판단.

## 왜 KoE5가 1위인가

KoE5는 **intfloat/multilingual-e5-large**를 한국어 query-document-hard_negative 70만+ 쌍으로 파인튜닝한 모델이다 (고려대 NLP&AI Lab).

| 모델 | MRR | 베이스 | 차이 |
|------|-----|--------|------|
| **KoE5** | **0.6871** | multilingual-e5-large | **+0.099** (한국어 triplet 파인튜닝 효과) |
| multilingual-e5-large-instruct | 0.5882 | — | 원본 |

같은 아키텍처의 base와 직접 비교하면 **한국어 도메인 파인튜닝이 +0.099 MRR**을 가져온다. 이는 다국어 모델이 한국어 검색에서 여전히 여지가 많다는 신호다.

> 💡 **프롬프트 형식 주의**: KoE5는 `query: `와 `passage: ` prefix를 요구한다. 우리 실험에서는 prefix 없이 측정했으므로 **실제 성능은 더 높을 가능성**이 있다.

## 왜 8B 모델이 300M에 졌나

이전 포스트에서 500자 트렁케이션 버그를 발견해 재측정했지만, **qwen3-embed-8b는 여전히 0.5271**로 gemma-embed-300m(0.6650)보다 낮다.

원인 분석:

### 1. 훈련 목적의 불일치

| 모델 | 훈련 목적 | MRR |
|------|---------|------|
| KoE5 | **한국어 검색 파인튜닝** | 0.6871 |
| gemma-embed-300m | Google 범용 검색 | 0.6650 |
| qwen3-embed-8b | 범용 MTEB 임베딩 | 0.5271 |

**검색(retrieval) 목적 + 한국어 데이터**가 우선. MTEB 평균 점수는 RAG 검색에 직결되지 않는다.

### 2. 한국어 토큰화 효율

Qwen 계열은 다국어지만 한국어 비중이 낮다. 한국어 토큰 밀도가 낮아 512~8K 토큰으로 표현되는 실제 의미 정보가 줄어든다.

### 3. 양자화 손실

대형 모델일수록 Q8 양자화로 섬세한 임베딩 패턴 손실이 누적. 300M처럼 파라미터 밀도가 높은 모델은 상대적으로 영향 덜 받음.

## Microsoft Harrier 시리즈 재측정

Harrier는 decoder-only 아키텍처의 임베딩 모델로, 공식 스펙은 **last-token pooling**이다. 기존 측정은 llama-server 기본 `mean pooling`을 쓰고 있었다.

재측정 결과:

| 모델 | mean pooling (기존) | last pooling (공식) | 변화 |
|------|--------------|-------------|------|
| harrier-270m (640 dim) | 0.5479 | 0.5291 | 📉 -0.019 |
| **harrier-0.6b (1024 dim)** | 0.5193 | **0.6131** | 📈 **+0.094** |
| harrier-27b (5376 dim) | 0.0033 | 0.0170 | 5배 개선 (여전히 최하) |

- **0.6b**는 last pooling이 맞음. +18% 성능 향상.
- **270m**은 오히려 mean이 나음 (모델 크기별 선호 다름 가능).
- **27b**는 pooling 무관 실패. GGUF 양자화 또는 한국어 적합성 문제.

## 도메인별 성능

상위 5개 임베딩의 도메인별 MRR:

| 모델 | commerce | finance | law | medical | public |
|------|----------|---------|-----|---------|--------|
| koe5 | 0.802 | 0.621 | 0.672 | 0.714 | 0.676 |
| gemma-embed-300m | 0.789 | 0.564 | 0.657 | 0.699 | 0.632 |
| pixie-rune-v1 | 0.793 | 0.601 | 0.649 | 0.671 | 0.657 |
| snowflake-arctic-ko | 0.778 | 0.612 | 0.654 | 0.688 | 0.649 |
| snowflake-arctic-l-v2 | 0.764 | 0.577 | 0.663 | 0.603 | 0.641 |

![임베딩 × 도메인 MRR 히트맵](../../assets/images/blog/rag-embedding/domain-heatmap-ko.png)

- **finance가 가장 어렵다**: 숫자/표/그래프 많음.
- **commerce가 가장 쉽다**: 자연어 설명 위주.
- **KoE5가 모든 도메인에서 균등하게 우세**.

## Context Type별 성능

```
Top 5 임베딩 평균:
paragraph → MRR ~0.74
text      → MRR ~0.71
table     → MRR ~0.65
image     → MRR ~0.48 (전 모델 실패)
```

**image context는 모든 임베딩이 실패한다**. 텍스트 임베딩만으로 이미지 내 정보는 검색 불가. 비전 임베딩 + OCR 전처리가 필요.

## 실패 모드 분석

| 임베딩 | File Miss | Page Miss | Total Fail |
|--------|-----------|-----------|-----------|
| koe5 | 8.7% | 12.6% | 21.3% |
| gemma-embed-300m | 8.3% | 12.0% | 20.3% |
| qwen3-embed-8b | 13.7% | 21.6% | 35.3% |
| labse | 72.7% | 19.3% | 92.0% |
| **harrier-27b** | **84.3%** | 13.4% | **97.7%** |

- **labse**는 109개 언어 지원 범용성 때문에 한국어 표현력이 얕다.
- **harrier-27b**는 사실상 모든 문서가 서로 비슷하게 보여서 파일 자체를 찾지 못한다 (임베딩 공간 붕괴).

## 모델 효율성 (MRR ÷ 크기)

| 모델 | MRR | VRAM | MRR/VRAM |
|------|-----|------|----------|
| **granite-107m** | 0.4786 | 0.2GB | **2.39** |
| **harrier-270m** | 0.5291 | 0.3GB | 1.76 |
| **koe5** | 0.6871 | 0.6GB | 1.15 |
| gemma-embed-300m | 0.6650 | 0.5GB | 1.33 |
| qwen3-embed-8b | 0.5271 | 7.5GB | 0.070 |
| harrier-27b | 0.0170 | 27GB | 0.001 |

![임베딩 효율성 (MRR vs VRAM)](../../assets/images/blog/rag-embedding/efficiency-scatter-ko.png)

**코스트/성능 비율에서도 소형 임베딩이 압도적.** qwen3-embed-8b는 VRAM 대비 효과가 koe5의 1/16.

## 추천 구성

| 시나리오 | 추천 모델 | 이유 |
|---------|---------|------|
| **최고 정확도** | **koe5** | MRR 1위, 한국어 특화 |
| **영어+한국어 혼합** | gemma-embed-300m | MRR 2위, 검색 범용 |
| **초저메모리 (< 300MB)** | granite-278m | MRR 0.597, 290MB |
| **실험 baseline** | bge-m3 | MRR 0.563, hybrid (dense+sparse 가능) |

## 자주 묻는 질문

### qwen3-embed-8b가 17위인 게 정상인가?

MTEB 벤치마크에서 qwen3-embed-8b는 SOTA에 가깝지만, 이 한국어 실험에서는:
1. **훈련 데이터 한국어 비중이 낮음**
2. **검색 특화 파인튜닝 없음** (범용 MTEB 최적화)
3. **Q8 양자화 손실**이 대형 모델일수록 크게 작용
4. 같은 이유로 e5-mistral-7b, llama-embed-nemotron-8b도 하위권

### 트렁케이션을 제거했는데 왜 qwen3-embed-8b가 크게 안 올랐나?

이전 0.5325 → 현재 0.5271로 거의 동일. **트렁케이션이 원인이 아니었음**. 500자 청크는 한국어 기준 ~250 토큰이라 애초에 8B 모델의 긴 문맥 강점이 작동할 여지가 없다.

### harrier-27b는 왜 완전히 실패하나?

임베딩 .npy 분석 결과 **5376차원 중 97%(5211개)의 분산이 거의 0**. 거의 모든 청크 쌍의 유사도가 0.76~0.9로 포화 → 구별력 상실. Q8 양자화 또는 decoder-only 27B 모델 구조가 5376차원 공간을 효과적으로 활용 못 함.

공식 `last` pooling + `-c 8192`로 재측정해도 MRR 0.0033 → 0.0170 (5배 개선이지만 여전히 최하위).

### KoE5와 KURE-v1은 같은 연구실 모델인데 왜 성능 차이가 크나?

| 모델 | 베이스 | MRR |
|------|--------|------|
| KoE5 | multilingual-e5-large | 0.6871 |
| KURE-v1 | BAAI/bge-m3 | 0.6267 |

다른 베이스 모델에서 시작. KoE5는 검색 특화 E5 기반, KURE는 다국어 범용 BGE 기반. 한국어 데이터로 파인튜닝했지만 **베이스의 retrieval 최적화 정도**가 결과를 갈랐다.

### nemotron-embed-8b와 llama-embed-nemotron-8b가 왜 동일한 MRR인가?

모든 지표가 소수점까지 정확히 일치 (MRR 0.4617, p@1 36.3%, p@5 59.0%, f@5 88.0%). 
→ **두 모델이 사실상 동일 아키텍처 + 동일 가중치**. 공식 페이지에서 별개 모델로 공개됐지만 내부적으로 같은 것으로 추정.

## 다음 단계

1. 전처리 영향 분석 → [파서/청킹/벡터스토어 비교 포스트](/posts/rag-preprocessing-comparison)
2. **Experiment B (LLM 비교)**: gemma-embed-300m 고정 × 11개 LLM 답변 생성 → 진행 중
3. **Experiment A (임베딩 vs 답변 품질)**: 27개 임베딩이 실제 답변 품질에 미치는 영향 측정
4. **LLM-as-judge** (예정): gpt-oss-120b + qwen3.5-122b로 답변 자동 채점
5. 리랭커 실험: Qwen3-Reranker, BCE, BGE reranker

---

## 코드 및 원본 데이터

- **GitHub**: [github.com/BAEM1N/RAG-Evaluation](https://github.com/BAEM1N/RAG-Evaluation)
- **Phase 4 결과 JSON**: [results/phase4_embedding/](https://github.com/BAEM1N/RAG-Evaluation/tree/main/results/phase4_embedding) — 27개 임베딩 전체 MRR/Hit/도메인별 결과
- **Retrieval Cache**: [data/retrieval_cache/](https://github.com/BAEM1N/RAG-Evaluation/tree/main/data/retrieval_cache) — 각 임베딩이 찾은 top-5 청크 × 300 질문
- **Leaderboard**: [LEADERBOARD.md](https://github.com/BAEM1N/RAG-Evaluation/blob/main/results/phase4_embedding/LEADERBOARD.md)
- **실험 스크립트**: [scripts/bench_phase4_parallel.py](https://github.com/BAEM1N/RAG-Evaluation/blob/main/scripts/bench_phase4_parallel.py)

RAG 설계 근거가 필요한 경우 원본 데이터를 직접 열어 검증할 수 있다.

---

## 시리즈 목차

**Phase 1-4: RAG retrieval 최적화**

- [실험 설계](/posts/rag-evaluation-experiment-design/) — 5단계 통제 실험
- [파서 비교](/posts/rag-parser-comparison/) — pymupdf4llm 1위 (+5.4%p)
- [청킹 비교](/posts/rag-chunking-comparison/) — small 청크 1위 (+23.5%p, MRR 영향 최대)
- [벡터스토어 비교](/posts/rag-vectorstore-comparison/) — FAISS 0.74ms (정확도 동률)
- [임베딩 27종](/posts/rag-embedding-benchmark-results/) — koe5 1위 (한국어 특화 강세)

**Phase 5: LLM-as-Judge cross-validation**

- [Q1 — Local cand × Local judge](/posts/rag-llm-judge-q1-local-cross-validation/)
- [Q2 — API cand × Local judge](/posts/rag-llm-judge-q2-api-llm-vs-local-judges/)
- [Q3 — Local cand × API judge](/posts/rag-llm-judge-q3-flagship-api-judges/)
- [Q4 — API cand × API judge](/posts/rag-llm-judge-q4-api-self-evaluation/)
- [4-Quadrant 종합 RRF leaderboard](/posts/rag-llm-judge-summary-4quadrant-matrix/) — 46 cand × 17 judge 통합
- [Judge × Judge correlation 분석](/posts/rag-llm-judge-correlation-analysis/) — severity vs consensus, optimal ensemble
