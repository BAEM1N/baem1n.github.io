---
author: baem1n
pubDatetime: 2026-04-19T02:40:00.000Z
title: "청킹이 임베딩보다 중요하다 — 한국어 RAG 청크 전략 4종 비교"
description: "300 Q&A 데이터로 청크 크기 4종을 단일 변수 실험. small(500/100)이 MRR 0.5315로 1위, large(2000/300) 대비 +23.5% — 전처리 단계 중 MRR 영향 최대."
tags:
  - rag
  - chunking
  - text-splitter
  - langchain
  - korean-nlp
featured: false
draft: false
aiAssisted: true
---

> **TL;DR**: 한국어 RAG 전처리 전 단계 중 검색 정확도를 가장 크게 움직이는 것은 **청킹**이다. chunk_size 500/100 설정이 MRR 0.5315로, 2000/300 대비 **+23.5%**. 작은 청크가 이기는 이유는 (1) 한 주제에 집중된 **정보 밀도**, (2) llama.cpp 임베딩 서버의 **512 토큰 한계** 회피, (3) top-k 내 **검색 정밀도** 증가.

## Table of contents

## 실험 설정

[allganize RAG-Evaluation-Dataset-KO](https://huggingface.co/datasets/allganize/RAG-Evaluation-Dataset-KO) 300 Q&A, 58 PDF 대상 단일 변수 실험.

| 고정 변수 | 값 |
|---------|-----|
| Parser | pymupdf4llm (Phase 1 1위) |
| 임베딩 | qwen3-embed-8b (4096dim) |
| VectorStore | 기본 (Phase 3에서 정확도 동률 확인) |
| Top-k | 5 |
| 지표 | MRR, Hit@1/5, File Hit@5 |

변수는 `chunk_size × chunk_overlap` 단 두 개.

전체 실험 설계: [RAG 벤치마크 실험 설계](/posts/rag-evaluation-experiment-design)

## 4개 청킹 전략 비교

| 전략 | chunk_size | overlap | MRR | Hit@1 | Hit@5 | 청크 수 | 순위 |
|------|-----------|---------|-----|-------|-------|---------|------|
| **small** | 500 | 100 | **0.5315** | **45.0%** | **65.0%** | **3,166** | 🥇 |
| baseline | 1,000 | 200 | 0.4713 | 38.3% | 58.3% | 1,920 | 🥈 |
| medium | 1,500 | 200 | 0.4458 | 36.3% | 55.0% | 1,468 | 🥉 |
| large | 2,000 | 300 | 0.4302 | 34.3% | 53.3% | 1,370 | 4위 |

## 청크 크기가 작을수록 MRR이 높다

**MRR 0.4302 → 0.5315 (+23.5%)** — 모든 RAG 전처리 Phase 중 가장 큰 변동폭. 파서 교체 효과(+5.4%)의 4배 이상, 벡터스토어 교체 효과(0.6%)의 40배.

![청킹 전략별 MRR 비교](../../assets/images/blog/rag-preprocessing/chunking-mrr-ko.png)

Hit@1 역시 34.3% → 45.0%로 10%p 이상 뛰어오른다. 단순히 top-5 안에만 들어가는 것이 아니라 **최상위 랭크에 정답이 오는 비율** 자체가 올라간다는 의미.

## 왜 small이 이기는가

1. **정보 밀도 집중**: 500자 청크는 **한 주제에만 집중** → 임베딩 벡터가 더 선명한 의미 표현
2. **임베딩 서버 제약**: llama.cpp 서버 512 토큰 제한 → 긴 청크는 잘리기 때문에 large에서 정보 손실
3. **검색 정밀도**: 작은 청크는 top-k 내 다양한 위치에서 정답 포착

## 실무 적용 팁

```python
from langchain_text_splitters import RecursiveCharacterTextSplitter

splitter = RecursiveCharacterTextSplitter(
    chunk_size=500,       # MRR 1위 크기
    chunk_overlap=100,    # 20% overlap
    separators=["\n\n", "\n", " ", ""],  # 자연 경계 우선
    add_start_index=True,
)
chunks = splitter.split_documents(docs)
```

**주의**: 한국어 기준. 영문/코드/법률 도메인은 다를 수 있음. 자체 데이터로 300~1500 범위 테스트 권장.

**청크 수 부수 효과**: small은 3,166 청크로 large(1,370) 대비 2.3배. 임베딩·인덱싱 비용도 2배 수준이라는 점은 감안.

## 자주 묻는 질문

### 청크가 작을수록 무조건 좋은가?

아니다. **너무 작으면(100자 이하) 맥락 단절**로 오히려 MRR 하락. 300~700자 범위에서 도메인별 테스트 권장. 법률/계약서처럼 긴 단위가 중요한 문서는 1,000~1,500자가 더 좋을 수 있다.

### 왜 large가 오히려 MRR이 낮은가?

본 실험 임베딩 서버(llama.cpp)는 입력 512 토큰에서 잘린다. 2,000자 청크는 토큰 기준으로 이를 초과해 **뒷부분이 임베딩에 반영되지 않는다**. 긴 청크 전략을 쓰려면 long-context 임베딩 모델이 선행 조건.

### overlap은 얼마가 적정한가?

본 실험 기준 chunk_size의 **20%**(500/100, 1000/200)가 기준선. overlap이 너무 작으면 경계 질의에서 정답 누락, 너무 크면 중복 청크로 임베딩 비용만 증가.

### 청크 수가 늘면 운영 비용은?

small(3,166) vs large(1,370) → 임베딩 호출 약 2.3배, 벡터 인덱스 용량 약 2.3배. 다만 **쿼리 지연은 로그 스케일**(HNSW 기준)이라 검색 속도 영향은 미미.

## 시리즈

- [파서 비교](/posts/rag-parser-comparison/) — MRR +5.4%
- (this post) 청킹 비교
- [벡터스토어 비교](/posts/rag-vectorstore-comparison/) — 정확도 동률, 속도 200배

---

## 코드 및 원본 데이터

- **GitHub**: [github.com/BAEM1N/RAG-Evaluation](https://github.com/BAEM1N/RAG-Evaluation)
- **Phase 2 결과**: [results/phase2_chunking/](https://github.com/BAEM1N/RAG-Evaluation/tree/main/results/phase2_chunking)
- **실행 코드**: [scripts/bench_all.py](https://github.com/BAEM1N/RAG-Evaluation/blob/main/scripts/bench_all.py)

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
