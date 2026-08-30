---
author: baem1n
pubDatetime: 2026-08-29T00:00:00.000Z
title: "176B를 128GB 한 대에 — Qwen3.8-Flash-Next를 GB10에 올리고 커널까지 파고든 기록"
description: "공식 양자화는 전부 메모리를 넘겼다. 미머지 PR로 빌드해 87GiB짜리 4bit를 올렸더니 이번엔 26만 토큰에서 CUDA가 죽었다. grid.y 한계 65,535까지 따라가 원인을 찾고, 모델 없이 두 줄로 재현하고, 고쳐서 검증했다."
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

> **TL;DR**: 176B(활성 3B) 모델을 128GB 단일 노드에 올렸다. **공식 양자화는 BF16 360GB·FP8 186GB로 전부 안 들어가서** unsloth GGUF와 **미머지 PR** 빌드가 유일한 길이었다. 올리고 나니 26만 토큰에서 `CUDA error: invalid argument`가 떴다. 원인은 컨텍스트도 메모리도 아닌 **CUDA grid.y 한계 65,535**였고, 실사용 상한은 학습 상한(262,144)보다 **256 낮은 261,888**이다. 모델 없이 두 줄로 재현했고, 고쳐서 21,099개 회귀 테스트까지 통과시켰다. 그리고 **커밋 하나 차이로 긴 컨텍스트 성능이 2배** 뛰었다.

## Table of contents

## 이 글을 읽고 나면

- 128GB 통합 메모리에 **176B 모델이 실제로 들어가는지**, 어떤 양자화가 현실적인지 알 수 있다.
- 하이브리드 어텐션 모델이 **왜 26만 토큰 KV를 6GiB에 담는지** 계산으로 이해할 수 있다.
- `CUDA error: invalid argument` 같은 무성의한 에러에서 **커널 launch 파라미터까지 역추적하는 방법**을 볼 수 있다.
- 미머지 PR로 최신 모델을 돌린다는 것이 **실제로 무엇을 감수하는 일인지** 수치로 판단할 수 있다.

## 왜 llama.cpp였나 — 선택지가 없었다

DGX Spark(GB10)는 121 GiB 통합 메모리를 쓴다. Qwen3.8-Flash-Next는 **176.94B 파라미터, 활성 3B의 MoE**에 하이브리드 희소·선형 어텐션 구조다. 공식 배포본을 먼저 봤다.

| 배포 | 출처 | 크기 | 121 GiB 노드 |
|---|---|---:|---|
| `Qwen/Qwen3.8-Flash-Next` BF16 | 공식 | 360.0 GB | ❌ |
| `Qwen/Qwen3.8-Flash-Next-FP8` | 공식 | 185.6 GB | ❌ |
| NVFP4 | **공식·unsloth 모두 없음** | — | — |

**공식 양자화 중 들어가는 게 하나도 없다.** GB10은 Blackwell이라 NVFP4 하드웨어 가속이 되지만, Qwen도 unsloth도 NVFP4를 내지 않았다. Hugging Face에 NVFP4가 8종 있는데 전부 개인 변환본이다.

여기서 원칙 하나를 지켰다. 예전에 제3자 GGUF 리랭커 변환본을 썼다가 점수가 e-14 노이즈로 나오면서 랭킹이 통째로 무너진 적이 있어, 그 뒤로는 **공식 또는 unsloth 배포만** 쓴다.

그래서 남은 건 unsloth GGUF뿐이었다.

| quant | 크기 | 121 GiB 노드 |
|---|---:|---|
| UD-Q4_K_XL | 111.3 GB | ❌ |
| **UD-IQ4_XS** | **93.7 GB** | ✅ 채택 |
| UD-Q3_K_XL | 90.0 GB | ✅ |
| UD-IQ3_XXS | 82.0 GB | ✅ |
| UD-Q2_K_XL | 78.9 GB | ✅ |
| UD-IQ1_M | 74.5 GB | ✅ |

**이 모델은 양자화를 낮춰도 별로 안 줄어든다.** 1bit인 IQ1_M도 74.5GB다. 4bit(93.7GB)와 1bit(74.5GB)의 차이가 20GB뿐이라, 품질을 크게 버려도 얻는 게 적다. 그래서 들어가는 것 중 가장 큰 IQ4_XS를 골랐다.

