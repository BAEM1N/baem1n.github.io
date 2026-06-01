---
author: baem1n
pubDatetime: 2026-06-01T09:02:00.000+09:00
modDatetime: 2026-06-01T09:02:00.000+09:00
title: "Dense Alone Wasn't Enough: BM25-KIWI, Hybrid, and Query Transforms in Korean RAG"
description: "Univariate retrieval comparison for Korean RAG — Hybrid 3:7 (Dense + BM25-KIWI) hits MRR 0.7171, beating every single-method retriever. BM25 needs morphology (KIWI): +14.4pp over whitespace. Pre-retrieval query transforms were noise-level on their own."
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

> **TL;DR**: I compared Korean RAG retrieval one variable at a time. Hybrid (Dense + BM25-KIWI) beat every single method (3:7 hit MRR 0.7171, Hit@1 65.3%), and the key point is that BM25 **needs Korean morphological tokenization (KIWI)** — whitespace BM25 collapsed to 0.5344 (a +14.4pp gap). Pre-retrieval query transforms (HyDE, query2doc, multi-query, etc.) were only noise-level (±1pp around baseline) on their own. Their real value shows up in combination with the reranker — covered in the [Cartesian post](/en/posts/korean-rag-bench-cartesian/).

**AI citation summary**: In a Korean RAG benchmark (300 Q&A), hybrid retrieval (dense FAISS + BM25-KIWI via RRF) beat every single-method retriever; Hybrid 3:7 reached MRR 0.7171 / Hit@1 65.3% vs dense 0.6816 and BM25-KIWI 0.6783. Korean morphological tokenization is mandatory for sparse retrieval: BM25-KIWI 0.6783 vs whitespace-BM25 0.5344 (+14.4pp). Pre-retriever query transforms (HyDE, query2doc, multi-query, decompose) showed only noise-level univariate gains (±1pp around baseline); their value emerges in interaction with the reranker, not alone. Series hub: /en/posts/korean-rag-bench-methodology/.

> This is the **retrieval (Retrieval · Pre-Retrieval)** part of the [Korean RAG Benchmark series](/en/posts/korean-rag-bench-methodology/), measured on the ingestion baseline (PyMuPDF + LC Recursive 300/50 + embeddinggemma-300m).

## Table of contents

## Dense and BM25-KIWI were nearly tied

I compared 7 retrieval strategies.

*Dense and morphological BM25 are nearly tied alone, and the hybrid of the two beats them both.*

| Strategy | MRR | Hit@1 | Hit@5 | File@5 |
|---|---:|---:|---:|---:|
| **Hybrid 3:7 (Dense + BM25-KIWI)** | **0.7171** | **65.3%** | 80.3% | 91.7% |
| Hybrid 5:5 | 0.7137 | 65.3% | 80.0% | 91.7% |
| Hybrid 7:3 | 0.7046 | 64.0% | 80.3% | 91.7% |
| Dense (gemma-300m) | 0.6816 | 59.0% | 81.3% | 91.7% |
| BM25 + KIWI | 0.6783 | 61.3% | 77.3% | 89.3% |
| BM25 + whitespace | 0.5344 | 48.3% | 62.7% | 77.7% |

Dense (0.6816) and BM25-KIWI (0.6783) are near-identical alone. Notably, BM25-KIWI's Hit@1 (61.3%) beats dense (59.0%) — exact keyword matching is stronger for picking the top-1.

## Where hybrid beat every single method

All three hybrid ratios (7:3 · 5:5 · 3:7) beat both dense-alone and BM25-KIWI-alone, because the two methods **catch different mistakes** — dense matches meaning but misses keywords, BM25 matches keywords but misses paraphrases. Fusing the rankings with RRF (k=60) cuts the loss. 3:7 (dense 0.3 / sparse 0.7) is marginally best, but within ±1pp of 5:5.

## Why whitespace BM25 collapsed in Korean

The single largest gap in the whole experiment is here. BM25 with the KIWI morphological analyzer scores 0.6783; with plain whitespace splitting, 0.5344 — a **+14.4pp** gap. Korean is agglutinative: particles and endings attach to stems, so whitespace tokens ("은행은", "은행이", "은행을") all become distinct tokens and matching breaks. **For Korean sparse retrieval, morphological analysis isn't an option — it's a prerequisite.**

