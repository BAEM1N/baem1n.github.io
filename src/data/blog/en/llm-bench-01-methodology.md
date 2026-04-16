---
author: baem1n
pubDatetime: 2026-04-05T09:00:00.000+09:00
modDatetime: 2026-04-16T18:00:00.000+09:00
title: "Local LLM Inference Benchmark: Experimental Design Across 4 Hardware Platforms and 5 Engines"
description: "Methodology, experimental design, and gotchas for a cross-platform benchmark measuring Qwen3.5 on M5 Max, RTX 3090×2, DGX Spark, and Ryzen AI MAX 395+."
tags:
  - llm
  - benchmark
  - apple-silicon
  - nvidia
  - amd
  - methodology
featured: false
aiAssisted: true
articleType: TechArticle
proficiencyLevel: Expert
dependencies: "Python 3.11+, uv, llama.cpp, MLX, Ollama, vLLM, Lemonade"
---

> **TL;DR**: Track B pins the engine, weights, and settings to isolate pure hardware differences across four machines. Track A flips that around and compares engines within a single platform. The design blocks every common trap — prompt cache pollution, prefix reuse, context policy drift, and execution-order bias.

## Table of contents

## Why run this experiment

"How fast can I run Qwen3.5-35B on a MacBook?" — answering that honestly takes a surprisingly careful experiment.

It seems like you should just spin up `llama-server` and measure tokens/sec. In practice:

- **prompt cache** can inflate prefill numbers by 10x or more
- **what TTFT means varies by backend**, so naive comparison is meaningless
- **different weight formats** (GGUF vs MLX) turn an engine comparison into an engine+weights-package comparison
- **context window size** affects gen_tps through KV cache occupancy

This post shares a benchmark design that identifies and blocks every one of these traps.

---

## Four hardware platforms

| ID | Machine | Memory | GPU/Accelerator | Notes |
|----|---------|--------|-----------------|-------|
| `macbook-m-series` | MacBook Pro 14 (M5 Max) | 128GB unified | Apple GPU (40 cores) | 546 GB/s bandwidth |
| `linux-5950x-3090x2` | Ryzen 9 5950X + RTX 3090 ×2 | 128GB DDR4 + 48GB VRAM | CUDA (Ampere) | Discrete GPU, PCIe |
| `dgx-spark` | NVIDIA DGX Spark (GB10) | 128GB unified | Blackwell GPU | 273 GB/s, CUDA 13 |
| `ryzen-ai-max-395` | HP Z2 Mini G1a (Strix Halo) | 128GB unified (96GB VRAM) | Radeon 8060S (Vulkan/ROCm) | iGPU, 256 GB/s |

All four machines carry 128GB of memory, enough to run even the 122B MoE model.

---

## Models

| Model | Architecture | Total params | Active params | Context |
|-------|--------------|--------------|---------------|---------|
| Qwen3.5-9B | Dense | 9B | 9B | 256K |
| Qwen3.5-27B | Dense | 27B | 27B | 256K |
| Qwen3.5-35B-A3B | MoE | 35B | ~3B | 256K |
| Qwen3.5-122B-A10B | MoE | 122B | ~10B | 256K |

Quantization: Q4_K_M (4-bit) and Q8_0 (8-bit), all unsloth GGUF.

---

## Two tracks

### Track B — Hardware comparison

> Variable: **hardware only**. Engine, weights, and settings all pinned.

| Item | Value |
|------|-------|
| Engine | llama.cpp (identical version) |
| Weights | unsloth GGUF (Q4_K_M, Q8_0) |
| Settings | flash_attn=on, batch=512, ubatch=512, no-cache-prompt |
| Context | Model native (256K) — record as failure on OOM |

This is the track that answers "running the same model on a Mac, how many times slower is it than a DGX?"

### Track A — Engine comparison (within a platform)

> Variable: **engine only**. Hardware pinned.

Every available backend on each platform:

| Platform | Backends |
|----------|----------|
| Mac | llama.cpp, Ollama, MLX |
| 3090 | llama.cpp, Ollama, vLLM |
| DGX Spark | llama.cpp, Ollama, vLLM |
| Ryzen AI | llama.cpp, Ollama, Lemonade |

**Interpretation scope**: Track A is strictly a **within-platform comparison**. Putting the MLX numbers from the Mac next to the vLLM numbers from Linux and calling it an "engine comparison" is not valid.

---

## Measurement tracks

### Generation — output throughput

