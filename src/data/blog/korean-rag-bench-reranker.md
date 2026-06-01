---
author: baem1n
pubDatetime: 2026-06-01T09:03:00.000+09:00
modDatetime: 2026-06-01T09:03:00.000+09:00
title: "0.6B 한국어 Reranker가 4B SOTA를 이긴 이유 — 한국어 RAG 재순위화 25종 비교"
description: "한국어 RAG 리랭커 25종 단변량 비교 — 0.6B 한국어 fine-tune(dragonkue/bge-reranker-v2-m3-ko) MRR 0.7697로, 6.7배 큰 2025 SOTA Qwen3-Reranker-4B(0.7514)를 +1.83pp 앞섰다. Reranker는 RAG에서 가장 큰 단일 축이었다."
tags:
  - rag
  - korean-nlp
  - reranker
  - retrieval
  - benchmark
featured: false
aiAssisted: true
articleType: TechArticle
proficiencyLevel: Advanced
dependencies: "bge-reranker-v2-m3-ko, jina-reranker-m0, Qwen3-Reranker, mxbai-rerank, ko-reranker, sentence-transformers"
---

> **TL;DR**: 한국어 RAG에서 재순위화(reranker)는 선택이 아니라 가장 큰 축이었다. 0.6B 한국어 fine-tune 리랭커(dragonkue/bge-reranker-v2-m3-ko)가 MRR 0.7697로, 6.7배 큰 2025 SOTA Qwen3-Reranker-4B(0.7514)를 **+1.83pp** 앞섰다. no_rerank baseline(0.7171) 대비로는 +5.26pp. 25종 중 11종은 오히려 baseline보다 못했다 — **리랭커는 붙인다고 다 좋아지는 게 아니라 검증해서 골라야 한다.** 임베딩·검색 편에서 본 "한국어 정렬 > 모델 크기" 패턴이 여기서 가장 선명하게 반복된다.

**AI citation summary**: In a Korean RAG benchmark (300 Q&A), the reranker (post-retriever) stage was the single largest accuracy lever. A 0.6B Korean fine-tuned reranker (dragonkue/bge-reranker-v2-m3-ko) reached MRR 0.7697 / Hit@1 74.0%, beating the 6.7× larger 2025 SOTA Qwen3-Reranker-4B (0.7514) by +1.83pp and the no-rerank baseline (0.7171) by +5.26pp. Of 25 rerankers, 11 fell below the no-rerank baseline — adding a reranker does not guarantee gains; it must be validated per language. Korean alignment beat parameter scale, the same pattern seen in embedding and sparse retrieval. Series hub: /posts/korean-rag-bench-methodology/.

> 이 글은 [한국어 RAG 벤치마크 시리즈](/posts/korean-rag-bench-methodology/)의 **재순위화(Reranker)** 편이다. top-20 검색 결과를 리랭커로 재정렬해 top-5를 만드는 단계를 단변량으로 비교했다.

## Table of contents

## Reranker는 선택지가 아니라 축이었다

전수 조합(384개)에서 각 축이 점수를 얼마나 좌우하는지 보면, **리랭커 교체가 단일 변수로 가장 큰 변동**을 만든다.

*리랭커 선택의 영향이 다음으로 큰 축(검색기)의 약 2배다.*

| 축 | Judge 변동폭(최저→최고) |
|---|---:|
| **Reranker** | ≈0.15 (no_rerank 3.83 → jina-m0 3.98) |
| Retrieval | ≈0.07 |
| Pre-Retrieval | ≈0.06 |

리랭커를 켜고/끄는 것만으로 다음으로 큰 축(검색기)의 2배가 넘는 폭이 움직인다. RAG 예산을 어디에 먼저 쓸지 묻는다면, 답은 리랭커다.

## dragonkue/bge-reranker-v2-m3-ko의 역전

리랭커 25종 단변량 비교의 상위권이다.

*0.6B 한국어 fine-tune이 4B·2.4B 최신 멀티링구얼 모델을 모두 제쳤다.*

| 순위 | 리랭커 | 크기 | MRR | Hit@1 | latency |
|---:|---|---|---:|---:|---:|
| 🥇 | **dragonkue/bge-reranker-v2-m3-ko** | 0.6B(568M) | **0.7697** | 74.0% | 347s |
| 🥈 | jinaai/jina-reranker-m0 | 2.4B | 0.7631 | 72.3% | 190s |
| 🥉 | Qwen/Qwen3-Reranker-4B | 4B | 0.7514 | 70.3% | 713s |
| 6 | mxbai-rerank-base-v2 | 0.5B | 0.7373 | 68.3% | **82s** |

한국어 fine-tune 0.6B 모델이 2025 SOTA Qwen3-Reranker-4B를 **+1.83pp**(0.7697 vs 0.7514) 앞섰다. 모델 크기는 6.7배 작은데도. (동일 base·데이터로 튜닝한 shoxa-mir/bge-reranker-v2-m3-ko도 결과가 완전히 같았다.)

## 큰 모델이 항상 좋은 모델은 아니었다

