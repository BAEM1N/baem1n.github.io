---
author: baem1n
pubDatetime: 2026-08-29T00:00:00.000Z
title: "176B on a Single 128GB Box — Serving Qwen3.8-Flash-Next on GB10, Down to the CUDA Kernel"
description: "Every official quant overflowed memory. Building an unmerged PR got an 87 GiB 4-bit model running — then CUDA died at 260K tokens. I traced it to the grid.y limit of 65,535, reproduced it in two lines without the model, and fixed it."
tags:
  - benchmark
  - llama-cpp
  - qwen
  - local-llm
  - dgx-spark
  - cuda
  - long-context
aiAssisted: true
articleType: TechArticle
proficiencyLevel: "advanced"
---

> **TL;DR**: I put a 176B (3B active) model on a single 128GB node. **Every official quant was too big** — BF16 at 360GB, FP8 at 186GB — so unsloth GGUF plus an **unmerged PR** build was the only path. Once it ran, `CUDA error: invalid argument` appeared at 260K tokens. The cause was neither context nor memory but the **CUDA grid.y limit of 65,535**, which puts the real ceiling at **261,888** — 256 below the trained limit of 262,144. I reproduced it in two lines with no model at all, fixed it, and passed 21,099 regression tests. Along the way, **a single commit doubled long-context performance**.

## Table of contents

## What you'll get from this post

- Whether a **176B model actually fits** in 128GB of unified memory, and which quant is realistic.
- Why hybrid-attention models fit **260K tokens of KV cache into 6 GiB**, with the arithmetic.
- How to trace an unhelpful `CUDA error: invalid argument` **back to kernel launch parameters**.
- What running an unmerged PR **actually costs you**, in numbers.

## Why llama.cpp — there was no choice

The DGX Spark (GB10) has 121 GiB of unified memory. Qwen3.8-Flash-Next is a **176.94B parameter MoE with 3B active**, built on hybrid sparse and linear attention. I looked at the official releases first.

| Release | Source | Size | Fits 121 GiB? |
|---|---|---:|---|
| `Qwen/Qwen3.8-Flash-Next` BF16 | Official | 360.0 GB | ❌ |
| `Qwen/Qwen3.8-Flash-Next-FP8` | Official | 185.6 GB | ❌ |
| NVFP4 | **Neither official nor unsloth** | — | — |

**Not one official quant fits.** GB10 is Blackwell and has native NVFP4 acceleration, but neither Qwen nor unsloth published an NVFP4 build. Hugging Face has eight NVFP4 variants and all of them are third-party conversions.

I held a rule here. A third-party GGUF reranker conversion once produced e-14 noise scores and collapsed my rankings entirely, so since then I use **official or unsloth releases only**.

That left unsloth's GGUFs.

| Quant | Size | Fits 121 GiB? |
|---|---:|---|
| UD-Q4_K_XL | 111.3 GB | ❌ |
| **UD-IQ4_XS** | **93.7 GB** | ✅ chosen |
| UD-Q3_K_XL | 90.0 GB | ✅ |
| UD-IQ3_XXS | 82.0 GB | ✅ |
| UD-Q2_K_XL | 78.9 GB | ✅ |
| UD-IQ1_M | 74.5 GB | ✅ |

**This model barely shrinks as you drop bits.** Even 1-bit IQ1_M is 74.5GB. The gap between 4-bit (93.7GB) and 1-bit (74.5GB) is only 20GB, so you give up a lot of quality for very little room. I took the largest one that fit.

### You have to build an unmerged PR

The unsloth docs say it outright: **mainline llama.cpp will not load this model.**

