---
author: baem1n
pubDatetime: 2026-04-27T12:01:00.000Z
title: "Q2 — 34 API LLM answers judged by 8 local OSS judges"
description: "OpenAI 4 + Anthropic 6 + Google 5 + OpenRouter 19 = 34 API LLM RAG answers cross-checked by 8 local OSS judges. 263/272 cells (96.7%) complete. Result: OSS-only judge ensemble correlates r ≈ 0.97 with API judge median for the best Korean-tuned local LLMs."
tags:
  - rag
  - llm-judge
  - evaluation
  - korean-nlp
featured: false
draft: false
aiAssisted: true
---

## Summary

- **Goal**: Replace API judge cost with **OSS-only ($0)** while preserving ranking quality.
- **Scale**: 8 judges × 34 candidates × 4 metric × 300 Q = **326,400 judge calls**.
- **Status**: **263/272 cells (96.7%) complete**. solar-100b 21/34 still running (severity outlier, excluded from analysis).
- **Key finding**: `qwen3.5-27b-claude-distill` correlates **r ≈ 0.97** with API judge median, at $0 cost.

## Judge severity (across 34 API candidates)

OSS judges differ widely in how lenient they are.

| Judge | mean acc | severity |
| --- | ---:| --- |
| **solar-open-100b** | **0.870** (n=22) | too lenient — outlier |
| qwen3.6-35b-a3b | 0.788 | lenient |
| nemotron-120b | 0.731 | mild |
| supergemma4-26b | 0.701 | mild |
| qwen3.5_35b-a3b-q4_K_M | 0.684 | average |
| qwen3.5_122b-a10b-q4_K_M | 0.680 | average |
| qwen3.5-27b-claude-distill | 0.619 | strict, **near API median** ⭐ |
| gemma4_31b | 0.606 | strict |
| **qwen3-next-80b** | **0.482** | **strictest** |

→ **0.39 severity gap** (solar 0.87 ↔ qwen3-next 0.48). Use ≥3 judge ensemble or severity normalization.

## OSS judge correlation with API judges

| OSS judge | r vs API judge median | Cost (full Q2 run) |
| --- | ---:| ---:|
| **qwen3.5-27b-claude-distill** | **0.97** ⭐ | $0 |
| qwen3.5_122b-a10b-q4_K_M | 0.92 | $0 |
| nemotron-120b | 0.85 | $0 |
| qwen3.6-35b-a3b | 0.85 | $0 |
| supergemma4-26b | 0.82 | $0 |
| gemma4_31b | 0.74 | $0 |
| qwen3-next-80b | 0.71 | $0 |
| solar-open-100b | 0.65 (severity outlier) | $0 |

→ `qwen3.5-27b-claude-distill` (27B model) yields **near-identical ranking** to API judge ensemble at zero cost.

## Top 12 cand (8 OSS judge avg)

| Rank | Cand | OSS avg | Type |
| ---:| --- | ---:| --- |
| 1 | gpt-5.4-pro | 0.732 | API |
| 2 | gpt-5.4 | 0.728 | API |
| 3 | x-ai/grok-4.20 | 0.722 | API |
| 4 | claude-sonnet-4-6 | 0.713 | API |
| 5 | gpt-5.4-mini | 0.710 | API |
| 6 | claude-opus-4-7 | 0.708 | API |
| 7 | moonshotai/kimi-k2.5 | 0.704 | API |
| 8 | gemini-3-pro-preview | 0.696 | API |
| 9 | gemini-3.1-pro-preview-thinking | 0.692 | API |
| 10 | claude-sonnet-4-6-thinking | 0.690 | API |
| 11 | claude-opus-4-7-thinking | 0.685 | API |
| 12 | deepseek/deepseek-v4-pro | 0.682 | API |

→ Top 12 from OSS judges **closely match Q4 (API judge) ranking** — RRF score within ±2-3%.

## Q2 vs Q4 ranking diff

| Diff | Meaning |
| --- | --- |
| 32/34 cand within ±2 ranks | OSS judges produce nearly the same ranking as API judges |
| `claude-haiku-4-5` Q4=#30 → Q2=#28 | OSS judges slightly more lenient (severity diff) |

→ For repeated A/B tests or CI/CD, **OSS-only ensemble is sufficient**.

## Cost / time tradeoff

```
Q4 (API × API):   ~$280 per full eval (8 judge × 34 cand × 4 metric × 300 Q)
Q2 (OSS × API):   $0 (electricity + time only)
Time:
  Q4: ~2-3 days (batch API)
  Q2: ~6.5 days (slowest path = solar-100b)
```

→ OSS path is slower per-run, but the **$0 marginal cost** wins for repeated evaluations.

## Next

- Solar-100b 21 cand finishing → 100% matrix.
- Combined Q1+Q2+Q3+Q4 leaderboard: see [4-Quadrant summary](/posts/en/rag-llm-judge-summary-4quadrant-matrix/).
- Detailed judge correlations: see [Correlation analysis](/posts/en/rag-llm-judge-correlation-analysis/).

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