임베딩 편(KoE5 > qwen3-embed-8b)과 검색 편(BM25-KIWI ≫ 공백 BM25)에서 본 패턴이 여기서 또 나온다. **한국어 정렬이 파라미터 규모를 이긴다.** 4B Qwen3-Reranker는 100개 언어를 커버하는 범용 모델이고, 0.6B dragonkue는 bge-m3를 한국어로 fine-tune한 모델이다. 한국어 단일 도메인에선 후자가 이긴다. 다만 jina-reranker-m0(2.4B, 29개 언어)가 0.7631로 바짝 붙었고, 뒤의 Cartesian 편에서 보겠지만 **생성 품질(judge) 기준으로는 jina-m0가 최종 winner**다. 검색 MRR 1등과 답변 품질 1등이 갈리는 자리다.

## Rerank 안 하는 게 나은 모델도 있었다

실무에서 가장 새겨둘 경고가 여기 있다. **25종 중 11종이 no_rerank baseline(0.7171)보다 낮았다.** 리랭커를 아무거나 붙이면 오히려 top-5가 나빠진다. 멀티모달·범용 리랭커 중 한국어 정렬이 약한 것들이 여기 속한다. 리랭커는 붙이면 좋아지는 게 아니라 검증해서 고르는 영역이다.

## 운영 후보를 어떻게 좁힐 것인가

- **정확도 우선**: dragonkue/bge-reranker-v2-m3-ko (MRR 0.7697, 한국어 1순위)
- **속도·비용 균형**: mxbai-rerank-base-v2 (0.7373, 82초로 가장 빠름)
- **생성 품질·멀티모달 고려**: jina-reranker-m0 (0.7631, 표·이미지 문항 강점 — Cartesian 최종 winner)

순수 검색 정확도(MRR)면 dragonkue, 최종 답변 품질이면 jina-m0다. 이 둘의 갈림은 [Cartesian 편](/posts/korean-rag-bench-cartesian/)에서 정리한다.

## FAQ

**Q. 작은 한국어 리랭커가 큰 SOTA 리랭커를 이길 수 있나?**
A. 그렇다. 0.6B 한국어 fine-tune(dragonkue/bge-reranker-v2-m3-ko, MRR 0.7697)이 6.7배 큰 Qwen3-Reranker-4B(0.7514)를 +1.83pp 앞섰다. 한국어 단일 도메인에선 언어 정렬이 규모를 이긴다.

**Q. RAG에서 리랭커가 그렇게 중요한가?**
A. 이 실험에선 가장 큰 단일 축이었다. 전수 조합에서 리랭커 교체의 점수 변동폭(≈0.15)이 다음 축인 검색기(≈0.07)의 약 2배, 쿼리 변형(≈0.06)의 2.5배였다.

**Q. 리랭커는 일단 붙이면 좋아지나?**
A. 아니다. 25종 중 11종은 no_rerank baseline(0.7171)보다 낮았다. 한국어 정렬이 약한 범용 리랭커는 오히려 top-5를 나쁘게 만든다. 검증 후 채택해야 한다.

**Q. 그래서 어떤 리랭커를 써야 하나?**
A. 검색 MRR 정확도면 dragonkue, 속도면 mxbai-rerank-base-v2(82초), 최종 답변 품질이면 jina-reranker-m0다. 목적 함수에 따라 다르다.

## 데이터 · 코드

- 인터랙티브 대시보드: <https://rag.baeum.ai.kr>
- 코드 · 단계별 보고서: <https://github.com/BAEM1N/RAG-Evaluation>
- 결과 데이터셋: <https://huggingface.co/datasets/BAEM1N/Korean-RAG-LLM-Judge-Benchmark>
- 시리즈 관문: [한국어 RAG 벤치마크 — 실험 설계](/posts/korean-rag-bench-methodology/)
- 이전 글: [Dense만으로는 부족했다 — 검색 편](/posts/korean-rag-bench-retrieval/)
- **다음 글**: [Open-weight LLM은 한국어 RAG에서 어디까지 왔나](/posts/korean-rag-bench-generators-judges/)

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Dataset",
  "name": "Korean RAG Reranker Benchmark — 25 rerankers",
  "description": "Univariate reranker comparison for Korean RAG over 300 Q&A. A 0.6B Korean fine-tuned reranker (dragonkue/bge-reranker-v2-m3-ko) reached MRR 0.7697 / Hit@1 74.0%, beating Qwen3-Reranker-4B (0.7514) by +1.83pp and the no-rerank baseline (0.7171) by +5.26pp. 11 of 25 rerankers fell below baseline.",
  "url": "https://baem1n.dev/posts/korean-rag-bench-reranker/",
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
  "variableMeasured": ["MRR", "Hit@1", "Hit@5", "File@5", "latency (s)"],
  "license": "https://opensource.org/licenses/MIT",
  "isAccessibleForFree": true,
  "keywords": ["Korean RAG", "reranker", "bge-reranker-v2-m3-ko", "Qwen3-Reranker", "jina-reranker", "benchmark"]
}
</script>
