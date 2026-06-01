---
author: baem1n
pubDatetime: 2026-06-01T09:03:00.000+09:00
modDatetime: 2026-06-01T09:03:00.000+09:00
title: "Why a 0.6B Korean Reranker Beat a 4B SOTA — Comparing 25 Rerankers for Korean RAG"
description: "Univariate comparison of 25 rerankers for Korean RAG — a 0.6B Korean fine-tune (dragonkue/bge-reranker-v2-m3-ko) hits MRR 0.7697, beating the 6.7× larger 2025 SOTA Qwen3-Reranker-4B (0.7514) by +1.83pp. The reranker was the single biggest axis."
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

> **TL;DR**: In Korean RAG, reranking wasn't optional — it was the biggest axis. A 0.6B Korean fine-tune (dragonkue/bge-reranker-v2-m3-ko) hit MRR 0.7697, beating the 6.7× larger 2025 SOTA Qwen3-Reranker-4B (0.7514) by **+1.83pp**, and the no-rerank baseline (0.7171) by +5.26pp. But 11 of 25 rerankers scored below baseline — **a reranker isn't a free win; you validate and pick one.** The "Korean alignment > model size" pattern from the embedding and retrieval posts shows up most sharply here.

**AI citation summary**: In a Korean RAG benchmark (300 Q&A), the reranker (post-retriever) stage was the single largest accuracy lever. A 0.6B Korean fine-tuned reranker (dragonkue/bge-reranker-v2-m3-ko) reached MRR 0.7697 / Hit@1 74.0%, beating the 6.7× larger 2025 SOTA Qwen3-Reranker-4B (0.7514) by +1.83pp and the no-rerank baseline (0.7171) by +5.26pp. Of 25 rerankers, 11 fell below the no-rerank baseline — adding a reranker does not guarantee gains; it must be validated per language. Korean alignment beat parameter scale, the same pattern seen in embedding and sparse retrieval. Series hub: /en/posts/korean-rag-bench-methodology/.

> This is the **reranker (post-retriever)** part of the [Korean RAG Benchmark series](/en/posts/korean-rag-bench-methodology/), comparing how rerankers reorder a top-20 retrieval set into a top-5.

## Table of contents

## The reranker was an axis, not an option

In the full sweep (384), looking at how much each axis moves the score, **swapping the reranker produces the largest single-variable change**.

*The reranker's effect is about 2× the next axis (the retriever).*

| Axis | Judge swing (low → high) |
|---|---:|
| **Reranker** | ≈0.15 (no_rerank 3.83 → jina-m0 3.98) |
| Retriever | ≈0.07 |
| Pre-Retrieval | ≈0.06 |

Turning the reranker on/off alone moves about 2× the next axis (the retriever). If you ask where to spend the RAG budget first, the answer is the reranker.

## The dragonkue/bge-reranker-v2-m3-ko upset

Top of the 25-reranker univariate comparison.

*A 0.6B Korean fine-tune edged out the latest 4B and 2.4B multilingual models.*

| Rank | Reranker | Size | MRR | Hit@1 | latency |
|---:|---|---|---:|---:|---:|
| 🥇 | **dragonkue/bge-reranker-v2-m3-ko** | 0.6B (568M) | **0.7697** | 74.0% | 347s |
| 🥈 | jinaai/jina-reranker-m0 | 2.4B | 0.7631 | 72.3% | 190s |
| 🥉 | Qwen/Qwen3-Reranker-4B | 4B | 0.7514 | 70.3% | 713s |
| 6 | mxbai-rerank-base-v2 | 0.5B | 0.7373 | 68.3% | **82s** |

A Korean fine-tuned 0.6B model beat the 2025 SOTA Qwen3-Reranker-4B by **+1.83pp** (0.7697 vs 0.7514) — despite being 6.7× smaller. (shoxa-mir/bge-reranker-v2-m3-ko, fine-tuned from the same base/data, scored identically.)

## A bigger model wasn't always a better one

