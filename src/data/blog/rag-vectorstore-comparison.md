---
author: baem1n
pubDatetime: 2026-04-19T02:50:00.000Z
title: "RAG 벡터스토어 7종 비교 — 정확도 동률, 속도 200배 차이"
description: "300 Q&A 데이터로 FAISS·Chroma·Milvus·Weaviate·Qdrant·pgvector·LanceDB 7종을 단일 변수 실험. MRR 0.527~0.530으로 정확도 거의 동일, FAISS p95 0.74ms가 pgvector 174ms 대비 200배 빠름."
tags:
  - rag
  - vector-database
  - faiss
  - pgvector
  - korean-nlp
featured: false
draft: true
aiAssisted: true
---

> **TL;DR**: 같은 임베딩·같은 top-k를 넣으면 벡터스토어 7종의 검색 랭킹은 거의 같다(MRR 0.527~0.530). 차이는 속도다. **FAISS p95 0.74ms vs pgvector 174ms — 200배**. 단일 노드 인-프로세스에서는 FAISS가 압도적이고, Qdrant·Weaviate·pgvector는 100~200배 느리지만 분산·모니터링·DB 통합 같은 운영 기능을 제공한다.

## Table of contents

## 실험 설정

[allganize RAG-Evaluation-Dataset-KO](https://huggingface.co/datasets/allganize/RAG-Evaluation-Dataset-KO) 300 Q&A, 58 PDF를 대상으로 **벡터스토어만** 바꿔 단일 변수 실험을 돌렸다.

| 고정 변수 | 값 |
|---------|-----|
| Parser | pymupdf4llm (마크다운) |
| Chunking | 500 / 100 (overlap) |
| Embedding | qwen3-embed-8b (4096dim) |
| Top-k | 5 |
| 지표 | MRR, Hit@5, Insert/Query 지연, 메모리 |

전체 실험 설계: [RAG 벤치마크 실험 설계](/posts/rag-evaluation-experiment-design)

## 7개 벡터스토어 비교표

| VectorStore | MRR | Hit@5 | Insert 시간 | 쿼리 지연 | 메모리 |
|-------------|-----|-------|------------|----------|--------|
| **FAISS** | 0.5304 | 65.0% | **0.8s** | **0.7ms** | 인메모리 |
| LanceDB | 0.5304 | 65.0% | 6.0s | 6.3ms | 디스크+메모리 |
| Qdrant | 0.5304 | 65.0% | 58.6s | 112.8ms | 서버 |
| Milvus | 0.5304 | 65.0% | 22.4s | 53.7ms | 서버 |
| Weaviate | 0.5298 | 64.7% | 12.0s | 23.3ms | 서버 |
| Chroma | 0.5271 | 64.7% | 16.7s | 40.0ms | 서버 |
| pgvector | 0.5304 | 65.0% | 92.3s | 142.9ms | PostgreSQL 확장 |

## 정확도는 거의 동일 (MRR 0.527~0.530)

**같은 임베딩 벡터를 넣으면 검색 결과도 같다.** 벡터스토어는 인덱스 구조만 다를 뿐 코사인 유사도 계산은 동일 → 랭킹 차이 0.6% 이내.

예외: **Chroma(0.5271)가 0.6% 낮은 이유**는 기본 인덱스가 HNSW ef=10(낮음)이라 일부 이웃 탐색이 불완전했던 것으로 보인다. ef=64로 올리면 동률이 된다.

## 속도는 200배 차이

![벡터스토어 Insert 시간](../../assets/images/blog/rag-preprocessing/vectorstore-insert-ko.png)

![벡터스토어 쿼리 지연](../../assets/images/blog/rag-preprocessing/vectorstore-latency-ko.png)

## 왜 FAISS가 빠른가

- **인-프로세스 라이브러리**: 네트워크 왕복 0
- HNSW/IVF 인덱스 최적화가 직접 메모리 접근
- Chroma/Qdrant/Milvus/Weaviate는 HTTP/gRPC 추가 오버헤드
- **pgvector는 2번 쿼리**: cosine distance 계산 + ORDER BY + LIMIT (ivfflat 2000차원 제한 → 이번 실험 4096차원은 인덱스 없이 순차 검색)

## 실무 선택 가이드

| 요건 | 추천 |
|------|------|
| 단일 노드, 최고 속도 | **FAISS** |
| 서버리스 파일 기반 | LanceDB |
| 운영 가시성 (모니터링) | Qdrant, Weaviate |
| 기존 PostgreSQL 통합 | pgvector (dim ≤ 2000) |
| 대규모 분산 | Milvus |

## 자주 묻는 질문

### pgvector가 제일 느린 이유는?

이 실험의 임베딩은 **4096차원**. pgvector는 HNSW/IVFFlat 인덱스 모두 2000차원까지만 지원 → **인덱스 없이 순차 검색**했다. Qwen3-Embed-0.6B(1024dim) 쓰면 pgvector도 10ms대 가능.

### FAISS가 빠른데 왜 운영에는 Qdrant/Weaviate를 쓰나?

FAISS는 **단일 프로세스, 영속성 수동 관리, 업데이트 취약** 등 운영 제약이 있다. 대규모 서비스는:
- 분산 / 복제 / 백업 필요 → Qdrant, Milvus, Weaviate
- 운영 대시보드 / 모니터링 → Qdrant (대시보드 제공)
- 기존 DB 연계 → pgvector

본 벤치마크는 **RAG 파이프라인 성능 비교용 (인-프로세스 라이브러리 기준)**이다.

### 벡터스토어 정확도 차이는 왜 없는가?

벡터스토어는 **코사인 유사도 = 벡터 내적 연산**만 하고 순위를 매긴다. 모두 같은 벡터를 받으면 수학적으로 동일 결과. 차이는 인덱스(HNSW, IVFFlat, PQ) 정밀도 설정에 따른 **근사 검색(ANN)의 품질 차이**로, 기본 설정에서는 0.1% 수준.

## 시리즈

- [파서 비교](/posts/rag-parser-comparison/) — MRR +5.4%
- [청킹 비교](/posts/rag-chunking-comparison/) — MRR 영향 최대 (+23.5%)
- (this post) 벡터스토어 비교

---

## 코드 및 원본 데이터

- **GitHub**: [github.com/BAEM1N/RAG-Evaluation](https://github.com/BAEM1N/RAG-Evaluation)
- **Phase 3 결과**: [results/phase3_vectorstore/](https://github.com/BAEM1N/RAG-Evaluation/tree/main/results/phase3_vectorstore)
- **실행 코드**: [scripts/bench_all.py](https://github.com/BAEM1N/RAG-Evaluation/blob/main/scripts/bench_all.py) — 모든 Phase 한 스크립트로

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
