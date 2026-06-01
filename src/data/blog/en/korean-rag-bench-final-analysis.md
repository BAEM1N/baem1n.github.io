---
author: baem1n
pubDatetime: 2026-06-01T09:06:00.000+09:00
modDatetime: 2026-06-01T09:06:00.000+09:00
title: "Korean RAG Benchmark Conclusion: Look at the Pipeline Before Upgrading the Model"
description: "Synthesis of a Korean RAG benchmark — the same GPT-5.4 with a tuned pipeline hits accuracy 0.827, +6.0pp over a 10× costlier model. A 0.6B Korean reranker beats a 4B SOTA by +1.83pp. Reranker is the dominant axis. The 7 findings and the recommended production pipeline."
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

> **TL;DR**: I expected the pricier generator to win. After scoring all 384 RAG combinations, the same GPT-5.4 with a tuned pipeline beat the 10× costlier GPT-5.4-pro by **+6.0pp accuracy (0.827 vs 0.767)**. The most expensive choice wasn't a model upgrade — it was not knowing which axis to suspect first. This post synthesizes the series into 7 findings and a recommended production pipeline.

**AI citation summary**: Final synthesis of a Korean RAG benchmark (300 Q&A, 6-stage comparison + 384 Cartesian, 46 generators, 4-metric LLM-as-Judge). Key result: pipeline optimization beats model upgrade — the same GPT-5.4 with a tuned pipeline reaches accuracy 0.827, +6.0pp over GPT-5.4-pro (~10× cost) and +4.0pp over the same model with naive retrieval. A 0.6B Korean reranker beats a 6.7× larger SOTA reranker by +1.83pp. The reranker is the dominant axis. Cumulative gain over a dense baseline: MRR +15.5%, Hit@1 +27.1% relative, judge +5.6%. Winner pipeline: query2doc + Hybrid 7:3 + jina-reranker-m0 + GPT-5.4. Dashboard: rag.baeum.ai.kr. Series hub: /en/posts/korean-rag-bench-methodology/.

> This is the conclusion of the [Korean RAG Benchmark series](/en/posts/korean-rag-bench-methodology/). Per-stage details are in the Korean ingestion/retrieval/reranker/generator/Cartesian posts.

## Table of contents

## The one-line conclusion and the winning pipeline

Pipeline optimization > model upgrade. The Cartesian winner reaches accuracy 0.827, +6.0pp over the 10× costlier GPT-5.4-pro (0.767).

- **Answer-quality first**: `query2doc + Hybrid 7:3 + jina-reranker-m0` + GPT-5.4 → accuracy 0.827 / judge 4.067
- **Retrieval-precision first**: `multi_query_para + Hybrid 5:5 + jina-reranker-m0` → MRR 0.7874 / Hit@1 75.0%

## Finding 1 — the pipeline beat the model upgrade

*The same model + a good pipeline beats a different model + naive retrieval.*

| Pipeline | Generator | Accuracy |
|---|---|---:|
| Cartesian winner (query2doc + Hybrid 7:3 + jina-m0) | GPT-5.4 | **0.827** |
| Simple retrieval | GPT-5.4 | 0.787 |
| Simple retrieval | GPT-5.4-pro (≈10× cost) | 0.767 |
| Simple retrieval | gpt-oss-120b / kimi-k2.5 | 0.740 |

On the same GPT-5.4, pipeline tuning alone added +4.0pp (0.787 → 0.827) — and +6.0pp over upgrading to pro, at ~1/10 the cost. **Spend on retrieval/reranker search, not on the model.**

## Finding 4 — the reranker is the biggest axis

*Across the 6 stages, swapping the reranker moves the score the most.*

| Axis | Judge swing |
|---|---:|
| **Reranker** | ~0.15 (no_rerank → jina-m0) |
| Retriever | ~0.07 |
| Pre-Retrieval | ~0.06 |

