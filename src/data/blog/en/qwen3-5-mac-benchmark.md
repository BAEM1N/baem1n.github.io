---
author: baem1n
pubDatetime: 2026-04-03T00:00:00.000Z
title: "Qwen3.5 Local Inference Benchmark: MLX vs llama.cpp vs Ollama (M5 Max)"
description: "692 measured runs across 4 Qwen3.5 models, 3 backends on M5 Max 128GB. MoE efficiency analysis and backend trade-offs with real benchmark data."
tags:
  - llm
  - benchmark
  - mlx
  - ollama
  - apple-silicon
featured: false
draft: true
aiAssisted: true
---

> **TL;DR**: Qwen3.5-35B-A3B (MoE) reaches **139 tok/s** on MLX — 4.6x faster than 27B Dense with only 29% more memory. For long-context prefill, llama.cpp Flash Attention is **204x faster** than MLX. Choosing the right backend depends on whether generation or prefill matters more for your workload.

English version coming soon. See the [Korean version](/posts/qwen3-5-mac-benchmark) for the full benchmark data.
