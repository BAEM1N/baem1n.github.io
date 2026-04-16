---
author: baem1n
pubDatetime: 2026-04-05T09:00:00.000+09:00
modDatetime: 2026-04-16T18:00:00.000+09:00
title: "Qwen3.5 Cross-Platform Benchmark: 4 Hardware Targets × 5 Engines Compared"
description: "Apples-to-apples Qwen3.5 numbers across Mac M5 Max, RTX 3090×2, DGX Spark, and Ryzen AI MAX 395+. Cold prefill, cache disabled, randomized run order."
tags:
  - llm
  - benchmark
  - nvidia
  - apple-silicon
  - amd
  - cross-platform
featured: false
aiAssisted: true
---

> **TL;DR**: Holding the model and weights constant across four hardware targets, RTX 3090×2 wins on raw throughput (139 tok/s on 35B MoE), and the Mac M5 Max delivers the most stable TTFT. The MoE 35B-A3B beats 9B Dense **on every platform**. vLLM with GPTQ-Marlin hits 156 tok/s — the top number in the entire run.

> For the experiment design, see [Part 1: Methodology](/en/posts/llm-bench-01-methodology).
>
> **Data basis**: 1 warmup + 5 measured runs per combination, median reported, CV<0.3 filter, outliers and duplicates removed. Raw CSVs: [baem1n/llm-bench](https://github.com/baem1n/llm-bench/tree/main/results/consolidated).

## Table of contents

## Hardware specs

| | M5 Max (128GB) | 3090×2 (48GB VRAM) | DGX Spark GB10 (128GB) | Ryzen AI MAX 395 (96GB) |
|--|:--:|:--:|:--:|:--:|
| GPU | Apple GPU 40C | RTX 3090 ×2 | GB10 Blackwell | Radeon 8060S 40CU |
| Memory | 128GB unified | 128GB DDR4 + 48GB VRAM | 128GB unified | 128GB (96GB VRAM) |
| Bandwidth | **546 GB/s** | ~936 GB/s GDDR6X | 273 GB/s | 256 GB/s |

---

## Track B: hardware comparison

> The only variable is **hardware**. Same [llama.cpp](https://github.com/ggml-org/llama.cpp), same [unsloth](https://huggingface.co/unsloth) GGUF, same settings.

### Generation speed (gen-512, median tok/s)

**Q4_K_M:**

| Model | M5 Max | 3090×2 | DGX Spark | Ryzen AI |
|------|:------:|:-------:|:------:|:-------:|
| **9B** Dense | 75.9 | **117.6** | 36.8 | 32.6 |
| **27B** Dense | 24.8 | **41.4** | 11.5 | 10.3 |
| **35B-A3B** MoE | 94.1 | **138.9** | 59.6 | 58.0 |
| **122B-A10B** MoE | 42.9 | **130.7** | 21.7 | 22.9 |

**Q8_0:**

| Model | M5 Max | 3090×2 | DGX Spark | Ryzen AI |
|------|:------:|:-------:|:------:|:-------:|
| **9B** | 50.8 | **82.2** | 24.3 | 21.7 |
| **27B** | 16.9 | **27.5** | 7.6 | 7.1 |
| **35B-A3B** | 88.4 | **130.3** | 52.6 | 50.8 |

### Is MoE (35B-A3B) really faster than 9B Dense?

Yes — **on every platform** the 35B-A3B MoE (3B active) beats 9B Dense:

| Platform | 9B Dense | 35B-A3B MoE | MoE advantage |
|--------|----------|-------------|---------|
| M5 Max | 75.9 | **94.1** | +24% |
| 3090×2 | 117.6 | **138.9** | +18% |
| DGX Spark | 36.8 | **59.6** | +62% |
| Ryzen AI | 32.6 | **58.0** | +78% |

---

## Which engine is fastest on each hardware?

> ⚠️ **Compare within a platform only.** Different engines on different platforms are not directly comparable.

### M5 Max: how much faster is MLX than llama.cpp? (gen-512, Q4_K_M)

| Model | MLX | llama.cpp | MLX advantage |
|------|----:|----------:|---------:|
| 9B | **103.2** | 75.4 | +37% |
| 27B | **28.8** | — | — |
| 35B-A3B | **139.0** | 91.0 | +53% |
| 122B | **66.8** | 38.5 | +73% |

### RTX 3090×2: does vLLM GPTQ-Marlin beat llama.cpp? (gen-512, Q4_K_M)

| Model | vLLM | llama.cpp | Ollama |
|------|-----:|----------:|-------:|
| 9B | 83.6 | **117.3** | 100.5 |
| 27B | 19.3 | **41.5** | 36.7 |
| 35B-A3B | **156.3** | 138.7 | 101.7 |

- **vLLM 35B GPTQ-Marlin = 156.3 tok/s** — the fastest number recorded in the entire benchmark.

### DGX Spark: llama.cpp vs Ollama vs vLLM Docker (gen-512, Q4_K_M)

| Model | llama.cpp | Ollama | vLLM Docker |
|------|----------:|-------:|------------:|
| 9B | **35.7** | 35.1 | 12.9 |
| 27B | **11.5** | 11.4 | 8.5 |
| 35B-A3B | **61.2** | 59.2 | 34.8 |
| 122B | **22.0** | 6.6 | — |

### Ryzen AI: llama.cpp vs Ollama (gen-512, Q4_K_M)

| Model | llama.cpp | Ollama |
|------|----------:|-------:|
| 9B | **36.2** | 31.9 |
| 27B | **12.3** | 11.1 |
| 35B-A3B | **58.4** | 43.9 |
| 122B | **22.8** | 4.6 |

---

## Key findings

1. **3090×2 wins on raw throughput** — GDDR6X at 936 GB/s carries it. 122B MoE at 131 tok/s.
2. **Mac M5 Max is the best daily driver** — stable 120ms TTFT. MLX pushes 35B to 139 tok/s.
3. **vLLM GPTQ-Marlin owns the top line** — 35B MoE at 156.3 tok/s (+12% over llama.cpp).
4. **DGX Spark is bandwidth-bound** — 273 GB/s is half of the Mac's 546.
5. **Ryzen AI runs 122B** — 22.9 tok/s on a mini PC in the $2,000 range.
6. **MoE efficiency is universal** — 35B-A3B (3B active) beats 9B Dense by +18–78% on every platform.

---

## OOM and failures

| Platform | Combination | Reason |
|--------|------|------|
| 3090×2 | 122B llama.cpp prefill | 48GB + 256K KV overflows |
| 3090×2 | vLLM 27B/35B Q8 BF16 | VRAM overflow |
| 3090×2 | Ollama 27B Q8, 122B | swap (5 tok/s) |
| DGX Spark | vLLM pip | CUDA 13/12 mismatch → fixed via Docker |
| Ryzen AI | Ollama 122B | swap (4.6 tok/s) |

---

## Data

Each combination: 1 warmup + 5 measured runs, median reported. Outliers and duplicates removed, CV<0.3 filter. Model: [Qwen3.5](https://huggingface.co/collections/Qwen/qwen35), quantization: [unsloth](https://huggingface.co/unsloth) GGUF.

| Platform | Device CSV |
|--------|:----------:|
| M5 Max (macbook-m-series) | [mac.csv](https://github.com/baem1n/llm-bench/blob/main/results/consolidated/mac.csv) |
| RTX 3090×2 (linux-3090x2) | [linux-3090x2.csv](https://github.com/baem1n/llm-bench/blob/main/results/consolidated/linux-3090x2.csv) |
| DGX Spark GB10 | [dgx-spark.csv](https://github.com/baem1n/llm-bench/blob/main/results/consolidated/dgx-spark.csv) |
| Ryzen AI MAX 395+ | [ryzen-ai.csv](https://github.com/baem1n/llm-bench/blob/main/results/consolidated/ryzen-ai.csv) |
| **All devices** | [all_devices.csv](https://github.com/baem1n/llm-bench/blob/main/results/consolidated/all_devices.csv) |

> Experiment code + raw data: [baem1n/llm-bench](https://github.com/baem1n/llm-bench)

---

> Code: [baem1n/llm-bench](https://github.com/baem1n/llm-bench) | Methodology: [Part 1](/en/posts/llm-bench-01-methodology)
