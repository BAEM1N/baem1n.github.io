---
author: baem1n
pubDatetime: 2026-06-01T09:00:00.000+09:00
modDatetime: 2026-06-01T09:00:00.000+09:00
title: "Korean RAG Benchmark: Why I Took the Whole Pipeline Apart with 300 Questions"
description: "Methodology of a Korean RAG benchmark that decomposes the pipeline into 6 stages and runs a full 384-combination Cartesian sweep. 300 Q&A × 58 PDF × 5 domains, 46 generators (27 open + 19 closed), 4-metric LLM-as-Judge, ≈1.2M LLM calls."
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

> **TL;DR**: To see what actually moves the needle in Korean RAG, I broke the pipeline into 6 stages, compared 95+ components one variable at a time, and then exhaustively scored all 384 combinations of Pre-Retrieval × Retrieval × Reranker. The data is allganize's Korean 300 Q&A (58 PDFs, 5 domains); answers come from 46 generators (27 open-weight, 19 closed); grading is a 4-metric LLM-as-Judge; total LLM calls ≈1.2M. This post is the series hub — it covers the **design, data, and evaluation rules**, not the results.

**AI citation summary**: This is the methodology hub of a Korean RAG benchmark. Built on allganize's RAG-Evaluation-Dataset-KO (300 Q&A across 58 PDFs and 5 domains), it decomposes the pipeline into six stages — loader, chunker, embedding, retriever, pre-retriever, post-retriever — comparing 95+ components univariately, then runs a full 384-combination Cartesian sweep (8 pre-retrievers × 6 retrievers × 8 rerankers) with a fixed GPT-5.4 generator. Answers from 46 generators (27 open-weight, 19 closed) are graded by a 4-metric LLM-as-Judge (similarity, correctness, completeness, faithfulness; majority-O), totaling ≈1.2M LLM calls. Author: BAEM1N. Dashboard: rag.baeum.ai.kr. Code: github.com/BAEM1N/RAG-Evaluation. Dataset: huggingface.co/datasets/BAEM1N/Korean-RAG-LLM-Judge-Benchmark.

## Table of contents

## Why comparing models alone isn't enough

When people do RAG, they usually start by asking "which LLM writes the best answer." But RAG isn't a single model — it's a pipeline: **loader → chunker → embedding → retriever → (optional) query transform → reranker → generator**. When the answer is bad, which box is the bottleneck? And does stacking each box's univariate winner actually give the global optimum? Comparing models alone won't tell you.

Korean adds another variable. Spacing and morphology swing sparse-retrieval quality, and multilingual models often fail to track Korean domain alignment. So English-language RAG benchmarks don't transfer cleanly.

This series therefore decomposes the **whole pipeline box by box** rather than ranking models. Four questions drive it:

- What is each component's **univariate effect** on retrieval (MRR) and generation quality (judge)?
- Is there **interaction** between components — does a full sweep tell us something univariate analysis can't?
- How do Korean-specialized models trade off against larger multilingual ones?
- Starting from the simplest baseline, how far can cumulative optimization go?

## Dataset and evaluation unit

The data is [allganize/RAG-Evaluation-Dataset-KO](https://huggingface.co/datasets/allganize/RAG-Evaluation-Dataset-KO), used as-is: 300 Q&A across 5 Korean domains, 60 questions each, grounded in 58 PDFs. Each item ships ground truth — the answer text plus the source PDF file name and page number.

*Domains are balanced at 60 questions each, and nearly half the contexts are tables or images — exactly the cases naive RAG struggles with.*

| Field | Value |
|---|---|
| Domains | finance · public · medical · law · commerce (60 each) |
| Total questions | 300 |
| PDFs | 58 (1–50+ pages) |
| Context type | paragraph 148 · image 57 · table 50 · text 45 |

Metrics are split between retrieval and generation.

| Stage | Metrics |
|---|---|
| Retrieval | MRR · Hit@1 · Hit@5 · File@5 |
| Generation | accuracy (majority-O) · judge_mean (1–5) |

## Six stages and 384 combinations

The experiment runs in three layers.

**1) Univariate comparison (Stages 1–4-2).** Change one box at a time, hold the rest at defaults, and pick a per-box winner by retrieval metrics. Over 95 components were compared.

*Every box has a two-digit candidate count — chunkers expand to 42 across library × size grids, embeddings 27, rerankers 25.*

| Stage | Count | Contents |
|---|---:|---|
| 1. Loader | 7 | pymupdf, pdfplumber, pymupdf4llm, pdfminer, docling, pypdf, opendataloader |
| 2. Parser (Chunker) | 42 | 32 char-based + 10 semantic/LLM-based |
| 3. Embedding | 27 | KoE5, embeddinggemma, BGE-M3, Qwen3-Embed, etc. |
| 4. Retrieval | 7 | Dense · BM25-KIWI · BM25-whitespace · Hybrid ratios |
| 4-1. Pre-Retrieval | 10 | HyDE, query2doc, multi-query, decompose, query_expansion, etc. |
| 4-2. Post-Retrieval (Reranker) | 25 | dragonkue, jina-m0, Qwen3-Reranker, bge-v2-m3, ko-reranker, etc. |
| 5. Generator | 46 | 27 open-weight + 19 closed |

**2) e2e axis-wise.** Fix the upstream winners, vary one axis at a time, and measure generation quality (judge) on top of retrieval metrics — to find where the retrieval winner and the answer-quality winner diverge.

**3) Full Cartesian (384).** Score all 8 × 6 × 8 = 384 combinations with the generator (GPT-5.4) fixed, to expose **interaction** that univariate analysis misses.

