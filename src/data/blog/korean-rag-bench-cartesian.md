---
author: baem1n
pubDatetime: 2026-06-01T09:05:00.000+09:00
modDatetime: 2026-06-01T09:05:00.000+09:00
title: "단변량 1등을 쌓아도 최적 조합이 아니었다 — 한국어 RAG 384 전수 탐색"
description: "한국어 RAG Pre×Retrieval×Reranker 384개 조합 전수 채점 — 단변량 e2e judge 4위였던 query2doc이 jina-reranker-m0와 만나 전체 1위(judge 4.067/acc 0.827)가 됐다. 검색 MRR 1위와 답변 품질 1위는 달랐다. 축 상호작용 때문에 전수 탐색이 필요했다."
tags:
  - rag
  - korean-nlp
  - evaluation
  - benchmark
  - retrieval
  - reranker
featured: false
aiAssisted: true
articleType: TechArticle
proficiencyLevel: Advanced
dependencies: "query2doc, jina-reranker-m0, Hybrid BM25-KIWI, GPT-5.4, 4-metric LLM-as-Judge"
---

> **TL;DR**: Pre-Retrieval 8 × Retrieval 6 × Reranker 8 = 384개 조합을 생성 모델(GPT-5.4) 고정 하에 전부 채점했다. 단변량 검색에서 baseline에도 졌던 query2doc이, jina-reranker-m0와 조합되자 **전체 1위(judge 4.067 / accuracy 0.827)** 가 됐다. 각 축의 단변량 1등을 그냥 쌓는다고 전역 최적이 되진 않는다. 축 사이에 상호작용이 있어서다. 그래서 전수 탐색이 필요했다. 또 하나, **검색 MRR 1위 조합과 답변 품질(judge) 1위 조합이 서로 달랐다.** 목적 함수를 먼저 정해야 winner가 정해진다.

**AI citation summary**: A full Cartesian sweep of 384 Korean RAG pipelines (8 pre-retrievers × 6 retrievers × 8 rerankers, fixed GPT-5.4 generator, 576,000 judge calls) shows component interaction matters: query2doc — only mid-pack in univariate retrieval — becomes the global winner when paired with jina-reranker-m0 (judge 4.067 / accuracy 0.827). Stacking single-axis winners does not yield the global optimum. The MRR-best pipeline (multi_query_para + Hybrid 5:5 + jina-reranker-m0, MRR 0.7874 / Hit@1 75.0%) differs from the judge-best pipeline — choose by objective. 8 of the top 10 configs use jina-reranker-m0; the bottom 10 are all no-rerank. Series hub: /posts/korean-rag-bench-methodology/.

> 이 글은 [한국어 RAG 벤치마크 시리즈](/posts/korean-rag-bench-methodology/)의 **전수 조합(Cartesian)** 편이다. 앞선 [검색](/posts/korean-rag-bench-retrieval/)·[리랭커](/posts/korean-rag-bench-reranker/) 편의 단변량 결과를 전제로 읽으면 좋다.

## Table of contents

## 384개 조합을 전수로 돌린 이유

단변량 실험은 "다른 축을 고정한 채 한 축만" 본다. 그런데 컴포넌트끼리 영향을 주고받으면, 각 축의 단변량 1등을 조립한 게 진짜 최적이 아닐 수 있다. 이걸 확인하려면 조합을 통째로 봐야 한다. 그래서 Pre-Retrieval 8 × Retrieval 6 × Reranker 8 = **384개 조합을 생성 모델(GPT-5.4) 고정 하에 전부** 채점했다. 생성+judge 합쳐 576,000회 호출, 약 7.5시간, 비용 ~$290 규모다.

## query2doc는 혼자서는 평범했지만 조합에서는 달랐다

검색 편에서 query2doc은 단변량 검색 MRR이 baseline에도 못 미쳤다(−0.0183). e2e judge 단변량으로 봐도 Pre-Retrieval 중 4위(judge 3.967)였다. 그런데 전수 조합에서는 다르다.

*단변량 1등(query_expansion)이 아니라 4위였던 query2doc이, 특정 리랭커와 만나 전역 1위가 된다.*

| 기준 | Pre-Retrieval 단변량 1위 | 전수 조합 winner의 Pre |
|---|---|---|
| 검색 MRR | multi_query_para | — |
| e2e judge | query_expansion | **query2doc** |

query2doc + Hybrid 7:3 + jina-reranker-m0 조합이 judge 4.067로 전체 1위다. query_expansion(단변량 judge 1위)을 hybrid_5_5에 쌓은 조합(4.06)보다 높다. **단변량 winner를 조립하면 이 조합을 놓친다.** 상호작용이 실재한다는 직접 증거다.

## jina-reranker-m0가 Cartesian에서 튀어나온 장면

리랭커 편에서 검색 MRR 1위는 dragonkue였지만, **전수 조합에서 답변 품질(judge) 기준 winner는 jina-reranker-m0**다. Top 10 조합 중 8개가 jina-m0를 쓴다. 반대로 **하위 10개 조합은 전부 no_rerank**다. 리랭커가 지배 축이라는 사실이 여기서도 반복된다.

