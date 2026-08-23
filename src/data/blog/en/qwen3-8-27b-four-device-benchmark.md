---
author: baem1n
pubDatetime: 2026-08-23T00:00:00.000Z
title: "One Model, Four Machines — Benchmarking Qwen3.8-27B Inference"
description: "RTX 3090, Apple M5 Max, DGX Spark (GB10), and Ryzen AI Max 395 compared with a checksum-identical GGUF. CUDA came out 3.9x faster than Metal and 4.5x faster than Vulkan — and the benchmark code had to be fixed three times."
tags:
  - benchmark
  - llama-cpp
  - mlx
  - vllm
  - qwen
  - local-llm
featured: true
featuredOrder: 3
aiAssisted: true
articleType: TechArticle
proficiencyLevel: "intermediate"
---

> **TL;DR**: I ran one model, Qwen3.8-27B, on four machines. **The RTX 3090 dominates decode** (38 t/s, twice the runner-up). **GB10 wins prefill** (1,467 t/s). On Apple Silicon, **MLX beats llama.cpp Metal by 1.4–1.7x**. And I had to fix the benchmark code **three times** — trusting the first run would have led me to publish the opposite conclusion.

## Table of contents

## What you'll get from this post

- How the same model splits in **opposite directions** on prefill versus decode depending on hardware.
- Three traps that produce **plausible but false numbers** in local LLM benchmarks, and how to avoid them.
- Whether to run MLX or llama.cpp Metal on Apple Silicon, with data behind the choice.
- The real gap between unified memory (Apple / GB10 / Strix Halo) and dedicated VRAM.

## Why run this comparison

Qwen3.8-27B is a 27B dense model with an unusual architecture. Of its 64 layers, **only 16 use full attention** — the other 48 are linear attention (`full_attention_interval: 4`). That shrinks the KV cache enough that long contexts fit even on a 24GB card.

The open question was which machine to put it on. The four I had on hand belong to entirely different architecture families.

| Machine | Accelerator | Memory | Engine |
|---|---|---|---|
| Desktop | RTX 3090 (Ampere) | 24GB **dedicated VRAM** | llama.cpp CUDA |
| MacBook | Apple M5 Max | 128GB **unified** | MLX / llama.cpp Metal |
| DGX Spark | GB10 (Blackwell) | 128GB **unified** | vLLM |
| Mini workstation | Ryzen AI Max 395 (Radeon 8060S) | ~96GB **UMA** | llama.cpp Vulkan |

## How fairness was established

This is the core of the post. A "four machine comparison" turns meaningless very easily.

### The same GGUF file — verified by checksum

The RTX 3090, M5 Max, and Ryzen AI Max all ran **byte-identical files**.

```bash
sha256sum Qwen3.8-27B-UD-Q4_K_XL.gguf
# bee238bbeb3dc0a34bde4d0dedbaee1f98c009e8bb4226f03070054c12fb1372  (all three)
```

I hit a trap here. **The file on Hugging Face had been replaced.** What I downloaded on August 16 was 17,923,394,624 bytes; the same URL on August 23 gave 17,559,178,144 bytes. It had been re-quantized and re-uploaded.

Since `content-length` matches the new size, **the download looks perfectly complete.** Checking size alone won't catch it. I ended up copying directly from the original node to match checksums.

### Different quantization is disclosed as different

MLX and vLLM can't read GGUF, so those two use **different quantization schemes**.

| Stack | 4-bit method | Size |
|---|---|---|
| llama.cpp | GGUF UD-Q4_K_XL (per-layer mixed bits) | 16.69 GiB |
| MLX | uniform quantization (group size 64) | 14.0 GiB |
| vLLM | NVFP4 (native Blackwell FP4) | ~15 GiB |

Different sizes mean different memory-bandwidth load. So this comparison measures **"the speed each stack actually delivers," not "which hardware is faster."** The only pure hardware comparison is the three GGUF runs.

### The MLX model was converted from official weights

Converted builds already exist under `mlx-community` and `lmstudio-community`, but all of them are third-party conversions. I once used a third-party GGUF reranker conversion whose scores collapsed into e-14 noise and destroyed ranking entirely, so since then I stick to official or unsloth releases only.

MLX has neither, so I converted it myself.

```bash
mlx_lm.convert --hf-path Qwen/Qwen3.8-27B -q --q-bits 4 \
               --mlx-path ~/.cache/mlx-models/Qwen3.8-27B-4bit
# downloads 56GB BF16 → 14GiB 4-bit (3 shards)
```

This keeps the sourcing rule and, as a bonus, puts MLX on **the same original weights** as every other machine.

## Method — after three fixes

My first harness produced plausible-looking nonsense. It claimed the RTX 3090 could **prefill 64K tokens at 112,865 t/s**. That's physically impossible, so I suspected the code — and found three separate problems.

### 1. Prefix cache hits

Measuring the same prompt three times means runs 2 and 3 skip prefill entirely. The response `usage` gives it away.