### 미머지 PR을 빌드해야 한다

unsloth 문서가 못 박아 뒀다. **메인라인 llama.cpp로는 이 모델이 로드되지 않는다.**

아키텍처가 `Qwen4ExpForConditionalGeneration`(`model_type: qwen4_exp`) — Qwen4의 프리뷰다. 지원은 [PR #27742](https://github.com/ggml-org/llama.cpp/pull/27742) "model: add Qwen3.8-Flash-Next (qwen4exp)"에만 있고, 이 글을 쓰는 시점에 **아직 열려 있다.**

```bash
git clone --depth 50 -b qwen4exp/qwen3.8-flash-next \
  https://github.com/unslothai/llama.cpp ~/llama.cpp-qwen4exp
cd ~/llama.cpp-qwen4exp
cmake -B build -DGGML_CUDA=ON -DCMAKE_CUDA_ARCHITECTURES=native \
      -DLLAMA_CURL=OFF -DCMAKE_BUILD_TYPE=Release
cmake --build build -j 18 --target llama-server llama-cli llama-bench
```

PR의 커밋 25개가 건드린 파일을 보면 전부 `src/`(`llama-arch`, `llama-graph`, `llama-model`, `qwen4exp.cpp`, `llama-memory-hybrid-idx` 등)와 `gguf-py`다. **`ggml/src/ggml-cuda`는 한 줄도 안 건드린다.** 신규 아키텍처가 기존 ggml 연산 조합만으로 구현됐다는 뜻이고, 그래서 Vulkan 같은 다른 백엔드에서도 그대로 돌아간다.

다운로드는 무결성을 확인했다.

```
Qwen3.8-Flash-Next-UD-IQ4_XS-00001-of-00003.gguf      10,946,624
Qwen3.8-Flash-Next-UD-IQ4_XS-00002-of-00003.gguf  49,835,229,856
Qwen3.8-Flash-Next-UD-IQ4_XS-00003-of-00003.gguf  43,836,407,744
```

세 샤드 모두 HF 원본과 **바이트 단위로 일치**한다. 첫 샤드가 10MB로 유난히 작은데, 여기에 메타데이터가 들어 있다.

## 올라갔다 — 그리고 컨텍스트가 뜻밖에 싸다

```
ggml_cuda_init: found 1 CUDA devices (Total VRAM: 124616 MiB):
  Device 0: NVIDIA GB10, compute capability 12.1, VMM: yes
qwen4exp A3B IQ4_XS - 4.25 bpw | 87.24 GiB | 176.94 B | CUDA | ngl 99
```

87.24 GiB가 올라가고 121 GiB 중 94 GiB를 썼다. 한국어 응답도 정상이다.

흥미로운 건 컨텍스트 비용이었다. 공식 `config.json`을 보자.

```json
"num_hidden_layers": 48,
"full_attention_interval": 4,
"num_key_value_heads": 2,
"head_dim": 256,
"max_position_embeddings": 262144
```

**48개 레이어 중 full attention은 12개뿐이고 나머지 36개는 linear attention이다.** KV 캐시가 붙는 레이어가 1/4로 줄어든다.

```
토큰당 KV = 2 heads × 256 dim × 2 (K+V) × 2 B × 12 layers = 24 KiB
262,144 토큰 = 6.0 GiB
```

**26만 토큰을 다 채워도 KV가 6 GiB다.** 실측도 맞았다.

| 설정 | 메모리 사용 |
|---|---|
| 32K × 4슬롯, f16 KV | 94 GiB |
| 256K × 1슬롯, q8_0 KV | 98 GiB |
| 256K × 1슬롯, f16 KV | 112 GiB |

**컨텍스트를 8배로 늘렸는데 메모리는 4 GiB만 더 썼다.** 하이브리드 어텐션이 통합 메모리 노드에서 갖는 실질적인 이점이 이것이다.

여기까지가 "잘 돌아간다"는 이야기다. 문제는 그다음이었다.

## 26만 토큰에서 죽는다

`llama-bench`의 depth 스윕을 돌렸다. `-d 262144`에서 프로세스가 죽었다.

```
/ggml/src/ggml-cuda/ggml-cuda.cu:107: CUDA error
#4 rms_norm_mul_f32_cuda(...)
#5 ggml_cuda_op_rms_norm_fused(...)
#6 ggml_cuda_try_fuse(...)
#7 ggml_backend_cuda_graph_compute(...)
```

첫 가설은 단순했다. `llama-bench`는 `n_ctx = n_prompt + n_gen + n_depth`로 잡으므로 `262144 + 512 + 128 = 262,784`가 되어 학습 상한(262,144)을 **632토큰 초과**한다. 그래서 `-d 261503`으로 정확히 상한에 맞춰 다시 돌렸다.

**똑같이 죽었다.** 가설이 반증됐다.

### 에러 메시지를 놓치고 있었다

`ggml-cuda.cu`를 열어 보니 에러 출력이 세 줄이어야 했다.

```c
GGML_LOG_ERROR(GGML_CUDA_NAME " error: %s\n", msg);
GGML_LOG_ERROR("  current device: %d, in function %s at %s:%d\n", ...);
GGML_LOG_ERROR("  %s\n", stmt);
GGML_ABORT(GGML_CUDA_NAME " error");
```

그런데 로그엔 마지막 `GGML_ABORT` 줄만 남아 있었다. **`llama-bench`가 로그를 억제하고 있었다.** `-v`를 붙이자 진짜 메시지가 나왔다.

```
CUDA error: invalid argument
  current device: 0, in function ggml_cuda_kernel_launch at common.cuh:1668
  cudaLaunchKernelEx(&pdl_cfg.cfg, kernel, ...)
```

**메모리 접근 위반이 아니라 커널 launch 설정 오류다.** grid/block 차원이 하드웨어 한계를 넘었다는 뜻이다.

> 재현에 40분씩 걸리는 상황에서 첫 실행에 `-v`를 안 붙인 대가가 컸다. 크래시를 재현할 때는 처음부터 로그를 최대로 열어 두는 게 싸다.

### grid.y가 65,535다

`ggml/src/ggml-cuda/norm.cu`의 launch 지점은 이렇게 생겼다.

```c
const dim3 blocks_num(nrows, nchannels, nsamples);
```

하드웨어에 직접 물어봤다.

```
name=NVIDIA GB10 cc=12.1
maxGridSize = [2147483647, 65535, 65535]
```

**grid.x는 21억인데 grid.y와 grid.z는 65,535다.** 그러면 어떤 차원이 65,535를 넘는지 찾으면 된다.

`src/models/qwen4exp.cpp`에서 나왔다. QSA 희소 어텐션의 인덱서가 키를 압축비 `r`로 풀링한다.

```c
const int64_t r        = hparams.dsv4_compress_ratios[il];
const int64_t n_blocks = (n_kv + r - 1)/r;
...
pooled = ggml_reshape_3d(ctx0, pooled, idx_dim, 1, n_blocks*n_stream);
pooled = build_norm(pooled, model.layers[il].index_k_norm, nullptr, LLM_NORM_RMS, il);
```

**큰 차원이 `ne[1]`이 아니라 `ne[2]`로 갔다.** `ne[1]`은 1이다. 그래서 grid가 `(1, n_blocks, 1)`이 되고, `n_blocks`가 통째로 **grid.y**에 실린다.

압축비는 GGUF 메타데이터에 있었다.

```
qwen4exp.attention.compress_ratios arr[i32,48] = [0, 0, 0, 4, 0, 0, 0, 4, ...]
qwen4exp.context_length            u32         = 262144
```

**`r = 4`**, full attention 레이어마다 걸린다. 그러면 한계가 계산된다.

```
n_blocks = ⌈n_kv / 4⌉ ≤ 65,535
→ n_kv ≤ 262,140
```

학습 상한 262,144보다 낮다. 이 모델의 전체 컨텍스트는 CUDA 경로에서 구조적으로 도달할 수 없다는 뜻이다.

> 262,140이라는 값은 위 부등식에서 **유도한 상계**다. 262,140과 262,141을 각각 찔러 정확한 전환점을 측정하진 않았으므로, 실측으로 확정된 것은 아래 네 지점이 가리키는 **경계 구간**이다.

### 예측과 실측이 네 지점에서 맞았다

| n_ctx | n_blocks | 예측 | 실측 |
|---:|---:|---|---|
| 230,016 | 57,504 | 통과 | ✅ |
| 261,888 | 65,472 | 통과 | ✅ |
| 262,143 | 65,536 | 실패 | ❌ |
| 262,144 | 65,536 | 실패 | ❌ |

`n_kv`는 256 단위로 패딩되므로 **실사용 안전선은 261,888(= 256 × 1023)** 이다. `-c 262140`으로 줘도 262,144로 올림되어 여전히 죽는다.

`qwen4exp.cpp`의 norm 호출 7곳 중 **컨텍스트 길이에 비례하는 건 이 한 곳뿐**이다. 나머지는 전부 ubatch(≤2048)에 비례해 65,535 근처에도 못 간다.

## 모델 없이 두 줄로 재현된다

여기까지 오면 진짜 문제가 보인다. **이건 qwen4exp 버그가 아니라 upstream ggml 버그다.** `norm.cu`는 PR이 건드리지도 않은 파일이고, upstream master에도 클램프가 없다.

`tests/test-backend-ops.cpp`에 두 줄을 넣으면 176B 모델도 87GB 다운로드도 40분 프리필도 없이 재현된다.

```cpp
// ne[2] beyond the CUDA grid.y limit (65535)
test_cases.emplace_back(new test_rms_norm(GGML_TYPE_F32, {64, 1, 65536, 1}, false, 1e-6f));
test_cases.emplace_back(new test_rms_norm_mul_add(GGML_TYPE_F32, {64, 1, 65536, 1}, 1e-6f, false, false));
```

16MB 텐서 하나, 몇 초면 끝난다.

```
RMS_NORM(type=f32,ne=[64,5,4,3],...): OK      ← 기존 마지막 케이스
CUDA error: invalid argument
```

**같은 테스트 케이스가 Vulkan에서도 실패한다.** 벤더도 아키텍처도 다른 Radeon 8060S(gfx1151, RADV, x86_64)에서:

```
ggml-vulkan.cpp:8230: GGML_ASSERT(wg0 <= maxComputeWorkGroupCount[0] && ...) failed
```

Vulkan은 어서션으로 잡아 주기라도 하는데, **CUDA는 조용히 launch에 실패한다.**

다만 이 둘을 같은 버그로 묶으면 안 된다. Vulkan이 걸리는 건 `maxComputeWorkGroupCount`라는 **별개 백엔드의 별개 dispatch 한계**이고, 아래에서 만든 CUDA 패치로는 **고쳐지지 않는다.** 같은 텐서 레이아웃이 두 백엔드 모두에서 문제가 된다는 것 — 즉 `ne[1]=1`에 거대한 차원을 `ne[2]`로 보내는 구조 자체가 **이식성 위험**이라는 신호로 읽는 게 정확하다.

### 왜 지금까지 안 잡혔나

같은 코드베이스가 이미 이 문제를 세 번 고쳤다.

| PR | 대상 |
|---|---|
| [#19999](https://github.com/ggml-org/llama.cpp/pull/19999) | `convert.cu` — `std::min(ne01, 65535)` |
| [#22944](https://github.com/ggml-org/llama.cpp/pull/22944) | `im2col.cu` — `MAX_GRIDDIM_Y` + grid-stride 루프 |
| [#25103](https://github.com/ggml-org/llama.cpp/pull/25103) | `get_rows_back` — grid-y 클램프 |

`binbcast.cu`는 아예 1D grid로 평탄화하고 fastdiv로 인덱스를 분해한다. **`norm.cu`의 네 지점만 빠졌다.**

그리고 기존 RMS_NORM 테스트 케이스의 **`ne[2]` 최댓값이 5**다(`{n, 5, 4, 3}`). 테스트 스위트가 이 경로를 아예 지나가지 않는다.

### 고쳐서 검증했다

`im2col.cu` 선례를 따라 클램프 + grid-stride 루프를 넣었다. 걸림돌이 하나 있었다 — **커널이 차원을 `gridDim`에서 역산하고 있었다.**

```c
const int nrows     = gridDim.x;
const int nchannels = gridDim.y;   // ← 클램프하면 인덱싱이 조용히 틀어진다
```

그래서 차원을 명시적으로 넘기도록 바꿨다.

```c
const int nchannels = nchannels_total > 0 ? nchannels_total : (int) gridDim.y;
for (int sample  = blockIdx.z; sample  < nsamples;  sample  += gridDim.z) {
for (int channel = blockIdx.y; channel < nchannels; channel += gridDim.y) { ... }}
```

| 검증 | 결과 |
|---|---|
| 크래시 케이스 | `RMS_NORM`·`RMS_NORM_MUL_ADD` 모두 `OK` |
| CPU 대비 수치 정확도 | 일치 (`2/2 backends passed`) |
| 회귀 테스트 **21,099 케이스** (`d807f04`, CUDA, GB10) | **FAIL 0** |
| 실모델 `-d 262144` (원래 크래시 지점) | 완주 |
| 성능 영향 | 명백한 회귀 관찰되지 않음 (예비 측정, `-r 2`) |

`ne[2] ≤ 65,535`면 루프가 1회만 돌아 기존과 작업량이 같으니, 성능이 안 변하는 게 자연스럽다.

### 같은 결함이 여섯 군데 더 있다 — 다만 대부분 도달 불가

`norm.cu`만 그런 게 아닐 것 같아 CUDA 백엔드의 `dim3` grid 구성을 전수 조사했다(총 79곳). `ne[2]`를 65,536과 65,535로 각각 주는 통제 실험 결과다.

| op | 소스 위치 | ne[2]=65,535 | ne[2]=65,536 |
|---|---|---|---|
| SOFT_MAX | `softmax.cu:340` | OK | ❌ CUDA error |
| NORM | `norm.cu:294` | OK | ❌ CUDA error |
| L2_NORM | `norm.cu:434` | OK | ❌ CUDA error |
| CUMSUM | `cumsum.cu:240` | OK | ❌ CUDA error |
| TRI | `tri.cu:53` | OK | ❌ CUDA error |
| ADD_ID | `add-id.cu:50` | OK | ❌ CUDA error |
| RMS_NORM_MUL_ROPE | `rope.cu:809` | ⚠️ 수치 FAIL | ❌ CUDA error |
| RMS_NORM (+MUL_ADD) | `norm.cu:318,364` | OK | OK (수정 적용) |
| ADD | `binbcast.cu:309` | OK | OK — **가드 있음** |

경계가 정확히 65,535/65,536에서 갈린다. 그리고 **upstream master의 여섯 파일 전부 클램프가 없다.**

한계값 자체도 확인했다. 두 세대·두 CUDA 버전에서 동일하다.

```
GB10   (Blackwell, cc 12.1), CUDA 13.0/13.0 → maxGridSize = [2147483647, 65535, 65535]
RTX3090 (Ampere,   cc 8.6 ), CUDA 13.2/13.3 → maxGridSize = [2147483647, 65535, 65535]
```

**여기서 멈추고 정직해질 필요가 있다.** 크래시하는 것과 *실제로 그 형태가 만들어지는 것*은 다르다. 호출부의 텐서 형태를 따라가 보면:

```c
llama-graph.cpp:2641  ggml_soft_max_ext(ctx0, kq, ...);  // [n_kv, n_tokens, n_head, n_seq]
add-id.cu:50          dim3 blocks(ne01, ne02);           // n_experts_used, n_tokens
```

- **SOFT_MAX**는 `grid.y = n_head`다. 터지려면 어텐션 헤드가 6만 개를 넘어야 한다 — **실제 모델로는 도달 불가**다.
- **NORM·L2_NORM**은 LLM에서 `[n_embd, n_tokens]` 형태라 `ne[2] = 1`이다. qwen4exp처럼 특이하게 reshape하지 않는 한 도달하지 않는다.
- **ADD_ID**만 구조가 거꾸로다. 작은 `n_experts_used`가 grid.x(한계 21억)로, 큰 `n_tokens`가 grid.y(한계 65,535)로 간다. MoE 전문가 바이어스 경로라 `-ub 65536` 이상이면 터지는데, **그만한 물리 마이크로배치는 현실적인 운영 설정이 아니다.**
- **CUMSUM·TRI**는 어떤 모델이 쓰는지 확인하지 못했다.

즉 **실제로 도달이 실증된 건 qwen4exp의 이 경로 하나뿐**이고, 나머지는 합성 테스트로만 재현되는 **잠재 결함**이다. 이 글에서 "여섯 개 op가 더 깨진다"를 "여섯 개 워크로드가 깨진다"로 읽으면 안 된다.

### 그래서 PR을 내지 않았다

선례 3건의 동기를 읽어 봤더니 전부 **실제 장애 대응**이었다.

| PR | 트리거 |
|---|---|
| #19999 | `llama-server` + GLM-4.7-Flash + FA + 양자화 KV + 다중 슬롯 + 긴 컨텍스트 → KV 길이가 grid.y로. 이슈 2건 종결 |
| #22944 | conv1d 오디오 인코더(SEANet 11초 @16kHz → `OW = 176,000`), T4/Jetson Orin 검증 |
| #25103 | 65,535행 초과 임베딩/vocab 그래디언트 |

**이 저장소의 관례는 재현 가능한 실제 장애에 대한 수정이지, 잠재 결함 일괄 하드닝이 아니다.** 합성으로만 재현되는 여섯 곳을 묶어 큰 PR을 내는 건 이 관례에 맞지 않는다.

흥미로운 건 **#19999가 우리 케이스와 구조적으로 같다**는 점이다 — "긴 컨텍스트에서 KV 길이가 grid.y로 들어간다". 그건 머지됐다. 그러니 `norm.cu`의 RMS 계열만큼은 선례에 정확히 부합하는데, **정작 그걸 유발하는 모델의 PR이 아직 안 머지됐다.** in-tree 소비자가 없는 수정은 리뷰 우선순위를 못 받는다.

수정 코드와 검증은 남겨 뒀다. #27742가 머지되면 그때가 낼 시점이다.

### 같은 크래시를 먼저 만난 사람이 있었다

PR 대화를 뒤져 보니 **하드웨어까지 같은 제보**가 있었다. ASUS Ascent GX10(GB10, 128GB), 같은 UD-IQ4_XS, 같은 에러 문자열, 같은 `common.cuh:1668`. 텐서 형태나 launch 기하까지 기록돼 있진 않으므로 **동일 원인이라는 건 증상 일치에 근거한 추론**이다.

그런데 결론이 달랐다. 그쪽은 YaRN으로 524,288까지 확장한 뒤 크래시해서 **"네이티브 학습 컨텍스트 262,144 경계를 넘을 때 깨진다"** 로 봤다.

우리 데이터는 그 해석을 반증한다. **YaRN을 안 썼고, `n_ctx = 262,143`이라 네이티브 창 안쪽인데도 죽었다.** 진짜 경계는 262,140이고, 두 숫자가 4밖에 안 떨어져 있어 그쪽 실험만으로는 구분할 수 없었다.

> 경계가 우연히 다른 상수와 겹칠 때, 한쪽에서만 테스트하면 틀린 원인을 확신하게 된다. 반대편(안쪽)에서 한 번 더 찔러 보는 게 싸다.

## 성능 — depth별 실측

프로세스 격리로 각 depth를 별도 프로세스에서 측정했다. `-fa on`, f16 KV, `--parallel 1`.

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
| **261,248 (최대)** | **137.22** | **6.04** | 1 |

0 → 261K에서 **prefill 5.6배, decode 4.9배** 떨어진다.

실용 관점으로 읽으면 이렇다. **32K까지는 쾌적하고**(pp 520, tg 21), 131K에서 절반이 되며(pp 252, tg 10), 261K는 프리필만 40분 넘게 걸려 **배치 작업 전용**이다. "돌아간다"와 "쓸 수 있다"는 다르다.

> 196,608(158.89)과 229,376(159.37)이 역전돼 있다. `-r 1`이라 오차범위가 없고 차이가 0.3%뿐이라 **노이즈로 본다.** 확정하려면 재측정이 필요하다.

### 커밋 하나 차이로 2배가 바뀐다

이 글에서 가장 실무적인 발견이다. 같은 하드웨어, 같은 모델, 같은 인자인데 **PR 브랜치의 커밋만 다르다.**

| depth | `0b19188` | `d807f04` | 변화 |
|---:|---:|---:|---|
| 0 | 693.40 | 769.87 | +11% |
| 16,384 | 486.71 | 634.76 | +30% |
| 32,768 | 340.63 | 520.29 | +53% |
| 65,536 | 221.41 | 382.04 | +73% |
| 131,072 | 121.07 | 252.07 | **+108%** |
| 229,376 | 71.39 | 159.37 | **+123%** |
| 261,248 | 62.27 | 137.22 | **+120%** |

**깊을수록 개선폭이 크고, 긴 컨텍스트에서 2배를 넘는다.** 두 커밋 사이는 이틀이다.

원인으로 보이는 커밋이 `d807f04 "fix llm_graph_input_ple reuse"`다. `llm_graph_input_qsa`에 **`can_reuse()`를 구현**한다.

```cpp
bool can_reuse(const llm_graph_params & params) override {
    const int64_t n_kv     = idx->get_n_kv();
    const int64_t n_blocks = (n_kv + ratio - 1)/ratio;
    res &= cell_blk->ne[0]  == n_kv;
    res &= blk_pos->ne[0]   == 4*n_blocks*n_stream;
    ...
}
```

이게 없으면 ubatch마다 계산 그래프를 통째로 재구축한다. `0b19188` 서버 로그에 `graphs reused = 0`이 찍혔던 게 그 증상이고, 재구축 비용은 KV가 클수록 커지므로 **깊은 컨텍스트에서 개선폭이 큰 패턴과 맞는다.** 같은 방향의 커밋이 둘 더 있다 — `e361303 reduce input nodes`, `dfb5c13 trim output tokens`.

다만 **인과를 실측으로 확정하진 못했다.** 브랜치가 master에 리베이스되면서 히스토리가 재작성돼(`0b19188`은 `d807f04`의 조상이 아니다) 커밋 단위 A/B가 불가능하다.

**decode는 방향이 다르다.** 얕은 구간은 개선됐지만(0에서 27.56 → 29.51) 깊은 구간은 오히려 떨어졌다(131K에서 11.28 → 10.02, 163K에서 9.75 → 7.47). prefill 위주 최적화로 보이지만 **decode 하락은 아직 설명하지 못했다.**

> 미머지 PR을 쓴다는 건 이런 뜻이다. 어제 잰 수치가 오늘 절반일 수 있고, 반대일 수도 있다. **벤치마크를 공유할 때 커밋 해시를 안 적으면 그 숫자는 의미가 없다.**

## 재현

```bash
# 빌드 (커밋 고정)
git clone -b qwen4exp/qwen3.8-flash-next https://github.com/unslothai/llama.cpp
cd llama.cpp && git checkout d807f04
cmake -B build -DGGML_CUDA=ON -DCMAKE_CUDA_ARCHITECTURES=native \
      -DLLAMA_CURL=OFF -DCMAKE_BUILD_TYPE=Release
cmake --build build -j 18 --target llama-server llama-bench

# 서빙 — 안전선을 넘지 말 것
./build/bin/llama-server -m Qwen3.8-Flash-Next-UD-IQ4_XS-00001-of-00003.gguf \
  -ngl 99 -c 261888 --parallel 1 -fa on --host 0.0.0.0 --port 8001

# depth 벤치 (각 depth를 별도 프로세스로)
for d in 0 16384 65536 131072 261248; do
  ./build/bin/llama-bench -m ...-00001-of-00003.gguf -ngl 99 -fa on \
    -p 512 -n 128 -d $d -r 3
done
```

**`-c`는 261,888을 넘기지 말 것.** 262,144를 주면 프리필이 26만 토큰을 넘는 순간 죽는데, 거기까지 40분이 걸린 뒤에 죽는다.

한 프로세스에서 여러 depth를 연속으로 돌리면 **뒤쪽 테스트가 눌린다.** 실제로 한 프로세스에서 7개 depth를 순차로 돌렸을 때 131,072 지점이 **36% 낮게** 측정됐다(77.35 vs 121.07). 단조성이 깨지면 측정을 의심해야 한다.

## 한계와 미검증

- **패치는 부분적이다.** `rms_norm_f32` 계열만 고쳤다. 전수 조사에서 드러난 나머지 여섯 곳(`norm_f32`·`l2_norm_f32`·softmax·cumsum·tri·add-id)은 그대로다.
- **나머지 여섯 곳은 합성 테스트로만 재현했다.** 실제 모델이 그 형태를 만드는지는 확인하지 못했고, 오히려 대부분 도달 불가로 보인다. `CUMSUM`·`TRI`는 어떤 모델이 쓰는지조차 확인 못 했다.
- **Vulkan은 재현만 했고 고치지 않았다.** SYCL·HIP·Metal은 확인조차 안 했다. HIP은 AMD의 grid 한계가 달라 안 터질 수도 있다.
- **성능 영향 측정이 `-r 2`다.** 워밍업·클럭 변동·이상치를 걸러내기에 부족하고, 수정한 커널을 따로 떼어 재지도 않았다. "명백한 회귀가 관찰되지 않았다"까지만 말할 수 있다.
- **긴 컨텍스트의 출력 품질은 검증하지 않았다.** 26만 토큰에서 모델이 정상적으로 추론하는지는 속도와 별개 문제다.
- **decode 하락의 원인을 모른다.** 커밋 간 비교에서 깊은 구간 decode가 떨어진 이유를 설명하지 못했다.
- **커밋 인과가 정황이다.** 리베이스 때문에 커밋 단위 A/B를 못 했다.

## 외부 자료

- [Qwen3.8-Flash-Next (공식)](https://huggingface.co/Qwen/Qwen3.8-Flash-Next) — 원본 BF16
- [unsloth GGUF](https://huggingface.co/unsloth/Qwen3.8-Flash-Next-GGUF) — 이 실험에 쓴 UD-IQ4_XS
- [llama.cpp PR #27742](https://github.com/ggml-org/llama.cpp/pull/27742) — qwen4exp 아키텍처 지원
- [llama.cpp](https://github.com/ggml-org/llama.cpp) — 본류

## 관련 포스트

- [같은 모델, 4개 하드웨어 — Qwen3.8-27B 추론 속도 실측](/posts/qwen3-8-27b-four-device-benchmark) — 같은 GB10 노드를 vLLM으로 측정한 직전 글

직전 글에서 GB10은 Qwen3.8-**27B** NVFP4를 vLLM으로 서빙해 32K에서 decode 16.90 t/s였다. 이번 글의 **176B**는 같은 하드웨어에서 32K decode **20.99 t/s**다. **6.5배 큰 모델이 더 빠르게 생성한다.** 활성 파라미터가 27B와 3B로 다르고 decode가 대역폭 바운드이기 때문이다. 다만 엔진(vLLM vs llama.cpp)과 양자화(NVFP4 vs IQ4_XS)가 함께 달라서 순수 비교는 아니다.

## 핵심 정리

- **176B(활성 3B)가 128GB 한 대에 들어간다.** 단 공식 양자화는 전부 못 들어가고 unsloth GGUF + 미머지 PR 빌드가 유일한 경로다.
- **하이브리드 어텐션은 컨텍스트가 싸다.** 48레이어 중 full attention 12개뿐이라 26만 토큰 KV가 6 GiB다. 컨텍스트를 8배 늘려도 메모리는 4 GiB만 늘었다.
- **실사용 컨텍스트 상한은 261,888이다.** 학습 상한 262,144보다 256 낮고, 그 이유는 컨텍스트도 메모리도 아닌 **CUDA grid.y 한계 65,535**다.
- 원인은 **upstream ggml 버그**다. `norm.cu`의 네 지점이 grid 차원을 클램프하지 않고, 전수 조사 결과 **같은 결함이 여섯 군데 더** 있다(softmax·cumsum·tri·add-id 포함). 다만 **실제 도달이 실증된 건 이 글의 경로 하나뿐**이고 나머지는 잠재 결함이다. 같은 클래스가 `convert.cu`·`im2col.cu`·`get_rows`에서 이미 세 번 고쳐졌는데 `norm.cu`만 빠졌고, 테스트의 `ne[2]` 최댓값이 5라 커버되지 않았다.
- **모델 없이 두 줄로 재현된다.** 같은 케이스가 Vulkan에서도 실패하는데, 그건 별개 백엔드의 별개 한계이고 CUDA 패치로는 안 고쳐진다 — 레이아웃 자체가 이식성 위험이라는 신호다.
- **커밋 하나 차이로 긴 컨텍스트 성능이 2배 바뀐다.** 미머지 PR의 수치를 공유할 땐 커밋 해시가 필수다.

---

*모든 수치는 DGX Spark(GB10, 121 GiB 통합 메모리, aarch64, CUDA 13) 단일 사용자 조건 실측이다. 성능 표는 `d807f04` 기준이며, 이 PR은 활발히 변경 중이라 이후 커밋에서 달라질 수 있다.*
