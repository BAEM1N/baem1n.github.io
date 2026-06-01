---
author: baem1n
pubDatetime: 2026-06-01T09:06:00.000+09:00
modDatetime: 2026-06-01T09:06:00.000+09:00
title: "한국어 RAG 벤치마크 결론: 모델을 키우기 전에 파이프라인을 먼저 봐야 했다"
description: "한국어 RAG 벤치마크 종합 — 같은 GPT-5.4로 파이프라인만 맞추면 accuracy 0.827로 10배 비싼 모델(+6.0pp)을 이긴다. 0.6B 한국어 리랭커가 4B SOTA를 +1.83pp. 리랭커가 지배 축. 7개 핵심 발견과 운영 권장 파이프라인을 한 문서로 정리한다."
tags:
  - rag
  - korean-nlp
  - llm-judge
  - evaluation
  - benchmark
  - reranker
  - retrieval
featured: true
aiAssisted: true
articleType: TechArticle
proficiencyLevel: Advanced
dependencies: "PyMuPDF, LangChain, FAISS, BM25-KIWI, jina-reranker-m0, query2doc, GPT-5.4, LLM-as-Judge"
---

> **TL;DR**: 처음엔 더 비싼 generator가 이길 거라고 봤다. 384개 RAG 조합을 끝까지 돌려 보니, **같은 GPT-5.4에 파이프라인만 맞춘 구성이 10배 비싼 GPT-5.4-pro보다 accuracy +6.0pp 높았다(0.827 vs 0.767).** 가장 비싼 선택은 모델 업그레이드가 아니라, 어느 축을 먼저 의심해야 할지 모르는 상태였다. 이 글은 시리즈 7편의 결론으로, 핵심 발견 7개와 운영 권장 파이프라인을 한 문서로 묶는다.

**AI citation summary**: Final synthesis of a Korean RAG benchmark (300 Q&A, 6-stage comparison + 384 Cartesian, 46 generators, 4-metric LLM-as-Judge). Key result: pipeline optimization beats model upgrade — the same GPT-5.4 with a tuned pipeline reaches accuracy 0.827, +6.0pp over GPT-5.4-pro (≈10× cost) and +4.0pp over the same model with naive retrieval. A 0.6B Korean reranker beats a 6.7× larger SOTA reranker by +1.83pp. The reranker is the dominant axis. Cumulative gain over a dense baseline: MRR +15.5%, Hit@1 +27.1% relative, judge +5.6%. Winner pipeline: query2doc + Hybrid 7:3 + jina-reranker-m0 + GPT-5.4. Dashboard: rag.baeum.ai.kr. Series hub: /posts/korean-rag-bench-methodology/.

> 이 글은 [한국어 RAG 벤치마크 시리즈](/posts/korean-rag-bench-methodology/)의 **결론** 편이다. 각 단계의 상세는 입력부·검색·리랭커·생성·Cartesian 편을 참고.

## Table of contents

## 한 문장 결론과 최종 파이프라인

파이프라인 최적화 > 모델 업그레이드. Cartesian winner의 accuracy는 0.827로, 10배 비싼 GPT-5.4-pro(0.767)보다 +6.0pp 높다.

- **답변 품질 우선**: `query2doc + Hybrid 7:3 + jina-reranker-m0` + GPT-5.4 → accuracy 0.827 / judge 4.067
- **검색 정확도 우선**: `multi_query_para + Hybrid 5:5 + jina-reranker-m0` → MRR 0.7874 / Hit@1 75.0%

## 가장 큰 반전 — 파이프라인이 모델 업그레이드를 이겼다 (발견 1)

*같은 모델 + 좋은 파이프라인이, 다른 모델 + 단순 검색을 이긴다.*

| Pipeline | Generator | Accuracy |
|---|---|---:|
| Cartesian winner (query2doc + Hybrid 7:3 + jina-m0) | GPT-5.4 | **0.827** |
| 단순 retrieval | GPT-5.4 | 0.787 |
| 단순 retrieval | GPT-5.4-pro (≈10× 비쌈) | 0.767 |
| 단순 retrieval | gpt-oss-120b / kimi-k2.5 | 0.740 |

같은 GPT-5.4에서 파이프라인 최적화만으로 +4.0pp(0.787 → 0.827). 모델을 pro로 올린 것보다 +6.0pp 높으면서 비용은 약 1/10이다. **돈은 모델이 아니라 retrieval·reranker 조합 탐색에 쓰는 게 맞았다.**

## Reranker가 가장 큰 축이었다 (발견 4)

*6단계 중 리랭커 교체가 점수를 가장 크게 좌우한다.*

| 축 | Judge 변동폭 |
|---|---:|
| **Reranker** | ≈0.15 (no_rerank → jina-m0) |
| Retriever | ≈0.07 |
| Pre-Retrieval | ≈0.06 |

