---
author: baem1n
pubDatetime: 2026-04-05T00:00:00.000Z
modDatetime: 2026-04-07T12:00:00.000Z
title: "Qwen3.5 크로스 플랫폼 벤치마크: 4대 하드웨어 × 6개 엔진 성능 비교"
description: "Mac M5 Max, RTX 3090×2, DGX Spark, Ryzen AI MAX 395+에서 Qwen3.5를 동일 조건으로 측정한 4,624회 벤치마크. cold prefill, cache 차단, 실행 순서 랜덤화 적용."
tags:
  - llm
  - benchmark
  - nvidia
  - apple-silicon
  - amd
  - cross-platform
featured: true
aiAssisted: true
---

> **TL;DR**: 동일 모델·동일 가중치로 4대 하드웨어를 비교하면, RTX 3090×2가 절대 속도 1위(35B MoE 135 tok/s), Mac M5 Max가 TTFT 안정성 최강(120ms). MoE 35B-A3B는 **전 플랫폼에서** 9B Dense보다 빠르다. vLLM GPTQ-Marlin은 156 tok/s로 llamacpp를 12% 앞섰다.

> 실험 설계는 [1편: 실험 방법론](/posts/llm-bench-01-methodology)을 참고. 총 4,624회 유효 측정 (중복 제거).

## Table of contents

## 하드웨어 스펙

| | 🍎 Mac M5 Max | 🖥️ 3090 ×2 | 🔷 DGX Spark | 🔶 Ryzen AI MAX |
|--|:--:|:--:|:--:|:--:|
| GPU | Apple GPU 40C | RTX 3090 ×2 | GB10 Blackwell | Radeon 8060S 40CU |
| 메모리 | 128GB unified | 128GB DDR4 + 48GB VRAM | 128GB unified | 128GB (96GB VRAM) |
| 대역폭 | **546 GB/s** | ~936 GB/s GDDR6X | 273 GB/s | 256 GB/s |

---

## Track B: 하드웨어 비교

> 변수는 **하드웨어뿐**. llama.cpp + 동일 GGUF + 동일 설정.

### Generation 속도 (gen-512, 중앙값 tok/s)

**Q4_K_M:**

| 모델 | 🍎 Mac | 🖥️ 3090 | 🔷 DGX | 🔶 Ryzen |
|------|:------:|:-------:|:------:|:-------:|
| **9B** Dense | 75.9 | **117.5** | 36.8 | 32.4 |
| **27B** Dense | 24.4 | **41.4** | 11.5 | 32.6 |
| **35B-A3B** MoE | 94.1 | **135.0** | 59.6 | 58.0 |
| **122B-A10B** MoE | 42.9 | **130.7** | 21.7 | 22.9 |

**Q8_0:**

| 모델 | 🍎 Mac | 🖥️ 3090 | 🔷 DGX | 🔶 Ryzen |
|------|:------:|:-------:|:------:|:-------:|
| **9B** | 50.8 | **82.3** | 24.3 | 21.7 |
| **27B** | 16.9 | **27.5** | 7.6 | 7.1 |
| **35B-A3B** | **88.4** | 123.7 | 52.6 | 50.8 |

### MoE의 보편적 효율

**전 플랫폼에서** 35B-A3B MoE(3B active)가 9B Dense보다 빠르다:

| 플랫폼 | 9B Dense | 35B-A3B MoE | MoE 우위 |
|--------|----------|-------------|---------|
| 🍎 Mac | 75.9 | **94.1** | +24% |
| 🖥️ 3090 | 117.5 | **135.0** | +15% |
| 🔷 DGX | 36.8 | **59.6** | +62% |
| 🔶 Ryzen | 32.4 | **58.0** | +79% |

---

## Track A: 엔진 비교 (플랫폼 내부)

> ⚠️ **같은 플랫폼 내부에서만 비교**. 다른 플랫폼의 다른 엔진끼리는 비교하지 않는다.

### 🍎 Mac: MLX vs llama.cpp (gen-512, Q4_K_M)

| 모델 | MLX | llama.cpp | MLX 우위 |
|------|----:|----------:|---------:|
| 9B | **102.4** | 75.9 | +35% |
| 27B | **28.8** | 24.4 | +18% |
| 35B-A3B | **138.3** | 94.1 | +47% |
| 122B | **66.8** | 42.9 | +56% |

MLX가 generation에서 전 모델 우위. Metal 4-bit 커널 최적화 효과.

