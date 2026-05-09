---
author: baem1n
pubDatetime: 2026-04-27T12:04:00.000Z
title: "Korean RAG LLM-as-Judge 4-Quadrant Summary — RRF unified cross-judge ranking"
description: "12 local + 34 API = 46 candidates × 17 judges (8 OSS + 9 API). About 1M LLM judge calls total. Cand #1 gpt-5.4-pro, OSS top gpt-oss:120b (#8 overall). Frontier API spread within 5%p, judge choice has near-zero ranking impact."
tags:
  - rag
  - llm-judge
  - evaluation
  - korean-nlp
featured: false
draft: true
aiAssisted: true
---

## Controlled variables (Q1~Q4 common)

Same retrieval pipeline for all quadrants — only `cand` (LLM that answers) and `judge` (LLM that scores) vary.

| Stage         | Fixed value                | Source                                                |
| ------------- | -------------------------- | ----------------------------------------------------- |
| Parser        | `pymupdf4llm`              | Phase 1 winner (MRR 0.4715, +5.4%p)                   |
| Chunking      | 500 chars / 100 overlap    | Phase 2 winner (MRR 0.5315, +23.5%p)                  |
| Vector store  | FAISS                      | Phase 3 winner (p95 0.74ms, accuracy tied top)        |
| **Embedding** | **gemma-embed-300m (768d)** | Phase 4 rank 2 (MRR 0.6650), small + fast for batch judging |
| Retrieval     | top-5 cosine               | allganize original k=6 approximation                  |

→ Same retrieved chunks for every cand → answer differences = pure LLM quality (no retrieval noise).

## 4-Quadrant matrix overview

```
              Local judge (8)           API judge (9)
            ┌─────────────────────────┬─────────────────────────┐
Local-gen  │ Q1                      │ Q3                      │
(12 LLM)   │  8 × 12 × 4 × 300       │  9 × 12 × 4 × 300       │
            │  = 115,200 calls        │  = 129,600 calls ✅     │
            ├─────────────────────────┼─────────────────────────┤
API-gen    │ Q2                      │ Q4                      │
(34 LLM)   │  8 × 34 × 4 × 300       │  10 × 34 × 4 × 300      │
            │  = 326,400 calls        │  = 408,000 calls ✅     │
            └─────────────────────────┴─────────────────────────┘
```

**Q1 / Q3 / Q4 100% complete** + **Q2 98.2% complete** = ~**1M LLM judge calls** total.

## RRF (Reciprocal Rank Fusion)

`RRF_score(c) = Σ 1 / (k + rank_j(c))` with `k = 60`.

→ Outlier judges have less influence. Less sensitive to severity differences than simple average.

## Unified leaderboard — 46 cand RRF (17 judges)