```json
"prompt_tokens_details": { "cached_tokens": 42 }
```

I fixed it by prepending a **random nonce at the very front** of every call. Putting it at the end leaves the prefix cacheable, so position matters. I also print `cached_tokens` alongside results to **verify** invalidation on every run.

### 2. The differential method poisoning itself

To separate prefill from decode, you diff a `max_tokens=1` call against a `max_tokens=N` call. But **calling twice with the same prompt** means the second one hits the cache the first one just populated.

The symptom was distinctive: **decode got faster as context grew**, and at 64K the denominator went negative and produced `nan`.

Giving each call **its own nonce** fixes it. The lengths stay equal, so prefill cost is effectively unchanged.

### 3. Streaming shapes differ per engine

I initially used streaming to measure TTFT, but delta shapes varied by engine.

| Engine | Delta shape |
|---|---|
| llama.cpp | incremental (38 reasoning + 1 content) |
| vLLM + reasoning parser | **50 tokens in a single chunk** |

For vLLM this made `ttft ≈ total`, dividing decode by roughly zero and yielding values like **255,000,000 t/s**. I dropped streaming and standardized on the differential method.

### A sanity rule

The experience produced one rule worth keeping.

> **Decode must get slower as context grows. If it doesn't, your cache is polluted.**

In the final run, all three Linux machines passed this check cleanly.

## Results

Median of 3 runs per point, `-c 32768 -ctk q8_0 -ctv q8_0 -fa on --parallel 1`.

### prefill (t/s) — input processing

| Machine / stack | 0.5K | 2K | 8K | 32K |
|---|---|---|---|---|
| **GB10** / vLLM NVFP4 | **1,327** | **1,619** | **2,222** | **1,467** |
| **RTX 3090** / CUDA | 595 | 847 | 1,135 | 1,218 |
| **M5 Max** / MLX | 335 | 435 | 556 | 519 |
| **M5 Max** / Metal | 306 | 281 | 376 | 314 |
| **Radeon 8060S** / Vulkan | 80 | 143 | 228 | 271 |

### decode (t/s) — generation

| Machine / stack | 0.5K | 2K | 8K | 32K |
|---|---|---|---|---|
| **RTX 3090** / CUDA | **40.40** | **40.13** | **39.72** | **38.11** |
| **M5 Max** / MLX | 25.45 | 24.85 | 24.51 | 19.44 |
| **GB10** / vLLM NVFP4 | 17.06 | 17.68 | 17.35 | 16.90 |
| **M5 Max** / Metal | 17.23 | 14.77 | 14.70 | 13.26 |
| **Radeon 8060S** / Vulkan | 11.63 | 11.63 | 11.46 | 11.42 |

## What the numbers say

### Prefill and decode split in opposite directions

GB10 delivers 1.8x the 3090's prefill but less than half its decode. The reason is clear.

- **Prefill is compute-bound** — Blackwell's FP4 throughput wins.
- **Decode is bandwidth-bound** — the 3090's dedicated GDDR6X beats unified LPDDR.

Working out the crossover gives a usable rule.

```
input tokens P > roughly 79 × output tokens O  →  GB10 wins
otherwise                                      →  RTX 3090 wins
```

| Scenario | RTX 3090 | GB10 | Winner |
|---|---|---|---|
| 12K in + 256 out | 17.2s | 20.2s | **3090** |
| 100K in + 256 out | 90.5s | 59.6s | **GB10** |
| 4K in + 1000 out | 25.8s | 56.4s | **3090** |

**Long input with short output (RAG, summarization) goes to GB10; chat and code generation go to the 3090.**

### The controlled 3-way comparison — CUDA dominates

Same GGUF, same flags, same engine. The only pure comparison here, varying hardware and backend alone.

| Backend | prefill (32K) | decode (32K) |
|---|---|---|
| **CUDA** (RTX 3090) | **1,218** | **38.11** |
| **Metal** (M5 Max) | 314 | 13.26 |
| **Vulkan** (Radeon 8060S) | 271 | 11.42 |

The 3090 runs **3.9x the prefill and 2.9x the decode of Metal**, and **4.5x / 3.3x** of Vulkan.

What's interesting is that **Metal and Vulkan land in the same class** (314 vs 271, 13.26 vs 11.42). The M5 Max with 128GB unified memory and Strix Halo with 96GB UMA perform equivalently under llama.cpp. That looks like a shared ceiling of unified-memory architectures.

### On Apple Silicon, use MLX

Same hardware, same model, engine swapped.

| | decode (32K) | prefill (32K) |
|---|---|---|
| **MLX** | **19.44** | **519** |
| llama.cpp Metal | 13.26 | 314 |

MLX is **1.4–1.7x faster on decode and 1.1–1.5x on prefill**. I measured each engine twice and the ranges don't overlap, so the advantage is real.

MLX's weights being 2.7GiB smaller (14.0 vs 16.69GiB) contributes to decode, but it doesn't explain the prefill advantage.

### Laptop benchmarks need at least two full runs

**I got an interpretation wrong here.**

