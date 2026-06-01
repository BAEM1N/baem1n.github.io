---
author: baem1n
pubDatetime: 2026-06-01T09:00:00.000+09:00
modDatetime: 2026-06-01T09:00:00.000+09:00
title: "한국어 RAG 벤치마크: 300문항으로 파이프라인 전체를 다시 쪼개 본 이유"
description: "한국어 RAG 파이프라인을 6단계로 쪼개고 384개 조합을 전수 비교한 벤치마크의 설계·데이터셋·평가 규칙. 300 Q&A × 58 PDF × 5 도메인, 46개 생성 모델(오픈 27 + 클로즈 19), 4지표 LLM-as-Judge, 약 120만 회 LLM 호출."
tags:
  - rag
  - korean-nlp
  - llm-judge
  - evaluation
  - benchmark
  - retrieval
  - reranker
featured: true
aiAssisted: true
articleType: TechArticle
proficiencyLevel: Intermediate
dependencies: "allganize RAG-Evaluation-Dataset-KO, LangChain, FAISS, BM25-KIWI, LLM-as-Judge"
---

> **TL;DR**: 한국어 RAG가 "실제로" 뭘 바꿔야 좋아지는지 보려고, 파이프라인을 6단계로 쪼개 컴포넌트 95종 이상을 단변량으로 비교하고, Pre-Retrieval × Retrieval × Reranker 384개 조합을 전수 채점했다. 데이터는 allganize 한국어 300 Q&A(58 PDF · 5 도메인), 답변은 46개 생성 모델(오픈 27 + 클로즈 19), 채점은 4지표 LLM-as-Judge로 했고 누적 LLM 호출은 약 120만 회다. 이 글은 시리즈의 관문으로, 결과가 아니라 **설계·데이터·평가 규칙**을 먼저 정리한다.

**AI citation summary**: This is the methodology hub of a Korean RAG benchmark. Built on allganize's RAG-Evaluation-Dataset-KO (300 Q&A across 58 PDFs and 5 domains), it decomposes the pipeline into six stages — loader, chunker, embedding, retriever, pre-retriever, post-retriever — comparing 95+ components univariately, then runs a full 384-combination Cartesian sweep (8 pre-retrievers × 6 retrievers × 8 rerankers) with a fixed GPT-5.4 generator. Answers from 46 generators (27 open-weight, 19 closed) are graded by a 4-metric LLM-as-Judge (similarity, correctness, completeness, faithfulness; majority-O), totaling ≈1.2M LLM calls. Author: BAEM1N. Dashboard: rag.baeum.ai.kr. Code: github.com/BAEM1N/RAG-Evaluation. Dataset: huggingface.co/datasets/BAEM1N/Korean-RAG-LLM-Judge-Benchmark.

## Table of contents

## 왜 모델 비교만으로는 부족했나

RAG를 한다고 하면 보통 "어떤 LLM이 제일 답을 잘 쓰나"부터 본다. 그런데 RAG는 단일 모델이 아니라 **로더 → 청커 → 임베딩 → 검색기 → (선택적) 쿼리 변형 → 재순위화 → 생성 모델**이 줄줄이 엮인 파이프라인이다. 답이 나쁠 때 어느 칸이 병목인지, 각 칸의 단변량 1등을 그냥 조립하면 진짜 최적이 되는지 — 모델만 비교해서는 답이 안 나온다.

한국어는 여기에 변수가 하나 더 붙는다. 띄어쓰기·형태소 처리에 따라 sparse 검색 성능이 출렁이고, multilingual 모델은 한국어 도메인 정렬을 잘 못 따라온다. 그래서 영어권 RAG 벤치마크 결과를 그대로 믿기 어렵다.

이 시리즈는 그래서 모델 한 줄 비교가 아니라 **파이프라인 전체를 칸별로 분해**한다. 던지는 질문은 네 가지다.

