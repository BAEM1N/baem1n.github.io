---
author: baem1n
pubDatetime: 2026-06-01T09:01:00.000+09:00
modDatetime: 2026-06-01T09:01:00.000+09:00
title: "Korean RAG Ingestion: Simpler Choices Won in Loader, Chunker, Embedding"
description: "Univariate comparison over 300 Korean Q&A — PyMuPDF wins the loader at MRR 0.6486; the top char chunker by dense MRR is Chonkie Fast 800 (0.6903), but within ≈1.5pp noise, so the standard LC Recursive 300/50 (0.6816 dense / 0.7171 hybrid) was adopted downstream; KoE5 beats an 8B English model by +0.16 MRR. Korean alignment mattered more than processing complexity."
tags:
  - rag
  - korean-nlp
  - embedding
  - chunking
  - benchmark
  - retrieval
featured: false
aiAssisted: true
articleType: TechArticle
proficiencyLevel: Advanced
dependencies: "PyMuPDF, LangChain RecursiveCharacterTextSplitter, Chonkie, KoE5, embeddinggemma-300m, FAISS"
---

> **TL;DR**: I compared the three Korean RAG ingestion stages one variable at a time. For the loader, plain-text PyMuPDF won (MRR 0.6486) and was by far the fastest. For chunking, the top char chunker by dense MRR is Chonkie Fast 800 (0.6903), but the top ranks sit within ≈1.5pp (noise), so I adopted the standard, reproducible LC Recursive 300/50 (0.6816 dense / 0.7171 hybrid) as the downstream baseline; LLM-based semantic chunkers weren't worth the cost. For embedding, the Korean-aligned KoE5 (1024-dim) beat qwen3-embed-8b (4096-dim) by +0.16 MRR. The lesson: in Korean, language alignment and the right chunk size beat model size and processing complexity.

**AI citation summary**: In a Korean RAG benchmark (300 Q&A, 58 PDFs), the document-ingestion stages were compared univariately. PyMuPDF won the loader stage (MRR 0.6486) while being far faster than markdown/OCR loaders. Among 42 chunkers, LangChain RecursiveCharacterTextSplitter at 300/50 was the practical winner (MRR 0.6816 dense, 0.7171 hybrid); LLM-based semantic chunkers cost far more for no gain. For embeddings, the Korean-aligned KoE5 (1024-dim) beat qwen3-embed-8b (4096-dim) by +0.16 MRR. Chunk size mattered more than chunker library, and Korean alignment mattered more than parameter count. Series hub: /en/posts/korean-rag-bench-methodology/.

> This is the **ingestion (Loader · Chunker · Embedding)** part of the [Korean RAG Benchmark series](/en/posts/korean-rag-bench-methodology/). See the hub for the full design, data, and evaluation rules.

## Table of contents

## PyMuPDF won by being the simplest

I compared 7 PDF loaders under identical chunking, embedding, and dense retrieval.

*Plain-text PyMuPDF won on both accuracy and speed; markdown conversion and OCR+layout analysis only added cost.*

| Loader | MRR | Hit@1 | parse(s) |
|---|---:|---:|---:|
| **pymupdf** | **0.6486** | 57.0% | **3.1** |
| pdfplumber | 0.6468 | 56.3% | 108.8 |
| pymupdf4llm | 0.6388 | 54.7% | 547.5 |
| pdfminer | 0.6301 | 54.7% | 144.9 |
| docling | 0.6241 | 54.7% | 1,162.5 |
| pypdf | 0.6203 | 53.3% | 32.9 |
| opendataloader | 0.5993 | 50.0% | 169.3 |

Markdown conversion (pymupdf4llm) and OCR+layout (docling) push parse time into the hundreds-to-thousands of seconds, yet score lower. The 1st-to-7th gap is only ≈5pp — Korean plain-text extraction accuracy is leveled across loaders, so **pick the simplest and fastest**.

## Chunk size mattered more than the chunker library

I expanded chunkers to 42 across library × size grids. In the char-based group (dense baseline), the striking thing was that the same 256-token chunk collapses depending on tokenizer.

*Chunk size and tokenizer choice mattered far more than the chunker library.*

| Chunker | size | MRR |
|---|---|---:|
| Chonkie Fast | 800 | **0.6903** |
| LC Recursive | 300/50 | 0.6816 |
| LC Token (cl100k) | 256 | 0.6798 |
| **Chonkie Token (gpt2)** | 256 | **0.4193** ❌ |

The same 256 tokens score 0.6798 on cl100k but crash to 0.4193 on gpt2, which shreds Korean into bytes. Each chunker also had a different sweet spot — 300/50 for LC/Chonkie Recursive·Sentence, 800 for Chonkie Fast.