| Track ID | Input | Output |
|----------|-------|--------|
| gen-512 | 64 tok | 512 tok |
| gen-2048 | 64 tok | 2,048 tok |
| gen-4096 | 64 tok | 4,096 tok |
| gen-8192 | 64 tok | 8,192 tok |

### Prefill — input processing throughput

| Track ID | Input | Output |
|----------|-------|--------|
| prefill-1k | 1,024 tok | 10 tok |
| prefill-4k | 4,096 tok | 10 tok |
| prefill-16k | 16,384 tok | 10 tok |
| prefill-64k | 65,536 tok | 10 tok |
| prefill-128k | 131,072 tok | 10 tok |

---

## Experimental integrity

### 1. Fully disable prompt cache

llama.cpp's `--cache-prompt` (on by default) and `--slot-prompt-similarity` (default 0.10) wreck prefill numbers.

In an early run, llama.cpp 128K prefill showed TTFT of 0.21s and prefill_tps of 574,324 tok/s. That wasn't prefill — it was **KV cache reuse** performance.

**How to kill it**:

```
--no-cache-prompt              # disable prompt KV cache
--slot-prompt-similarity 0     # disable prefix reuse
```

vLLM: `--no-enable-prefix-caching`
SGLang: `--disable-radix-cache`

### 2. Regenerate the prompt per run (nonce prefix)

Each measurement run gets a fresh random nonce injected at the head of the prompt:

```
[run:8eovt3an7ge9lbtj96n55f57reqz92gd] The history of computing...
```

This guarantees:
- warmup and measurement see different prompts
- consecutive runs within a track see different prompts
- no prefix sharing across tracks

### 3. Cold prefill (server restart)

The server process is restarted between prefill tracks. That fully resets KV cache, CUDA context, and allocator state from the previous track.

### 4. Enforce native context

Use the model's native context window (Qwen3.5: 256K) as-is. On OOM, don't shrink — record it as a failure. That's how you get an honest answer to "can this hardware actually run 27B with a 256K context?"

### 5. Randomize execution order

Backend, model, and track order are all shuffled per run. Fixed order introduces bias from thermals, allocator state, and cache warmth.

### 6. Log OOM and failures

Model load failures, context overflows, server crashes — everything lands in CSV as `skip:load_fail`, `skip:ctx_exceeded`, or `failed`. Knowing which combinations fail is as informative as the ones that succeed.

---

## Measurement protocol

| Item | Value |
|------|-------|
| Warmup | 1 run (separate prompt, excluded from results) |
| Measurement | 5 runs, median aggregation |
| Inter-run wait | 5s |
| Inter-track wait | 60s |
| Inter-model wait | 120s |
| Inter-backend wait | 60s |
| Thermal guard | 60s cooldown above 85°C |

### Key metrics

- **Gen TPS**: generation tokens/sec, from after TTFT through the last token.
- **TTFT**: time to first token (ms), measured client-side.
- **Prefill TPS**: `input_tokens / (TTFT_seconds)`, unified client-side definition.
- **Hit Rate**: `output_tokens / max_tokens`, generation completion rate.

---

## Known limitations

1. **Weight format differences**: In Track A, MLX (mlx 4-bit) and llama.cpp (GGUF Q4_K_M) are at the same nominal quantization level but have different implementations. This is closer to an engine+weights-package comparison than a pure engine comparison.

2. **Ollama's structural TTFT disadvantage**: Ollama pre-allocates the full context, so KV cache allocation time lands inside TTFT. At 256K context, that overhead runs into tens of seconds.

3. **Approximate input token counts**: We target exact tokenizer-based counts, but fall back to a character-count approximation (3.8 chars/token) if the tokenizer fails to load.

4. **Output quality not validated**: `hit_rate` is a length-completion metric, not a quality metric. Repetition and loops score well on hit_rate too.

---

## Next

[Part 2: Performance results across 4 platforms and 5 engines](/en/posts/llm-bench-02-results-analysis) digs into the actual measurement data.

---

## Code and data

The full benchmark code and raw CSVs are open source:

- **Code**: [baem1n/llm-bench](https://github.com/baem1n/llm-bench)
- **Runner**: `src/runner.py` (orchestrator, v3)
- **Raw CSV (consolidated per device)**: [results/consolidated/](https://github.com/baem1n/llm-bench/tree/main/results/consolidated)
- **Reproduce**: `uv run python -m src.runner --config config.yaml`
