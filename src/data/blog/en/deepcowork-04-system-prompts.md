---
author: baem1n
pubDatetime: 2026-04-04T03:00:00.000Z
title: "DeepCoWork #4: System Prompt Design per Mode -- Clarify, Code, Cowork, ACP"
description: "How 4 agent modes use different system prompts, with real prompt engineering patterns from the codebase."
tags:
  - prompt-engineering
  - system-prompt
  - ai-agent
  - langchain
aiAssisted: true
---

> **TL;DR**: DeepCoWork injects a different system prompt for each of its 4 modes (Clarify, Code, Cowork, ACP). The final prompt combines common rules + mode prompt + memory files (SOUL/USER/MEMORY.md) + runtime environment info. Each mode explicitly constrains the agent's behavior scope.

## Table of contents

## Prompt Architecture

`build_system_prompt()` assembles 4 layers:

```python
def build_system_prompt(mode: str, workspace_dir: Path) -> str:
    mode_prompt = _MODE_PROMPTS.get(mode, _MODE_PROMPTS["cowork"])
    soul = read_memory_file(config.WORKSPACE_ROOT / "SOUL.md")
    user_prefs = read_memory_file(config.WORKSPACE_ROOT / "USER.md")
    session_memory = read_memory_file(workspace_dir / "MEMORY.md")

    parts = [
        f"You are {app_name}'s AI cowork agent.",
        mode_prompt,
        _COMMON_RULES,
    ]
    if soul:
        parts.append(f"## Agent Persona (SOUL.md)\n{soul}")
    if user_prefs:
        parts.append(f"## User Preferences (USER.md)\n{user_prefs}")
    if session_memory:
        parts.append(f"## Previous Session Memory (MEMORY.md)\n{session_memory}")

    parts.append(f"## Runtime\n- OS: {config.PLATFORM}\n- Shell: {shell_name}\n- Workspace: {workspace_dir}\n- Current mode: {mode}")
    return "\n\n".join(parts)
```

| Order | Layer | Purpose |
|-------|-------|---------|
| 1 | Role declaration | "AI cowork agent" |
| 2 | Mode prompt | Behavior rules and constraints |
| 3 | Common rules | Language, tools, HITL rules |
| 4 | Memory files | Persona, preferences, session memory |
| 5 | Runtime environment | OS, shell, workspace path |

## Mode 1: Clarify -- Requirement Strategist

The agent reads code first, then asks only what it cannot determine from the codebase. Maximum 3 questions, answers under 4 lines. No unnecessary explanations.

Key design: Prevent questions like "What language are you using?" that the agent could answer by reading the code first.

## Mode 2: Code -- Pair Programming Partner

Minimal changes only. Read files before modifying. Follow existing code style, patterns, and naming. Focus on requested features, not unsolicited refactoring. Run tests after changes.

Key: The "minimal change" principle. Explicitly prevents the agent from refactoring unrelated code.

## Mode 3: Cowork -- Autonomous Agent

Plan-based ReAct execution:
- **Round 1**: Write `plan.md` (task list, completion criteria, dependencies)
- **Subsequent rounds**: Read `plan.md` -> execute current task -> update `plan.md` status
- **Completion**: End with "TASK_COMPLETED: [summary]"

Key: File-based self-tracking. The agent manages its progress in a file, avoiding LLM context consumption for long-running tasks.

## Mode 4: ACP -- Architecture Lead

The agent never writes code directly. It only delegates to sub-agents via the `task()` tool. Focuses on architecture decisions, interface design, and code review.

Key: The hard constraint "never directly use write_file / edit_file / execute" makes the ACP agent a pure orchestrator.

## Mode Comparison

| Feature | Clarify | Code | Cowork | ACP |
|---------|---------|------|--------|-----|
| File read | Yes | Yes | Yes | Yes |
| File write | No | Yes | Yes | No (delegated) |
| Shell exec | No | Yes | Yes | No (delegated) |
| Planning | No | No | Yes (plan.md) | Yes (task decomposition) |
| Sub-agents | No | No | No | Yes |
| Primary use | Analysis | Implementation | Autonomous | Large-scale |

## Common Rules: Cross-Platform

```python
def _make_common_rules() -> str:
    if config.IS_WIN:
        shell_hint = "**Shell**: PowerShell (Windows)..."
    elif config.PLATFORM == "Darwin":
        shell_hint = "**Shell**: zsh (macOS)..."
    else:
        shell_hint = "**Shell**: bash (Linux)..."
```

OS detection automatically adjusts shell command guidance. Windows users get PowerShell commands; macOS users get zsh idioms.

## Prompt Engineering Lessons

1. **Constraints beat instructions**: "Do NOT do X" is more reliably followed than "Please do X."
2. **Specify exact formats**: Defining the plan.md markdown structure keeps output consistent.
3. **"MUST first"**: Emphasizing preconditions prevents the agent from acting without context.
4. **Inject runtime info**: Including OS and shell type in the prompt generates platform-correct commands.

## FAQ

### Can I switch modes mid-conversation?

Yes. The mode switch in the UI applies from the next message onward. In-progress streams are unaffected.

### Can I add a custom mode?

Add a new entry to the `_MODE_PROMPTS` dictionary in `prompts.py`, and add a corresponding button to the `ModeSwitch` frontend component.

### What if SOUL.md is empty?

A default persona is created by `_init_default_soul()` in `main.py`: "Act like an enthusiastic, systematic senior engineer."

---

## Series

1. [DeepCoWork: I Built an AI Agent Desktop App](/posts/deepcowork-01-introduction)
2. [Tauri 2 + Python Sidecar](/posts/deepcowork-02-tauri-sidecar)
3. [DeepAgents SDK Internals](/posts/deepcowork-03-deep-agents-sdk)
4. **[This post]** System Prompt Design per Mode
5. [SSE Streaming Pipeline](/posts/deepcowork-05-sse-streaming)
6. [HITL Approval Flow](/posts/deepcowork-06-hitl-approval)
7. [Multi-Agent ACP Mode](/posts/deepcowork-07-acp-multi-agent)
8. [Agent Memory 4 Layers](/posts/deepcowork-08-agent-memory)
9. [Skills System](/posts/deepcowork-09-skills-system)
10. [LLM Provider Integration](/posts/deepcowork-10-llm-providers)
11. [Security Checklist](/posts/deepcowork-11-security)
12. [GitHub Actions Cross-Platform Build](/posts/deepcowork-12-ci-cd)