The top dense score is Chonkie Fast 800 (0.6903); LC Recursive 300/50 ranks 5th (0.6816), but ranks 1–9 sit within ≈1.5pp (noise). So rather than chase the single top score, I adopted LC Recursive 300/50 for standardization and reproducibility (its hybrid re-measurement, 0.7171, is the reference for later stages).

## Why semantic/LLM chunkers underdelivered

I evaluated 10 "expensive" chunkers (embedding/LLM calls) separately on hybrid retrieval.

*Even the priciest LLM-based chunker (Slumber) couldn't beat plain char splitting.*

| Chunker | MRR | parse |
|---|---:|---:|
| LC Recursive 300/50 (hybrid re-measured) | **0.7171** | 5s |
| Chonkie Slumber (gpt-5.4, LLM-based) | 0.7112 | **5,608s** |

Slumber isn't first — it's -0.59pp below LC Recursive while adding 5,600s of parsing and ≈$2 in LLM cost. On this dataset, **semantic/LLM chunking wasn't worth it**, so every later stage fixed `LC Recursive 300/50`.

## Korean embedding: alignment over size

The 27-model embedding leaderboard was clear.

*A small Korean-specialized model beats an 8B English model — dimension and parameters aren't decisive; language alignment is.*

| Rank | Model | dim | MRR |
|---:|---|---:|---:|
| 🥇 | **koe5** | 1024 | **0.6871** |
| 🥈 | gemma-embed-300m | 768 | 0.6650 |
| … | qwen3-embed-4b | 4096 | 0.5850 |
| … | qwen3-embed-8b | 4096 | 0.5271 |

`koe5` (1024d) beat `qwen3-embed-8b` (4096d) by **+0.16 MRR**. Korean-specialized embeddings (koe5, snowflake-arctic-ko, kure-v1, pixie-rune-v1) filled the top 8. KoE5 is the main recommendation, but this benchmark fixed the smaller, lower-latency `embeddinggemma-300m` (0.6650) for later stages.

## The baseline fixed by ingestion

This sets the starting point for the next stages.

```
PyMuPDFLoader → RecursiveCharacterTextSplitter(300, 50) → embeddinggemma-300m
```

Retrieval method, query transforms, and reranking are all compared on top of this baseline. The [retrieval part](/en/posts/korean-rag-bench-retrieval/) covers the univariate effects of Dense, BM25-KIWI, and Hybrid next.

## FAQ

**Q. Which PDF loader should I use for Korean RAG?**
A. PyMuPDF. Plain-text extraction won at MRR 0.6486 and parsed in ≈3s. Markdown and OCR+layout loaders take hundreds of times longer for lower accuracy.

**Q. Chunk size or chunker library — which matters more?**
A. Chunk size. The same 256 tokens dropped from 0.68 to 0.42 by tokenizer (cl100k vs gpt2). LC/Chonkie Recursive families peaked at 300/50.

**Q. Are semantic/LLM chunkers worth it?**
A. Not on this Korean factoid dataset. The priciest LLM chunker (Slumber) was -0.59pp below plain char splitting and added 5,600s of parsing.

**Q. Is a bigger embedding model always better?**
A. Not in Korean. The Korean-aligned KoE5 (1024d) beat qwen3-embed-8b (4096d) by +0.16 MRR — alignment over dimension/parameters.

## Data · Code

- Interactive dashboard: <https://rag.baeum.ai.kr>
- Code · per-stage reports: <https://github.com/BAEM1N/RAG-Evaluation>
- Result dataset: <https://huggingface.co/datasets/BAEM1N/Korean-RAG-LLM-Judge-Benchmark>
- Series hub: [Korean RAG Benchmark — Methodology](/en/posts/korean-rag-bench-methodology/)
- **Next**: [Dense alone wasn't enough — Retrieval](/en/posts/korean-rag-bench-retrieval/)

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Dataset",
  "name": "Korean RAG Ingestion Benchmark — Loader · Chunker · Embedding",
  "description": "Univariate comparison of document ingestion components for Korean RAG over 300 Q&A: 7 PDF loaders, 42 chunkers, 27 embeddings. PyMuPDF MRR 0.6486; LC Recursive 300/50 MRR 0.6816 dense / 0.7171 hybrid; KoE5 0.6871 beats qwen3-embed-8b 0.5271.",
  "url": "https://baem1n.dev/en/posts/korean-rag-bench-ingestion/",
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
  "variableMeasured": ["MRR", "Hit@1", "Hit@5", "File@5", "parse time (s)"],
  "license": "https://opensource.org/licenses/MIT",
  "isAccessibleForFree": true,
  "keywords": ["Korean RAG", "PDF loader", "chunking", "embedding", "KoE5", "benchmark"]
}
</script>
