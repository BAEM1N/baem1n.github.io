---
author: baem1n
pubDatetime: 2026-06-01T09:05:00.000+09:00
modDatetime: 2026-06-01T09:05:00.000+09:00
title: "Stacking Univariate Winners Didn't Give the Optimum — A 384-Combination Korean RAG Sweep"
description: "Scoring all 384 Pre×Retrieval×Reranker combinations for Korean RAG — query2doc, only 4th by univariate e2e judge, becomes the global winner (judge 4.067/acc 0.827) once paired with jina-reranker-m0. The MRR winner ≠ the answer-quality winner. Interaction is why the full sweep was needed."
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

> **TL;DR**: I scored all 8 × 6 × 8 = 384 Pre-Retrieval × Retrieval × Reranker combinations with the generator (GPT-5.4) fixed. query2doc — which lost even to baseline in univariate retrieval — became the **global winner (judge 4.067 / accuracy 0.827)** once paired with jina-reranker-m0. So stacking each axis's univariate winner doesn't yield the global optimum, because the axes interact — and that's why the full sweep was needed. Also: the **MRR-best combination and the answer-quality (judge)-best combination differ.** Pick your objective first, then the winner is determined.

**AI citation summary**: A full Cartesian sweep of 384 Korean RAG pipelines (8 pre-retrievers × 6 retrievers × 8 rerankers, fixed GPT-5.4 generator, 576,000 generation + judge calls) shows component interaction matters: query2doc — only mid-pack in univariate retrieval — becomes the global winner when paired with jina-reranker-m0 (judge 4.067 / accuracy 0.827). Stacking single-axis winners does not yield the global optimum. The MRR-best pipeline (multi_query_para + Hybrid 5:5 + jina-reranker-m0, MRR 0.7874 / Hit@1 75.0%) differs from the judge-best pipeline — choose by objective. 8 of the top 10 configs use jina-reranker-m0; the bottom 10 are all no-rerank. Series hub: /en/posts/korean-rag-bench-methodology/.

> This is the **Cartesian sweep** part of the [Korean RAG Benchmark series](/en/posts/korean-rag-bench-methodology/). Read the [retrieval](/en/posts/korean-rag-bench-retrieval/) and [reranker](/en/posts/korean-rag-bench-reranker/) posts first for the univariate results it builds on.

## Table of contents

## Why run all 384 combinations

Univariate experiments look at "one axis, others held fixed." But if components affect each other, stacking each axis's univariate winner may not be the real optimum. To check, you have to look at combinations as a whole. So I scored all 8 × 6 × 8 = **384 combinations with the generator (GPT-5.4) fixed** — 576,000 calls (generation + judge), ≈7.5 hours, ≈$290.

## query2doc was ordinary alone, different in combination

In the retrieval post, query2doc's univariate retrieval MRR fell below baseline (−0.0183). By univariate e2e judge it ranked 4th among pre-retrievers (judge 3.967). But the full sweep is different.

*Not the univariate winner (query_expansion) but the 4th-place query2doc becomes the global winner once paired with a specific reranker.*

| Basis | Univariate Pre-Retrieval winner | Cartesian winner's Pre |
|---|---|---|
| Retrieval MRR | multi_query_para | — |
| e2e judge | query_expansion | **query2doc** |

