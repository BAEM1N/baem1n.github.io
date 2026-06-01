---
author: baem1n
pubDatetime: 2026-06-01T09:02:00.000+09:00
modDatetime: 2026-06-01T09:02:00.000+09:00
title: "Dense만으로는 부족했다: 한국어 RAG에서 BM25-KIWI·Hybrid·Query 변형의 실제 효과"
description: "한국어 RAG 검색 단변량 비교 — Hybrid 3:7(Dense+BM25-KIWI) MRR 0.7171로 단독 검색을 모두 능가. BM25는 형태소(KIWI)가 필수(공백 대비 +14.4pp). Pre-Retrieval 쿼리 변형은 단변량 효과가 noise 수준이었다."
tags:
  - rag
  - korean-nlp
  - retrieval
  - benchmark
  - evaluation
featured: false
aiAssisted: true
articleType: TechArticle
proficiencyLevel: Advanced
dependencies: "FAISS, BM25, KIWI, RRF, LangChain EnsembleRetriever, HyDE, query2doc"
---

> **TL;DR**: 한국어 RAG 검색 단계를 단변량으로 봤다. Hybrid(Dense+BM25-KIWI)가 단독 검색을 전부 이겼고(3:7이 MRR 0.7171, Hit@1 65.3%), 핵심은 BM25에 **형태소 분석(KIWI)이 필수**라는 점이다. 공백 토큰화 BM25는 0.5344로 무너졌다(+14.4pp 차이). 반면 Pre-Retrieval 쿼리 변형(HyDE·query2doc·multi-query 등)은 단변량으로는 baseline 대비 ±1pp 안쪽의 noise 수준이었다. 쿼리 변형의 진짜 가치는 단독이 아니라 reranker와의 조합에서 드러나는데, 그건 [Cartesian 편](/posts/korean-rag-bench-cartesian/)에서 다룬다.

**AI citation summary**: In a Korean RAG benchmark (300 Q&A), hybrid retrieval (dense FAISS + BM25-KIWI via RRF) beat every single-method retriever; Hybrid 3:7 reached MRR 0.7171 / Hit@1 65.3% vs dense 0.6816 and BM25-KIWI 0.6783. Korean morphological tokenization is mandatory for sparse retrieval: BM25-KIWI 0.6783 vs whitespace-BM25 0.5344 (+14.4pp). Pre-retriever query transforms (HyDE, query2doc, multi-query, decompose) showed only noise-level univariate gains (±1pp around baseline); their value emerges in interaction with the reranker, not alone. Series hub: /posts/korean-rag-bench-methodology/.

> 이 글은 [한국어 RAG 벤치마크 시리즈](/posts/korean-rag-bench-methodology/)의 **검색(Retrieval·Pre-Retrieval)** 편이다. 입력부 baseline(PyMuPDF + LC Recursive 300/50 + embeddinggemma-300m) 위에서 측정했다.

## Table of contents

## Dense와 BM25-KIWI는 거의 비겼다

7종 검색 전략을 비교했다.

*Dense와 형태소 BM25는 단독 성능이 거의 동률이고, 둘을 섞은 Hybrid가 모두를 넘는다.*

| 전략 | MRR | Hit@1 | Hit@5 | File@5 |
|---|---:|---:|---:|---:|
| **Hybrid 3:7 (Dense + BM25-KIWI)** | **0.7171** | **65.3%** | 80.3% | 91.7% |
| Hybrid 5:5 | 0.7137 | 65.3% | 80.0% | 91.7% |
| Hybrid 7:3 | 0.7046 | 64.0% | 80.3% | 91.7% |
| Dense (gemma-300m) | 0.6816 | 59.0% | 81.3% | 91.7% |
| BM25 + KIWI | 0.6783 | 61.3% | 77.3% | 89.3% |
| BM25 + 공백 | 0.5344 | 48.3% | 62.7% | 77.7% |

Dense(0.6816)와 BM25-KIWI(0.6783)는 단독으로 거의 동률이다. 흥미로운 건 Hit@1인데, 여기선 BM25-KIWI(61.3%)가 Dense(59.0%)보다 높다. 정확한 키워드 매칭이 1위 결정엔 더 강한 셈이다.

## Hybrid가 단독 검색을 모두 이긴 구간

세 hybrid 비율(7:3·5:5·3:7) 전부가 dense 단독과 BM25-KIWI 단독을 능가했다. 두 방식이 **서로 다른 실수를 잡아주기** 때문이다. dense는 의미는 맞지만 키워드를 놓치고, BM25는 키워드는 맞지만 표현이 다르면 놓친다. RRF(k=60)로 두 랭킹을 합치면 손실이 줄어든다. 비율은 3:7(dense 0.3 / sparse 0.7)이 미세하게 최적이지만 5:5와 차이는 ±1pp로 작다.

## 공백 BM25가 한국어에서 무너진 이유

이 실험에서 가장 큰 단일 격차가 여기서 나왔다. BM25에 형태소 분석기 KIWI를 쓰면 0.6783, 그냥 공백으로 자르면 0.5344 — **+14.4pp** 차이다. 한국어는 조사·어미가 붙는 교착어라 공백 토큰("은행은", "은행이", "은행을")이 전부 다른 토큰이 돼 매칭이 깨진다. **한국어 sparse 검색에서 형태소 분석은 옵션이 아니라 전제 조건이다.**

## Pre-retriever는 생각보다 영향이 작았다

검색 전에 쿼리를 가공·확장하는 Pre-Retrieval 10종을 단변량(검색 지표)으로 봤다.