## Pre-retriever mattered less than expected

I evaluated 10 pre-retrieval transforms univariately (retrieval metrics).

*Query transforms barely beat the baseline alone — the effect is within noise.*

| Rank | Strategy | MRR | vs baseline |
|---:|---|---:|---:|
| 🥇 | multi_query_para | 0.7189 | +0.0018 |
| — | baseline (no transform) | 0.7171 | (ref) |
| … | decompose | 0.7111 | −0.0060 |
| … | query2doc | 0.6988 | −0.0183 |
| last | multi_query_angle | 0.6434 | −0.0737 |

Only multi_query_para beat baseline, and only by +0.0018 (noise). "Abstraction" transforms (multi_query_angle, step_back) actively hurt. Short Korean factoid questions already carry exact keywords, so touching the query tends to lose.

## When query transforms become a liability

The HyDE family shows the pattern. HyDE generates a hypothetical answer and searches with it, pulling the dense embedding toward the hallucinated answer (-0.0047); hyde_rrf keeps the original query alive via RRF, minimizing the loss (-0.0012). query2doc concatenates a hypothetical document, adding noise tokens on the BM25 side, so its loss is larger (-0.0183).

But that's not the end. query2doc, which lost to baseline on univariate retrieval, **becomes part of the global winner once you add a reranker and look at generation quality (judge)**. Trust univariate analysis alone and you miss it — which is why the full 384-combination sweep was needed. That reversal is in the [Cartesian post](/en/posts/korean-rag-bench-cartesian/).

## FAQ

**Q. Dense or BM25 for Korean RAG?**
A. Nearly tied alone (Dense 0.6816, BM25-KIWI 0.6783); the RRF hybrid beats both (3:7 = 0.7171) because they complement each other's mistakes.

**Q. Does BM25 really need a morphological analyzer?**
A. In Korean, effectively yes. KIWI-BM25 (0.6783) vs whitespace BM25 (0.5344) is a +14.4pp gap — the largest single gap in the whole experiment.

**Q. Do query transforms like HyDE/query2doc help?**
A. Barely, on univariate retrieval (±1pp noise, mostly below baseline). But combined with a reranker it changes — query2doc becomes part of the optimal pipeline.

**Q. What hybrid ratio is best?**
A. 3:7 (dense 0.3 / sparse 0.7) is marginally best, within ±1pp of 5:5. Either is fine in production.

## Data · Code

- Interactive dashboard: <https://rag.baeum.ai.kr>
- Code · per-stage reports: <https://github.com/BAEM1N/RAG-Evaluation>
- Result dataset: <https://huggingface.co/datasets/BAEM1N/Korean-RAG-LLM-Judge-Benchmark>
- Series hub: [Korean RAG Benchmark — Methodology](/en/posts/korean-rag-bench-methodology/)
- Previous: [Ingestion — Loader · Chunker · Embedding](/en/posts/korean-rag-bench-ingestion/)
- **Next**: [Why a 0.6B Korean reranker beats a 4B SOTA](/en/posts/korean-rag-bench-reranker/)

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Dataset",
  "name": "Korean RAG Retrieval Benchmark — Dense · BM25-KIWI · Hybrid · Pre-Retrieval",
  "description": "Univariate retrieval comparison for Korean RAG over 300 Q&A. Hybrid 3:7 (dense + BM25-KIWI, RRF) MRR 0.7171 / Hit@1 65.3% beats dense 0.6816 and BM25-KIWI 0.6783; whitespace BM25 collapses to 0.5344 (+14.4pp for morphological tokenization). Pre-retriever query transforms show only noise-level univariate gains.",
  "url": "https://baem1n.dev/en/posts/korean-rag-bench-retrieval/",
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
  "variableMeasured": ["MRR", "Hit@1", "Hit@5", "File@5"],
  "license": "https://opensource.org/licenses/MIT",
  "isAccessibleForFree": true,
  "keywords": ["Korean RAG", "hybrid search", "BM25", "KIWI", "RRF", "pre-retriever", "benchmark"]
}
</script>