In the first run, MLX prefill was nearly flat: 403 → 470 → 432 → 446. Every other machine increased, so I concluded that `mlx_lm.server` must be skipping batch optimization.

The second run demolished that hypothesis.

| MLX | 0.5K | 2K | 8K | 32K |
|---|---|---|---|---|
| Run 1 prefill | 403 | 470 | 432 | 446 |
| Run 2 prefill | 335 | 435 | **556** | **519** |
| Run 1 decode | 27.02 | **19.17** | 20.79 | 18.57 |
| Run 2 decode | 25.45 | **24.85** | 24.51 | 19.44 |

Run 2 goes 335 → 435 → 556 → 519 — **the same growth pattern as every other machine**. The flatness wasn't real. Decode differed by **30%** at the 2K point (19.17 vs 24.85).

The harness takes 3 samples per point and uses the median. But that only captures **within-point variance**, not **run-to-run variance**. The three Linux servers were monotonic enough that this trap stayed hidden; the laptop exposed it immediately.

> **Repeat the entire run at least twice on a laptop.**

Worth adding: **Metal was actually more reproducible than MLX** here (decode spread around 2 t/s).

### GB10's prefill dips at 32K

It's the only non-monotonic curve: 2,222 at 8K but 1,467 at 32K.

I attribute this to `--max-num-batched-tokens 8192`. An 8K prompt fits one chunk; 32K splits into four and pays the overhead. If you frequently feed long inputs, that's a reason to raise the value.

## Side findings

### MTP is either usable or discarded, depending on the engine

Qwen3.8 ships a Multi-Token Prediction layer (`mtp_num_hidden_layers: 1`), present in the GGUF as `blk.64.nextn.*` tensors.

**llama.cpp ignores them as `unused tensor`.** vLLM uses them.

Enabling it in vLLM gave an 80% acceptance rate and pushed decode from 11.36 to 17.15 t/s — **51% faster**. The cost was a 30% prefill hit, because reserving draft slots forces `max_num_scheduled_tokens` down to 2048. Pairing it with `--max-num-batched-tokens 8192` shrinks that loss to 8%.

### Directory permissions can cause a crash in a surprising place

With the shell's cwd sitting in a directory I couldn't read, `llama-server` died like this:

```
libc++abi: terminating due to uncaught exception of type
std::filesystem::filesystem_error: in current_path: call to getcwd failed
```

Not during GGUF loading, not during Metal init — it blew up in **`getcwd()` inside backend discovery**. From the log alone it looks like a llama.cpp bug. Spelling out `cd "$HOME"` in automation scripts is the safe move.

## References

- [Qwen3.8-27B (official)](https://huggingface.co/Qwen/Qwen3.8-27B) — original BF16 weights
- [unsloth GGUF](https://huggingface.co/unsloth/Qwen3.8-27B-GGUF) — the UD-Q4_K_XL used here
- [MLX LM](https://github.com/ml-explore/mlx-lm) — Apple Silicon inference framework
- [llama.cpp](https://github.com/ggml-org/llama.cpp) — CUDA / Metal / Vulkan backends
- [vLLM](https://github.com/vllm-project/vllm) — NVFP4 and MTP support

## Related posts

This post follows an earlier series that measured the same four machines with **Qwen3.5**. That series compared five engines; this one moves to Qwen3.8 and focuses on a controlled setup with checksum-identical GGUF files.

- [Local LLM Inference Benchmark: 4 Machines × 5 Engines Experiment Design](/en/posts/llm-bench-01-methodology) — Part 1: design
- [Qwen3.5 Cross-Platform Benchmark](/en/posts/llm-bench-02-results-analysis) — Part 2: analysis
- [Qwen3.5 Local Inference Benchmark Result Tables](/en/posts/llm-bench-03-results-tables) — Part 3: full tables

> The desktop differs between the two. The earlier series used a 5950X with two RTX 3090s; this one uses a 9600X with a single 3090. Under single-user, no-concurrency conditions the second card goes unused, so decode comparisons are unaffected.

## Key takeaways

- **The RTX 3090 dominates decode** at 38.11 t/s — double the runner-up MLX (19.44). Dedicated GDDR6X bandwidth beats unified memory.
- **GB10 wins prefill** at 1,467 t/s, thanks to Blackwell FP4 throughput, which makes it the pick for long-input work.
- The crossover sits at **input tokens ≈ 79 × output tokens**. Above it, GB10; below it, the 3090.
- On identical GGUF, **CUDA is 3.9x Metal and 4.5x Vulkan** — and **Metal ≈ Vulkan**, putting both unified-memory architectures in the same class.
- **Use MLX on Apple Silicon.** It's 1.4–1.7x faster on decode than llama.cpp Metal.
- I fixed the benchmark three times. **When a number is physically impossible, suspect the code** — and **run laptops at least twice**.

---

*All numbers are measured single-user with no concurrency (`--parallel 1`). Comparisons across stacks with different quantization should be read as effective per-stack speed, not as hardware comparison.*
