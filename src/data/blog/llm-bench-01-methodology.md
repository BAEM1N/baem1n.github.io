---
author: baem1n
pubDatetime: 2026-04-05T00:00:00.000Z
title: "로컬 LLM 추론 벤치마크: 4대 하드웨어 × 6개 엔진 실험 설계"
description: "Qwen3.5 모델을 4개 플랫폼(M5 Max, RTX 3090×2, DGX Spark, Ryzen AI MAX 395+)에서 측정하는 크로스 플랫폼 벤치마크의 실험 설계, 방법론, 주의사항을 정리합니다."
tags:
  - llm
  - benchmark
  - apple-silicon
  - nvidia
  - amd
  - methodology
featured: false
aiAssisted: true
---

> **TL;DR**: 동일 모델·동일 가중치·동일 설정으로 4대 하드웨어의 순수 추론 성능을 비교하는 Track B와, 각 플랫폼 내부에서 엔진별 차이를 보는 Track A로 나눠 실험했다. prompt cache 오염, prefix reuse, 컨텍스트 정책, 실행 순서 편향 등 흔한 함정을 모두 차단한 설계를 공유한다.

## Table of contents

## 왜 이 실험을 하는가

"Qwen3.5-35B를 MacBook에서 돌리면 얼마나 빠를까?" — 이 질문에 정직하게 답하려면 상당히 까다로운 실험 설계가 필요하다.

단순히 `llama-server`를 띄우고 토큰/초를 재면 될 것 같지만, 실제로는:

- **prompt cache**가 prefill 수치를 10배 이상 부풀릴 수 있고
- **백엔드마다 TTFT의 의미**가 달라서 단순 비교가 불가능하고
- **가중치 형식**(GGUF vs MLX)이 다르면 엔진 비교가 아니라 엔진+가중치 패키지 비교가 되고
- **컨텍스트 윈도우 크기**가 KV cache 점유를 통해 gen_tps에 영향을 준다

이 글은 이런 함정들을 모두 식별하고 차단한 벤치마크 설계를 공유한다.

---

## 하드웨어 4대

| ID | 장비 | 메모리 | GPU/가속기 | 특징 |
|----|------|--------|-----------|------|
| `macbook-m-series` | MacBook Pro 14 (M5 Max) | 128GB unified | Apple GPU (40코어) | 546 GB/s 대역폭 |
| `linux-5950x-3090x2` | Ryzen 9 5950X + RTX 3090 ×2 | 128GB DDR4 + 48GB VRAM | CUDA (Ampere) | 이산 GPU, PCIe |
| `dgx-spark` | NVIDIA DGX Spark (GB10) | 128GB unified | Blackwell GPU | 273 GB/s, CUDA 13 |
| `ryzen-ai-max-395` | HP Z2 Mini G1a (Strix Halo) | 128GB unified (96GB VRAM) | Radeon 8060S (Vulkan/ROCm) | iGPU, 256 GB/s |

4대 모두 128GB 메모리를 갖추고 있어 122B MoE 모델까지 실행 가능하다.

---

## 모델

| 모델 | 아키텍처 | 총 파라미터 | 활성 파라미터 | 컨텍스트 |
|------|----------|-----------|-------------|---------|
| Qwen3.5-9B | Dense | 9B | 9B | 256K |
| Qwen3.5-27B | Dense | 27B | 27B | 256K |
| Qwen3.5-35B-A3B | MoE | 35B | ~3B | 256K |
| Qwen3.5-122B-A10B | MoE | 122B | ~10B | 256K |

양자화: Q4_K_M (4-bit)과 Q8_0 (8-bit), 모두 unsloth GGUF.

---

## 두 가지 트랙

### Track B — 하드웨어 비교

> 변수: **하드웨어만**. 엔진·가중치·설정 모두 고정.

| 항목 | 값 |
|------|-----|
| 엔진 | llama.cpp (동일 버전) |
| 가중치 | unsloth GGUF (Q4_K_M, Q8_0) |
| 설정 | flash_attn=on, batch=512, ubatch=512, no-cache-prompt |
| 컨텍스트 | 모델 네이티브 (256K) — OOM 시 실패 기록 |

이 트랙의 결과로 "같은 모델을 Mac에서 돌리면 DGX 대비 몇 배 느린가?"에 답할 수 있다.

### Track A — 엔진 비교 (플랫폼 내부)

> 변수: **엔진만**. 하드웨어 고정.

각 플랫폼에서 사용 가능한 백엔드를 모두 실행:

| 플랫폼 | 백엔드 |
|--------|--------|
| Mac | llama.cpp, Ollama, MLX |
| 3090 | llama.cpp, Ollama, vLLM |
| DGX Spark | llama.cpp, Ollama, vLLM |
| Ryzen AI | llama.cpp, Ollama, Lemonade |

**해석 범위**: Track A는 **플랫폼 내부 비교**로만 해석한다. Mac의 MLX 결과와 Linux의 vLLM 결과를 놓고 "엔진 비교"라고 하면 안 된다.

---

## 측정 트랙

### Generation — 출력 속도 측정

