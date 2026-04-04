---
author: baem1n
pubDatetime: 2026-04-04T05:00:00.000Z
title: "DeepCoWork #6: HITL Approval Flow -- interrupt_on, Approval Queue, Timeout, Rejection Recovery"
description: "Design and implementation of the human-in-the-loop approval flow for dangerous tool calls."
tags:
  - hitl
  - human-in-the-loop
  - ai-safety
  - agent
aiAssisted: true
---

> **TL;DR**: Write/execute tool calls trigger a [LangGraph interrupt](https://langchain-ai.github.io/langgraph/concepts/human_in_the_loop/)-based graph suspension with a 300-second auto-reject timeout for safety.

## Table of contents

## Why HITL

When an AI agent overwrites files or runs `rm -rf`, there is no undo. HITL (Human-in-the-Loop) is the safety gate that requires human confirmation before dangerous operations.

The implementation follows the tool call review pattern from the [LangGraph HITL how-to guide](https://langchain-ai.github.io/langgraph/how-tos/human_in_the_loop/review-tool-calls/).

| Tool | Needs Approval | Reason |
|------|---------------|--------|
| `read_file`, `ls`, `glob`, `grep` | No | Read-only, no side effects |
| `web_search`, `memory_read` | No | External lookup, non-destructive |
| `write_file` | Yes | Creates/overwrites files |
| `edit_file` | Yes | Modifies files |
| `execute` | Yes | Runs shell commands |

## The Complete Flow

```
Agent calls write_file
    |
    v
LangGraph interrupt_on -> graph suspended
    |
    v
_pump_agent: check graph_state.tasks[].interrupts for pending
    |
    v
_request_approval() -> send approval SSE event
    |
    v
Frontend ApprovalModal displayed
    |
    +-- Approve -> POST /agent/approve -> asyncio.Event.set()
    +-- Reject -> POST /agent/approve (approved=false)
    +-- Timeout (300s) -> auto-reject
    |
    v
Command(resume={"decisions": [...]}) -> agent resumes
```

## Backend: Interrupt Detection

`_pump_agent()` checks for interrupts after each agent execution:

```python
for _iter in range(config.MAX_AGENT_ITERATIONS):
    async for chunk in stream_events(agent, agent_input, cfg, active_subagents):
        await out.put(chunk)

    graph_state = await get_agent_state(agent, cfg)
    pending = []
    for task in (graph_state.tasks or []):
        for interrupt in (getattr(task, "interrupts", None) or []):
            pending.append(interrupt)

    if not pending:
        break  # No interrupt = agent complete

    decisions = []
    for interrupt in pending:
        value = getattr(interrupt, "value", interrupt) or {}
        action_requests = value.get("action_requests", [])

        for action_req in action_requests:
            tool_name = action_req.get("name", "")
            if tool_name in config.READ_ONLY_TOOLS:
                decisions.append({"type": "approve"})
                continue
            approved = await _request_approval(tool_name, action_req.get("args", {}), thread_id, out)
            decisions.append({"type": "approve" if approved else "reject"})

    agent_input = resume_agent_input(decisions)
```

Key: `MAX_AGENT_ITERATIONS` (default 25) prevents infinite loops.

## Approval Request and Wait

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
        approval_results[approval_id] = False  # Timeout = reject

    return approval_results.pop(approval_id, False)
```

`asyncio.Event` synchronizes the approval result. The SSE connection stays alive while waiting.

## Global State Management

Global dictionaries in `hitl.py`:

```python
pending_approvals: dict[str, asyncio.Event] = {}
approval_results: dict[str, bool] = {}
thread_approval_ids: dict[str, set[str]] = {}
thread_output_queues: dict[str, asyncio.Queue] = {}
abort_signals: dict[str, bool] = {}
```

`cleanup_thread()` clears all state when the stream ends.

## Frontend: ApprovalModal

The modal shows tool-specific formatting:
- `write_file`: File path + content preview
- `edit_file`: old_text -> new_text diff view
- `execute`: `$ command` format

A queue badge shows how many approvals are pending, processing them one at a time.

## Rejection Recovery

On rejection, the agent receives a `reject` decision and typically:
1. Tries an alternative approach to the same goal
2. Asks the user why they rejected
3. Skips the task and moves to the next one

## Benchmark

| Metric | Value |
|--------|-------|
| Approval timeout | 300 seconds (5 minutes) |
| Approval request to modal display latency | ~80ms |
| Average user response time (internal testing) | ~3.2 seconds |
| Rejection recovery success rate (Claude Sonnet) | ~70% |
| MAX_AGENT_ITERATIONS | 25 (infinite loop prevention) |

## Abort: Full Stop

When the user presses "Stop":

```typescript
const handleAbort = useCallback(async () => {
  abortRef.current?.abort();          // Cancel fetch
  await abortThread(threadId);        // Signal server
  finalizeStream();                   // Clean up UI
}, [activeThreadId, finalizeStream]);
```

Server-side, `abort_signals[thread_id] = True` terminates `_pump_agent`'s loop immediately.

## FAQ

### What is the approval timeout?

Default 300 seconds (5 minutes). Configurable via `config.APPROVAL_TIMEOUT_SEC`.

### What if multiple approval requests come at once?

They are queued. A `queueSize` badge shows how many are pending, and they are processed sequentially.

### Do sub-agents also require HITL?

No. Sub-agents are created with `with_hitl=False`. The main agent in ACP mode already received user approval when calling the `task()` tool.

---

## Series

1. [DeepCoWork: I Built an AI Agent Desktop App](/posts/deepcowork-01-introduction)
2. [Tauri 2 + Python Sidecar](/posts/deepcowork-02-tauri-sidecar)
3. [DeepAgents SDK Internals](/posts/deepcowork-03-deep-agents-sdk)
4. [System Prompt Design per Mode](/posts/deepcowork-04-system-prompts)
5. [SSE Streaming Pipeline](/posts/deepcowork-05-sse-streaming)
6. **[This post]** HITL Approval Flow
7. [Multi-Agent ACP Mode](/posts/deepcowork-07-acp-multi-agent)
8. [Agent Memory 4 Layers](/posts/deepcowork-08-agent-memory)
9. [Skills System](/posts/deepcowork-09-skills-system)
10. [LLM Provider Integration](/posts/deepcowork-10-llm-providers)
11. [Security Checklist](/posts/deepcowork-11-security)
12. [GitHub Actions Cross-Platform Build](/posts/deepcowork-12-ci-cd)