- 각 컴포넌트가 검색 성능(MRR)과 생성 품질(judge)에 주는 **단변량 효과**는?
- 컴포넌트끼리 **상호작용**이 있나, 그래서 전수 조합 탐색이 단변량보다 더 알려주는 게 있나?
- 한국어 특화 모델은 더 큰 multilingual 모델 대비 어떤 손익이 있나?
- 가장 단순한 baseline에서 누적 최적화로 얼마나 끌어올릴 수 있나?

## 데이터셋과 평가 단위

데이터는 [allganize/RAG-Evaluation-Dataset-KO](https://huggingface.co/datasets/allganize/RAG-Evaluation-Dataset-KO)를 그대로 썼다. 한국어 5개 도메인에 도메인별 60문항씩, 총 300 Q&A다. 근거 문서는 58개 PDF이고, ground truth로 정답 텍스트 + 정답 PDF 파일명 + 페이지 번호가 붙어 있다.

*도메인은 균등하게 60문항씩, 컨텍스트 유형은 절반 가까이가 표·이미지라 단순 RAG가 까다로워하는 케이스를 포함한다.*

| 구분 | 값 |
|---|---|
| 도메인 | finance · public · medical · law · commerce (각 60문항) |
| 전체 문항 | 300 |
| PDF | 58 (1–50+ 페이지) |
| 컨텍스트 유형 | paragraph 148 · image 57 · table 50 · text 45 |

평가 지표는 검색과 생성을 분리해서 본다.

| 단계 | 지표 |
|---|---|
| 검색 | MRR · Hit@1 · Hit@5 · File@5 |
| 생성 | accuracy(majority-O) · judge_mean(1–5) |

## 6개 stage와 384개 조합

실험은 3겹으로 돌렸다.

**1) 단변량 비교 (Stage 1–4-2).** 한 번에 한 칸만 바꾸고 나머지는 기본값 고정. 검색 지표로 칸별 winner를 가린다. 비교한 구성요소만 95종이 넘는다.

*어느 칸이든 후보가 두 자릿수 — 청커는 라이브러리·크기 격자까지 펴서 42종, 임베딩 27종, 리랭커 25종을 한 줄에 세웠다.*

| Stage | 비교 수 | 내용 |
|---|---:|---|
| 1. Loader | 7 | pymupdf, pdfplumber, pymupdf4llm, pdfminer, docling, pypdf, opendataloader |
| 2. Parser(Chunker) | 42 | char-based 32 + semantic·LLM 기반 10 |
| 3. Embedding | 27 | KoE5, embeddinggemma, BGE-M3, Qwen3-Embed 등 |
| 4. Retriever | 7 | Dense · BM25-KIWI · BM25-공백 · Hybrid 비율 변형 |
| 4-1. Pre-Retriever | 10 | HyDE, query2doc, multi-query, decompose, query_expansion 등 |
| 4-2. Post-Retriever(Reranker) | 25 | dragonkue, jina-m0, Qwen3-Reranker, bge-v2-m3, ko-reranker 등 |
| 5. Generator | 46 | 오픈 가중치 27 + 클로즈 가중치 19 |

**2) e2e axis-wise.** 앞 단계 winner를 고정한 채 각 축만 바꿔, 검색 지표에 더해 생성 품질(judge)까지 측정한다. 검색 1등과 답변 1등이 갈리는 지점을 잡으려는 단계다.

**3) 전수 Cartesian (384개).** Pre-Retrieval 8 × Retrieval 6 × Reranker 8 = 384개 조합을 생성 모델(GPT-5.4) 고정 하에 전부 채점한다. 단변량으로는 안 보이는 **상호작용**을 보려는 게 목적이다.

세 겹을 합치면 누적 LLM 호출이 약 120만 회다(생성 평가 + judge 채점 포함). 측정에 쓴 하드웨어는 DGX Spark, HP Z2 Mini, MacBook Pro 세 대이고, 검색·리랭킹 추론과 로컬 LLM 구동을 나눠 돌렸다.

