---
author: baem1n
pubDatetime: 2026-04-05T00:00:00.000Z
modDatetime: 2026-04-05T12:00:00.000Z
title: "Qwen3.5 크로스 플랫폼 벤치마크: 4대 하드웨어 성능 비교"
description: "Mac M5 Max, RTX 3090×2, DGX Spark, Ryzen AI MAX 395+에서 Qwen3.5를 동일 조건(llama.cpp + GGUF)으로 측정한 생성/프리필 벤치마크. cold prefill, cache 차단 적용."
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

> **TL;DR**: 동일 모델·동일 가중치(llama.cpp + GGUF)로 4대 하드웨어를 비교하면, Mac M5 Max가 메모리 대역폭 이점으로 대부분의 모델에서 1위. MoE 35B-A3B는 전 플랫폼에서 9B Dense보다 빠르다. DGX Spark(GB10)은 273 GB/s 대역폭의 한계로 Mac의 절반 수준. Ryzen AI MAX 395+는 96GB VRAM으로 122B까지 실행 가능하지만 속도는 Mac의 1/3~1/2.

> 실험 설계는 [1편: 실험 방법론](/posts/llm-bench-01-methodology)을 참고. 일부 플랫폼은 실험 진행 중이며, 결과가 추가되면 업데이트됩니다.

## Table of contents

## 하드웨어 스펙

| | 🍎 Mac M5 Max | 🖥️ 3090 ×2 | 🔷 DGX Spark | 🔶 Ryzen AI MAX |
|--|---------------|------------|-------------|----------------|
| CPU | Apple M5 Max | Ryzen 9 5950X | Grace ARM (20C) | Ryzen AI MAX+ PRO 395 |
| GPU | Apple GPU 40C | RTX 3090 ×2 | GB10 Blackwell | Radeon 8060S (40 CU) |
| 메모리 | 128GB unified | 128GB DDR4 + 48GB VRAM | 128GB unified | 128GB unified (96GB VRAM) |
| 대역폭 | **546 GB/s** | DDR4 ~50 GB/s + GDDR6X ~936 GB/s | 273 GB/s | 256 GB/s |
| 아키텍처 | Metal | CUDA (Ampere) | CUDA (Blackwell) | Vulkan / ROCm |

---

## Track B: 하드웨어 비교 (동일 llama.cpp + 동일 GGUF)

> 변수는 **하드웨어뿐**. 엔진, 가중치, 설정 모두 동일.

### Generation 속도 (gen-512, Q4_K_M, 중앙값 tok/s)

| 모델 | 🍎 Mac | 🖥️ 3090 | 🔷 DGX | 🔶 Ryzen | 최고 |
|------|:------:|:-------:|:------:|:-------:|:----:|
| **9B** Dense | **75.9** | 117.2 | 36.8 | 36.2 | 🖥️ |
| **27B** Dense | 24.8 | **41.4** | 11.5 | **43.8** | 🔶 |
| **35B-A3B** MoE | **94.1** | 135.0 | 59.6 | 58.0 | 🖥️ |
| **122B-A10B** MoE | **42.9** | 130.7 | — | 22.9 | 🖥️ |

### Generation 속도 (gen-512, Q8_0)

| 모델 | 🍎 Mac | 🖥️ 3090 | 🔷 DGX | 🔶 Ryzen |
|------|:------:|:-------:|:------:|:-------:|
| **9B** | 50.8 | **138.6** | 24.3 | — |
| **27B** | — | **27.5** | 7.6 | — |
| **35B-A3B** | **88.4** | 123.7 | 52.6 | 50.8 |

### Prefill 속도 (prefill-16k, Q4_K_M, 중앙값 tok/s)

| 모델 | 🍎 Mac | 🖥️ 3090 | 🔷 DGX |
|------|:------:|:-------:|:------:|
| **9B** | 1,148 | **4,193** | 1,548 |
| **27B** | 383 | **1,781** | 491 |
| **35B-A3B** | 974 | **5,159** | 1,543 |

### TTFT (gen-512, Q4_K_M, ms)

| 모델 | 🍎 Mac | 🖥️ 3090 | 🔷 DGX | 🔶 Ryzen |
|------|:------:|:-------:|:------:|:-------:|
| **9B** | **120** | 136 | 166 | 609⁑ |
| **27B** | 310 | 7,805 | 267 | 609 |
| **35B-A3B** | **119** | 233 | 175 | 1,994 |
| **122B** | 282 | **193** | — | 840 |

⁑ Ryzen 9B TTFT가 27B와 같은 값 — Track A/B 데이터 혼재 가능성. 추가 검증 필요.

