---
author: baem1n
pubDatetime: 2026-04-04T09:00:00.000Z
title: "DeepCoWork #10: LLM 프로바이더 통합 -- 5개 백엔드, 모델 자동 감지, 빌드 변형"
description: "Anthropic, OpenRouter, Ollama, LM Studio, vLLM 5개 프로바이더를 하나의 인터페이스로 통합하는 설계 과정을 공유합니다."
tags:
  - llm
  - anthropic
  - ollama
  - openrouter
  - ai-agent
aiAssisted: true
---

> **TL;DR**: `build_llm()` 팩토리 함수 하나로 5개 LLM 프로바이더(클라우드 2 + 로컬 3)를 통합하며, 로컬 모델은 `/v1/models` API로 자동 감지한다.

## Table of contents

## 5개 프로바이더

| 프로바이더 | 유형 | 기본 모델 | API 형식 |
|-----------|------|----------|----------|
| Anthropic | 클라우드 | claude-sonnet-4-6 | Anthropic 네이티브 |
| OpenRouter | 클라우드 | anthropic/claude-sonnet-4-5 | OpenAI 호환 |
| Ollama | 로컬 | llama3.1 | OpenAI 호환 |
| LM Studio | 로컬 | loaded-model | OpenAI 호환 |
| vLLM | 로컬 | meta-llama/Llama-3.1-8B | OpenAI 호환 |

## build_llm(): 단일 팩토리

```python
def build_llm() -> Any:
    provider = config.LLM_PROVIDER or os.getenv("LLM_PROVIDER", "anthropic")

    if provider == "openrouter":
        return ChatOpenAI(
            model=config.MODEL_NAME or "anthropic/claude-sonnet-4-5",
            api_key=config.OPENROUTER_API_KEY or "none",
            base_url=config.OPENROUTER_BASE_URL,
            temperature=0.0,
            max_tokens=8192,
            default_headers={
                "HTTP-Referer": os.getenv("APP_URL", "https://cowork.local"),
                "X-Title": os.getenv("APP_NAME", "MX CoWork"),
            },
        )
    elif provider in ("ollama", "lmstudio", "vllm"):
        _defaults = {
            "ollama": "http://localhost:11434/v1",
            "lmstudio": "http://localhost:1234/v1",
            "vllm": "http://localhost:8000/v1",
        }
        return ChatOpenAI(
            model=config.MODEL_NAME or "llama3.1",
            api_key="local",
            base_url=config.OLLAMA_BASE_URL or _defaults.get(provider),
            temperature=0.0,
            max_tokens=8192,
        )
    else:  # anthropic
        return ChatAnthropic(
            model=config.MODEL_NAME or "claude-sonnet-4-6",
            temperature=0.0,
            max_tokens=8192,
        )
```