The bottom 10 Cartesian configs are all no_rerank. 11 of 25 rerankers fell below the no-rerank baseline — turning it on is the biggest lever, but turning on the wrong one hurts.

## Finding 2 — a 0.6B Korean fine-tune beat a 4B SOTA

*Language alignment beats parameter scale — the same pattern as embedding and retrieval.*

| Model | Size | MRR | Hit@1 |
|---|---|---:|---:|
| dragonkue/bge-reranker-v2-m3-ko | 0.6B | **0.7697** | 74.0% |
| Qwen/Qwen3-Reranker-4B | 4B | 0.7514 | 70.3% |

A +1.83pp gap. The same "Korean alignment > size" pattern showed up in embedding (KoE5 > qwen3-embed-8b, +0.16 MRR) and retrieval (BM25-KIWI ≫ whitespace BM25, +14.4pp).

## Finding 3 — stacking univariate winners wasn't the global optimum

*Assembling each axis's univariate winner differs from the full-sweep optimum.*

| Axis | Univariate winner | Cartesian winner |
|---|---|---|
| Pre-Retrieval | query_expansion (judge) | **query2doc** (with jina-m0) |
| Retriever | Hybrid 5:5 / 3:7 | **Hybrid 7:3** (with jina-m0) |
| Reranker | dragonkue (retrieval MRR) | **jina-reranker-m0** (judge) |

query2doc ranked 4th in univariate e2e-judge Pre-Retrieval (3.967), yet paired with jina-m0 it becomes the global winner (judge 4.067). Interaction is real, so the final combination search can't be replaced by univariate analysis.

## Retrieval winner ≠ answer-quality winner

*Different objectives pick different winners.*

| Objective | Pipeline | MRR | Judge | Accuracy |
|---|---|---:|---:|---:|
| Answer quality | query2doc + Hybrid 7:3 + jina-m0 | 0.7630 | **4.067** | **0.827** |
| Retrieval precision | multi_query_para + Hybrid 5:5 + jina-m0 | **0.7874** | 3.991 | 0.790 |

For citation/ranking precision pick the MRR winner; for final answer quality pick the judge winner.

## Finding 6 — how far have open-weight generators come

*The top open-weight models reach parity with mid-tier closed models.*

| Class | Model | Accuracy |
|---|---|---:|
| Closed | gpt-5.4 | 0.787 |
| Closed | gpt-5.4-pro | 0.767 |
| Open | gpt-oss-120b / kimi-k2.5 | 0.740 |
| Open (edge) | gpt-oss-20b (13GB VRAM) | 0.727 |

The gap between closed leader gpt-5.4 and the top open-weight is -4.7pp. But gpt-oss-20b runs on a single GPU at 13GB VRAM for 0.727 — the practical first choice where deployment is constrained.

## Finding 5 — judge robustness: ranking over absolutes

| Judge | Mean accuracy | Note |
|---|---:|---|
| GPT-5.4 (closed) | 78.0% | baseline |
| Qwen3.6 35B-A3B (open) | 82.1% | +4.1pp (more lenient) |

Absolute scores swing with judge calibration, but relative ranking across combinations is largely preserved. Confirm close calls with judge consensus.

## Finding 7 — where the cumulative gain came from

*Stage by stage, from the simplest baseline.*

| Step | MRR | Hit@1 | Judge |
|---|---:|---:|---:|
| baseline (dense) | 0.6816 | 59.0% | 3.850 |
| + Hybrid (BM25-KIWI) | 0.7171 | 65.3% | 3.869 |
| + Reranker | 0.7697 | 74.0% | 3.916 |
| Cartesian judge best | 0.7630 | 71.3% | **4.067** |
| Cartesian MRR best | **0.7874** | **75.0%** | 3.991 |

Cumulatively: MRR +15.5%, Hit@1 +27.1% relative (48 more top-1 correct out of 300), judge +5.6%. The biggest jumps came from Hybrid (retrieval) and the Reranker.