---

## 핵심 발견

### 1. 3090 2-WAY가 절대 속도 1위

RTX 3090 ×2의 936 GB/s 총 대역폭(GDDR6X ×2)이 generation에서 압도적이다. 9B Q4에서 117 tok/s, 122B MoE에서 131 tok/s.

다만 **TTFT가 불안정**하다. 27B gen-512에서 7.8초 — 256K 컨텍스트 KV cache 할당 오버헤드.

### 2. Mac M5 Max는 균형 최강

546 GB/s unified 대역폭으로 35B-A3B MoE에서 94 tok/s, 122B에서 43 tok/s. TTFT가 전 모델 120~310ms로 **가장 안정적**이다. 실사용에서 체감 속도가 가장 좋다.

### 3. DGX Spark는 대역폭에 묶임

128GB unified 메모리로 모든 모델이 올라가지만, 273 GB/s 대역폭이 병목. Mac의 약 절반 속도. Blackwell GPU의 연산 능력이 대역폭에 의해 활용되지 못한다.

### 4. Ryzen AI MAX 395+는 96GB VRAM의 가능성

96GB BIOS VRAM 설정으로 122B MoE까지 GPU에 올린다. 속도는 Mac의 1/3~1/2이지만, **$2,000대 미니 PC에서 122B를 돌릴 수 있다**는 점이 핵심 가치.

27B Q4에서 43.8 tok/s로 3090(41.4)을 근소하게 앞서는 것은 주목할 만하다.

### 5. MoE의 보편적 효율

**전 플랫폼에서** 35B-A3B MoE(3B active)가 9B Dense보다 빠르다:

| 플랫폼 | 9B Dense | 35B-A3B MoE | MoE 우위 |
|--------|----------|-------------|---------|
| Mac | 75.9 | 94.1 | +24% |
| 3090 | 117.2 | 135.0 | +15% |
| DGX | 36.8 | 59.6 | +62% |
| Ryzen | 36.2 | 58.0 | +60% |

---

## Track A: 엔진 비교 (플랫폼 내부)

> ⚠️ Track A는 **같은 플랫폼 내부**에서만 비교. 다른 플랫폼의 다른 엔진끼리는 비교하지 않는다.

### 🖥️ 3090: llamacpp vs Ollama (gen-512 tok/s)

| 모델 | llamacpp | Ollama | 차이 |
|------|---------|--------|------|
| 9B Q4 | 117.3 | 100.5 | llamacpp +17% |
| 9B Q8 | 130.6 | 73.5 | llamacpp +78% |
| 27B Q4 | — | 36.7 | — |
| 27B Q8 | — | 5.4 ⚠️ | Ollama VRAM swap |

Ollama 27B Q8_0의 5.4 tok/s는 VRAM 초과 → CPU swap 발생. 실사용 불가.

### 🍎 Mac: llamacpp vs Ollama (gen-512 tok/s)

| 모델 | llamacpp | Ollama |
|------|---------|--------|
| 9B Q4 | 75.9 | 29.2 |

Mac Ollama는 llamacpp 대비 **2.6배 느리다**. 256K 컨텍스트 KV pre-allocation 오버헤드.

> MLX 결과는 실험 진행 중. 완료되면 추가.

---

## OOM / 실패 기록

| 플랫폼 | 조합 | 사유 |
|--------|------|------|
| 3090 | vLLM 27B/35B Q8_0 (BF16) | 48GB VRAM 초과 |
| DGX | 122B llamacpp | 아직 미실행 |
| Ryzen | 9B/27B Q8_0 | Track B 미완료 (진행 중) |

---

## 진행 상태

| 플랫폼 | Track B | Track A | 비고 |
|--------|---------|---------|------|
| 🖥️ 3090 | ✅ 완료 (7 모델×퀀트) | ✅ 완료 | 982 rows |
| 🔷 DGX | ✅ 6 조합 | 🔄 9B 진행 중 | 287 rows |
| 🔶 Ryzen | ✅ 4 조합 | 🔄 27B 진행 중 | 260 rows |
| 🍎 Mac | ✅ 6 조합 | 🔄 Ollama 진행 | 285 rows |

> 실험 완료 시 이 글을 업데이트합니다.

---

## 다음

- 전 플랫폼 Track A 완료 후 엔진 비교 분석 추가
- Gemma 4 모델 추가 실험
- 동시성(Concurrency) 벤치마크

---

> 실험 코드: [baem1n/llm-bench](https://github.com/baem1n/llm-bench) | 방법론: [1편](/posts/llm-bench-01-methodology)