핵심: `ChatOpenAI`의 `base_url` 파라미터로 [OpenAI 호환 API](https://platform.openai.com/docs/api-reference)를 사용하는 모든 로컬 서버를 지원한다. Anthropic만 전용 SDK(`ChatAnthropic`)를 사용한다. Ollama의 [OpenAI 호환 모드](https://ollama.com/blog/openai-compatibility)가 이 통합의 핵심이다.

## 빌드 변형 (Deploy Mode)

`VITE_DEPLOY_MODE` 환경 변수로 빌드 시 프로바이더를 제어한다:

```typescript
// deploy.ts
export type DeployMode = "local" | "cloud" | "all";

export const PROVIDERS = (() => {
  const all = [
    { value: "anthropic", label: "Anthropic", cloud: true, local: false },
    { value: "openrouter", label: "OpenRouter", cloud: true, local: false },
    { value: "ollama", label: "Ollama", cloud: false, local: true },
    { value: "lmstudio", label: "LM Studio", cloud: false, local: true },
    { value: "vllm", label: "vLLM", cloud: false, local: true },
  ];

  if (DEPLOY_MODE === "local") return all.filter((p) => p.local);
  if (DEPLOY_MODE === "cloud") return all.filter((p) => p.cloud);
  return all;
})();

export const SHOW_API_KEY = DEPLOY_MODE !== "local";
export const DEFAULT_PROVIDER = DEPLOY_MODE === "local" ? "ollama" : "anthropic";
```

빌드 명령:

| 명령 | 결과 |
|------|------|
| `npm run build` | 모든 프로바이더 |
| `VITE_DEPLOY_MODE=local npm run build` | Ollama, LM Studio, vLLM만 |
| `VITE_DEPLOY_MODE=cloud npm run build` | Anthropic, OpenRouter만 |

"local" 빌드에서는 API 키 입력 UI가 완전히 제거된다.

## 로컬 모델 자동 감지

SettingsModal이 로컬 서버에서 모델 목록을 자동으로 가져온다:

```typescript
async function fetchOllamaModels() {
  const baseUrl = localUrl.replace(/\/v1\/?$/, "");

  // OpenAI 호환 API 먼저 시도 (Ollama, LM Studio, vLLM 공통)
  try {
    const res = await fetch(`${baseUrl}/v1/models`, { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const data = await res.json();
      models = data.data.map((m: { id: string }) => m.id).sort();
    }
  } catch {}

  // Ollama 전용 API 폴백
  if (models.length === 0) {
    const res = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const data = await res.json();
      models = data.models.map((m: { name: string }) => m.name).sort();
    }
  }
}
```

2단계 탐색:
1. `/v1/models` -- OpenAI 호환 API (모든 로컬 서버)
2. `/api/tags` -- Ollama 전용 API (폴백)

## 설정 영속화

설정 변경은 `~/.cowork.env` 파일에 저장된다:

```python
def _persist_env(key: str, value: str) -> None:
    config.COWORK_ENV_FILE.parent.mkdir(parents=True, exist_ok=True)
    lines = []
    if config.COWORK_ENV_FILE.exists():
        for line in config.COWORK_ENV_FILE.read_text().splitlines():
            if not line.startswith(f"{key}="):
                lines.append(line)
    lines.append(f"{key}={value}")
    config.COWORK_ENV_FILE.write_text("\n".join(lines) + "\n")
```

프로바이더, 모델, API 키 변경이 앱 재시작 후에도 유지된다.

## 에이전트 재빌드

프로바이더나 모델이 변경되면 모든 활성 에이전트가 즉시 재빌드된다:

```python
async def rebuild_all_agents_safe():
    async with _agent_rebuild_lock:
        for tid in list(state._agents.keys()):
            meta = state.threads_meta.get(tid, {})
            ws = Path(meta.get("workspace_path", "")) or config.WORKSPACE_ROOT / tid
            state._agents[tid] = create_agent(ws, state.checkpointer, meta.get("mode", "cowork"), tid)
```

`asyncio.Lock`으로 동시 재빌드를 방지한다.

## 실측 데이터

| 항목 | 수치 |
|------|------|
| 모델 목록 조회 레이턴시 (Ollama 로컬) | ~120ms |
| 모델 목록 조회 레이턴시 (LM Studio 로컬) | ~80ms |
| 모델 목록 조회 타임아웃 | 5초 |
| 프로바이더 전환 → 에이전트 재빌드 | ~200ms |
| build_llm() 실행 시간 | ~15ms |

## 삽질 노트

`create_react_agent`의 `interrupt_before` 파라미터에 도구 이름(`"write_file"`)을 넣었더니 `ValueError`가 발생했다. LangGraph의 `interrupt_before`는 **노드 이름**만 받고, 도구 이름은 받지 않는다. 이걸 모르고 한참 삽질했는데, DeepAgents SDK의 `interrupt_on`이 도구 이름 기반으로 동작해서 이 문제를 깔끔하게 해결해줬다. 이 차이가 DeepAgents SDK를 선택한 핵심 이유 중 하나다.

두 번째 문제는 Ollama의 모델 목록 API였다. Ollama는 원래 `/api/tags` 엔드포인트를 사용하는데, v0.1.24부터 OpenAI 호환 `/v1/models`도 지원한다. 처음에 `/v1/models`만 호출했더니 구버전 Ollama에서 404가 나왔다. 2단계 폴백 전략(v1/models 먼저, 실패 시 /api/tags)으로 해결했다.

세 번째로, OpenRouter 연동 시 `HTTP-Referer`와 `X-Title` 헤더를 안 넣으면 429 레이트리밋에 더 빨리 걸린다는 걸 나중에 알았다. OpenRouter 문서를 꼼꼼히 읽지 않은 대가였다.

## 자주 묻는 질문

### Ollama를 원격 서버에서 실행할 수 있나?

그렇다. 서버 URL을 `http://192.168.1.100:11434/v1` 같은 원격 주소로 변경하면 된다. 단, CORS 설정이 필요하다.

### OpenRouter는 왜 사용하나?

OpenRouter는 여러 LLM 프로바이더를 하나의 API로 통합한다. Claude, GPT-4, Gemini 등을 API 키 하나로 사용할 수 있어서 테스트와 비교에 편리하다.

### 모델 변경이 진행 중인 대화에 영향을 주나?

현재 스트리밍 중인 대화에는 영향이 없다. 다음 메시지부터 새 모델이 적용된다.

---

## 시리즈 목차

1. [DeepCoWork: AI 에이전트 데스크톱 앱을 만들었다](/posts/deepcowork-01-introduction)
2. [Tauri 2 + Python 사이드카](/posts/deepcowork-02-tauri-sidecar)
3. [DeepAgents SDK 핵심 해부](/posts/deepcowork-03-deep-agents-sdk)
4. [모드별 시스템 프롬프트 설계](/posts/deepcowork-04-system-prompts)
5. [SSE 스트리밍 파이프라인](/posts/deepcowork-05-sse-streaming)
6. [HITL 승인 플로우](/posts/deepcowork-06-hitl-approval)
7. [멀티에이전트 ACP 모드](/posts/deepcowork-07-acp-multi-agent)
8. [에이전트 메모리 4계층](/posts/deepcowork-08-agent-memory)
9. [스킬 시스템](/posts/deepcowork-09-skills-system)
10. **[이번 글]** LLM 프로바이더 통합
11. [보안 체크리스트](/posts/deepcowork-11-security)
12. [GitHub Actions 크로스 플랫폼 빌드](/posts/deepcowork-12-ci-cd)
