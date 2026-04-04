---
author: baem1n
pubDatetime: 2026-04-04T06:00:00.000Z
title: "DeepCoWork #7: 멀티에이전트 ACP 모드 -- task() 도구, 서브에이전트 생성, 스트림 병합"
description: "ACP 모드에서 메인 에이전트가 task() 도구로 서브에이전트를 생성하고, 결과를 실시간 스트리밍하는 구조를 분석합니다."
tags:
  - multi-agent
  - acp
  - sub-agent
  - langgraph
  - ai-agent
aiAssisted: true
---

> **TL;DR**: ACP(Agent Coordination Protocol) 모드에서 메인 에이전트는 코드를 직접 작성하지 않는다. `task()` 도구로 서브에이전트를 생성하고, 각 서브에이전트의 SSE 스트림을 `source: "sub:이름"` 태그로 구분하여 메인 스트림에 병합한다. 서브에이전트는 HITL 없이 독립 실행된다.

## Table of contents

## ACP 모드란

ACP는 메인 에이전트가 아키텍처 리드 역할을 하고, 실제 구현은 서브에이전트에게 위임하는 패턴이다.

```
메인 에이전트 (ACP 모드)
    |
    +-- task("파일 구조 분석") --> 서브에이전트 A
    +-- task("API 엔드포인트 구현") --> 서브에이전트 B
    +-- task("테스트 작성") --> 서브에이전트 C
    |
    v
결과 통합 및 품질 검토
```

## task() 도구 구현

`tools.py`의 `task()` 도구가 서브에이전트를 생성한다:

```python
@tool
async def task(description: str, instructions: str = "") -> str:
    """서브에이전트를 생성해 독립적인 서브태스크를 실행합니다."""
    aid = uuid.uuid4().hex[:8]
    sub_thread_id = f"{thread_id or 'acp'}-sub-{aid}"

    subagents[aid] = {
        "id": aid,
        "name": description,
        "status": "running",
        "currentTask": prompt[:80],
    }

    if out_queue:
        await out_queue.put(sse({"type": "agents", "agents": list(subagents.values())}))

    # 서브에이전트는 HITL 없이 실행
    sub_agent = build_agent(
        workspace_dir, app_state.checkpointer,
        "code",           # 서브에이전트는 항상 Code 모드
        sub_thread_id,
        with_hitl=False,  # HITL 비활성화
    )
    sub_config = {"configurable": {"thread_id": sub_thread_id}}

    result_tokens: list[str] = []
    async for chunk in stream_events(sub_agent, {"messages": [{"role": "user", "content": prompt}]}, sub_config, {}):
        if out_queue:
            data = json.loads(chunk.removeprefix("data: ").strip())
            if data.get("type") == "token":
                result_tokens.append(data.get("content", ""))
            data["source"] = f"sub:{description[:24]}"
            await out_queue.put(sse(data))

    subagents[aid]["status"] = "done"
    return "".join(result_tokens).strip() or f"[{description} 완료]"
```

핵심 설계 결정:

1. **Code 모드 고정**: 서브에이전트는 항상 Code 모드로 실행되어 직접 코드를 작성한다.
2. **HITL 비활성화**: 메인 에이전트의 `task()` 호출이 이미 사용자 승인을 거쳤으므로 서브에이전트는 자유롭게 실행된다.
3. **독립 thread_id**: 각 서브에이전트가 별도 스레드로 실행되어 상태가 격리된다.

## 스트림 병합

서브에이전트의 SSE 이벤트가 메인 스트림에 `source` 태그와 함께 병합된다:

```python
data["source"] = f"sub:{description[:24]}"
await out_queue.put(sse(data))
```

프론트엔드에서는 `source` 필드로 어떤 에이전트의 출력인지 구분한다:

| source 값 | 의미 |
|-----------|------|
| `"main"` | 메인 에이전트 |
| `"sub:파일 구조 분석"` | 서브에이전트 (이름 표시) |

## 서브에이전트 상태 추적

`thread_subagents` 딕셔너리가 서브에이전트 상태를 관리한다:

