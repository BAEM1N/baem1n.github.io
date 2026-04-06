---
author: baem1n
pubDatetime: 2026-04-05T00:00:00.000Z
modDatetime: 2026-04-06T12:00:00.000Z
title: "Qwen3.5 크로스 플랫폼 벤치마크: 4대 하드웨어 × 6개 엔진 성능 비교"
description: "Mac M5 Max, RTX 3090×2, DGX Spark, Ryzen AI MAX 395+에서 Qwen3.5를 동일 조건(llama.cpp + GGUF)으로 측정한 생성/프리필 벤치마크. 3,862회 측정, cold prefill, cache 차단 적용."
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

> 실험 설계는 [1편: 실험 방법론](/posts/llm-bench-01-methodology)을 참고. 총 3,862회 측정 (OK: 3,642).

## Table of contents

## 하드웨어 스펙

| | 🍎 Mac M5 Max | 🖥️ 3090 ×2 | 🔷 DGX Spark | 🔶 Ryzen AI MAX |
|--|:--:|:--:|:--:|:--:|
| CPU | Apple M5 Max | Ryzen 9 5950X | Grace ARM 20C | Ryzen AI MAX+ PRO 395 |
| GPU | Apple GPU 40C | RTX 3090 ×2 | GB10 Blackwell | Radeon 8060S 40CU |
| 메모리 | 128GB unified | 128GB DDR4 + 48GB VRAM | 128GB unified | 128GB (96GB VRAM) |
| 대역폭 | **546 GB/s** | ~936 GB/s GDDR6X | 273 GB/s | 256 GB/s |

---

## Track B: 하드웨어 비교

> 변수는 **하드웨어뿐**. llama.cpp + 동일 GGUF + 동일 설정.

### Generation 속도 (gen-512, Q4_K_M, 중앙값 tok/s)

| 모델 | 🍎 Mac | 🖥️ 3090 | 🔷 DGX | 🔶 Ryzen |
|------|:------:|:-------:|:------:|:-------:|
| **9B** Dense | 75.9 | **117.5** | 36.8 | 36.2 |
| **27B** Dense | 24.4 | **41.4** | 11.5 | 12.3* |
| **35B-A3B** MoE | 94.1 | **135.0** | 59.6 | 58.0 |
| **122B-A10B** MoE | 42.9 | **130.7** | — | 22.9 |

> \* Ryzen 27B는 Track A 값 사용 (Track B 불완전).  
> DGX 122B: GGUF 다운로드 실패 → 미측정.

### MoE의 보편적 효율

**전 플랫폼에서** 35B-A3B MoE(3B active)가 9B Dense보다 빠르다:

| 플랫폼 | 9B Dense | 35B-A3B MoE | MoE 우위 |
|--------|----------|-------------|---------|
| 🍎 Mac | 75.9 | **94.1** | +24% |
| 🖥️ 3090 | 117.5 | **135.0** | +15% |
| 🔷 DGX | 36.8 | **59.6** | +62% |
| 🔶 Ryzen | 36.2 | **58.0** | +60% |

### Prefill 속도 (prefill-1k, Q4_K_M, tok/s)

| 모델 | 🍎 Mac | 🖥️ 3090 | 🔷 DGX |
|------|:------:|:-------:|:------:|
| **9B** | 1,705 | **2,774** | 2,217 |
| **27B** | 504 | **961** | 674 |
| **35B-A3B** | 2,302 | **2,819** | 1,602 |

3090이 RTX 3090 GDDR6X 대역폭으로 prefill에서도 1위.

---

## Track A: 엔진 비교 (플랫폼 내부)

> ⚠️ **같은 플랫폼 내부에서만 비교**. Mac의 MLX와 Linux의 vLLM을 놓고 "엔진 비교"라고 하면 안 된다.

### 🍎 Mac: MLX vs llama.cpp (gen-512, tok/s)

| 모델 | MLX Q4 | llama.cpp Q4 | MLX 우위 |
|------|-------:|------------:|---------:|
| 9B | **102.4** | 75.9 | +35% |
| 27B | **28.8** | 24.4 | +18% |
| 35B-A3B | **138.3** | 94.1 | +47% |
| 122B | **66.8** | 42.9 | +56% |

MLX가 generation에서 전 모델 우위. Metal 4-bit 커널 최적화 효과.

### 🖥️ 3090: vLLM vs llama.cpp vs Ollama (gen-512, tok/s)

