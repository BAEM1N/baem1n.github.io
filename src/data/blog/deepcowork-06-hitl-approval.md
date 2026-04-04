---
author: baem1n
pubDatetime: 2026-04-04T05:00:00.000Z
title: "DeepCoWork #6: HITL 승인 플로우 -- interrupt_on, 승인 큐, 타임아웃, 거부 복구"
description: "위험한 도구 호출을 사용자에게 확인받는 HITL 승인 플로우의 전체 구현을 해부합니다."
tags:
  - hitl
  - human-in-the-loop
  - ai-safety
  - agent
aiAssisted: true
---

> **TL;DR**: DeepCoWork는 `write_file`, `edit_file`, `execute` 도구 호출 전에 사용자 승인을 요구한다. LangGraph `interrupt_on`이 그래프를 중단하고, asyncio.Event 기반 승인 큐가 프론트엔드와 동기화하며, 타임아웃 시 자동 거부로 안전하게 처리한다.

## Table of contents

## 왜 HITL인가

AI 에이전트가 파일을 덮어쓰거나 `rm -rf`를 실행하면 되돌릴 수 없다. HITL(Human-in-the-Loop)은 위험한 작업 전에 사람이 확인하는 안전장치다.

DeepCoWork의 HITL 정책:

| 도구 | 승인 필요 | 이유 |
|------|-----------|------|
| `read_file`, `ls`, `glob`, `grep` | 아니오 | 읽기 전용, 부작용 없음 |
| `web_search`, `memory_read` | 아니오 | 외부 조회, 비파괴적 |
| `write_file` | 예 | 파일 생성/덮어쓰기 |
| `edit_file` | 예 | 파일 수정 |
| `execute` | 예 | 셸 명령 실행 |

## 전체 흐름

```
에이전트가 write_file 호출
    |
    v
LangGraph interrupt_on -> 그래프 중단
    |
    v
_pump_agent: graph_state.tasks[].interrupts에서 pending 확인
    |
    v
_request_approval() -> approval SSE 이벤트 전송
    |
    v
프론트엔드 ApprovalModal 표시
    |
    +-- 승인 -> POST /agent/approve -> asyncio.Event.set()
    +-- 거부 -> POST /agent/approve (approved=false)
    +-- 타임아웃 (300초) -> 자동 거부
    |
    v
Command(resume={"decisions": [...]}) -> 에이전트 재개
```

## 백엔드: 인터럽트 감지

`_pump_agent()`가 에이전트 실행 후 인터럽트를 확인한다:

```python
for _iter in range(config.MAX_AGENT_ITERATIONS):
    if abort_signals.pop(thread_id, False):
        break

    async for chunk in stream_events(agent, agent_input, cfg, active_subagents):
        await out.put(chunk)

    # Check for Deep Agents interrupt_on
    graph_state = await get_agent_state(agent, cfg)
    pending: list = []
    for task in (graph_state.tasks or []):
        for interrupt in (getattr(task, "interrupts", None) or []):
            pending.append(interrupt)

    if not pending:
        break  # 인터럽트 없음 = 에이전트 완료

    # Process each interrupt
    decisions = []
    for interrupt in pending:
        value = getattr(interrupt, "value", interrupt) or {}
        action_requests = value.get("action_requests", [])

        for action_req in action_requests:
            tool_name = action_req.get("name", "")

            if tool_name in config.READ_ONLY_TOOLS:
                decisions.append({"type": "approve"})  # 읽기 전용은 자동 승인
                continue

            approved = await _request_approval(tool_name, action_req.get("args", {}), thread_id, out)
            decisions.append({"type": "approve" if approved else "reject"})

    agent_input = resume_agent_input(decisions)
```

핵심: `MAX_AGENT_ITERATIONS` (기본 25회)로 무한 루프를 방지한다.

## 승인 요청과 대기

```python
async def _request_approval(tool_name, tool_args, thread_id, out) -> bool:
    approval_id = str(uuid.uuid4())
    evt = asyncio.Event()
    pending_approvals[approval_id] = evt
    thread_approval_ids.setdefault(thread_id, set()).add(approval_id)

    await out.put(sse({
        "type": "approval",
        "approval_id": approval_id,
        "tool_name": tool_name,
        "args": tool_args,
        "source": "main",
    }))

    try:
        await asyncio.wait_for(evt.wait(), timeout=config.APPROVAL_TIMEOUT_SEC)
    except asyncio.TimeoutError:
        approval_results[approval_id] = False  # 타임아웃 = 거부

    return approval_results.pop(approval_id, False)
```

`asyncio.Event`가 승인 결과를 동기화한다. SSE 연결은 유지된 채 승인 대기가 가능하다.

## 전역 상태 관리

