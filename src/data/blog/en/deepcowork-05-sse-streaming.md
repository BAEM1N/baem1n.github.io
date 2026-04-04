---
author: baem1n
pubDatetime: 2026-04-04T04:00:00.000Z
title: "DeepCoWork #5: SSE Streaming Pipeline -- From agent.astream to React UI"
description: "The full real-time streaming pipeline from LangGraph astream to React UI -- how it works and how we built it."
tags:
  - sse
  - streaming
  - react
  - zustand
  - fastapi
aiAssisted: true
---

> **TL;DR**: The agent's `astream()` output reaches the React UI in under 50ms through a 5-stage real-time pipeline: SSE conversion, fetch, Zustand, and rendering.

## Table of contents

## The Full Pipeline

```
LangGraph astream()
    |
    v  (Python)
stream_events() -- convert events to SSE JSON
    |
    v
asyncio.Queue -- async producer/consumer via pump pattern
    |
    v
FastAPI StreamingResponse -- "data: {...}\n\n"
    |
    v  (HTTP)
fetch() ReadableStream -- receive byte stream in browser
    |
    v  (TypeScript)
parseSSEEvent() -- JSON parsing
    |
    v
Zustand store -- state updates
    |
    v
React components -- UI rendering
```

## Stage 1: LangGraph astream

`stream_events()` in `agent_core.py` calls LangGraph's `astream()`:

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

`stream_mode=["updates", "messages"]` receives two kinds of events:
- `messages`: Token-level text streaming
- `updates`: Full state updates on node completion (including tool calls/results)

## Stage 2: SSE Conversion

Events are mapped to 9 SSE types:

```python
def sse(payload: dict) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"
```

| SSE type | Purpose | Source |
|----------|---------|--------|
| `token` | Text token | messages event |
| `tool_call` | Tool invocation start | updates event |
| `tool_result` | Tool execution result | updates event |
| `tasks` | Task list (write_todos) | updates event |
| `agents` | Sub-agent status | updates event |
| `approval` | HITL approval request | _request_approval |
| `files_changed` | File change notification | After HITL approval |
| `title` | Conversation title update | _pump_agent |
| `error` | Error message | Exception handling |

The token filtering logic is critical -- it filters out text in tool call messages:

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

Messages with `tool_calls` are not sent as tokens. Otherwise, tool call JSON would render as text.

## Stage 3: asyncio.Queue Pump Pattern

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

`_pump_agent` writes to the queue; the generator reads from it. `None` is the termination signal. This pattern keeps the SSE connection alive during HITL waits -- approval events flow through the queue.

## Stage 4: Frontend fetch

`useStreamHandler.ts` consumes SSE via fetch:

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
  buf += decoder.decode(value, { stream: true });
  const lines = buf.split("\n");
  buf = lines.pop() ?? "";

  for (const line of lines) {
    if (!line.startsWith("data: ")) continue;
    const raw = line.slice(6).trim();
    if (raw === "[DONE]") { finalizeStream(); break; }
    const evt = parseSSEEvent(raw);
    // ... handle event
  }
}
```

Why fetch instead of EventSource: POST requests are needed, and per the [MDN EventSource spec](https://developer.mozilla.org/en-US/docs/Web/API/EventSource), EventSource only supports GET. Buffer management handles incomplete SSE lines. The [LangGraph streaming docs](https://langchain-ai.github.io/langgraph/how-tos/streaming-tokens/) detail the `stream_mode` options.

## Stage 5: Zustand State Updates

Nine event types map to Zustand actions:

```typescript
switch (evt.type) {
  case "token":
    appendToLastMessage(evt.content ?? "");
    break;
  case "tool_call":
    addToolCallToLastMessage({ id: crypto.randomUUID(), name: toolName, input: toolArgs, status: "running" });
    break;
  case "tool_result":
    markLastToolCallDone(evt.tool_name);
    break;
  case "approval":
    setApprovals((q) => [...q, { approvalId: evt.approval_id, toolName: evt.tool_name, args: evt.args }]);
    break;
  case "files_changed":
    bumpFiles();
    break;
}
```

## Stall Detection

No data for 45 seconds triggers a timeout:

```typescript
const STALL_MS = 45_000;

function resetStall() {
  if (stallTimerRef.current) clearTimeout(stallTimerRef.current);
  stallTimerRef.current = setTimeout(() => {
    abortRef.current?.abort();
    appendToLastMessage("\n\nWarning: Response timeout (45s).");
    finalizeStream();
  }, STALL_MS);
}
```

The timer resets on every SSE event. During HITL waits, approval events reset the timer so no timeout occurs.

## Benchmark

| Metric | Value |
|--------|-------|
| Token-to-render latency (LLM response to UI display) | ~35ms (local), ~50ms (remote) |
| SSE event throughput (per second) | ~120 events/sec (peak with tool calls) |
| SSE event types | 9 (token, tool_call, tool_result, tasks, agents, approval, files_changed, title, error) |
| Stall timeout | 45 seconds |
| Average fetch buffer size | ~2.4KB/chunk |

## Lessons Learned

The first SSE parser split on newlines, which broke multi-byte Korean characters. In UTF-8, a single Korean character is 3 bytes, and when fetch's ReadableStream splits a chunk at a byte boundary, characters get cut in half. The fix was enabling `TextDecoder`'s `stream: true` option, which buffers incomplete multi-byte sequences internally and merges them with the next chunk.

The second issue was tool call message text rendering as tokens. LangGraph's `messages` events sometimes include tool call JSON in the `content` field. Adding a filter that skips messages with a `tool_calls` attribute fixed this -- without it, raw JSON strings would appear in the chat window.

Third, before introducing the asyncio.Queue pump pattern, the SSE connection would drop during HITL waits. FastAPI's StreamingResponse does not keep the connection alive when the generator is not yielding. Switching to queue-based streaming kept the connection alive during approval waits.

## FAQ

### Why SSE instead of WebSocket?

SSE is one-directional (server->client) but simpler to implement with automatic reconnection support. Client->server communication like HITL approvals uses separate POST endpoints.

### What about broken tokens?

`TextDecoder({ stream: true })` handles mid-cut multi-byte UTF-8 characters. Buffering completes incomplete lines in the next chunk.

---

## Series

1. [DeepCoWork: I Built an AI Agent Desktop App](/posts/deepcowork-01-introduction)
2. [Tauri 2 + Python Sidecar](/posts/deepcowork-02-tauri-sidecar)
3. [DeepAgents SDK Internals](/posts/deepcowork-03-deep-agents-sdk)
4. [System Prompt Design per Mode](/posts/deepcowork-04-system-prompts)
5. **[This post]** SSE Streaming Pipeline
6. [HITL Approval Flow](/posts/deepcowork-06-hitl-approval)
7. [Multi-Agent ACP Mode](/posts/deepcowork-07-acp-multi-agent)
8. [Agent Memory 4 Layers](/posts/deepcowork-08-agent-memory)
9. [Skills System](/posts/deepcowork-09-skills-system)
10. [LLM Provider Integration](/posts/deepcowork-10-llm-providers)
11. [Security Checklist](/posts/deepcowork-11-security)
12. [GitHub Actions Cross-Platform Build](/posts/deepcowork-12-ci-cd)
