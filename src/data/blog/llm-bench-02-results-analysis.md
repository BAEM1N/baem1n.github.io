---
author: baem1n
pubDatetime: 2026-04-05T09:00:00.000+09:00
modDatetime: 2026-04-07T23:00:00.000+09:00
title: "Qwen3.5 크로스 플랫폼 벤치마크: 4대 하드웨어 × 5개 엔진 성능 비교"
description: "Mac M5 Max, RTX 3090×2, DGX Spark, Ryzen AI MAX 395+에서 Qwen3.5를 동일 조건으로 측정한 벤치마크. 4,200회 정상 측정 (이상치·중복 제거). cold prefill, cache 차단 적용."
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

> **TL;DR**: 동일 모델·동일 가중치로 4대 하드웨어를 비교하면, RTX 3090×2가 절대 속도 1위(35B MoE 139 tok/s), Mac M5 Max가 TTFT 안정성 최강. MoE 35B-A3B는 **전 플랫폼에서** 9B Dense보다 빠르다. vLLM GPTQ-Marlin은 156 tok/s로 전체 실험 최고.

> 실험 설계는 [1편: 실험 방법론](/posts/llm-bench-01-methodology)을 참고.
>
> **데이터 기준**: 각 조합별 가장 안정적인 5회 측정 세트 선택 (CV<0.3). 중복 실행·이상치 제거 후 4,200회 유효.

## Table of contents

## 하드웨어 스펙

| | M5 Max (128GB) | 3090×2 (48GB VRAM) | DGX Spark GB10 (128GB) | Ryzen AI MAX 395 (96GB) |
|--|:--:|:--:|:--:|:--:|
| GPU | Apple GPU 40C | RTX 3090 ×2 | GB10 Blackwell | Radeon 8060S 40CU |
| 메모리 | 128GB unified | 128GB DDR4 + 48GB VRAM | 128GB unified | 128GB (96GB VRAM) |
| 대역폭 | **546 GB/s** | ~936 GB/s GDDR6X | 273 GB/s | 256 GB/s |

---

## Track B: 하드웨어 비교

> 변수는 **하드웨어뿐**. llama.cpp + 동일 GGUF + 동일 설정.

### Generation 속도 (gen-512, 중앙값 tok/s)

**Q4_K_M:**

| 모델 | M5 Max | 3090×2 | DGX Spark | Ryzen AI |
|------|:------:|:-------:|:------:|:-------:|
| **9B** Dense | 75.9 | **117.6** | 36.8 | 32.6 |
| **27B** Dense | 24.8 | **41.4** | 11.5 | 10.3 |
| **35B-A3B** MoE | 94.1 | **138.9** | 59.6 | 58.0 |
| **122B-A10B** MoE | 42.9 | **130.7** | 21.7 | 22.9 |

**Q8_0:**

| 모델 | M5 Max | 3090×2 | DGX Spark | Ryzen AI |
|------|:------:|:-------:|:------:|:-------:|
| **9B** | 50.8 | **82.2** | 24.3 | 21.7 |
| **27B** | 16.9 | **27.5** | 7.6 | 7.1 |
| **35B-A3B** | 88.4 | **130.3** | 52.6 | 50.8 |

### MoE의 보편적 효율

**전 플랫폼에서** 35B-A3B MoE(3B active)가 9B Dense보다 빠르다:

| 플랫폼 | 9B Dense | 35B-A3B MoE | MoE 우위 |
|--------|----------|-------------|---------|
| M5 Max | 75.9 | **94.1** | +24% |
| 3090×2 | 117.6 | **138.9** | +18% |
| DGX Spark | 36.8 | **59.6** | +62% |
| Ryzen AI | 32.6 | **58.0** | +78% |

---

## Track A: 엔진 비교 (플랫폼 내부)

> ⚠️ **같은 플랫폼 내부에서만 비교**. 다른 플랫폼의 다른 엔진끼리는 비교하지 않는다.

### M5 Max: MLX vs llama.cpp (gen-512, Q4_K_M)

| 모델 | MLX | llama.cpp | MLX 우위 |
|------|----:|----------:|---------:|
| 9B | **103.2** | 75.4 | +37% |
| 27B | **28.8** | — | — |
| 35B-A3B | **139.0** | 91.0 | +53% |
| 122B | **66.8** | 38.5 | +73% |

### 3090×2: vLLM vs llama.cpp vs Ollama (gen-512, Q4_K_M)

| 모델 | vLLM | llama.cpp | Ollama |
|------|-----:|----------:|-------:|
| 9B | 83.6 | **117.3** | 100.5 |
| 27B | 19.3 | **41.5** | 36.7 |
| 35B-A3B | **156.3** | 138.7 | 101.7 |

- **vLLM 35B GPTQ-Marlin = 156.3 tok/s** — 전체 실험 최고 속도

### DGX Spark: llamacpp vs Ollama vs vLLM Docker (gen-512, Q4_K_M)

| 모델 | llama.cpp | Ollama | vLLM Docker |
|------|----------:|-------:|------------:|
| 9B | **35.7** | 35.1 | 12.9 |
| 27B | **11.5** | 11.4 | 8.5 |
| 35B-A3B | **61.2** | 59.2 | 34.8 |
| 122B | **22.0** | 6.6 | — |

### Ryzen AI: llama.cpp vs Ollama (gen-512, Q4_K_M)

| 모델 | llama.cpp | Ollama |
|------|----------:|-------:|
| 9B | **36.2** | 31.9 |
| 27B | **12.3** | 11.1 |
| 35B-A3B | **58.4** | 43.9 |
| 122B | **22.8** | 4.6 |

---

## 핵심 발견

1. **3090 2-WAY 절대 속도 1위** — GDDR6X 936 GB/s 대역폭. 122B MoE 131 tok/s.
2. **Mac M5 Max 실사용 최강** — TTFT 120ms 안정. MLX 35B 139 tok/s.
3. **vLLM GPTQ-Marlin 최고 기록** — 35B MoE 156.3 tok/s (llamacpp +12%).
4. **DGX Spark 대역폭 병목** — 273 GB/s로 Mac(546)의 절반.
5. **Ryzen AI 122B 실행 가능** — $2,000대 미니 PC에서 22.9 tok/s.
6. **MoE 보편적 효율** — 35B-A3B(3B active) > 9B Dense, 전 플랫폼 +18~78%.

---

## OOM / 실패

| 플랫폼 | 조합 | 사유 |
|--------|------|------|
| 3090×2 | 122B llamacpp prefill | 48GB + 256K KV 초과 |
| 3090×2 | vLLM 27B/35B Q8 BF16 | VRAM 초과 |
| 3090×2 | Ollama 27B Q8, 122B | swap (5 tok/s) |
| DGX Spark | vLLM pip | CUDA 13/12 호환 → Docker 해결 |
| Ryzen AI | Ollama 122B | swap (4.6 tok/s) |

---

## 데이터

4,200회 유효 측정 (이상치·중복 제거, CV<0.3 필터)

| 플랫폼 | 정상 데이터 |
|--------|----------:|
| 3090×2 | 994 |
| DGX Spark | 1,094 |
| M5 Max | 940 |
| Ryzen AI | 918 |
| **합계** | **3,946** |

---

> 실험 코드: [baem1n/llm-bench](https://github.com/baem1n/llm-bench) | 방법론: [1편](/posts/llm-bench-01-methodology)