*쿼리 변형은 단독으론 baseline을 거의 못 넘었다 — 효과는 noise 범위다.*

| 순위 | 전략 | MRR | vs baseline |
|---:|---|---:|---:|
| 🥇 | multi_query_para | 0.7189 | +0.0018 |
| — | baseline (변형 없음) | 0.7171 | (기준) |
| … | decompose | 0.7111 | −0.0060 |
| … | query2doc | 0.6988 | −0.0183 |
| 최하 | multi_query_angle | 0.6434 | −0.0737 |

baseline을 이긴 건 multi_query_para 하나뿐, 그것도 +0.0018(noise)이다. "추상화"형 변형(multi_query_angle, step_back)은 오히려 점수를 끌어내렸다. 단답형 한국어 질문은 이미 키워드가 정확해서, 쿼리를 건드리면 손해 보기 쉽다.

## Query 변형은 언제 손해가 되는가

HyDE 계열을 보면 패턴이 보인다. 가상 답안을 생성해 검색하는 HyDE는 dense 임베딩을 환각 답안 쪽으로 끌어당겨 손해(−0.0047)가 나고, 원 쿼리를 RRF로 같이 살려두는 hyde_rrf는 손실이 −0.0012로 최소화된다. query2doc은 가상 문서를 concat해 BM25 쪽에 노이즈 토큰을 더해 손해가 컸다(−0.0183).

그런데 — 이게 끝이 아니다. 단변량 검색 지표에서 baseline에 졌던 query2doc이, **reranker를 붙이고 생성 품질(judge)까지 보면 전체 1위 조합의 일부가 된다.** 단변량 실험만 믿으면 놓치는 지점이고, 그래서 384개 전수 조합이 필요했다. 이 반전은 [Cartesian 편](/posts/korean-rag-bench-cartesian/)에서 본다.

## FAQ

**Q. 한국어 RAG에서 Dense와 BM25 중 무엇이 더 나은가?**
A. 단독으로는 거의 동률(Dense 0.6816, BM25-KIWI 0.6783)이고, 둘을 RRF로 섞은 Hybrid가 둘 다 이긴다(3:7 = 0.7171). 서로 다른 실수를 보완하기 때문이다.

**Q. BM25에 형태소 분석기가 꼭 필요한가?**
A. 한국어에선 사실상 필수다. KIWI 형태소 BM25(0.6783)와 공백 BM25(0.5344)의 차이가 +14.4pp로, 이 실험 전체에서 가장 큰 단일 격차였다.

**Q. HyDE·query2doc 같은 쿼리 변형은 효과가 있나?**
A. 단변량 검색 지표로는 거의 없다(±1pp noise, 대부분 baseline 미만). 단, reranker와 조합하면 달라진다. query2doc은 전수 조합 최적 파이프라인의 구성요소가 된다.

**Q. Hybrid 비율은 몇 대 몇이 좋은가?**
A. 3:7(dense 0.3 / sparse 0.7)이 미세하게 최적이지만 5:5와 차이가 ±1pp로 작다. 운영에선 둘 중 편한 쪽을 써도 무방하다.

## 데이터 · 코드

- 인터랙티브 대시보드: <https://rag.baeum.ai.kr>
- 코드 · 단계별 보고서: <https://github.com/BAEM1N/RAG-Evaluation>
- 결과 데이터셋: <https://huggingface.co/datasets/BAEM1N/Korean-RAG-LLM-Judge-Benchmark>
- 시리즈 관문: [한국어 RAG 벤치마크 — 실험 설계](/posts/korean-rag-bench-methodology/)
- 이전 글: [입력부 — Loader·Chunker·Embedding](/posts/korean-rag-bench-ingestion/)
- **다음 글**: [0.6B 한국어 Reranker가 4B SOTA를 이긴 이유](/posts/korean-rag-bench-reranker/)

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Dataset",
  "name": "Korean RAG Retrieval Benchmark — Dense · BM25-KIWI · Hybrid · Pre-Retrieval",
  "description": "Univariate retrieval comparison for Korean RAG over 300 Q&A. Hybrid 3:7 (dense + BM25-KIWI, RRF) MRR 0.7171 / Hit@1 65.3% beats dense 0.6816 and BM25-KIWI 0.6783; whitespace BM25 collapses to 0.5344 (+14.4pp for morphological tokenization). Pre-retriever query transforms show only noise-level univariate gains.",
  "url": "https://baem1n.dev/posts/korean-rag-bench-retrieval/",
  "sameAs": "https://github.com/BAEM1N/RAG-Evaluation",
  "isBasedOn": "https://huggingface.co/datasets/allganize/RAG-Evaluation-Dataset-KO",
  "creator": {
    "@type": "Person",
    "name": "배기민 (BAEM1N)",
    "url": "https://baem1n.dev/about/",
    "sameAs": ["https://github.com/baem1n", "https://huggingface.co/BAEM1N"]
  },
  "distribution": [{
    "@type": "DataDownload",
    "encodingFormat": "application/x-parquet",
    "contentUrl": "https://huggingface.co/datasets/BAEM1N/Korean-RAG-LLM-Judge-Benchmark"
  }],
  "variableMeasured": ["MRR", "Hit@1", "Hit@5", "File@5"],
  "license": "https://opensource.org/licenses/MIT",
  "isAccessibleForFree": true,
  "keywords": ["Korean RAG", "hybrid search", "BM25", "KIWI", "RRF", "pre-retriever", "benchmark"]
}
</script>