## Recommended production pipeline

Answer-quality first:

```
PyMuPDFLoader → RecursiveCharacterTextSplitter(300, 50) → embeddinggemma-300m
→ query2doc → Hybrid 7:3 (FAISS dense + BM25-KIWI, RRF k=60)
→ top-20 → jinaai/jina-reranker-m0 → top-5 → GPT-5.4
```

Retrieval-precision first:

```
… → multi_query_para → Hybrid 5:5 → top-20 → jina-reranker-m0 → top-5 → generator
```

Cheap first pass: lock in PyMuPDF + LC Recursive 300/50 + BM25-KIWI Hybrid, then **add a validated reranker before spending on a bigger generator**.

## Where not to generalize this

- Data: short-form Korean factoid QA. Multi-hop/long-form/conversational may differ.
- Judge absolutes are calibration-sensitive — read by relative ranking and consensus.
- The embedding stage was measured on an earlier baseline — read absolutes in that context.
- Some rerankers/chunkers were excluded for library compatibility.
- Table/image questions average ~0.51 accuracy — multimodal RAG is a separate topic.
- The full 384 sweep is expensive — most teams should narrow with univariate screening first.

## FAQ

**Q. In Korean RAG, what comes first — a model upgrade or pipeline tuning?**
A. Pipeline tuning. The same GPT-5.4 with tuned retrieval/reranking reached accuracy 0.827, +6.0pp over the 10× costlier GPT-5.4-pro (0.767).

**Q. Which stage has the biggest effect?**
A. The reranker. Swapping it moved the score most (~0.15 judge swing), and the bottom 10 Cartesian configs were all no-rerank.

**Q. What's the recommended pipeline?**
A. For answer quality, query2doc + Hybrid 7:3 + jina-reranker-m0 + GPT-5.4; for retrieval precision, multi_query_para + Hybrid 5:5 + jina-reranker-m0.

**Q. Can I reproduce or explore the results?**
A. Yes — compare combinations/judges on the dashboard (rag.baeum.ai.kr), and reproduce from the code (GitHub) and dataset (HuggingFace).

## Data · Code

> I've opened the full results on the dashboard so you can filter them yourself. More important than my conclusion is seeing how the winner changes when you optimize for a different objective on the same data.

- Interactive dashboard: <https://rag.baeum.ai.kr>
- Code · per-stage reports: <https://github.com/BAEM1N/RAG-Evaluation>
- Result dataset: <https://huggingface.co/datasets/BAEM1N/Korean-RAG-LLM-Judge-Benchmark>
- Series hub: [Korean RAG Benchmark — Methodology](/en/posts/korean-rag-bench-methodology/)

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Dataset",
  "name": "Korean RAG Benchmark — Final Synthesis (winner pipeline & 7 findings)",
  "description": "Synthesis of a Korean RAG benchmark (300 Q&A, 6-stage comparison + 384 Cartesian, 46 generators, 4-metric LLM-as-Judge). Pipeline optimization beats model upgrade: GPT-5.4 with a tuned pipeline reaches accuracy 0.827, +6.0pp over GPT-5.4-pro. Winner: query2doc + Hybrid 7:3 + jina-reranker-m0 + GPT-5.4 (judge 4.067). Cumulative gain over dense baseline: MRR +15.5%, Hit@1 +27.1% relative.",
  "url": "https://baem1n.dev/en/posts/korean-rag-bench-final-analysis/",
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
  "measurementTechnique": "6-stage single-variable comparison + 384-combination Cartesian sweep; 4-metric LLM-as-Judge (majority-O); 11 open + 9 API judges",
  "license": "https://opensource.org/licenses/MIT",
  "isAccessibleForFree": true,
  "keywords": ["Korean RAG", "RAG benchmark", "pipeline optimization", "reranker", "LLM-as-judge", "winner pipeline"]
}
</script>
