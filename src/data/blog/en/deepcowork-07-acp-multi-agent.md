---
author: baem1n
pubDatetime: 2026-04-04T06:00:00.000Z
title: "DeepCoWork #7: Multi-Agent ACP Mode -- task() Tool, Sub-Agent Creation, Stream Merging"
description: "How the ACP mode main agent creates sub-agents via task() and merges their streams -- a multi-agent implementation story."
tags:
  - multi-agent
  - acp
  - sub-agent
  - langgraph
  - ai-agent
aiAssisted: true
---

> **TL;DR**: The ACP mode main agent spawns sub-agents via the `task()` tool and never writes code directly -- a pure orchestrator pattern.

## Table of contents

## What is ACP Mode

ACP makes the main agent an architecture lead while sub-agents handle implementation. It follows the supervisor pattern from the [LangGraph multi-agent docs](https://langchain-ai.github.io/langgraph/concepts/multi_agent/), but simplified with a `task()` tool-based approach.

```
Main Agent (ACP mode)
    |
    +-- task("Analyze file structure") --> Sub-agent A
    +-- task("Implement API endpoints") --> Sub-agent B
    +-- task("Write tests") --> Sub-agent C
    |
    v
Integrate results and quality review
```

## The task() Tool Implementation

```python
@tool
async def task(description: str, instructions: str = "") -> str:
    """Creates a sub-agent to execute an independent subtask."""
    aid = uuid.uuid4().hex[:8]
    sub_thread_id = f"{thread_id or 'acp'}-sub-{aid}"

    subagents[aid] = {"id": aid, "name": description, "status": "running", "currentTask": prompt[:80]}

    # Sub-agents run without HITL
    sub_agent = build_agent(
        workspace_dir, app_state.checkpointer,
        "code",           # Sub-agents always use Code mode
        sub_thread_id,
        with_hitl=False,  # HITL disabled
    )

    result_tokens: list[str] = []
    async for chunk in stream_events(sub_agent, {"messages": [{"role": "user", "content": prompt}]}, sub_config, {}):
        if out_queue:
            data = json.loads(chunk.removeprefix("data: ").strip())
            if data.get("type") == "token":
                result_tokens.append(data.get("content", ""))
            data["source"] = f"sub:{description[:24]}"
            await out_queue.put(sse(data))

    subagents[aid]["status"] = "done"
    return "".join(result_tokens).strip() or f"[{description} complete]"
```

The [LangGraph subgraph streaming docs](https://langchain-ai.github.io/langgraph/how-tos/streaming-subgraphs/) were the reference for capturing sub-agent events. Key design decisions:

1. **Code mode fixed**: Sub-agents always run in Code mode for direct implementation.
2. **HITL disabled**: The main agent's `task()` call already has user approval.
3. **Independent thread_id**: Each sub-agent runs on a separate thread for state isolation.

## Stream Merging

Sub-agent SSE events are merged into the main stream with source tags:

```python
data["source"] = f"sub:{description[:24]}"
await out_queue.put(sse(data))
```

| source value | Meaning |
|-------------|---------|
| `"main"` | Main agent |
| `"sub:Analyze files"` | Sub-agent (name shown) |

## Sub-Agent State Tracking

```typescript
export interface SubAgent {
  id: string;
  name: string;
  status: AgentStatus;  // "idle" | "running" | "done" | "error"
  currentTask?: string;
}
```

The frontend Agents panel displays real-time status of all sub-agents, updated via SSE `agents` events.

## Circular Dependency Resolution

The `task()` tool references `stream`, `agent_core`, and `state`, which depend on each other. Lazy imports break the cycle:

```python
@tool
async def task(description: str, instructions: str = "") -> str:
    from stream import sse, stream_events
    from agent_core import build_agent
    from state import state as app_state
    from hitl import thread_output_queues, thread_subagents
```

## Error Handling

If a sub-agent fails, its status updates to "error" and the error message returns to the main agent, which can try alternative strategies.

## Benchmark

| Metric | Value |
|--------|-------|
| Sub-agent creation overhead | ~200ms (excluding LLM call) |
| 3 sub-agents parallel execution total time | ~45 seconds (Claude Sonnet) |
| Sub-agent average ReAct loop iterations | 5-8 |
| Recommended sub-agent count | 3-5 |
| Stream merge source tag overhead | Negligible (~20 bytes/event) |

## FAQ

### Do sub-agents share files?

Yes. They share the same `workspace_dir`, so sub-agent A's output files are readable by sub-agent B. However, concurrent write conflicts are not prevented, so the main agent must decompose tasks into independent units.

### How many sub-agents can run?

No hard limit, but each sub-agent makes separate LLM calls. In practice, 3-5 is optimal for cost and speed.

### Do sub-agents create plan.md?

No. Sub-agents run in Code mode without plan-based planning. Planning is the main agent's responsibility.

---

## Series

1. [DeepCoWork: I Built an AI Agent Desktop App](/posts/deepcowork-01-introduction)
2. [Tauri 2 + Python Sidecar](/posts/deepcowork-02-tauri-sidecar)
3. [DeepAgents SDK Internals](/posts/deepcowork-03-deep-agents-sdk)
4. [System Prompt Design per Mode](/posts/deepcowork-04-system-prompts)
5. [SSE Streaming Pipeline](/posts/deepcowork-05-sse-streaming)
6. [HITL Approval Flow](/posts/deepcowork-06-hitl-approval)
7. **[This post]** Multi-Agent ACP Mode
8. [Agent Memory 4 Layers](/posts/deepcowork-08-agent-memory)
9. [Skills System](/posts/deepcowork-09-skills-system)
10. [LLM Provider Integration](/posts/deepcowork-10-llm-providers)
11. [Security Checklist](/posts/deepcowork-11-security)
12. [GitHub Actions Cross-Platform Build](/posts/deepcowork-12-ci-cd)
