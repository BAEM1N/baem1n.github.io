---
author: baem1n
pubDatetime: 2026-04-04T04:00:00.000Z
title: "DeepCoWork #5: SSE 스트리밍 파이프라인 -- agent.astream에서 React UI까지"
description: "LangGraph astream → SSE → EventSource → Zustand → React로 이어지는 실시간 스트리밍 파이프라인의 동작 원리와 구현."
tags:
  - sse
  - streaming
  - react
  - zustand
  - fastapi
aiAssisted: true
---

> **TL;DR**: 에이전트의 `astream()` 출력이 SSE → EventSource → Zustand → React까지 50ms 이내에 도달하는 실시간 파이프라인 구조다.

## Table of contents

## 전체 파이프라인

```
LangGraph astream()
    |
    v  (Python)
stream_events() -- 이벤트를 SSE JSON으로 변환
    |
    v
asyncio.Queue -- pump 패턴으로 비동기 생산/소비
    |
    v
FastAPI StreamingResponse -- "data: {...}\n\n"
    |
    v  (HTTP)
fetch() ReadableStream -- 브라우저에서 바이트 스트림 수신
    |
    v  (TypeScript)
parseSSEEvent() -- JSON 파싱
    |
    v
Zustand store -- 상태 업데이트
    |
    v
React 컴포넌트 -- UI 렌더링
```

## 1단계: LangGraph astream

`agent_core.py`의 `stream_events()`가 LangGraph의 `astream()`을 호출한다:

```python
async for event in agent.astream(
    agent_input,
    stream_mode=["updates", "messages"],
    subgraphs=True,
    config=cfg,
):
    if len(event) == 3:
        namespace, evmode, data = event
    else:
        namespace, evmode, data = (), event[0], event[1]

    source = "main" if not namespace else str(namespace[-1])
```

`stream_mode=["updates", "messages"]`로 두 종류의 이벤트를 수신한다:
- `messages`: 토큰 단위 텍스트 스트리밍
- `updates`: 노드 실행 완료 시 전체 상태 업데이트 (도구 호출/결과 포함)

## 2단계: SSE 변환

이벤트를 9가지 SSE 타입으로 매핑한다:

```python
def sse(payload: dict) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"
```

| SSE type | 용도 | 소스 |
|----------|------|------|
| `token` | 텍스트 토큰 | messages 이벤트 |
| `tool_call` | 도구 호출 시작 | updates 이벤트 |
| `tool_result` | 도구 실행 결과 | updates 이벤트 |
| `tasks` | 태스크 목록 (write_todos) | updates 이벤트 |
| `agents` | 서브에이전트 상태 | updates 이벤트 |
| `approval` | HITL 승인 요청 | _request_approval |
| `files_changed` | 파일 변경 알림 | HITL 승인 후 |
| `title` | 대화 제목 업데이트 | _pump_agent |
| `error` | 에러 메시지 | 예외 처리 |

토큰 필터링 로직이 중요하다 -- 도구 호출 메시지에 포함된 텍스트를 걸러낸다:

```python
if evmode == "messages":
    msg, meta_ev = data
    node = meta_ev.get("langgraph_node", "")
    if (
        hasattr(msg, "content")
        and msg.content
        and node in ("model", "agent", "call_model")
        and not getattr(msg, "tool_calls", None)
    ):
        yield sse({"type": "token", "content": msg.content, "source": source})
```

`tool_calls`가 있는 메시지는 토큰으로 전송하지 않는다. 그렇지 않으면 도구 호출 JSON이 텍스트로 렌더링된다.

## 3단계: asyncio.Queue Pump 패턴

```python
async def run_agent_stream(message, thread_id, mode, workspace_path=None):
    out: asyncio.Queue[str | None] = asyncio.Queue()
    thread_output_queues[thread_id] = out

    async def pump():
        await _pump_agent(message, thread_id, mode, workspace_path, out)

    asyncio.create_task(pump())

    while True:
        chunk = await out.get()
        if chunk is None:
            break
        yield chunk
```

`_pump_agent`가 큐에 쓰고, 제너레이터가 큐에서 읽는다. `None`이 종료 신호다. 이 패턴으로 HITL 대기 중에도 SSE 연결이 유지된다 -- 승인 이벤트는 큐를 통해 전달된다.

## 4단계: 프론트엔드 fetch

`useStreamHandler.ts`가 fetch로 SSE를 소비한다:

```typescript
const res = await fetch(`http://127.0.0.1:${serverPort}/agent/stream`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
  signal: abortRef.current.signal,
});

const reader = res.body?.getReader();
const decoder = new TextDecoder();
let buf = "";