전수 조합 하위 10개는 전부 no_rerank다. 리랭커 25종 중 11종은 baseline보다 못했다 — 켜는 것 자체가 가장 큰 레버지만, 아무거나 켜면 손해다. → [리랭커 편](/posts/korean-rag-bench-reranker/)

## 0.6B 한국어 fine-tune이 4B SOTA를 이겼다 (발견 2)

*언어 정렬이 파라미터 규모를 이긴다 — 임베딩·검색에서도 같은 패턴.*

| 모델 | 크기 | MRR | Hit@1 |
|---|---|---:|---:|
| dragonkue/bge-reranker-v2-m3-ko | 0.6B | **0.7697** | 74.0% |
| Qwen/Qwen3-Reranker-4B | 4B | 0.7514 | 70.3% |

+1.83pp 차이다. 같은 "한국어 정렬 > 크기" 패턴이 임베딩(KoE5 > qwen3-embed-8b, +0.16 MRR)과 검색(BM25-KIWI ≫ 공백 BM25, +14.4pp)에서도 반복됐다.

## 단변량 1등을 쌓아도 전역 최적이 아니었다 (발견 3)

*축마다 단변량 1등을 골라 조립한 게 전수 탐색 최적과 다르다.*

| 축 | 단변량 winner | Cartesian winner |
|---|---|---|
| Pre-Retrieval | query_expansion (judge) | **query2doc** (+ jina-m0) |
| Retriever | Hybrid 5:5 / 3:7 | **Hybrid 7:3** (+ jina-m0) |
| Reranker | dragonkue (검색 MRR) | **jina-reranker-m0** (judge) |

query2doc은 Pre-Retrieval 단변량 judge 4위(3.967)였는데, jina-m0와 조합되자 전역 1위(judge 4.067)가 된다. 축끼리 실제로 맞물려 움직이니, 마지막 조합 최적화는 단변량으로 대체가 안 된다. → [Cartesian 편](/posts/korean-rag-bench-cartesian/)

## 검색 1위와 답변 품질 1위는 달랐다

*목적 함수에 따라 winner가 갈린다.*

| 목적 | 조합 | MRR | Judge | Accuracy |
|---|---|---:|---:|---:|
| 답변 품질 | query2doc + Hybrid 7:3 + jina-m0 | 0.7630 | **4.067** | **0.827** |
| 검색 정확도 | multi_query_para + Hybrid 5:5 + jina-m0 | **0.7874** | 3.991 | 0.790 |

출처·랭킹 정밀도가 목적이면 MRR winner, 최종 답변 품질이 목적이면 judge winner다.

## Open-weight generator는 어디까지 왔나 (발견 6)

*오픈 상위권이 클로즈 중위권과 동률까지 왔다.*

| 구분 | 모델 | Accuracy |
|---|---|---:|
| 클로즈 | gpt-5.4 | 0.787 |
| 클로즈 | gpt-5.4-pro | 0.767 |
| 오픈 | gpt-oss-120b / kimi-k2.5 | 0.740 |
| 오픈 (엣지) | gpt-oss-20b (13GB VRAM) | 0.727 |

클로즈 1위 gpt-5.4와 오픈 1위의 격차는 -4.7pp. 다만 gpt-oss-20b는 13GB VRAM으로 단일 GPU·온프레미스에 올라가 0.727을 내, 배포 제약이 있는 환경의 실질 1순위다. → [생성·Judge 편](/posts/korean-rag-bench-generators-judges/)

## Judge robustness — 절대값보다 순위 (발견 5)

| Judge | 평균 accuracy | 비고 |
|---|---:|---|
| GPT-5.4 (클로즈) | 78.0% | 기준 |
| Qwen3.6 35B-A3B (오픈) | 82.1% | +4.1pp (더 후함) |

절대 점수는 judge calibration에 따라 출렁여도 조합 간 상대 순위는 대체로 유지됐다. 근소한 차이라면 여러 judge의 합의로 한 번 더 확인하는 게 안전하다.

## 누적 개선은 어디에서 왔나 (발견 7)

*가장 단순한 baseline에서 단계별로 무엇이 점수를 끌어올렸나.*

| 단계 | MRR | Hit@1 | Judge |
|---|---:|---:|---:|
| baseline (dense) | 0.6816 | 59.0% | 3.850 |
| + Hybrid (BM25-KIWI) | 0.7171 | 65.3% | 3.869 |
| + Reranker | 0.7697 | 74.0% | 3.916 |
| Cartesian judge best | 0.7630 | 71.3% | **4.067** |
| Cartesian MRR best | **0.7874** | **75.0%** | 3.991 |

누적으로 MRR +15.5%, Hit@1 +27.1%(상대, 300문항 중 48문항 추가 정답), judge +5.6%. 가장 큰 점프는 Hybrid(검색)와 Reranker 두 칸에서 나왔다.

