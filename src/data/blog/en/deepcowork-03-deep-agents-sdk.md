---
author: baem1n
pubDatetime: 2026-04-04T02:00:00.000Z
title: "DeepCoWork #3: DeepAgents SDK Internals -- create_deep_agent, LocalShellBackend, ReAct Loop"
description: "Deep dive into the core SDK functions and how DeepCoWork wraps them in a single coupling point."
tags:
  - deep-agents
  - langchain
  - langgraph
  - react-loop
  - ai-agent
aiAssisted: true
---

> **TL;DR**: All agent logic in DeepCoWork lives in one file: `agent_core.py`. `create_deep_agent` builds a LangGraph ReAct graph, `LocalShellBackend` auto-provides file/shell tools, and `interrupt_on` halts execution before dangerous tool calls. This file is the only SDK coupling point.

## Table of contents

## Architecture: Single Coupling Point

DeepCoWork isolates all Deep Agents SDK interaction into `agent_core.py`. The export contract has five items:

| Export | Purpose |
|--------|---------|
| `build_llm()` | Create LLM instance from settings |
| `build_agent()` | Create DeepAgent instance |
| `stream_events()` | SSE streaming |
| `get_agent_state()` | Query agent state |
| `resume_agent_input()` | Resume from HITL |

When the SDK version changes, only this file needs updating.

## Dissecting create_deep_agent

The `build_agent()` function calls the SDK's `create_deep_agent`:

```python
from deepagents import create_deep_agent
from deepagents.backends import LocalShellBackend

def build_agent(
    workspace_dir: Path,
    checkpointer: Any,
    mode: str = "cowork",
    thread_id: str | None = None,
    with_hitl: bool = True,
    tools: list | None = None,
    system_prompt: str | None = None,
) -> Any:
    llm = build_llm()

    backend = LocalShellBackend(
        root_dir=str(workspace_dir),
        virtual_mode=False,
        timeout=60,
        max_output_bytes=50_000,
        inherit_env=True,
    )

    if system_prompt is None:
        system_prompt = build_system_prompt(mode, workspace_dir)

    interrupt_on: dict = (
        {"write_file": True, "edit_file": True, "execute": True}
        if with_hitl else {}
    )

    return create_deep_agent(
        model=llm,
        tools=tools or [],
        backend=backend,
        interrupt_on=interrupt_on,
        checkpointer=checkpointer,
        system_prompt=system_prompt,
        skills=_resolve_skills(workspace_dir) or None,
    )
```

Let's examine each key parameter.

## LocalShellBackend

`LocalShellBackend` gives the agent filesystem and shell access. Auto-provided tools:

| Tool | Type | Needs HITL |
|------|------|------------|
| `read_file` | Read | No |
| `write_file` | Write | Yes |
| `edit_file` | Write | Yes |
| `execute` | Shell | Yes |
| `ls` | Read | No |
| `glob` | Read | No |
| `grep` | Read | No |

Key configuration:

```python
backend = LocalShellBackend(
    root_dir=str(workspace_dir),  # Sandbox boundary
    virtual_mode=False,            # Real filesystem
    timeout=60,                    # Shell command timeout (seconds)
    max_output_bytes=50_000,       # Output size limit
    inherit_env=True,              # Inherit environment variables
)
```

`root_dir` is the agent's sandbox boundary. No file access is possible outside this directory.

## interrupt_on: The HITL Gate

The `interrupt_on` dictionary decides which tool calls pause execution:

```python
interrupt_on = {"write_file": True, "edit_file": True, "execute": True}
```

When these tools are invoked, LangGraph suspends graph execution and sends an approval request to the frontend. On approval, execution resumes with `Command(resume={"decisions": [...]})`:

```python
def resume_agent_input(decisions: list[dict]) -> Any:
    return Command(resume={"decisions": decisions})
```

Sub-agents are created with `with_hitl=False` and run without HITL -- the main agent already has approval.

## The ReAct Loop

The core of DeepAgents SDK is a LangGraph-based ReAct (Reasoning + Acting) loop:

```
[User message]
     |
     v
  LLM Reasoning
     |
     +-- Tool call decision (Acting)
     |       |
     |       v
     |   [interrupt_on check]
     |       |
     |       +-- HITL needed -> pause -> wait for approval
     |       +-- HITL not needed -> execute immediately
     |       |
     |       v
     |   Tool execution result
     |       |
     +-------+
     |
     v
  LLM Reasoning (decide next action)
     |
     +-- Complete -> final response
     +-- Incomplete -> loop again
```

The `stream_events()` function converts this loop into SSE:

```python
async for event in agent.astream(
    agent_input,
    stream_mode=["updates", "messages"],
    subgraphs=True,
    config=cfg,
):
```

`stream_mode=["updates", "messages"]` receives both tool call events and text tokens. `subgraphs=True` captures sub-agent events in ACP mode.

## Checkpointer: State Persistence

`AsyncSqliteSaver` persists agent state to SQLite:

```python
from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver

self.db_conn = await aiosqlite.connect(str(config.DB_PATH))
await self.db_conn.execute("PRAGMA journal_mode=WAL")
self.checkpointer = AsyncSqliteSaver(self.db_conn)
```

WAL (Write-Ahead Logging) mode ensures concurrent read/write performance. Conversation history and agent state survive app restarts.

## Skill Resolution

`_resolve_skills()` scans global and workspace skill directories:

```python
def _resolve_skills(workspace_dir: Path) -> list[str]:
    sources: list[str] = []
    global_skills = config.WORKSPACE_ROOT / "skills"
    if global_skills.is_dir():
        sources.append("skills/")
    ws_skills = workspace_dir / "skills"
    if ws_skills.is_dir():
        sources.append("skills/")
    return sources
```

Priority: global (`~/.cowork/skills/`) < workspace (`{workspace}/skills/`). Later-loaded skills take precedence.

## FAQ

### Can it work without the Deep Agents SDK?

No. `create_deep_agent` and `LocalShellBackend` are core dependencies. However, by replacing only `agent_core.py`, you could swap in a different agent framework.

### What happens with virtual_mode=True?

File writes are handled in memory without touching disk. Useful for testing or preview, but DeepCoWork uses False since real filesystem changes are the goal.

### Why max_output_bytes=50_000?

Large shell outputs consume LLM context. The 50KB limit prevents commands like `npm install` from overwhelming the agent with verbose output.

---

## Series

1. [DeepCoWork: I Built an AI Agent Desktop App](/posts/deepcowork-01-introduction)
2. [Tauri 2 + Python Sidecar](/posts/deepcowork-02-tauri-sidecar)
3. **[This post]** DeepAgents SDK Internals
4. [System Prompt Design per Mode](/posts/deepcowork-04-system-prompts)
5. [SSE Streaming Pipeline](/posts/deepcowork-05-sse-streaming)
6. [HITL Approval Flow](/posts/deepcowork-06-hitl-approval)
7. [Multi-Agent ACP Mode](/posts/deepcowork-07-acp-multi-agent)
8. [Agent Memory 4 Layers](/posts/deepcowork-08-agent-memory)
9. [Skills System](/posts/deepcowork-09-skills-system)
10. [LLM Provider Integration](/posts/deepcowork-10-llm-providers)
11. [Security Checklist](/posts/deepcowork-11-security)
12. [GitHub Actions Cross-Platform Build](/posts/deepcowork-12-ci-cd)