The architecture is `Qwen4ExpForConditionalGeneration` (`model_type: qwen4_exp`) — a preview of Qwen4. Support exists only in [PR #27742](https://github.com/ggml-org/llama.cpp/pull/27742), "model: add Qwen3.8-Flash-Next (qwen4exp)", which is **still open** as of this writing.

```bash
git clone --depth 50 -b qwen4exp/qwen3.8-flash-next \
  https://github.com/unslothai/llama.cpp ~/llama.cpp-qwen4exp
cd ~/llama.cpp-qwen4exp
cmake -B build -DGGML_CUDA=ON -DCMAKE_CUDA_ARCHITECTURES=native \
      -DLLAMA_CURL=OFF -DCMAKE_BUILD_TYPE=Release
cmake --build build -j 18 --target llama-server llama-cli llama-bench
```

Looking at what the PR's 25 commits touch: everything is under `src/` (`llama-arch`, `llama-graph`, `llama-model`, `qwen4exp.cpp`, `llama-memory-hybrid-idx`) and `gguf-py`. **Not a single line in `ggml/src/ggml-cuda`.** The new architecture is composed entirely from existing ggml ops, which is why it also runs on other backends like Vulkan.

I verified the download.

```
Qwen3.8-Flash-Next-UD-IQ4_XS-00001-of-00003.gguf      10,946,624
Qwen3.8-Flash-Next-UD-IQ4_XS-00002-of-00003.gguf  49,835,229,856
Qwen3.8-Flash-Next-UD-IQ4_XS-00003-of-00003.gguf  43,836,407,744
```

All three shards match the Hugging Face originals **byte for byte**. The first shard is oddly small at 10MB because it holds the metadata.

## It loaded — and context turned out to be cheap

```
ggml_cuda_init: found 1 CUDA devices (Total VRAM: 124616 MiB):
  Device 0: NVIDIA GB10, compute capability 12.1, VMM: yes
qwen4exp A3B IQ4_XS - 4.25 bpw | 87.24 GiB | 176.94 B | CUDA | ngl 99
```

87.24 GiB loaded, using 94 GiB of the 121 GiB. Korean responses came back clean.

The interesting part was the context cost. From the official `config.json`:

```json
"num_hidden_layers": 48,
"full_attention_interval": 4,
"num_key_value_heads": 2,
"head_dim": 256,
"max_position_embeddings": 262144
```

**Only 12 of the 48 layers use full attention; the other 36 are linear attention.** That cuts the layers carrying a KV cache to a quarter.

```
KV per token = 2 heads × 256 dim × 2 (K+V) × 2 B × 12 layers = 24 KiB
262,144 tokens = 6.0 GiB
```

**Filling all 260K tokens costs 6 GiB of KV.** Measurements agreed.

| Configuration | Memory used |
|---|---|
| 32K × 4 slots, f16 KV | 94 GiB |
| 256K × 1 slot, q8_0 KV | 98 GiB |
| 256K × 1 slot, f16 KV | 112 GiB |

**An 8x larger context cost 4 GiB more memory.** That is the practical payoff of hybrid attention on a unified-memory node.

That is the part that works. The trouble came next.

## It dies at 260K tokens

I ran a `llama-bench` depth sweep. At `-d 262144` the process died.

```
/ggml/src/ggml-cuda/ggml-cuda.cu:107: CUDA error
#4 rms_norm_mul_f32_cuda(...)
#5 ggml_cuda_op_rms_norm_fused(...)
#6 ggml_cuda_try_fuse(...)
#7 ggml_backend_cuda_graph_compute(...)
```

My first hypothesis was simple. `llama-bench` sets `n_ctx = n_prompt + n_gen + n_depth`, so this becomes `262144 + 512 + 128 = 262,784` — **632 tokens past** the trained limit of 262,144. So I reran with `-d 261503` to land exactly on the limit.

**It died identically.** Hypothesis refuted.

### I had been throwing away the error message

Opening `ggml-cuda.cu`, the error path prints three lines.

```c
GGML_LOG_ERROR(GGML_CUDA_NAME " error: %s\n", msg);
GGML_LOG_ERROR("  current device: %d, in function %s at %s:%d\n", ...);
GGML_LOG_ERROR("  %s\n", stmt);
GGML_ABORT(GGML_CUDA_NAME " error");
```

My log only had the final `GGML_ABORT` line. **`llama-bench` suppresses logging by default.** Adding `-v` produced the real message.

```
CUDA error: invalid argument
  current device: 0, in function ggml_cuda_kernel_launch at common.cuh:1668
  cudaLaunchKernelEx(&pdl_cfg.cfg, kernel, ...)
```

**Not a memory access violation — a kernel launch configuration error.** Grid or block dimensions exceeded a hardware limit.

> Each reproduction took 40 minutes, so skipping `-v` on the first run was expensive. When reproducing a crash, open the logs all the way up front. It is cheap.

### grid.y caps at 65,535

The launch site in `ggml/src/ggml-cuda/norm.cu` looks like this:

```c
const dim3 blocks_num(nrows, nchannels, nsamples);
```

I asked the hardware directly.

```
name=NVIDIA GB10 cc=12.1
maxGridSize = [2147483647, 65535, 65535]
```

**grid.x allows 2.1 billion; grid.y and grid.z allow 65,535.** So the question becomes which dimension crosses 65,535.

It came from `src/models/qwen4exp.cpp`. The QSA sparse attention indexer pools keys by a compression ratio `r`.

```c
const int64_t r        = hparams.dsv4_compress_ratios[il];
const int64_t n_blocks = (n_kv + r - 1)/r;
...
pooled = ggml_reshape_3d(ctx0, pooled, idx_dim, 1, n_blocks*n_stream);
pooled = build_norm(pooled, model.layers[il].index_k_norm, nullptr, LLM_NORM_RMS, il);
```

**The large dimension went into `ne[2]` instead of `ne[1]`.** `ne[1]` is literally 1. So the grid becomes `(1, n_blocks, 1)` and `n_blocks` lands entirely on **grid.y**.

The compression ratio was in the GGUF metadata.

```
qwen4exp.attention.compress_ratios arr[i32,48] = [0, 0, 0, 4, 0, 0, 0, 4, ...]
qwen4exp.context_length            u32         = 262144
```

**`r = 4`**, applied on every full-attention layer. That gives the ceiling.

```
n_blocks = ⌈n_kv / 4⌉ ≤ 65,535
→ n_kv ≤ 262,140
```

**Four below the trained limit of 262,144.** This model's full context is structurally unreachable on the CUDA path.

### The prediction held at four points

| n_ctx | n_blocks | Predicted | Measured |
|---:|---:|---|---|
| 230,016 | 57,504 | pass | ✅ |
| 261,888 | 65,472 | pass | ✅ |
| 262,143 | 65,536 | fail | ❌ |
| 262,144 | 65,536 | fail | ❌ |

`n_kv` is padded to multiples of 256, so the **safe ceiling in practice is 261,888 (= 256 × 1023)**. Passing `-c 262140` still dies, because it rounds up to 262,144.

Of the seven norm calls in `qwen4exp.cpp`, **only this one scales with context length**. The rest scale with the ubatch (≤2048) and never come close to 65,535.

## Two lines reproduce it without the model

At this point the real problem is visible. **This is not a qwen4exp bug — it is an upstream ggml bug.** `norm.cu` is a file the PR never touches, and upstream master has no clamp either.

Two lines in `tests/test-backend-ops.cpp` reproduce it with no 176B model, no 87GB download, and no 40-minute prefill.

```cpp
// ne[2] beyond the CUDA grid.y limit (65535)
test_cases.emplace_back(new test_rms_norm(GGML_TYPE_F32, {64, 1, 65536, 1}, false, 1e-6f));
test_cases.emplace_back(new test_rms_norm_mul_add(GGML_TYPE_F32, {64, 1, 65536, 1}, 1e-6f, false, false));
```

One 16MB tensor, a few seconds.

```
RMS_NORM(type=f32,ne=[64,5,4,3],...): OK      ← last existing case
CUDA error: invalid argument
```

**The same case fails on Vulkan too.** On a Radeon 8060S (gfx1151, RADV, x86_64) — different vendor, different architecture:

```
ggml-vulkan.cpp:8230: GGML_ASSERT(wg0 <= maxComputeWorkGroupCount[0] && ...) failed
```

Vulkan at least catches it with an assert. **CUDA just fails the launch silently.**

### Why it survived this long

The same codebase has already fixed this class of bug three times.

| PR | Target |
|---|---|
| [#19999](https://github.com/ggml-org/llama.cpp/pull/19999) | `convert.cu` — `std::min(ne01, 65535)` |
| [#22944](https://github.com/ggml-org/llama.cpp/pull/22944) | `im2col.cu` — `MAX_GRIDDIM_Y` plus a grid-stride loop |
| [#25103](https://github.com/ggml-org/llama.cpp/pull/25103) | `get_rows_back` — grid-y clamp |

`binbcast.cu` goes further and flattens to a 1D grid with fastdiv index decomposition. **Only the four sites in `norm.cu` were missed.**

And the largest `ne[2]` in the existing RMS_NORM test cases is **5** (`{n, 5, 4, 3}`). The test suite never walks this path.

### I fixed it and verified

Following the `im2col.cu` precedent, I added a clamp plus a grid-stride loop. There was one obstacle: **the kernel derives its dimensions from `gridDim`.**

```c
const int nrows     = gridDim.x;
const int nchannels = gridDim.y;   // ← clamping silently corrupts indexing
```

So the dimensions have to be passed explicitly.

```c
const int nchannels = nchannels_total > 0 ? nchannels_total : (int) gridDim.y;
for (int sample  = blockIdx.z; sample  < nsamples;  sample  += gridDim.z) {
for (int channel = blockIdx.y; channel < nchannels; channel += gridDim.y) { ... }}
```

| Check | Result |
|---|---|
| Crashing cases | `RMS_NORM` and `RMS_NORM_MUL_ADD` both `OK` |
| Numerical accuracy vs CPU | matches (`2/2 backends passed`) |
| Regression suite, **21,099 cases** | **0 failures** |
| Real model at `-d 262144` (the original crash) | completes |
| Performance impact | within measurement noise |

When `ne[2] ≤ 65,535` the loop runs exactly once, so the workload is unchanged — no performance change is the expected result.

### Someone hit this crash first

Digging through the PR discussion, there was a report from **identical hardware**: an ASUS Ascent GX10 (GB10, 128GB), the same UD-IQ4_XS, the same error, the same `common.cuh:1668`.

But the conclusion differed. That report extended context to 524,288 via YaRN and crashed, concluding **"it breaks when crossing the native trained context of 262,144."**

Our data refutes that reading. **No YaRN was involved, and `n_ctx = 262,143` — inside the native window — still died.** The true boundary is 262,140, and the two numbers sit four apart, so that experiment alone could not distinguish them.

> When a boundary happens to coincide with another constant, testing from only one side will convince you of the wrong cause. Probing from the other side is cheap.

## Performance by depth

Each depth was measured in its own process. `-fa on`, f16 KV, `--parallel 1`.

| depth | pp512 (t/s) | tg128 (t/s) | reps |
|---:|---:|---:|:--:|
| 0 | 769.87 ± 13.17 | 29.51 ± 0.60 | 3 |
| 4,096 | 761.60 ± 18.60 | 28.32 ± 0.07 | 3 |
| 16,384 | 634.76 ± 15.43 | 24.65 ± 0.07 | 3 |
| 32,768 | 520.29 ± 16.92 | 20.99 ± 0.45 | 3 |
| 65,536 | 382.04 ± 10.79 | 16.03 ± 0.02 | 3 |
| 131,072 | 252.07 | 10.02 | 1 |
| 163,840 | 208.92 | 7.47 | 1 |
| 196,608 | 158.89 | 6.40 | 1 |
| 229,376 | 159.37 | 6.17 | 1 |
| **261,248 (max)** | **137.22** | **6.04** | 1 |

From 0 to 261K, **prefill drops 5.6x and decode 4.9x**.

Read practically: **32K is comfortable** (pp 520, tg 21), 131K is roughly half (pp 252, tg 10), and 261K takes over 40 minutes just to prefill, making it **batch-only**. "It runs" and "it is usable" are different claims.

> 196,608 (158.89) and 229,376 (159.37) are inverted. With `-r 1` there are no error bars and the gap is 0.3%, so I read this as **noise.** Confirming it would need a rerun.

### One commit changed performance by 2x

This is the most practically useful finding here. Same hardware, same model, same flags — **only the PR branch commit differs.**

| depth | `0b19188` | `d807f04` | Change |
|---:|---:|---:|---|
| 0 | 693.40 | 769.87 | +11% |
| 16,384 | 486.71 | 634.76 | +30% |
| 32,768 | 340.63 | 520.29 | +53% |
| 65,536 | 221.41 | 382.04 | +73% |
| 131,072 | 121.07 | 252.07 | **+108%** |
| 229,376 | 71.39 | 159.37 | **+123%** |
| 261,248 | 62.27 | 137.22 | **+120%** |

**The deeper the context, the larger the gain, exceeding 2x on long contexts.** The two commits are two days apart.

The likely cause is `d807f04 "fix llm_graph_input_ple reuse"`, which implements **`can_reuse()`** on `llm_graph_input_qsa`.

```cpp
bool can_reuse(const llm_graph_params & params) override {
    const int64_t n_kv     = idx->get_n_kv();
    const int64_t n_blocks = (n_kv + ratio - 1)/ratio;
    res &= cell_blk->ne[0]  == n_kv;
    res &= blk_pos->ne[0]   == 4*n_blocks*n_stream;
    ...
}
```

Without it, the compute graph is rebuilt from scratch every ubatch. The `0b19188` server logs showed `graphs reused = 0`, which is exactly that symptom, and rebuild cost grows with KV size — matching the pattern of larger gains at depth. Two sibling commits push the same direction: `e361303 reduce input nodes` and `dfb5c13 trim output tokens`.

That said, **I could not confirm causation by measurement.** The branch was rebased onto master and the history rewritten (`0b19188` is not an ancestor of `d807f04`), so a per-commit A/B is impossible.

**Decode moves the other way.** It improved at shallow depth (27.56 → 29.51 at 0) but regressed deep (11.28 → 10.02 at 131K, 9.75 → 7.47 at 163K). This looks like a prefill-focused optimization, but **the decode regression remains unexplained.**

> This is what running an unmerged PR means. Yesterday's number can be half of today's, or double. **A benchmark shared without a commit hash is meaningless.**

## Reproducing

```bash
# Build, pinned to a commit
git clone -b qwen4exp/qwen3.8-flash-next https://github.com/unslothai/llama.cpp
cd llama.cpp && git checkout d807f04
cmake -B build -DGGML_CUDA=ON -DCMAKE_CUDA_ARCHITECTURES=native \
      -DLLAMA_CURL=OFF -DCMAKE_BUILD_TYPE=Release
cmake --build build -j 18 --target llama-server llama-bench

# Serving — do not cross the safe ceiling
./build/bin/llama-server -m Qwen3.8-Flash-Next-UD-IQ4_XS-00001-of-00003.gguf \
  -ngl 99 -c 261888 --parallel 1 -fa on --host 0.0.0.0 --port 8001

# Depth benchmark (one process per depth)
for d in 0 16384 65536 131072 261248; do
  ./build/bin/llama-bench -m ...-00001-of-00003.gguf -ngl 99 -fa on \
    -p 512 -n 128 -d $d -r 3
done
```

**Keep `-c` at or below 261,888.** Passing 262,144 dies the moment prefill crosses 260K tokens — 40 minutes in.

Running several depths in one process **depresses the later tests.** Sweeping seven depths sequentially in a single process measured the 131,072 point **36% low** (77.35 vs 121.07). When monotonicity breaks, suspect the measurement.

## Limits and open questions

- **The patch is partial.** Only the `rms_norm_f32` family is fixed. `norm_f32` and `l2_norm_f32` in the same file carry the identical flaw; no model has triggered them yet.
- **Vulkan was reproduced but not fixed.** SYCL, HIP, and Metal were not checked at all. HIP may not break, since AMD's grid limits differ.
- **The performance comparison used `-r 2`.** That supports "no significant regression" and nothing more precise.
- **Long-context output quality was not evaluated.** Whether the model reasons correctly at 260K tokens is a separate question from speed.
- **The decode regression is unexplained.** I do not know why deep-context decode dropped between commits.
- **Commit causation is circumstantial**, because the rebase made a per-commit A/B impossible.

## References

- [Qwen3.8-Flash-Next (official)](https://huggingface.co/Qwen/Qwen3.8-Flash-Next) — original BF16
- [unsloth GGUF](https://huggingface.co/unsloth/Qwen3.8-Flash-Next-GGUF) — the UD-IQ4_XS used here
- [llama.cpp PR #27742](https://github.com/ggml-org/llama.cpp/pull/27742) — qwen4exp architecture support
- [llama.cpp](https://github.com/ggml-org/llama.cpp) — upstream

## Related post

- [One Model, Four Machines — Benchmarking Qwen3.8-27B Inference](/posts/qwen3-8-27b-four-device-benchmark) — the previous post, measuring this same GB10 node with vLLM

In that post, GB10 served Qwen3.8-**27B** NVFP4 through vLLM at 16.90 t/s decode at 32K. The **176B** here does **20.99 t/s** decode at 32K on the same hardware. **A 6.5x larger model generates faster**, because active parameters differ (27B vs 3B) and decode is bandwidth-bound. Note the engine (vLLM vs llama.cpp) and quantization (NVFP4 vs IQ4_XS) differ too, so this is not a clean comparison.

## Key takeaways

- **176B (3B active) fits on a single 128GB box** — but no official quant fits, so unsloth GGUF plus an unmerged PR build is the only route.
- **Hybrid attention makes context cheap.** With only 12 of 48 layers doing full attention, 260K tokens of KV is 6 GiB. An 8x context increase cost 4 GiB.
- **The usable context ceiling is 261,888**, 256 below the trained 262,144, and the reason is neither context nor memory but the **CUDA grid.y limit of 65,535**.
- The root cause is an **upstream ggml bug**: four sites in `norm.cu` never clamp grid dimensions. The same class was fixed three times in `convert.cu`, `im2col.cu`, and `get_rows` — `norm.cu` was missed, and the tests never covered it because their largest `ne[2]` is 5.
- **Two lines reproduce it without the model**, on both CUDA and Vulkan.
- **A single commit changed long-context performance by 2x.** Always publish the commit hash with unmerged-PR benchmarks.

---

*All numbers were measured on a DGX Spark (GB10, 121 GiB unified memory, aarch64, CUDA 13) under single-user conditions. The performance tables are from `d807f04`; this PR is under active development and later commits will differ.*