```python
# hitl.py
thread_subagents: dict[str, dict[str, dict]] = {}

# 상태 변화 흐름:
# 1. task() 호출 시: status = "running"
# 2. 실행 완료 시: status = "done"
# 3. 에러 발생 시: status = "error"
```

프론트엔드의 `useStore`가 에이전트 상태를 관리한다:

```typescript
export interface SubAgent {
  id: string;
  name: string;
  status: AgentStatus;  // "idle" | "running" | "done" | "error"
  currentTask?: string;
}

// SSE 이벤트 수신 시
case "agents":
  setAgents((evt.agents ?? []) as SubAgent[]);
  break;
```

## 순환 의존성 해결

`task()` 도구는 `stream`, `agent_core`, `state`를 모두 참조해야 하지만 이들이 서로 의존한다. 지연 임포트(lazy import)로 해결했다:

```python
@tool
async def task(description: str, instructions: str = "") -> str:
    # Late imports to break circular dependency
    from stream import sse, stream_events
    from agent_core import build_agent
    from state import state as app_state
    from hitl import thread_output_queues, thread_subagents
    # ...
```

## 에러 처리

서브에이전트 실행 중 에러가 발생하면 상태를 "error"로 업데이트하고 에러 메시지를 반환한다:

```python
except Exception as exc:
    subagents[aid]["status"] = "error"
    if out_queue:
        await out_queue.put(sse({"type": "agents", "agents": list(subagents.values())}))
    return f"[{description} 오류]: {exc}"
```

메인 에이전트는 이 에러 메시지를 받아서 다른 전략을 시도하거나 사용자에게 보고한다.

## ACP 모드의 제약

ACP 모드 시스템 프롬프트에는 강한 제약이 있다:

> "직접 코드를 작성하지 않습니다. 서브에이전트에게만 위임합니다."
> "절대 직접 write_file / edit_file / execute 사용 금지"

이 제약 덕분에 메인 에이전트는 작업 분해, 품질 검토, 결과 통합에만 집중한다.

## 자주 묻는 질문

### 서브에이전트끼리 파일을 공유하나?

그렇다. 같은 `workspace_dir`을 공유하므로 서브에이전트 A가 작성한 파일을 서브에이전트 B가 읽을 수 있다. 다만 동시 쓰기 충돌은 방지되지 않으므로, 메인 에이전트가 태스크를 독립적으로 분해하는 것이 중요하다.

### 서브에이전트는 최대 몇 개?

제한은 없지만, 각 서브에이전트가 별도 LLM 호출을 하므로 비용과 속도를 고려해야 한다. 실무에서는 3-5개가 적절하다.

### 서브에이전트도 plan.md를 만드나?

아니다. 서브에이전트는 Code 모드로 실행되므로 plan.md 기반 계획 없이 바로 구현에 들어간다. 계획은 메인 에이전트가 담당한다.

---

## 시리즈 목차

1. [DeepCoWork: AI 에이전트 데스크톱 앱을 만들었다](/posts/deepcowork-01-introduction)
2. [Tauri 2 + Python 사이드카](/posts/deepcowork-02-tauri-sidecar)
3. [DeepAgents SDK 핵심 해부](/posts/deepcowork-03-deep-agents-sdk)
4. [모드별 시스템 프롬프트 설계](/posts/deepcowork-04-system-prompts)
5. [SSE 스트리밍 파이프라인](/posts/deepcowork-05-sse-streaming)
6. [HITL 승인 플로우](/posts/deepcowork-06-hitl-approval)
7. **[이번 글]** 멀티에이전트 ACP 모드
8. [에이전트 메모리 4계층](/posts/deepcowork-08-agent-memory)
9. [스킬 시스템](/posts/deepcowork-09-skills-system)
10. [LLM 프로바이더 통합](/posts/deepcowork-10-llm-providers)
11. [보안 체크리스트](/posts/deepcowork-11-security)
12. [GitHub Actions 크로스 플랫폼 빌드](/posts/deepcowork-12-ci-cd)