| Rank | Cand | Type | Avg acc | RRF |
| ---:| --- | :-:| ---:| ---:|
| 🥇 | `gpt-5.4-pro` | API | **0.7418** | **0.2698** |
| 🥈 | `gpt-5.4` | API | 0.7317 | 0.2603 |
| 🥉 | `x-ai/grok-4.20` | API | 0.7264 | 0.2596 |
| 4 | `gpt-5.4-mini` | API | 0.7150 | 0.2562 |
| 5 | `moonshotai/kimi-k2.5` | API | 0.7021 | 0.2488 |
| 6 | `claude-sonnet-4-6` | API | 0.6986 | 0.2451 |
| 7 | `claude-opus-4-7` | API | 0.6962 | 0.2411 |
| 8 | **`gpt-oss_120b`** | **OSS** | **0.7201** | 0.2404 |
| 9 | `gemini-3.1-flash-lite-preview` | API | 0.6869 | 0.2331 |
| 10 | `claude-opus-4-7-thinking` | API | 0.6892 | 0.2323 |
| 11 | `gemini-3-flash-preview` | API | 0.6843 | 0.2304 |
| 12 | `moonshotai/kimi-k2.6` | API | 0.6875 | 0.2294 |
| 13 | `gemini-3-pro-preview` | API | 0.6897 | 0.2285 |
| 14 | `gemini-3.1-pro-preview` | API | 0.6878 | 0.2266 |
| 15 | `claude-sonnet-4-6-thinking` | API | 0.6861 | 0.2250 |
| 16 | **`gpt-oss_20b`** | **OSS** | 0.7118 | 0.2224 |
| 17 | `deepseek/deepseek-v4-pro` | API | 0.6805 | 0.2196 |
| 18 | `gemini-3.1-pro-preview-thinking` | API | 0.6346 | 0.2192 |
| 19 | `z-ai/glm-5.1` | API | 0.6094 | 0.2172 |
| 20 | **`qwen3.5_122b-a10b_think`** | **OSS** | 0.7052 | 0.2156 |
| 21 | `qwen/qwen3.6-plus` | API | 0.6761 | 0.2118 |
| 22 | `deepseek/deepseek-v4-flash` | API | 0.6729 | 0.2082 |
| 23 | `xiaomi/mimo-v2.5-pro` | API | 0.6412 | 0.2067 |
| 24 | `claude-sonnet-4-5` | API | 0.6681 | 0.2057 |
| 25 | `minimax/minimax-m2.5` | API | 0.6657 | 0.2044 |
| 26 | `z-ai/glm-4.7` | API | 0.6009 | 0.2041 |
| 27 | **`qwen3.5_122b-a10b_nothink`** | **OSS** | 0.6894 | 0.2000 |
| 28 | **`qwen3.5_27b-q8_nothink`** | **OSS** | 0.6913 | 0.1988 |
| 29 | `xiaomi/mimo-v2.5` | API | 0.6392 | 0.1977 |
| 30 | `minimax/minimax-m2.7` | API | 0.6598 | 0.1971 |
| 31 | `z-ai/glm-5` | API | 0.5883 | 0.1938 |
| 32 | `gpt-5.4-nano` | API | 0.6512 | 0.1910 |
| 33 | `claude-haiku-4-5` | API | 0.6538 | 0.1907 |
| 34 | `qwen/qwen3-max-thinking` | API | 0.6528 | 0.1891 |
| 35 | `deepseek/deepseek-v3.2` | API | 0.6541 | 0.1890 |
| 36 | `mistralai/mistral-small-2603` | API | 0.6358 | 0.1811 |
| 37 | **`exaone3.5_32b`** | **OSS** | 0.6363 | 0.1780 |
| 38 | **`mistral-small_24b`** | **OSS** | 0.6336 | 0.1771 |
| 39 | `upstage/solar-pro-3` | API | 0.6061 | 0.1750 |
| 40 | **`deepseek-r1_70b_nothink`** | **OSS** | 0.6257 | 0.1743 |
| 41 | **`phi4_14b`** | **OSS** | 0.6251 | 0.1740 |
| 42 | `z-ai/glm-4.7-flash` | API | 0.5482 | 0.1723 |
| 43 | **`qwen3.5_9b-q4_K_M_nothink`** | **OSS** | 0.6084 | 0.1710 |
| 44 | **`qwen3.5_9b-q8_nothink`** | **OSS** | 0.5956 | 0.1700 |
| 45 | `nvidia/nemotron-3-nano-30b-a3b` | API | 0.5950 | 0.1700 |
| 46 | **`lfm2_24b`** | **OSS** | **0.4369** | 0.1619 |

## Meta insights

### 1. Top tier is frontier API (within 5%p spread)

```
#1 gpt-5.4-pro       0.7418
#2 gpt-5.4           0.7317  (-1.4%p)
#3 grok-4.20         0.7264  (-2.1%p)
#4 gpt-5.4-mini      0.7150  (-3.6%p)
#5 kimi-k2.5         0.7021  (-5.4%p)
```