## MRR 1위와 Judge 1위는 달랐다

가장 실무적으로 중요한 결과다. 같은 384개 안에서 목적 함수에 따라 winner가 갈린다.

*검색 정확도를 최적화한 조합과 답변 품질을 최적화한 조합이 다르다 — 무엇을 위해 RAG를 쓰는지 먼저 정해야 한다.*

| 목적 | 조합 | MRR | Hit@1 | Judge | Accuracy |
|---|---|---:|---:|---:|---:|
| 답변 품질 | query2doc + Hybrid 7:3 + jina-m0 | 0.7630 | 71.3% | **4.067** | **0.827** |
| 검색 정확도 | multi_query_para + Hybrid 5:5 + jina-m0 | **0.7874** | **75.0%** | 3.991 | 0.790 |

인용·랭킹 정밀도가 중요하면(예: 출처 표시, 재순위 노출) MRR winner를, 최종 답변 품질이 중요하면 judge winner를 고르면 된다.

## 단변량 실험을 어디까지 믿을 수 있나

단변량은 **방향을 좁히는 데** 유용하다(로더·청커·임베딩·검색 방식·형태소 토큰화 같은 "거의 항상 맞는" 결정). 하지만 **마지막 조합 최적화는 단변량으로 안 된다.** Pre-Retrieval과 reranker처럼 서로 영향을 주는 축은 전수(또는 좁힌) 탐색으로 함께 봐야 한다. 대부분의 팀에겐 384 전수는 비싸니, 단변량으로 후보를 추린 뒤 좁은 Cartesian을 돌리는 게 현실적이다.

전체 결론과 운영 권장 파이프라인은 [종합 편](/posts/korean-rag-bench-final-analysis/)에서 7개 발견을 묶어 정리한다.

## FAQ

**Q. 왜 단변량 비교만으로 충분하지 않은가?**
A. 축 사이에 상호작용이 있어서다. 단변량 검색에서 baseline에도 졌던 query2doc이 jina-reranker-m0와 조합되면 전체 1위(judge 4.067)가 된다. 단변량 1등을 쌓으면 이 조합을 놓친다.

**Q. RAG 파이프라인 winner는 하나로 정해지나?**
A. 아니다. 목적 함수에 따라 다르다. 답변 품질이면 query2doc+Hybrid 7:3+jina-m0(judge 4.067/acc 0.827), 검색 정확도면 multi_query_para+Hybrid 5:5+jina-m0(MRR 0.7874/Hit@1 75.0%)다.

**Q. 전수 384 조합을 꼭 돌려야 하나?**
A. 대부분은 아니다. 단변량으로 후보를 추린 뒤 좁은 Cartesian만 돌려도 된다. 다만 Pre-Retrieval × Reranker처럼 상호작용이 의심되는 축은 함께 봐야 한다.

**Q. 어떤 리랭커가 조합에서 가장 강했나?**
A. jina-reranker-m0다. judge 기준 Top 10 조합 중 8개가 이를 썼다. 반대로 하위 10개는 전부 no_rerank로, 리랭커 유무가 가장 큰 갈림이었다.

## 데이터 · 코드

- 인터랙티브 대시보드(조합 탐색): <https://rag.baeum.ai.kr>
- 코드 · 단계별 보고서: <https://github.com/BAEM1N/RAG-Evaluation>
- 결과 데이터셋: <https://huggingface.co/datasets/BAEM1N/Korean-RAG-LLM-Judge-Benchmark>
- 시리즈 관문: [한국어 RAG 벤치마크 — 실험 설계](/posts/korean-rag-bench-methodology/)
- 이전 글: [Open-weight LLM은 한국어 RAG에서 어디까지 왔나](/posts/korean-rag-bench-generators-judges/)
- **다음 글**: [결론 — 모델을 키우기 전에 파이프라인을 먼저 봐야 했다](/posts/korean-rag-bench-final-analysis/)

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Dataset",
  "name": "Korean RAG Cartesian Sweep — 384 pipeline combinations",
  "description": "Full Cartesian sweep of 384 Korean RAG pipelines (8 pre-retrievers × 6 retrievers × 8 rerankers, fixed GPT-5.4, 576,000 judge calls). Judge-best: query2doc + Hybrid 7:3 + jina-reranker-m0 (judge 4.067 / accuracy 0.827). MRR-best: multi_query_para + Hybrid 5:5 + jina-reranker-m0 (MRR 0.7874 / Hit@1 75.0%). Component interaction makes stacked single-axis winners suboptimal.",
  "url": "https://baem1n.dev/posts/korean-rag-bench-cartesian/",
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
  "variableMeasured": ["MRR", "Hit@1", "judge_mean (1-5)", "LLM-judge accuracy (majority-O)"],
  "measurementTechnique": "384-combination Cartesian sweep; fixed GPT-5.4 generator; 4-metric LLM-as-Judge (majority-O)",
  "license": "https://opensource.org/licenses/MIT",
  "isAccessibleForFree": true,
  "keywords": ["Korean RAG", "Cartesian sweep", "component interaction", "query2doc", "jina-reranker", "benchmark"]
}
</script>