| Track ID | 입력 | 출력 |
|----------|------|------|
| gen-512 | 64 tok | 512 tok |
| gen-2048 | 64 tok | 2,048 tok |
| gen-4096 | 64 tok | 4,096 tok |
| gen-8192 | 64 tok | 8,192 tok |

### Prefill — 입력 처리 속도 측정

| Track ID | 입력 | 출력 |
|----------|------|------|
| prefill-1k | 1,024 tok | 10 tok |
| prefill-4k | 4,096 tok | 10 tok |
| prefill-16k | 16,384 tok | 10 tok |
| prefill-64k | 65,536 tok | 10 tok |
| prefill-128k | 131,072 tok | 10 tok |

---

## 실험 무결성 보장

### 1. Prompt Cache 완전 차단

llama.cpp의 `--cache-prompt`(기본 활성)과 `--slot-prompt-similarity`(기본 0.10)가 prefill 수치를 심각하게 왜곡한다.

초기 실험에서 llama.cpp 128K prefill이 TTFT 0.21초, prefill_tps 574,324 tok/s로 나왔다. 이건 실제 prefill이 아니라 **KV cache 재사용** 성능이었다.

**차단 방법**:

```
--no-cache-prompt              # prompt KV cache 비활성화
--slot-prompt-similarity 0     # prefix reuse 비활성화
```

vLLM: `--no-enable-prefix-caching`
SGLang: `--disable-radix-cache`

### 2. Run별 프롬프트 재생성 (Nonce Prefix)

매 측정 run마다 프롬프트 맨 앞에 랜덤 nonce를 삽입한다:

```
[run:8eovt3an7ge9lbtj96n55f57reqz92gd] The history of computing...
```

이렇게 하면:
- warmup과 measure가 다른 프롬프트
- 같은 track의 연속 run이 다른 프롬프트
- 다른 track 간 prefix 공유 불가능

### 3. Cold Prefill 보장 (서버 재시작)

prefill track 전환 시 서버 프로세스를 재시작한다. 이렇게 해야 이전 track의 KV cache, CUDA context, allocator 상태가 완전히 초기화된다.

### 4. 컨텍스트 네이티브 강제

모델의 네이티브 컨텍스트(Qwen3.5: 256K)를 그대로 사용한다. OOM이 발생하면 컨텍스트를 줄이지 않고 실패로 기록한다. 이렇게 해야 "이 하드웨어에서 256K 컨텍스트로 27B를 돌릴 수 있는가?"에 대한 정직한 답이 된다.

### 5. 실행 순서 랜덤화

backend, model, track 순서를 매 실행마다 랜덤화한다. 고정 순서로 돌리면 발열, allocator 상태, 캐시 상태가 순서에 편향을 만든다.

### 6. OOM/실패 기록

모델 로드 실패, 컨텍스트 초과, 서버 크래시 등 모든 실패를 CSV에 `skip:load_fail`, `skip:ctx_exceeded`, `failed` 상태로 기록한다. 어떤 조합이 실패했는지가 성공만큼 중요한 정보다.

---

## 측정 프로토콜

| 항목 | 값 |
|------|-----|
| 워밍업 | 1회 (별도 프롬프트, 결과 제외) |
| 측정 | 5회, 중앙값 집계 |
| Run 간 대기 | 5초 |
| Track 간 대기 | 60초 |
| 모델 간 대기 | 120초 |
| 백엔드 간 대기 | 60초 |
| 온도 가드 | 85°C 초과 시 60초 쿨다운 |

### 주요 메트릭

- **Gen TPS**: 생성 토큰/초. TTFT 이후부터 마지막 토큰까지.
- **TTFT**: 첫 토큰까지 시간 (ms). 클라이언트 측 측정.
- **Prefill TPS**: `input_tokens / (TTFT_seconds)`. 클라이언트 측 통일 정의.
- **Hit Rate**: `output_tokens / max_tokens`. 생성 완주율.

---

## 알려진 제약

1. **가중치 형식 차이**: Track A에서 MLX(mlx 4-bit)와 llama.cpp(GGUF Q4_K_M)는 동일 양자화 수준이지만 구현이 다르다. 순수 엔진 비교가 아니라 엔진+가중치 패키지 비교에 가깝다.

2. **Ollama TTFT 구조적 불리**: Ollama는 full context pre-allocation을 하므로 TTFT에 KV cache 할당 시간이 포함된다. 256K 컨텍스트에서 이 오버헤드가 수십 초에 달한다.

3. **입력 토큰 수 근사**: 토크나이저 기반 정확한 토큰 수를 목표로 하지만, 토크나이저 로드 실패 시 문자 수 근사(3.8 chars/token)로 폴백한다.

4. **출력 품질 미검증**: hit_rate는 길이 완주율일 뿐 품질 지표가 아니다. 반복/루프도 hit_rate 높게 나온다.

---

## 다음 글

[2편: 4대 하드웨어 × 6개 엔진 성능 비교 결과](/posts/llm-bench-02-results)에서 실제 측정 데이터를 분석한다.

---

## 코드

전체 벤치마크 코드는 오픈소스로 공개되어 있다:

- GitHub: [baem1n/llm-bench](https://github.com/baem1n/llm-bench)