query2doc + Hybrid 7:3 + jina-reranker-m0 is the overall winner at judge 4.067 — higher than stacking query_expansion (univariate judge #1) onto hybrid_5_5 (4.06). **Stacking univariate winners misses this combination** — direct evidence that interaction is real.

## jina-reranker-m0 surfaced in the Cartesian

In the reranker post, the retrieval-MRR #1 was dragonkue, but **in the full sweep the answer-quality (judge) winner is jina-reranker-m0**. 8 of the top 10 combinations use jina-m0. Conversely, the **bottom 10 are all no_rerank** — the reranker-is-the-dominant-axis result repeats here.

## The MRR winner wasn't the judge winner

The most practically important result. Within the same 384, the winner changes by objective.

*The combination that optimizes retrieval precision differs from the one that optimizes answer quality — decide what you use RAG for first.*

| Objective | Pipeline | MRR | Hit@1 | Judge | Accuracy |
|---|---|---:|---:|---:|---:|
| Answer quality | query2doc + Hybrid 7:3 + jina-m0 | 0.7630 | 71.3% | **4.067** | **0.827** |
| Retrieval precision | multi_query_para + Hybrid 5:5 + jina-m0 | **0.7874** | **75.0%** | 3.991 | 0.790 |

For citation/ranking precision (source attribution, reranked exposure) pick the MRR winner; for final answer quality pick the judge winner.

## How far to trust univariate experiments

To summarize — univariate analysis is useful for **narrowing direction** (loader, chunker, embedding, retrieval method, morphological tokenization — the "almost always right" decisions). But the **final combination optimization can't be done univariately.** Axes that affect each other, like Pre-Retrieval and reranker, must be searched together (exhaustively or narrowed). For most teams a full 384 sweep is expensive, so screen univariately first, then run a narrowed Cartesian.

The full conclusions and recommended production pipeline are in the [final synthesis](/en/posts/korean-rag-bench-final-analysis/), tying the 7 findings together.

## FAQ

**Q. Why isn't univariate comparison enough?**
A. The axes interact. query2doc, which lost to baseline in univariate retrieval, becomes the overall winner (judge 4.067) when paired with jina-reranker-m0. Stacking univariate winners misses this combination.

**Q. Is the RAG pipeline winner a single thing?**
A. No — it depends on the objective. For answer quality, query2doc + Hybrid 7:3 + jina-m0 (judge 4.067/acc 0.827); for retrieval precision, multi_query_para + Hybrid 5:5 + jina-m0 (MRR 0.7874/Hit@1 75.0%).

**Q. Do I have to run all 384 combinations?**
A. Usually not. Screen univariately, then run a narrowed Cartesian. But axes suspected of interacting (Pre-Retrieval × Reranker) should be searched together.

**Q. Which reranker was strongest in combination?**
A. jina-reranker-m0 — 8 of the judge-based top 10 used it. The bottom 10 were all no_rerank, so reranker presence was the biggest split.

## Data · Code

- Interactive dashboard (combination explorer): <https://rag.baeum.ai.kr>
- Code · per-stage reports: <https://github.com/BAEM1N/RAG-Evaluation>
- Result dataset: <https://huggingface.co/datasets/BAEM1N/Korean-RAG-LLM-Judge-Benchmark>
- Series hub: [Korean RAG Benchmark — Methodology](/en/posts/korean-rag-bench-methodology/)
- Previous: [How far have open-weight LLMs come in Korean RAG](/en/posts/korean-rag-bench-generators-judges/)
- **Next**: [Conclusion — look at the pipeline before upgrading the model](/en/posts/korean-rag-bench-final-analysis/)

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Dataset",
  "name": "Korean RAG Cartesian Sweep — 384 pipeline combinations",
  "description": "Full Cartesian sweep of 384 Korean RAG pipelines (8 pre-retrievers × 6 retrievers × 8 rerankers, fixed GPT-5.4, 576,000 generation + judge calls). Judge-best: query2doc + Hybrid 7:3 + jina-reranker-m0 (judge 4.067 / accuracy 0.827). MRR-best: multi_query_para + Hybrid 5:5 + jina-reranker-m0 (MRR 0.7874 / Hit@1 75.0%). Component interaction makes stacked single-axis winners suboptimal.",
  "url": "https://baem1n.dev/en/posts/korean-rag-bench-cartesian/",
  "sameAs": "https://github.com/BAEM1N/RAG-Evaluation",
  "isBasedOn": "https://huggingface.co/datasets/allganize/RAG-Evaluation-Dataset-KO",
  "creator": {
    "@type": "Person",
    "name": "배기민 (BAEM1N)",
    "url": "https://baem1n.dev/en/about/",
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