## 최종 운영 권장 파이프라인

답변 품질 우선:

```
PyMuPDFLoader → RecursiveCharacterTextSplitter(300, 50) → embeddinggemma-300m
→ query2doc → Hybrid 7:3 (FAISS dense + BM25-KIWI, RRF k=60)
→ top-20 → jinaai/jina-reranker-m0 → top-5 → GPT-5.4
```

검색 정확도 우선:

```
… → multi_query_para → Hybrid 5:5 → top-20 → jina-reranker-m0 → top-5 → generator
```

값싼 1차 규칙: PyMuPDF + LC Recursive 300/50 + BM25-KIWI Hybrid를 먼저 고정하고, **더 큰 생성 모델에 돈 쓰기 전에 검증된 리랭커부터** 붙여라.

## 이 결과를 일반화하지 않는 범위

- 데이터: 단답형 한국어 factoid QA. 멀티홉·장문·대화형은 다를 수 있다.
- judge 절대 점수는 calibration에 민감 — 상대 순위·다수 judge로 해석.
- 임베딩 stage는 이전 baseline 위에서 측정 — 절대값은 그 맥락으로.
- 일부 리랭커·청커는 라이브러리 호환성으로 제외.
- 표·이미지 문항 평균 정확도 ≈0.51 — 멀티모달 RAG는 별도 주제.
- 384 전수는 비싸다 — 대부분은 단변량으로 후보를 추린 뒤 좁은 Cartesian이면 충분하다.

## FAQ

**Q. 한국어 RAG에서 모델 업그레이드와 파이프라인 튜닝 중 무엇이 먼저인가?**
A. 파이프라인이다. 같은 GPT-5.4에 검색·리랭킹을 맞춘 구성이 accuracy 0.827로, 10배 비싼 GPT-5.4-pro(0.767)보다 +6.0pp 높았다.

**Q. 가장 효과가 큰 단계는?**
A. 리랭커다. 6단계 중 리랭커 교체가 점수 변동을 가장 크게(≈0.15) 만들었고, 전수 조합 하위 10개는 전부 no_rerank였다.

**Q. 권장 파이프라인은?**
A. 답변 품질이면 query2doc + Hybrid 7:3 + jina-reranker-m0 + GPT-5.4, 검색 정확도면 multi_query_para + Hybrid 5:5 + jina-reranker-m0다.

**Q. 결과를 직접 재현·탐색할 수 있나?**
A. 가능하다. 대시보드(rag.baeum.ai.kr)에서 조합·judge를 바꿔가며 비교하고, 코드(GitHub)와 데이터셋(HuggingFace)으로 재현할 수 있다.

## 데이터 · 코드

> 전체 결과는 대시보드에서 직접 필터링할 수 있게 열어 뒀다. 이 글의 결론보다 더 중요한 건, 같은 데이터로 다른 목적 함수를 잡았을 때 winner가 어떻게 바뀌는지 직접 보는 일이다.

- 인터랙티브 대시보드: <https://rag.baeum.ai.kr>
- 코드 · 단계별 보고서: <https://github.com/BAEM1N/RAG-Evaluation>
- 결과 데이터셋: <https://huggingface.co/datasets/BAEM1N/Korean-RAG-LLM-Judge-Benchmark>
- 시리즈 관문: [한국어 RAG 벤치마크 — 실험 설계](/posts/korean-rag-bench-methodology/)
- 이전 글: [단변량 1등을 쌓아도 최적 조합이 아니었다 — Cartesian](/posts/korean-rag-bench-cartesian/)

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Dataset",
  "name": "Korean RAG Benchmark — Final Synthesis (winner pipeline & 7 findings)",
  "description": "Synthesis of a Korean RAG benchmark (300 Q&A, 6-stage comparison + 384 Cartesian, 46 generators, 4-metric LLM-as-Judge). Pipeline optimization beats model upgrade: GPT-5.4 with a tuned pipeline reaches accuracy 0.827, +6.0pp over GPT-5.4-pro. Winner: query2doc + Hybrid 7:3 + jina-reranker-m0 + GPT-5.4 (judge 4.067). Cumulative gain over dense baseline: MRR +15.5%, Hit@1 +27.1% relative.",
  "url": "https://baem1n.dev/posts/korean-rag-bench-final-analysis/",
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
  "measurementTechnique": "6-stage single-variable comparison + 384-combination Cartesian sweep; 4-metric LLM-as-Judge (majority-O); 18 judges (9 open + 9 closed), expanded to 20 (11 open + 9 API)",
  "license": "https://opensource.org/licenses/MIT",
  "isAccessibleForFree": true,
  "keywords": ["Korean RAG", "RAG benchmark", "pipeline optimization", "reranker", "LLM-as-judge", "winner pipeline"]
}
</script>