| 모델 | vLLM | llama.cpp | Ollama |
|------|-----:|----------:|-------:|
| 9B Q4 | 83.6 | **117.3** | 100.5 |
| 9B Q8 | 83.5 | **130.6** | 73.5 |
| 35B Q4 | **156.3** | 138.6 | 101.7 |
| 27B Q4 | — | **41.5** | 36.7 |

- **vLLM 35B GPTQ-Marlin = 156.3 tok/s** — llamacpp(138.6) 대비 12% 빠름. MoE + Marlin 커널 최적화.
- 9B에서는 llamacpp가 vLLM을 앞섬 (117 vs 84). 모델 크기에 따라 우위가 달라진다.
- vLLM 27B GPTQ는 서버 초기화 실패로 미측정.

### 🔶 Ryzen: llama.cpp vs Ollama (gen-512, tok/s)

| 모델 | llama.cpp Q4 | Ollama Q4 | 차이 |
|------|------------:|----------:|-----:|
| 9B | **36.2** | 31.9 | +13% |
| 27B | **12.3** | 11.1 | +11% |
| 35B-A3B | **58.4** | 43.9 | +33% |
| 122B | **22.8** | 4.6 | **+396%** |

Ollama 122B가 4.6 tok/s — 256K KV cache 할당이 96GB VRAM을 압박하여 swap 발생. llamacpp는 22.8 tok/s로 안정.

---

## 핵심 발견

### 1. 3090 2-WAY가 절대 속도 1위

RTX 3090 ×2의 GDDR6X 936 GB/s 대역폭이 generation과 prefill 모두에서 압도적. 122B MoE에서 130.7 tok/s.

다만 TTFT가 불안정하다. 27B gen-512에서 7.8초 — 256K 컨텍스트 KV cache 할당 오버헤드.

### 2. Mac M5 Max는 실사용 최강

546 GB/s unified 대역폭으로 TTFT 120~310ms. MLX 35B MoE 138 tok/s. 절대 속도는 3090에 밀리지만, **체감 응답성이 가장 좋다**.

### 3. vLLM GPTQ-Marlin의 잠재력

35B MoE에서 156.3 tok/s — 전체 실험 최고 속도. GPTQ-Marlin 커널이 MoE 아키텍처에서 특히 효과적. 단, 9B에서는 llamacpp가 더 빠름.

### 4. DGX Spark 대역폭 병목

128GB unified로 모든 모델이 올라가지만, 273 GB/s 대역폭이 Mac(546)의 절반. 가격 대비 성능은 아쉬움.

### 5. Ryzen AI 96GB VRAM의 가치

$2,000대 미니 PC에서 122B를 22.9 tok/s로 돌린다. 128GB unified 메모리의 96GB를 GPU VRAM으로 할당.

### 6. Ollama TTFT 구조적 문제

256K 컨텍스트에서 KV pre-allocation으로 TTFT가 5~112초. 실서비스에서는 컨텍스트를 줄이거나 llamacpp 직접 사용이 현실적.

---

## OOM / 실패 기록

| 플랫폼 | 조합 | 사유 |
|--------|------|------|
| 🖥️ 3090 | 122B llamacpp prefill | 48GB VRAM + 256K KV cache 초과 |
| 🖥️ 3090 | Ollama 27B Q8, 122B | VRAM swap → 5 tok/s |
| 🖥️ 3090 | vLLM 27B GPTQ | 서버 초기화 실패 |
| 🔷 DGX | 122B llamacpp | GGUF 파일 깨짐 |
| 🔷 DGX | vLLM 전체 | CUDA 13/12 호환 불가 (Docker 빌드 중) |
| 🔶 Ryzen | Ollama 122B | KV pre-allocation swap (4.6 tok/s) |

---

## 데이터

| 플랫폼 | 총 측정 | 유효 | 비고 |
|--------|-------:|-----:|------|
| 🖥️ 3090 | 1,423 | 1,316 | Track A+B 완료 |
| 🔷 DGX | 939 | 849 | vLLM Docker 빌드 중 |
| 🔶 Ryzen | 785 | 764 | Lemonade/vLLM 대기 |
| 🍎 Mac | 715 | 713 | Ollama/MLX 일부 진행 중 |
| **합계** | **3,862** | **3,642** | |

---

## 다음

- DGX Spark vLLM (Docker 빌드 후)
- Ryzen AI Lemonade Server
- Mac Ollama/MLX 나머지
- Gemma 4 모델 추가

---

> 실험 코드: [baem1n/llm-bench](https://github.com/baem1n/llm-bench) | 방법론: [1편](/posts/llm-bench-01-methodology)