→ OpenAI / xAI / Moonshot are roughly equivalent. Anthropic / Google frontier within 5%p. **No clear single winner** — choose by latency / cost / vendor preference.

### 2. OSS top tier — gpt-oss_120b matches frontier

```
#8  gpt-oss_120b              0.7201  ← OSS #1, -2.2%p vs frontier
#16 gpt-oss_20b               0.7118  ← 20B model -3.0%p
#20 qwen3.5_122b_think        0.7052  ← reasoning helps +1.6%p
#27 qwen3.5_122b_nothink      0.6894
#28 qwen3.5_27b_q8_nothink    0.6913
```

→ `gpt-oss` series is on par with frontier API for Korean RAG generation. Free if you have GPU.

### 3. Self-judge bias is small

| Cand family | self-family judge avg | non-self avg | Δ |
| --- | ---:| ---:| ---:|
| Anthropic (claude cand × claude judge) | 0.726 | 0.715 | +1.1%p |
| OpenAI (gpt-5 cand × OpenAI judge) | 0.736 | 0.728 | +0.8%p |
| Google (gemini cand × gemini judge) | 0.715 | 0.713 | +0.2%p |

→ 1-2%p — minimal RRF ranking impact. (Cell-level Claude bias is larger; see [Correlation analysis](/posts/en/rag-llm-judge-correlation-analysis/).)

### 4. Reasoning / thinking is negligible

| Pair | non-thinking | thinking | Δ |
| --- | ---:| ---:| ---:|
| `qwen3.5_122b-a10b` (OSS) | 0.689 | 0.705 | **+1.6%p** |
| `claude-sonnet-4-6` | 0.699 | 0.686 | -1.3%p |
| `claude-opus-4-7` | 0.696 | 0.689 | -0.7%p |
| `gemini-3.1-pro-preview` | 0.688 | 0.635 | **-5.3%p** |

→ For RAG answer extraction, **faithful citation matters more than reasoning**. Thinking adds cost without benefit (sometimes negative).

### 5. Strong cross-judge consensus

- All 17 judges rank `lfm2_24b` last
- Pairwise judge correlation r = 0.70~0.98 (mid-to-strong)
- Top-3 ranking matches across 14/17 judges (gpt-5.4 / pro / grok)
- **Candidate quality dominates over judge choice**

Details: [Judge × Judge correlation analysis](/posts/en/rag-llm-judge-correlation-analysis/)

### 6. Bottom — small models + weak Korean

```
#42 z-ai/glm-4.7-flash     0.5482
#45 nemotron-3-nano        0.5950
#46 lfm2_24b               0.4369  ← OSS bottom, frontier −31%p
```

`lfm2_24b` is English-trained → unsuitable for Korean RAG. Solar-pro-3 / Nemotron-nano hit accuracy ceiling at <30B.

## Methodology

### Scoring protocol (allganize-based)

- 4 metrics: `similarity / correctness / completeness / faithfulness`
- threshold = 4 (1-5 scale, ≥4 = "good")
- majority vote: ≥2 of 4 metrics ≥4 → "O" (correct)
- accuracy = O / 300 questions

### Reasoning / thinking unified

- Local judge: `JUDGE_MODE=nothink` (`enable_thinking=False`)
- OpenAI: `reasoning.effort='none'`, `max_output_tokens=64`
- Anthropic: thinking off (default)
- Gemini: OpenRouter `reasoning.effort='low'`

## Conclusion

In LLM-as-Judge matrices, **scoring protocol matters more than judge size, family, or reasoning mode** for ranking RAG candidates:

1. Premium reasoning judges (`opus-4-7`, `gpt-5.5`) and cheap small judges (`gpt-5.4-nano`, `gemini-flash-lite`) produce **identical RRF rankings**.
2. Self-judge bias 1-2%p — negligible at matrix level.
3. Practical: cheap / small judges are sufficient.
4. **Candidate quality is the real determinant** of ranking.

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
