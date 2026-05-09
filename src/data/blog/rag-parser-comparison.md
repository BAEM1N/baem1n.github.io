---
author: baem1n
pubDatetime: 2026-04-19T02:30:00.000Z
title: "한국어 RAG 파서 3종 비교 — PyPDF vs pymupdf vs pymupdf4llm"
description: "300 Q&A 데이터로 PDF 파서 3종을 단일 변수 실험. 마크다운을 보존하는 pymupdf4llm이 MRR 0.4715로 1위, pypdf 대비 +5.4%."
tags:
  - rag
  - parser
  - pdf
  - langchain
  - korean-nlp
featured: false
draft: true
aiAssisted: true
---

> **TL;DR**: PDF 파서 3종(pypdf, pymupdf, pymupdf4llm)을 단일 변수로 비교한 결과, 마크다운 구조를 보존하는 **pymupdf4llm이 MRR 0.4715로 1위**. pypdf(0.4472) 대비 **+5.4%**. 구조 정보(`#`, `##`, 테이블 파이프)가 임베딩에 추가 신호로 작동하며, 청크 수도 56% 더 많이 생성된다.

## Table of contents

## 실험 설정

[allganize RAG-Evaluation-Dataset-KO](https://huggingface.co/datasets/allganize/RAG-Evaluation-Dataset-KO) 300 Q&A, 58 PDF를 대상으로 **한 번에 한 컴포넌트만** 바꿔 단일 변수 실험을 돌렸다.

| 고정 변수 | 값 |
|---------|-----|
| 임베딩 | qwen3-embed-8b (4096dim) |
| 청킹 | 1,000 / 200 (baseline) |
| Top-k | 5 |
| 지표 | MRR, Hit@1/5, File Hit@5 |

전체 실험 설계: [RAG 벤치마크 실험 설계](/posts/rag-evaluation-experiment-design)

## Parser 3종 비교

| Parser | MRR | Hit@1 | Hit@5 | File@5 | 청크 수 | 파싱 방식 |
|--------|-----|-------|-------|--------|---------|----------|
| **pymupdf4llm** | **0.4715** | 38.3% | 58.3% | 86.0% | 1,920 | 마크다운 변환 (# ## 헤더, 테이블) |
| pymupdf | 0.4663 | 35.7% | **63.3%** | **86.3%** | 1,263 | 일반 텍스트 추출 |
| pypdf | 0.4472 | 34.3% | 60.7% | 82.7% | 1,224 | 라인 기반 추출 |

### 핵심 관찰

**pymupdf4llm이 MRR 1위**인 이유는 구조 보존이다.

- `# 제목`, `## 섹션`, 테이블 파이프(`|`) 문법으로 문서 구조가 청크에 담김
- 임베딩이 구조 정보를 활용해 의미 매칭
- 청크 수 1,920개 (vs pypdf 1,224개) — 같은 문서에서 **56% 더 많은 청크** 생성

**pymupdf는 Hit@5에서 1위** (63.3% vs pymupdf4llm 58.3%)이지만 MRR은 낮음 → **정답을 top-5에는 넣지만 최상위 순위를 놓침**.

파이썬 코드:

```python
# pymupdf4llm
import pymupdf4llm
import pymupdf

doc = pymupdf.open(pdf_path)
pages = []
for i in range(len(doc)):
    md = pymupdf4llm.to_markdown(doc, pages=[i])  # 마크다운으로!
    pages.append({"page": i + 1, "text": md.strip()})
```

## Parser 선택 기준

| 요건 | 추천 |
|------|------|
| 정확도 최우선 | **pymupdf4llm** |
| 단순 텍스트 | pymupdf |
| 레거시 호환 | pypdf |

## 자주 묻는 질문

### 왜 pymupdf4llm이 pymupdf보다 MRR만 높고 Hit@5는 낮은가?

pymupdf4llm은 마크다운 구조를 살리면서 **정답 청크의 표현력이 강해 순위(MRR)가 올라간다**. 단 청크 수가 56% 많아 top-5에 여러 유사 청크가 들어가면서 정답이 밀려 Hit@5는 소폭 하락.

### 파서 차이가 왜 청킹보다 작은가?

파서는 텍스트 추출 품질만 바꾸지만 청킹은 **청크 경계와 정보 밀도 자체**를 바꾼다. 임베딩은 청크 단위로 벡터화되므로 경계 설계가 더 직접적으로 검색 품질을 좌우한다. 자세한 비교는 [청킹 비교 포스트](/posts/rag-chunking-comparison) 참고.

### pymupdf4llm의 마크다운 변환 비용은?

페이지별 `to_markdown()` 호출은 단일 페이지 기준 수십 ms 수준. 58 PDF 기준 전체 파싱이 수 초 내 완료되어 파싱 비용은 실무상 무시 가능.

## 시리즈: RAG 전처리 단일 변수 실험

- (this post) 파서 비교
- [청킹 비교](/posts/rag-chunking-comparison/) — MRR 영향 최대 (+23.5%)
- [벡터스토어 비교](/posts/rag-vectorstore-comparison/) — 정확도 동률, 속도 200배 차이

---

## 코드 및 원본 데이터

- **GitHub**: [github.com/BAEM1N/RAG-Evaluation](https://github.com/BAEM1N/RAG-Evaluation)
- **Phase 1 결과**: [results/phase1_parser/](https://github.com/BAEM1N/RAG-Evaluation/tree/main/results/phase1_parser)
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