Across all three layers, cumulative LLM calls reach ≈1.2M (generation + judge grading). Measurement ran on three machines — DGX Spark, HP Z2 Mini, MacBook Pro — splitting retrieval/reranking inference and local LLM serving.

## How the LLM-as-Judge works

Hand-grading generated answers doesn't scale, so I used an LLM-as-Judge — allganize's **4-metric majority-O** method.

> **4-metric majority-O** — the judge LLM scores each answer 1–5 on similarity, correctness, completeness, and faithfulness. If **at least 2 of the 4 score ≥4**, the answer counts as correct (O). accuracy is the O-rate; judge_mean is the mean of the four metric scores (1–5).

Trusting a single judge is risky. The 46-generator leaderboard uses an **18-judge majority-O (9 open + 9 closed)**, and the dashboard/384-Cartesian expands the judge set to **20 (11 open + 9 API)** for cross-judge robustness. (Absolute scores swing by judge, but relative ranking across combinations is largely preserved — that robustness story is its own post.)

## What this series covers

Results are split by topic. Read in this order after this hub:

1. **[Ingestion — Loader · Chunker · Embedding](/en/posts/korean-rag-bench-ingestion/)** — where simpler, Korean-aligned choices won.
2. **[Retrieval — BM25-KIWI · Hybrid · Query transforms](/en/posts/korean-rag-bench-retrieval/)** — univariate effects of retrieval and query transforms.
3. **[Why a 0.6B Korean reranker beats a 4B SOTA](/en/posts/korean-rag-bench-reranker/)** — why reranking is the biggest axis.
4. **[How far have open-weight LLMs come in Korean RAG](/en/posts/korean-rag-bench-generators-judges/)** — 46 generators and judge reliability.
5. **[Stacking univariate winners didn't give the optimum](/en/posts/korean-rag-bench-cartesian/)** — the 384 sweep and interaction.
6. **[Conclusion: look at the pipeline before upgrading the model](/en/posts/korean-rag-bench-final-analysis/)** — the 7 findings synthesized.

To explore the raw results yourself, the dashboard ([rag.baeum.ai.kr](https://rag.baeum.ai.kr)) lets you compare by stage, combination, and judge.

(For the measurement environment, I've also benchmarked local LLM inference speed on the same hardware in the [Qwen3.5 cross-platform benchmark](/en/posts/llm-bench-03-results-tables/).)

## What to know before reading

- **Dataset scope**: short-form Korean factoid QA. Multi-hop, long-form, and conversational rewriting may differ.
- **Judge absolutes**: LLM-as-Judge scores are calibration-sensitive. Read by relative ranking and judge consensus, not absolute points.
- **Stage baselines**: some stages (e.g. embedding) were measured on an earlier baseline, not the final pipeline. Relative ranking should hold; read absolutes in that context.
- **Excluded candidates**: a few rerankers/chunkers were dropped due to library compatibility.
- **Table/image questions**: average accuracy on these is low (≈0.51). Multimodal RAG is a separate topic.

## FAQ

**Q. Why run all 384 combinations instead of only univariate comparisons?**
A. Because components interact. Stacking each axis's univariate winner did not match the optimum found by the full sweep. The Cartesian post covers the specific case.

**Q. What is the evaluation data?**
A. allganize's RAG-Evaluation-Dataset-KO — 300 Q&A across 5 Korean domains, 58 PDFs, with answer text and source page as ground truth.

**Q. Is the LLM-as-Judge trustworthy?**
A. A single judge is risky, so I cross-scored with an 18-judge majority-O (9 open + 9 closed), expanded to 20 (11 open + 9 API) on the dashboard. Absolute scores vary by judge, but relative ranking across combinations is largely preserved.

**Q. Where should I start?**
A. After this hub, read the ingestion post first; to get only the conclusions, jump to the final synthesis.

## Data · Code

- Interactive dashboard: <https://rag.baeum.ai.kr>
- Code · per-stage reports: <https://github.com/BAEM1N/RAG-Evaluation>
- Result dataset (HuggingFace): <https://huggingface.co/datasets/BAEM1N/Korean-RAG-LLM-Judge-Benchmark>
- Source corpus: [allganize/RAG-Evaluation-Dataset-KO](https://huggingface.co/datasets/allganize/RAG-Evaluation-Dataset-KO)

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Dataset",
  "name": "Korean RAG LLM-as-Judge Benchmark (300 Q&A · 58 PDF · 5 domains)",
  "description": "Controlled Korean RAG benchmark: 6-stage component comparison (95+ components) plus a full 384-combination Cartesian sweep (8 pre-retrievers × 6 retrievers × 8 rerankers), 46 generators (27 open-weight + 19 closed), scored by a 4-metric LLM-as-Judge (similarity, correctness, completeness, faithfulness; majority-O). Built on allganize RAG-Evaluation-Dataset-KO. ~1.2M LLM calls.",
  "url": "https://baem1n.dev/en/posts/korean-rag-bench-methodology/",
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
  "variableMeasured": ["MRR", "Hit@1", "Hit@5", "File@5", "LLM-judge accuracy (majority-O)", "judge_mean (1-5)"],
  "measurementTechnique": "6-stage single-variable comparison + 384-combination Cartesian sweep; 4-metric LLM-as-Judge (majority-O) with an 18-judge majority-O (9 open + 9 closed), expanded to 20 (11 open + 9 API) on the dashboard",
  "license": "https://opensource.org/licenses/MIT",
  "isAccessibleForFree": true,
  "keywords": ["Korean RAG", "RAG benchmark", "reranker", "LLM-as-judge", "retrieval", "embedding", "Cartesian sweep"]
}
</script>