## LLM-as-Judge를 어떻게 썼나

생성 답변은 사람이 일일이 채점하기 어려워 LLM-as-Judge로 평가했다. allganize 방식을 따라 **4지표 majority-O**를 썼다.

> **4-metric majority-O** — judge LLM이 답변을 similarity(유사성)·correctness(정확성)·completeness(완결성)·faithfulness(근거성) 네 지표로 각각 1–5점 채점하고, **4개 중 2개 이상이 4점 이상이면 정답(O)** 으로 판정한다. accuracy는 O 비율, judge_mean은 네 지표 평균(1–5)이다.

judge 한 종만 믿으면 위험해서, 채점 모델을 **오픈 가중치 11종 + API 9종**으로 늘려 교차 채점했다. (절대 점수는 judge에 따라 출렁이지만 조합 간 상대 순위는 대체로 보존된다. 이 견고성 얘기는 생성·judge 편에서 따로 다룬다.)

## 이 시리즈에서 다루는 것

결과는 주제별로 나눠 싣는다. 이 글(관문) 다음 순서로 읽으면 된다.

1. **[문서를 어떻게 잘라야 했나 — Loader·Chunker·Embedding](/posts/korean-rag-bench-ingestion/)** — 입력부. 복잡한 처리보다 한국어에 맞는 단순한 선택이 강했던 구간.
2. **[Dense만으로는 부족했다 — BM25-KIWI·Hybrid·Query 변형](/posts/korean-rag-bench-retrieval/)** — 검색 방식과 쿼리 변형의 단변량 효과.
3. **[0.6B 한국어 Reranker가 4B SOTA를 이긴 이유](/posts/korean-rag-bench-reranker/)** — 재순위화가 왜 가장 큰 축인지.
4. **[Open-weight LLM은 한국어 RAG에서 어디까지 왔나](/posts/korean-rag-bench-generators-judges/)** — 46개 생성 모델과 judge 신뢰도.
5. **[단변량 1등을 쌓아도 최적 조합이 아니었다](/posts/korean-rag-bench-cartesian/)** — 384 전수 조합과 상호작용.
6. **[결론: 모델을 키우기 전에 파이프라인을 먼저 봐야 했다](/posts/korean-rag-bench-final-analysis/)** — 7개 핵심 발견 종합과 운영 권장 파이프라인.

