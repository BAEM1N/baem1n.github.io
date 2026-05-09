---
author: baem1n
pubDatetime: 2026-04-27T12:00:00.000Z
title: "Q1 — Local LLMs as judges scoring 12 local LLM candidates (cross-validation matrix)"
description: "12 local LLM RAG answers (gemma-embed-300m, top-5) judged by 8 local LLMs. allganize 4-metric × threshold=4 × majority(≥3) → 96-entry matrix. gpt-oss:120b avg 0.7400 #1, strong cross-judge ranking consistency."
tags:
  - rag
  - llm-judge
  - evaluation
  - korean-nlp
featured: false
draft: true
aiAssisted: true
---

## Summary

- **Setup**: 12 local LLMs answer RAG questions (retrieval = `gemma-embed-300m` top-5), then 8 local LLM judges score them.
- **Protocol**: allganize 4-metric × threshold=4 × majority(≥3) → O / X.
- **Scale**: 8 judges × 12 candidates × 4 metric × 300 Q = **115,200 judge calls**.
- **Result**: `gpt-oss:120b` ranked #1 (avg 0.7400). Cross-judge ranking is nearly identical.
- **Issue**: `solar-open-100b` judge produced non-integer outputs due to chat template missing → excluded from average (later re-run).

## Top 5 candidates (avg across 8 judges)

| Cand | Avg acc | Strongest judge | Weakest judge |
| --- | ---:| --- | --- |
| `gpt-oss:120b` | 0.7400 | nemotron-120b 0.823 | qwen3-next-80b 0.640 |
| `gpt-oss:20b` | 0.7178 | qwen3.6-35b 0.797 | qwen3-next-80b 0.583 |
| `qwen3.5_122b-a10b_think` | 0.7050 | qwen3.6-35b 0.787 | qwen3-next-80b 0.583 |
| `qwen3.5_27b-q8_nothink` | 0.6913 | nemotron-120b 0.760 | qwen3-next-80b 0.567 |
| `qwen3.5_122b-a10b_nothink` | 0.6894 | qwen3.6-35b 0.760 | qwen3-next-80b 0.547 |

## Bottom 3 — Korean RAG weakness

- `qwen3.5_9b-q4_K_M_nothink`: avg 0.609
- `qwen3.5_9b-q8.0_nothink`: avg 0.596
- `lfm2_24b`: **avg 0.437** — clearly bottom across all 8 judges (English-biased model, unsuitable for Korean RAG)

## Cross-judge consensus

Top 5 ranking is **identical across 8 judges**. `lfm2_24b` is unanimously #12.

→ Judge selection has near-zero impact on candidate ranking. Cheap judges suffice for Korean RAG benchmarking.

## Judge severity

| Judge | mean acc (across cands) | severity rank |
| --- | ---:| --- |
| solar-open-100b | 0.870 | most lenient (outlier) |
| qwen3.6-35b-a3b | 0.788 | lenient |
| nemotron-120b | 0.731 | mild |
| supergemma4-26b | 0.701 | mild |
| qwen3.5_35b-a3b | 0.684 | average |
| qwen3.5_122b-a10b | 0.680 | average |
| gemma4_31b | 0.606 | strict |
| qwen3-next-80b | 0.482 | strictest |

→ **0.39 severity gap** between solar (0.87) and qwen3-next (0.48). For ranking work this matters; for trend tracking it does not.

## Dataset / runtime

- Dataset: `allganize/RAG-Evaluation-Dataset-KO` (300 Q&A × 58 PDFs).
- Retrieval: `gemma-embed-300m`, FAISS top-5.
- Judge runtime: ollama / llama.cpp (local llama-server), `JUDGE_MODE=nothink`.
- Deterministic (`temperature=0`) for all judge calls.

## Next

- Q2: API LLM answers (34 cand) × local judge (8) — see [Q2 article](/posts/en/rag-llm-judge-q2-api-llm-vs-local-judges/).
- Q3: Local cand × API flagship judges — see [Q3 article](/posts/en/rag-llm-judge-q3-flagship-api-judges/).
- Q4: API cand × API judges — see [Q4 article](/posts/en/rag-llm-judge-q4-api-self-evaluation/).

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