### 🖥️ 3090: vLLM vs llama.cpp vs Ollama (gen-512, Q4_K_M)

| 모델 | vLLM | llama.cpp | Ollama |
|------|-----:|----------:|-------:|
| 9B | 83.6 | **117.3** | 100.5 |
| 27B | 19.3 | **41.5** | 36.7 |
| 35B-A3B | **156.3** | 138.6 | 101.7 |

- **vLLM 35B GPTQ-Marlin = 156.3 tok/s** — llamacpp 대비 12% 빠름. MoE + Marlin 커널 최적화.
- 9B/27B에서는 llamacpp가 vLLM을 앞섬. 모델 크기에 따라 우위가 달라진다.

### 🔷 DGX: llamacpp vs Ollama vs vLLM Docker (gen-512, Q4_K_M)

| 모델 | llama.cpp | Ollama | vLLM Docker |
|------|----------:|-------:|------------:|
| 9B | **35.7** | 35.1 | 12.9 |
| 27B | **11.5** | 11.4 | 8.5 |
| 35B-A3B | **61.2** | 59.2 | 34.8 |
| 122B | 22.0 | **6.6** | — |

DGX에서 llamacpp ≈ Ollama (차이 5% 미만). vLLM Docker는 `--enforce-eager` 모드라 느림.

### 🔶 Ryzen: llama.cpp vs Ollama (gen-512, Q4_K_M)

| 모델 | llama.cpp | Ollama |
|------|----------:|-------:|
| 9B | **36.2** | 31.9 |
| 27B | **12.3** | 11.1 |
| 35B-A3B | **58.4** | 43.9 |
| 122B | **22.8** | 4.6 |

Ollama 122B = 4.6 tok/s — 256K KV cache가 96GB VRAM을 압박하여 swap 발생.

---

## 핵심 발견

### 1. 3090 2-WAY가 절대 속도 1위

RTX 3090 ×2의 GDDR6X 936 GB/s 대역폭이 generation과 prefill 모두에서 압도적. 122B MoE에서 130.7 tok/s.

### 2. Mac M5 Max는 실사용 최강

546 GB/s unified 대역폭으로 TTFT 120~310ms. MLX 35B MoE 138 tok/s. 절대 속도는 3090에 밀리지만, **체감 응답성이 가장 좋다**.

### 3. vLLM GPTQ-Marlin의 잠재력

35B MoE에서 156.3 tok/s — 전체 실험 최고 속도. 단 9B에서는 llamacpp가 더 빠름.

### 4. DGX Spark 대역폭 병목

128GB unified로 모든 모델이 올라가지만, 273 GB/s 대역폭이 Mac(546)의 절반.

### 5. Ryzen AI 96GB VRAM의 가치

$2,000대 미니 PC에서 122B를 22.9 tok/s로 돌린다.

### 6. MoE의 보편적 효율

전 플랫폼에서 35B-A3B MoE(3B active)가 9B Dense보다 15~79% 빠르다.

---

## OOM / 실패 기록

| 플랫폼 | 조합 | 사유 |
|--------|------|------|
| 🖥️ 3090 | 122B llamacpp prefill | 48GB VRAM + 256K KV cache 초과 |
| 🖥️ 3090 | vLLM 27B/35B Q8 (BF16) | 55~70GB > 48GB VRAM |
| 🖥️ 3090 | Ollama 27B Q8, 122B | VRAM swap (5 tok/s) |
| 🔷 DGX | vLLM CUDA 13/12 호환 | Docker로 해결 |
| 🔶 Ryzen | Ollama 122B | KV pre-allocation swap (4.6 tok/s) |

---

## 데이터 (중복 제거)

| 플랫폼 | OK 측정 | 달성률 |
|--------|-------:|------:|
| 🖥️ 3090 | 1,366 | 129.5% |
| 🔷 DGX | 1,189 | 101.6% |
| 🔶 Ryzen | 1,041 | 82.2% |
| 🍎 Mac | 1,028 | 81.6% |
| **합계** | **4,624** | |

> 일부 플랫폼 실험 진행 중. 완료 시 업데이트.

---

## 다음

- Mac Ollama 전 모델 실험 (저녁 재실행)
- Ryzen Lemonade Server 완료
- Gemma 4 모델 추가
- 블로그 3편: Track A 상세 분석

---

> 실험 코드: [baem1n/llm-bench](https://github.com/baem1n/llm-bench) | 방법론: [1편](/posts/llm-bench-01-methodology)