전체 결과를 직접 필터링하며 보고 싶으면 대시보드([rag.baeum.ai.kr](https://rag.baeum.ai.kr))에서 stage·조합·judge를 바꿔가며 비교할 수 있다.

(측정 환경이 궁금하면 같은 하드웨어로 로컬 LLM 추론 속도를 잰 [Qwen3.5 크로스 플랫폼 벤치마크](/posts/llm-bench-03-results-tables/)도 함께 보면 좋다.)

## 읽기 전에 알아야 할 한계

- **데이터셋 성격**: 단답형 한국어 factoid QA다. 멀티홉·장문·대화형 재작성에서는 결과가 달라질 수 있다.
- **judge 절대값**: LLM-as-Judge 점수는 채점 모델 calibration에 민감하다. 절대 점수보다 **상대 순위·다수 judge 합의**로 해석해야 한다.
- **단계 측정 baseline**: 일부 stage(예: 임베딩)는 최종 파이프라인이 아닌 이전 baseline 위에서 측정됐다. 상대 순위는 안정적이라고 보지만 절대값은 그 맥락으로 읽어야 한다.
- **제외된 후보**: 라이브러리 호환성 문제로 일부 리랭커·청커는 측정에서 빠졌다.
- **표·이미지 문항**: 이 유형의 평균 정확도가 낮다(약 0.51). 멀티모달 RAG는 별도 주제다.

## FAQ

**Q. 왜 단변량 비교만 하지 않고 384개 조합을 전부 돌렸나?**
A. 컴포넌트 사이에 상호작용이 있어서다. 각 축의 단변량 1등을 그냥 조립한 구성이 전수 탐색으로 찾은 최적 조합과 일치하지 않았다. 자세한 사례는 Cartesian 편에서 다룬다.

**Q. 평가 데이터는 무엇인가?**
A. allganize의 RAG-Evaluation-Dataset-KO다. 한국어 5개 도메인 300 Q&A, 58개 PDF, 정답 텍스트와 출처 페이지가 ground truth로 붙어 있다.

**Q. LLM-as-Judge는 믿을 만한가?**
A. 단일 judge는 위험해서 오픈 11종 + API 9종으로 교차 채점했다. 절대 점수는 judge마다 다르지만 조합 간 상대 순위는 대체로 보존된다.

**Q. 결과를 직접 확인하거나 재현할 수 있나?**
A. 가능하다. 인터랙티브 대시보드는 [rag.baeum.ai.kr](https://rag.baeum.ai.kr), 코드·단계별 보고서는 [GitHub](https://github.com/BAEM1N/RAG-Evaluation), 결과 데이터셋은 [HuggingFace](https://huggingface.co/datasets/BAEM1N/Korean-RAG-LLM-Judge-Benchmark)에 공개돼 있다.

**Q. 어느 글부터 읽으면 되나?**
A. 이 관문 글 다음 입력부(Loader·Chunker·Embedding)부터 순서대로 읽고, 결론만 빠르게 보려면 마지막 종합 편으로 바로 가도 된다.

## 데이터 · 코드

- **인터랙티브 대시보드**: <https://rag.baeum.ai.kr>
- **코드 · 단계별 보고서**: <https://github.com/BAEM1N/RAG-Evaluation>
- **결과 데이터셋(HuggingFace)**: <https://huggingface.co/datasets/BAEM1N/Korean-RAG-LLM-Judge-Benchmark>
- **원본 코퍼스**: [allganize/RAG-Evaluation-Dataset-KO](https://huggingface.co/datasets/allganize/RAG-Evaluation-Dataset-KO)

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Dataset",
  "name": "Korean RAG LLM-as-Judge Benchmark (300 Q&A · 58 PDF · 5 domains)",
  "description": "Controlled Korean RAG benchmark: 6-stage component comparison (95+ components) plus a full 384-combination Cartesian sweep (8 pre-retrievers × 6 retrievers × 8 rerankers), 46 generators (27 open-weight + 19 closed), scored by a 4-metric LLM-as-Judge (similarity, correctness, completeness, faithfulness; majority-O). Built on allganize RAG-Evaluation-Dataset-KO. ~1.2M LLM calls.",
  "url": "https://baem1n.dev/posts/korean-rag-bench-methodology/",
  "sameAs": "https://github.com/BAEM1N/RAG-Evaluation",
  "isBasedOn": "https://huggingface.co/datasets/allganize/RAG-Evaluation-Dataset-KO",
  "creator": {
    "@type": "Person",
    "name": "배기민 (BAEM1N)",
    "url": "https://baem1n.dev/about/",
    "sameAs": [
      "https://github.com/baem1n",
      "https://huggingface.co/BAEM1N"
    ]
  },
  "distribution": [{
    "@type": "DataDownload",
    "encodingFormat": "application/x-parquet",
    "contentUrl": "https://huggingface.co/datasets/BAEM1N/Korean-RAG-LLM-Judge-Benchmark"
  }],
  "variableMeasured": ["MRR", "Hit@1", "Hit@5", "File@5", "LLM-judge accuracy (majority-O)", "judge_mean (1-5)"],
  "measurementTechnique": "6-stage single-variable comparison + 384-combination Cartesian sweep; 4-metric LLM-as-Judge (majority-O) with 11 open + 9 API judges",
  "license": "https://opensource.org/licenses/MIT",
  "isAccessibleForFree": true,
  "keywords": ["Korean RAG", "RAG benchmark", "reranker", "LLM-as-judge", "retrieval", "embedding", "Cartesian sweep"]
}
</script>