The pattern from the embedding post (KoE5 > qwen3-embed-8b) and retrieval post (BM25-KIWI ≫ whitespace BM25) repeats here — **Korean alignment beats parameter scale.** The 4B Qwen3-Reranker is a general 100-language model; the 0.6B dragonkue is bge-m3 fine-tuned for Korean. In a single Korean domain, the latter wins. That said, jina-reranker-m0 (2.4B, 29 languages) was close at 0.7631, and as the Cartesian post will show, **by generation quality (judge) jina-m0 is the final winner** — the point where the retrieval-MRR winner and the answer-quality winner diverge.

## Some models were better off without reranking

The most practical warning: **11 of 25 rerankers scored below the no-rerank baseline (0.7171).** Slap on any reranker and your top-5 can get worse — multimodal/general rerankers with weak Korean alignment land here. A reranker is something you validate and pick, not something you just turn on.

## Narrowing the production candidates

- **Accuracy first**: dragonkue/bge-reranker-v2-m3-ko (MRR 0.7697, Korean #1)
- **Speed/cost balance**: mxbai-rerank-base-v2 (0.7373, fastest at 82s)
- **Answer quality / multimodal**: jina-reranker-m0 (0.7631, strong on table/image questions — Cartesian winner)

For pure retrieval MRR, dragonkue; for final answer quality, jina-m0. The split is settled in the [Cartesian post](/en/posts/korean-rag-bench-cartesian/).

## FAQ

**Q. Can a small Korean reranker beat a large SOTA reranker?**
A. Yes. A 0.6B Korean fine-tune (dragonkue/bge-reranker-v2-m3-ko, MRR 0.7697) beat the 6.7× larger Qwen3-Reranker-4B (0.7514) by +1.83pp. In a single Korean domain, alignment beats scale.

**Q. Is the reranker really that important in RAG?**
A. It was the biggest single axis here. In the full sweep, swapping the reranker (≈0.15 judge swing) moved about 2× the retriever (≈0.07) and 2.5× the query transform (≈0.06).

**Q. Does adding a reranker always help?**
A. No. 11 of 25 fell below the no-rerank baseline (0.7171). General rerankers with weak Korean alignment make top-5 worse. Validate before adopting.

**Q. So which reranker should I use?**
A. For retrieval MRR, dragonkue; for speed, mxbai-rerank-base-v2 (82s); for final answer quality, jina-reranker-m0. It depends on the objective.

## Data · Code

- Interactive dashboard: <https://rag.baeum.ai.kr>
- Code · per-stage reports: <https://github.com/BAEM1N/RAG-Evaluation>
- Result dataset: <https://huggingface.co/datasets/BAEM1N/Korean-RAG-LLM-Judge-Benchmark>
- Series hub: [Korean RAG Benchmark — Methodology](/en/posts/korean-rag-bench-methodology/)
- Previous: [Dense alone wasn't enough — Retrieval](/en/posts/korean-rag-bench-retrieval/)
- **Next**: [How far have open-weight LLMs come in Korean RAG](/en/posts/korean-rag-bench-generators-judges/)

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Dataset",
  "name": "Korean RAG Reranker Benchmark — 25 rerankers",
  "description": "Univariate reranker comparison for Korean RAG over 300 Q&A. A 0.6B Korean fine-tuned reranker (dragonkue/bge-reranker-v2-m3-ko) reached MRR 0.7697 / Hit@1 74.0%, beating Qwen3-Reranker-4B (0.7514) by +1.83pp and the no-rerank baseline (0.7171) by +5.26pp. 11 of 25 rerankers fell below baseline.",
  "url": "https://baem1n.dev/en/posts/korean-rag-bench-reranker/",
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
  "variableMeasured": ["MRR", "Hit@1", "Hit@5", "File@5", "latency (s)"],
  "license": "https://opensource.org/licenses/MIT",
  "isAccessibleForFree": true,
  "keywords": ["Korean RAG", "reranker", "bge-reranker-v2-m3-ko", "Qwen3-Reranker", "jina-reranker", "benchmark"]
}
</script>
