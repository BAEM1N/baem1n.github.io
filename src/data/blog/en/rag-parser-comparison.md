---
author: baem1n
pubDatetime: 2026-04-19T02:30:00.000Z
title: "Korean RAG Parser Comparison — PyPDF vs pymupdf vs pymupdf4llm"
description: "Single-variable experiment on 300 Q&A comparing three PDF parsers. pymupdf4llm wins MRR 0.4715 by preserving markdown structure — +5.4% over pypdf."
tags:
  - rag
  - parser
  - pdf
  - langchain
  - korean-nlp
featured: false
draft: true
aiAssisted: true
---

> **TL;DR**: Comparing three PDF parsers (pypdf, pymupdf, pymupdf4llm) as a single variable, **pymupdf4llm wins MRR at 0.4715** by preserving markdown structure — **+5.4%** over pypdf (0.4472). Structural signals (`#`, `##`, table pipes) act as extra semantic cues for the embedder, and it produces 56% more chunks from the same documents.

## Table of contents

## Setup

Single-variable experiments on [allganize RAG-Evaluation-Dataset-KO](https://huggingface.co/datasets/allganize/RAG-Evaluation-Dataset-KO) (300 Q&A, 58 PDFs). Each phase varies exactly one component while holding everything else fixed.

| Held constant | Value |
|---------------|-------|
| Embedding | qwen3-embed-8b (4096-dim) |
| Chunking | 1,000 / 200 (baseline) |
| Top-k | 5 |
| Metrics | MRR, Hit@1/5, File Hit@5 |

Full design: [RAG Benchmark Experiment Design](/en/posts/rag-evaluation-experiment-design).

## Parser comparison

| Parser | MRR | Hit@1 | Hit@5 | File@5 | Chunks | Mode |
|--------|-----|-------|-------|--------|--------|------|
| **pymupdf4llm** | **0.4715** | 38.3% | 58.3% | 86.0% | 1,920 | Markdown (# ##, tables) |
| pymupdf | 0.4663 | 35.7% | **63.3%** | **86.3%** | 1,263 | Plain text |
| pypdf | 0.4472 | 34.3% | 60.7% | 82.7% | 1,224 | Line-based |

### Key finding

**pymupdf4llm wins on MRR** thanks to structure preservation. Markdown conversion adds `#`, `##`, and table syntax, which embeddings pick up as semantic signals. It also produces **56% more chunks** (1,920 vs 1,224) — more units to hit.

**pymupdf has higher Hit@5 (63.3%) but lower MRR (0.4663)** — it gets the right page into top-5 but not at the top rank.

```python
# pymupdf4llm pattern
import pymupdf4llm, pymupdf

doc = pymupdf.open(pdf_path)
pages = [pymupdf4llm.to_markdown(doc, pages=[i]) for i in range(len(doc))]
```

## Choice guide

| Requirement | Pick |
|-------------|------|
| Max accuracy | **pymupdf4llm** |
| Plain text only | pymupdf |
| Legacy compatibility | pypdf |

## FAQ

### Why does pymupdf4llm win MRR but lose Hit@5 to pymupdf?

Markdown structure pushes the right chunk to higher ranks (MRR ↑). But 56% more chunks means more near-duplicates inside top-5, occasionally pushing the exact target out — hence a slightly lower Hit@5.

### Why is the parser gap smaller than the chunking gap?

Parsers only change text extraction quality, but chunking changes **chunk boundaries and information density** itself. Since embeddings are computed per chunk, boundary design has a more direct effect on retrieval quality. See the [chunking comparison](/en/posts/rag-chunking-comparison) for details.

### How expensive is pymupdf4llm's markdown conversion?

Per-page `to_markdown()` calls run in tens of milliseconds. Parsing all 58 PDFs completes within seconds, so parsing cost is negligible in practice.

## Series: RAG preprocessing single-variable experiments

- (this post) Parser comparison
- [Chunking comparison](/en/posts/rag-chunking-comparison/) — largest MRR impact (+23.5%)
- [Vector store comparison](/en/posts/rag-vectorstore-comparison/) — accuracy ties, 200x latency spread

---

## Code & raw data

- **GitHub**: [github.com/BAEM1N/RAG-Evaluation](https://github.com/BAEM1N/RAG-Evaluation)
- **Phase 1 results**: [results/phase1_parser/](https://github.com/BAEM1N/RAG-Evaluation/tree/main/results/phase1_parser)
- **Runner**: [scripts/bench_all.py](https://github.com/BAEM1N/RAG-Evaluation/blob/main/scripts/bench_all.py) — single script, all phases

---

## RAG Series Index

**Phase 1-4: Retrieval optimization**

- [Experiment design](/posts/en/rag-evaluation-experiment-design/)
- [Parser comparison](/posts/en/rag-parser-comparison/) — pymupdf4llm wins (+5.4%p)
- [Chunking comparison](/posts/en/rag-chunking-comparison/) — small chunks +23.5%p (biggest MRR lever)
- [Vector store comparison](/posts/en/rag-vectorstore-comparison/) — FAISS 0.74ms (accuracy tied)
- [Embedding benchmark (27)](/posts/en/rag-embedding-benchmark-results/) — koe5 #1 (Korean-tuned)

**Phase 5: LLM-as-Judge cross-validation**

- [Q1 — Local cand × Local judge](/posts/en/rag-llm-judge-q1-local-cross-validation/)
- [Q2 — API cand × Local judge](/posts/en/rag-llm-judge-q2-api-llm-vs-local-judges/)
- [Q3 — Local cand × API judge](/posts/en/rag-llm-judge-q3-flagship-api-judges/)
- [Q4 — API cand × API judge](/posts/en/rag-llm-judge-q4-api-self-evaluation/)
- [4-Quadrant unified RRF leaderboard](/posts/en/rag-llm-judge-summary-4quadrant-matrix/) — 46 cand × 17 judge
- [Judge × Judge correlation analysis](/posts/en/rag-llm-judge-correlation-analysis/) — severity vs consensus, optimal ensemble