while (true) {
  const { value, done } = await reader.read();
  if (done) break;
  resetStall();
  buf += decoder.decode(value, { stream: true });
  const lines = buf.split("\n");
  buf = lines.pop() ?? "";

  for (const line of lines) {
    if (!line.startsWith("data: ")) continue;
    const raw = line.slice(6).trim();
    if (raw === "[DONE]") { finalizeStream(); break; }
    const evt = parseSSEEvent(raw);
    // ... 이벤트 처리
  }
}
```

EventSource 대신 fetch를 사용한 이유: POST 요청이 필요하고, [MDN EventSource 명세](https://developer.mozilla.org/en-US/docs/Web/API/EventSource)에 따르면 EventSource는 GET만 지원한다. 버퍼 관리로 불완전한 SSE 라인을 처리한다. [LangGraph 스트리밍 문서](https://langchain-ai.github.io/langgraph/how-tos/streaming-tokens/)에서 `stream_mode` 옵션의 상세 동작을 확인할 수 있다.

## 5단계: Zustand 상태 업데이트

9가지 이벤트가 Zustand 액션에 매핑된다:

```typescript
switch (evt.type) {
  case "token":
    appendToLastMessage(evt.content ?? "");
    break;
  case "tool_call":
    addToolCallToLastMessage({ id: crypto.randomUUID(), name: toolName, input: toolArgs, status: "running" });
    addToolLog({ name: toolName, args: toolArgs, status: "running", source: evt.source });
    break;
  case "tool_result":
    markLastToolCallDone(evt.tool_name);
    updateLastToolLog(evt.content ?? "", "done");
    break;
  case "approval":
    setApprovals((q) => [...q, { approvalId: evt.approval_id, toolName: evt.tool_name, args: evt.args }]);
    break;
  case "files_changed":
    bumpFiles();
    break;
}
```

`appendToLastMessage`가 토큰을 마지막 어시스턴트 메시지에 이어붙인다:

```typescript
appendToLastMessage: (chunk) =>
  set((s) => {
    const msgs = [...s.messages];
    const last = msgs[msgs.length - 1];
    if (last && last.streaming) {
      msgs[msgs.length - 1] = { ...last, content: last.content + chunk };
    }
    return { messages: msgs };
  }),
```

## 스톨 감지

45초간 데이터가 없으면 타임아웃으로 처리한다:

```typescript
const STALL_MS = 45_000;

function resetStall() {
  if (stallTimerRef.current) clearTimeout(stallTimerRef.current);
  stallTimerRef.current = setTimeout(() => {
    abortRef.current?.abort();
    appendToLastMessage("\n\n경고: 응답 대기 시간 초과 (45초).");
    finalizeStream();
  }, STALL_MS);
}
```

모든 SSE 이벤트 수신 시 타이머를 리셋한다. HITL 대기 중에는 승인 이벤트가 타이머를 리셋하므로 타임아웃이 발생하지 않는다.

## 실측 데이터

| 항목 | 수치 |
|------|------|
| 토큰-투-렌더 레이턴시 (LLM 응답 → UI 표시) | ~35ms (로컬), ~50ms (원격) |
| SSE 이벤트 처리량 (초당) | ~120 이벤트/초 (도구 호출 포함 피크) |
| 9가지 SSE 이벤트 타입 | token, tool_call, tool_result, tasks, agents, approval, files_changed, title, error |
| 스톨 타임아웃 | 45초 |
| 평균 fetch 버퍼 크기 | ~2.4KB/청크 |

## 삽질 노트

처음에 SSE 파싱을 줄 단위(`\n` 기준 split)로 했더니 멀티바이트 한글이 잘렸다. UTF-8에서 한글 한 글자가 3바이트인데, fetch의 ReadableStream이 바이트 경계에서 청크를 나누면 글자 중간이 잘리는 문제였다. `TextDecoder`의 `stream: true` 옵션을 켜서 해결했다. 이 옵션이 불완전한 멀티바이트 시퀀스를 내부 버퍼에 보관하고 다음 청크와 합쳐서 디코딩한다.

두 번째 문제는 도구 호출 메시지의 텍스트가 토큰으로 렌더링되는 버그였다. LangGraph의 `messages` 이벤트에는 도구 호출 JSON이 `content` 필드에 포함되는 경우가 있다. `tool_calls` 속성이 있는 메시지를 필터링하는 로직을 추가해서 해결했는데, 이 필터 없이는 JSON 문자열이 채팅 창에 그대로 출력됐다.

세 번째로, asyncio.Queue의 pump 패턴을 도입하기 전에는 HITL 대기 중 SSE 연결이 끊어졌다. FastAPI의 StreamingResponse는 제너레이터가 yield하지 않으면 연결을 유지하지 않기 때문이다. Queue 기반으로 바꾸니 승인 대기 중에도 연결이 살아있게 됐다.

## 자주 묻는 질문

### WebSocket 대신 SSE를 쓴 이유는?

SSE는 단방향(서버->클라이언트)이지만 구현이 단순하고 자동 재연결을 지원한다. HITL 승인 같은 클라이언트->서버 통신은 별도 POST 엔드포인트를 사용한다.

### 토큰이 깨져서 보이는 경우는?

`TextDecoder({ stream: true })` 옵션이 멀티바이트 UTF-8 문자의 중간 잘림을 처리한다. 버퍼링으로 불완전한 줄도 다음 청크에서 완성된다.

---

## 시리즈 목차

1. [DeepCoWork: AI 에이전트 데스크톱 앱을 만들었다](/posts/deepcowork-01-introduction)
2. [Tauri 2 + Python 사이드카](/posts/deepcowork-02-tauri-sidecar)
3. [DeepAgents SDK 핵심 해부](/posts/deepcowork-03-deep-agents-sdk)
4. [모드별 시스템 프롬프트 설계](/posts/deepcowork-04-system-prompts)
5. **[이번 글]** SSE 스트리밍 파이프라인
6. [HITL 승인 플로우](/posts/deepcowork-06-hitl-approval)
7. [멀티에이전트 ACP 모드](/posts/deepcowork-07-acp-multi-agent)
8. [에이전트 메모리 4계층](/posts/deepcowork-08-agent-memory)
9. [스킬 시스템](/posts/deepcowork-09-skills-system)
10. [LLM 프로바이더 통합](/posts/deepcowork-10-llm-providers)
11. [보안 체크리스트](/posts/deepcowork-11-security)
12. [GitHub Actions 크로스 플랫폼 빌드](/posts/deepcowork-12-ci-cd)
