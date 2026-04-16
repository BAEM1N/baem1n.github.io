---
author: baem1n
pubDatetime: 2026-04-16T01:00:00.000Z
title: "21 Korean RAG Embeddings Benchmarked — Why a 300M Model Beat 8B"
description: "MRR, Hit@k, NDCG, and failure mode analysis across 21 open GGUF embeddings on the allganize Korean 300 Q&A dataset. google/gemma-embed-300m wins at MRR 0.6682."
tags:
  - rag
  - embedding
  - benchmark
  - korean-nlp
  - llm
featured: true
aiAssisted: true
---

> **TL;DR**: 21 open GGUF embeddings on the allganize Korean 300 Q&A. The winner is **google/gemma-embed-300m (MRR 0.6682, 314MB)** — 7B–27B dense models landed in the bottom half. Law is the most embedding-sensitive domain; image-based questions fail across every embedding. 50 "hard" questions (16.7%) can't be rescued by any embedding — that's a retrieval ceiling no model can break.

## Table of contents

## Experiment setup

- **Data**: [allganize/RAG-Evaluation-Dataset-KO](https://huggingface.co/datasets/allganize/RAG-Evaluation-Dataset-KO) — 300 Q&A × 58 PDFs × 5 domains
- **Parser**: pymupdf4llm (markdown conversion)
- **Chunking**: 500 chars / overlap 100 (3,166 chunks total)
- **Vector store**: FAISS (in-memory, cosine)
- **Top-k**: 5
- **Input truncation**: 500 chars (to fit llama.cpp's 512-token cap)
- **Metrics**: MRR, NDCG@5, Hit@1/5 (page-level), File Hit@5 (file-level)

Full experiment design in [RAG Benchmark Experiment Design](/en/posts/rag-evaluation-experiment-design).

## Full ranking (sorted by MRR)

| Rank | Model | dim | Size | MRR | Hit@1 | Hit@5 | File@5 | Fail% |
|----|------|-----|------|-----|-------|-------|--------|-------|
| **1** | **google/gemma-embed-300m** | 768 | 314MB | **0.6682** | **58.3%** | **79.3%** | **92.0%** | 20.7% |
| 2 | jinaai/jina-v4-retrieval | 4096 | 3.1GB | 0.6489 | 55.3% | 79.0% | 91.7% | 21.0% |
| 3 | Snowflake/arctic-embed-l-v2 | 1024 | 606MB | 0.6489 | 58.7% | 73.3% | 89.7% | 26.6% |
| 4 | nomic-ai/nomic-embed-v2-moe | 768 | 489MB | 0.6484 | 57.0% | 75.3% | 90.0% | 24.7% |
| 5 | nlpai-lab/KURE-v1 | 1024 | 606MB | 0.6412 | 56.0% | 75.0% | 91.0% | 25.0% |
| 6 | ibm-granite/granite-278m | 768 | 290MB | 0.5973 | 50.3% | 72.3% | 87.3% | 27.7% |
| 7 | Qwen/Qwen3-Embedding-4B | 4096 | 4.0GB | 0.5862 | 49.0% | 72.7% | 90.3% | 27.4% |
| 8 | intfloat/multilingual-e5-large-instruct | 1024 | 576MB | 0.5853 | 50.0% | 71.0% | 91.0% | 29.0% |
| 9 | jinaai/jina-v4-code | 4096 | 3.1GB | 0.5442 | 43.7% | 69.0% | 88.3% | 31.0% |
| 10 | BAAI/bge-m3 | 1024 | 606MB | 0.5745 | 48.7% | 68.3% | 89.7% | 31.6% |
| 11 | Qwen/Qwen3-Embedding-0.6B | 1024 | 610MB | 0.5621 | 47.0% | 66.7% | 87.3% | 33.4% |
| 12 | Microsoft/harrier-oss-270m | 1024 | 279MB | 0.5594 | 47.0% | 67.3% | 88.3% | 32.7% |
| 13 | Microsoft/harrier-oss-0.6b | 1024 | 610MB | 0.5266 | 41.7% | 66.7% | 87.0% | 33.3% |
| 14 | **Qwen/Qwen3-Embedding-8B** | 4096 | **7.5GB** | 0.5325 | 45.0% | 65.0% | 86.7% | 35.0% |
| 15 | ibm-granite/granite-107m | 768 | 116MB | 0.4806 | 38.3% | 61.0% | 82.7% | 39.0% |
| 16 | NVIDIA/nemotron-embed-8b | 4096 | 7.5GB | 0.4640 | 36.0% | 60.3% | 88.0% | 39.7% |
| 17 | jinaai/v5-small-retrieval | 1024 | 610MB | 0.3868 | 31.0% | 48.0% | 74.7% | 52.0% |
| 18 | jinaai/jina-code-1.5b | 1024 | 1.6GB | 0.3288 | 22.7% | 47.0% | 82.3% | 53.0% |
| 19 | jinaai/v5-nano-matching | 512 | 223MB | 0.1821 | 12.7% | 25.0% | 61.3% | 75.0% |
| 20 | google/LaBSE | 768 | 492MB | 0.0468 | 2.7% | 8.0% | 27.0% | 92.0% |
| 21 | Microsoft/harrier-oss-27b | 4096 | **27GB** | 0.0044 | 0.0% | 1.0% | 11.3% | 99.0% |

### Three key observations

1. **Top 5 are all small (300MB–606MB)**. qwen3-embed-8b (7.5GB) is #14.
2. **Korean-specific (kure-v1) vs multilingual (gemma-300m)**: gemma wins slightly. Retrieval-tuned general model beats a Korean-specific one here.
3. **Bigger ≠ better**: harrier-oss-27b (27GB) is effectively broken with MRR 0.004 — likely a GGUF quantization issue.

## Why 300M beat 8B

Two likely causes.

### 1. The 512-token truncation

llama.cpp server caps inputs at 512 tokens. At 500-char truncation, Korean text is ~350 tokens. **With short inputs, model capacity stops mattering** — large models' advantage (long context, fine semantics) doesn't kick in.

### 2. Training objective matters more than size

| Model | Training focus | Result |
|-------|----------------|--------|
| gemma-embed-300m | Retrieval-specific (Google) | MRR 0.6682 (1st) |
| qwen3-embed-8b | General MTEB | MRR 0.5325 (14th) |
| kure-v1 | Korean-specific (AI-Lab) | MRR 0.6412 (5th) |

**Models trained specifically for retrieval win at RAG.** MTEB averages across many tasks and doesn't translate directly.

## Failure mode analysis

We classify failures into three bins:

- **file_miss**: target file not even in top-10 (worst)
- **page_miss**: right file, wrong page (fixable with more recall)
- **rank_low**: target at rank 6–10 (fixable by larger top-k)

| Embedding | File Miss | Page Miss | Total Fail |
|-----------|-----------|-----------|-----------|
| gemma-embed-300m | 8.0% | 12.7% | 20.7% |
| jina-v4-retrieval | 8.3% | 12.7% | 21.0% |
| kure-v1 | 9.0% | 16.0% | 25.0% |
| qwen3-embed-8b | 13.3% | 21.7% | 35.0% |
| labse | **73.0%** | 19.0% | 92.0% |
| harrier-27b | **88.7%** | 10.3% | 99.0% |

labse fails structurally at the file level (shallow Korean representation across 109 languages). harrier-27b is essentially random output.

## Domain heatmap (top 5 embeddings)

| Model | commerce | finance | law | medical | public | Avg |
|-------|----------|---------|-----|---------|--------|-----|
| gemma-embed-300m | 0.789 | 0.564 | 0.657 | 0.699 | 0.632 | 0.668 |
| jina-v4-retrieval | 0.781 | 0.477 | 0.595 | 0.685 | 0.666 | 0.641 |
| snowflake-arctic-l-v2 | 0.764 | 0.577 | 0.663 | 0.603 | 0.641 | 0.650 |
| nomic-embed-v2-moe | 0.773 | 0.545 | 0.647 | 0.628 | 0.650 | 0.649 |
| kure-v1 | 0.716 | 0.555 | 0.605 | 0.690 | 0.640 | 0.641 |

- **Finance is hardest**: everyone drops below average. Lots of numbers, tables, charts.
- **Commerce is easiest**: mostly natural-language explanations.

## Context type

| Model | paragraph | table | text | image |
|-------|-----------|-------|------|-------|
| gemma-embed-300m | 0.737 | 0.667 | 0.720 | **0.486** |
| jina-v4-retrieval | 0.700 | 0.656 | 0.686 | **0.474** |
| kure-v1 | 0.717 | 0.617 | 0.687 | **0.464** |

**Image-type questions fail universally (MRR ≤ 0.5)**. Text embeddings can't query image content — needs vision embedding + OCR captioning upstream.

## Question difficulty clustering

300 questions grouped by how many embeddings (out of 21) retrieved the right chunk.

| Cluster | Questions | Share | Interpretation |
|---------|-----------|-------|----------------|
| **Universal** (18+/21 hit) | 86 | 28.7% | Retrieval works everywhere → clean sample for LLM comparison |
| **Divergent** (3–17/21) | 164 | 54.7% | Embedding choice matters → highest experimental value |
| **Hard** (0–2/21) | **50** | **16.7%** | No embedding rescues them → retrieval ceiling |

### Hard 50 distribution

- **Domain**: finance 20, public 12, law 8, commerce 7, medical 3
- **Context type**: **image 26 (52%)**, paragraph 17, table 4, text 3

**52% of hard questions are image-context**. Image-grounded questions can't be solved by current text RAG — a hard upper bound, not a model problem.

## Consensus-based pseudo-GT

If we aggregate every embedding's top-1 into a majority vote, how often does the consensus match the ground truth?

| Consensus strength | Questions | GT match |
|--------------------|-----------|----------|
| Strong (15+/21 agree) | 102 | **82.4%** |
| Medium (8–14/21) | 120 | 63.3% |
| Weak (<8/21) | 78 | 23.1% |

**When many embeddings agree on the same chunk, it's the right answer 82.4% of the time.** Useful later to cut LLM-as-judge cost.

## Model efficiency (MRR / VRAM)

| Model | MRR | VRAM | MRR/VRAM |
|-------|-----|------|----------|
| **gemma-embed-300m** | 0.6682 | **0.5GB** | **1.336** |
| granite-107m | 0.4806 | 0.2GB | 2.403 |
| harrier-270m | 0.5594 | 0.3GB | 1.865 |
| granite-278m | 0.5973 | 0.5GB | 1.195 |
| kure-v1 | 0.6412 | 1.0GB | 0.641 |
| qwen3-embed-8b | 0.5325 | 9.0GB | 0.059 |
| harrier-27b | 0.0044 | 20.0GB | 0.000 |

Sub-500MB models dominate on efficiency. qwen3-embed-8b delivers ~1/22 the efficiency of gemma-embed-300m.

## Recommendations

| Scenario | Pick | Why |
|----------|------|-----|
| **Best accuracy** | gemma-embed-300m | MRR #1, 20.7% failure rate |
| **Korean-specific** | kure-v1 | MRR #5, stable on Korean |
| **Low memory (<500MB)** | granite-278m | MRR 0.597, 290MB |
| **Ultra low memory (<100MB)** | granite-107m | MRR 0.481, 116MB |
| **Korean+EN+JP multilingual** | bge-m3 | MRR 0.575, hybrid dense+sparse |

## FAQ

### Why did gemma-embed-300m beat the Korean-specialized kure-v1?

gemma-embed-300m is a 768-dim general retrieval embedding. Retrieval optimization generalized well to Korean, and its training data includes substantial Korean. The gap is MRR 0.027 (~4%) — not huge but consistent.

### Is qwen3-embed-8b at #14 really correct?

On general MTEB it's strong. In this benchmark it's hurt by:
1. 512-token input cap — nullifies long-context advantage
2. General MTEB tuning — not specifically retrieval-optimized
3. Possible Q8_0 quantization impact

### Why does harrier-27b fail 99%?

A 27GB GGUF that loads but returns near-random outputs. Either llama.cpp doesn't fully support the architecture or Q8_0 quantization destroyed the embedding quality. **Always validate large-model GGUF quantizations before deployment.**

### Why is File@5 high but MRR low?

File@5 (92%) minus Page@5 (79%) = 13% gap means "right file, wrong page". Common with legal/financial docs where similar text repeats across pages. Fix: larger top-k (5→10), add a reranker.

### Why does every model fail on image context?

All tested models are **text embeddings**. When a question references chart/graph content inside an image, we need vision embedding + OCR captioning at parse time. pymupdf4llm doesn't generate image captions today.

## Next steps

1. Experiment B: fixed embedding (gemma-embed-300m) × ~30 LLMs
2. Reranker experiments (Qwen3-Reranker, BCE, BGE)
3. Rescue the Hard-50: vision embedding + OCR preprocessing
4. RAGAS-based LLM-as-judge for answer quality

Raw JSON outputs are published under `results/phase4_embedding/` in the [GitHub repository](https://github.com/baem1n/RAG-Evaluation).