`hitl.py`의 전역 딕셔너리들:

```python
# HITL approval storage
pending_approvals: dict[str, asyncio.Event] = {}
approval_results: dict[str, bool] = {}

# Per-thread approval ID tracking
thread_approval_ids: dict[str, set[str]] = {}

# Per-thread SSE output queue
thread_output_queues: dict[str, asyncio.Queue] = {}

# Abort signals
abort_signals: dict[str, bool] = {}
```

`cleanup_thread()`가 스트림 종료 시 모든 상태를 정리한다:

```python
def cleanup_thread(thread_id: str) -> None:
    thread_subagents.pop(thread_id, None)
    for aid in list(thread_approval_ids.pop(thread_id, set())):
        pending_approvals.pop(aid, None)
        approval_results.pop(aid, None)
```

## 프론트엔드: ApprovalModal

```tsx
export function ApprovalModal({ approval, queueSize, onApprove }: Props) {
  return (
    <motion.div className="fixed inset-0 z-50 flex items-end justify-center pb-24"
      style={{ background: "rgba(0,0,0,0.6)" }}>
      <motion.div className="w-full max-w-lg rounded-2xl">
        {/* 도구 이름 + 인자 표시 */}
        <div className="flex items-center gap-2">
          {toolIcon(approval.toolName)}
          <span className="font-mono">{approval.toolName}</span>
        </div>
        {/* 인자 미리보기 */}
        <div className="font-mono text-xs">
          {formatArgs(approval.toolName, approval.args)}
        </div>
        {/* 승인/거부 버튼 */}
        <button onClick={() => onApprove(approval.approvalId, true)}>승인</button>
        <button onClick={() => onApprove(approval.approvalId, false)}>거부</button>
      </motion.div>
    </motion.div>
  );
}
```

도구별로 다른 포맷을 보여준다:
- `write_file`: 파일 경로 + 내용 미리보기
- `edit_file`: old_text → new_text diff
- `execute`: `$ command` 형식

## 거부 후 복구

거부 시 에이전트는 `reject` 결정을 받고 다른 접근 방법을 시도한다. LangGraph가 `Command(resume={"decisions": [{"type": "reject"}]})`를 처리하면 에이전트는 보통 다음 중 하나를 선택한다:

1. 다른 방법으로 같은 목표 달성 시도
2. 사용자에게 거부 이유를 물어봄
3. 해당 작업을 건너뛰고 다음 태스크로 이동

## Abort: 전체 중단

사용자가 "중지" 버튼을 누르면:

```typescript
const handleAbort = useCallback(async () => {
  abortRef.current?.abort();          // fetch 취소
  await abortThread(threadId);        // 서버에 abort 신호
  finalizeStream();                   // UI 정리
}, [activeThreadId, finalizeStream]);
```

서버 쪽에서 `abort_signals[thread_id] = True`가 설정되면 `_pump_agent`의 루프가 즉시 종료된다.

## 자주 묻는 질문

### 승인 타임아웃은 몇 초인가?

기본 300초 (5분). `config.APPROVAL_TIMEOUT_SEC`으로 설정 가능하다.

### 여러 승인 요청이 동시에 오면?

큐로 관리된다. `queueSize` 배지가 대기 중인 승인 수를 표시하고, 하나씩 순서대로 처리한다.

### 서브에이전트도 HITL이 적용되나?

아니다. 서브에이전트는 `with_hitl=False`로 생성된다. 메인 에이전트가 ACP 모드에서 `task()` 도구를 호출할 때 이미 사용자 승인을 받았기 때문이다.

---

## 시리즈 목차

1. [DeepCoWork: AI 에이전트 데스크톱 앱을 만들었다](/posts/deepcowork-01-introduction)
2. [Tauri 2 + Python 사이드카](/posts/deepcowork-02-tauri-sidecar)
3. [DeepAgents SDK 핵심 해부](/posts/deepcowork-03-deep-agents-sdk)
4. [모드별 시스템 프롬프트 설계](/posts/deepcowork-04-system-prompts)
5. [SSE 스트리밍 파이프라인](/posts/deepcowork-05-sse-streaming)
6. **[이번 글]** HITL 승인 플로우
7. [멀티에이전트 ACP 모드](/posts/deepcowork-07-acp-multi-agent)
8. [에이전트 메모리 4계층](/posts/deepcowork-08-agent-memory)
9. [스킬 시스템](/posts/deepcowork-09-skills-system)
10. [LLM 프로바이더 통합](/posts/deepcowork-10-llm-providers)
11. [보안 체크리스트](/posts/deepcowork-11-security)
12. [GitHub Actions 크로스 플랫폼 빌드](/posts/deepcowork-12-ci-cd)
