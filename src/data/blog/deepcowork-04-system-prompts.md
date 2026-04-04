---
author: baem1n
pubDatetime: 2026-04-04T03:00:00.000Z
title: "DeepCoWork #4: 모드별 시스템 프롬프트 설계 -- Clarify, Code, Cowork, ACP"
description: "4가지 에이전트 모드의 시스템 프롬프트를 어떻게 설계했는지, 프롬프트 엔지니어링 패턴을 실제 코드로 분석합니다."
tags:
  - prompt-engineering
  - system-prompt
  - ai-agent
  - langchain
aiAssisted: true
---

> **TL;DR**: DeepCoWork는 4가지 모드(Clarify, Code, Cowork, ACP)마다 다른 시스템 프롬프트를 주입한다. 공통 규칙 + 모드 프롬프트 + 메모리 파일(SOUL/USER/MEMORY.md) + 실행 환경 정보가 조합되어 최종 프롬프트가 된다. 각 모드는 에이전트의 행동 범위를 명확히 제한한다.

## Table of contents

## 프롬프트 아키텍처

`build_system_prompt()` 함수가 4개의 레이어를 조합한다:

```python
def build_system_prompt(mode: str, workspace_dir: Path) -> str:
    mode_prompt = _MODE_PROMPTS.get(mode, _MODE_PROMPTS["cowork"])
    soul = read_memory_file(config.WORKSPACE_ROOT / "SOUL.md")
    user_prefs = read_memory_file(config.WORKSPACE_ROOT / "USER.md")
    session_memory = read_memory_file(workspace_dir / "MEMORY.md")

    parts = [
        f"당신은 {app_name}의 AI 코워크 에이전트입니다.",
        mode_prompt,
        _COMMON_RULES,
    ]
    if soul:
        parts.append(f"## 에이전트 페르소나 (SOUL.md)\n{soul}")
    if user_prefs:
        parts.append(f"## 사용자 선호 (USER.md)\n{user_prefs}")
    if session_memory:
        parts.append(f"## 이전 세션 메모리 (MEMORY.md)\n{session_memory}")

    parts.append(f"## 실행 환경\n- OS: {config.PLATFORM}\n- 셸: {shell_name}\n- 워크스페이스: {workspace_dir}\n- 현재 모드: {mode}")

    return "\n\n".join(parts)
```

레이어 구조:

| 순서 | 레이어 | 역할 |
|------|--------|------|
| 1 | 역할 선언 | "AI 코워크 에이전트" |
| 2 | 모드 프롬프트 | 행동 규칙과 제약 |
| 3 | 공통 규칙 | 언어, 도구, HITL 규칙 |
| 4 | 메모리 파일 | 페르소나, 선호, 세션 기억 |
| 5 | 실행 환경 | OS, 셸, 워크스페이스 경로 |

## 모드 1: Clarify -- 요구사항 수집 전략가

```python
"clarify": """## 모드: Clarify -- 요구사항 수집 전략가

직접 조사한 후 핵심 질문만 합니다. 절대 가정하지 마세요.

### 행동 규칙
- 먼저 관련 파일과 코드를 **반드시 읽어** 컨텍스트를 파악하세요
- 명확하지 않은 요구사항만 질문하세요 (최대 3개)
- 답변은 4줄 이하로 간결하게
- 불필요한 설명이나 요약 금지"""
```

핵심 설계 의도: 에이전트가 코드를 먼저 읽고 나서 질문하게 한다. "어떤 언어를 사용하나요?" 같은 코드 보면 알 수 있는 질문을 방지한다.

## 모드 2: Code -- 페어프로그래밍 파트너

```python
"code": """## 모드: Code -- 페어프로그래밍 파트너

최소한의 필요한 코드만 변경합니다.

### 행동 규칙
- 변경 전 관련 파일을 **반드시 먼저 읽으세요**
- 기존 코드 스타일·패턴·네이밍을 따르세요
- 리팩토링보다 요청된 기능 구현에 집중
- 변경 후 execute 도구로 테스트 실행
- 코드 블록 외 설명은 최소화"""
```

핵심: "최소 변경" 원칙. 에이전트가 요청과 무관한 리팩토링을 하지 않도록 명시적으로 제한한다.

## 모드 3: Cowork -- 협업 자율 에이전트

```python
"cowork": """## 모드: Cowork -- 협업 자율 에이전트

복잡한 작업을 체계적으로 계획하고 자율 실행합니다.

### Plan-based ReAct 실행 방식 (cowork-studio 패턴)
**1라운드**: write_file로 plan.md 생성
**이후 라운드**: read_file로 plan.md 참조 -> 현재 태스크 실행 -> plan.md 상태 업데이트
**완료 시**: "TASK_COMPLETED: [요약]"으로 마무리

### plan.md 필수 형식
# Plan: [작업 제목]
## Tasks
- [ ] T1: [태스크 설명] (예상: N라운드)
- [ ] T2: [태스크 설명]
## Current Task: T1
## Status: in_progress"""
```

핵심: `plan.md` 기반 자기 추적. 에이전트가 자신이 어디까지 했는지를 파일로 관리해서 LLM 컨텍스트 소모 없이 장기 작업을 수행한다.

## 모드 4: ACP -- 아키텍처 리드

```python
"acp": """## 모드: ACP -- 아키텍처 리드 (Agent Coordination Protocol)

직접 코드를 작성하지 않습니다. **서브에이전트에게만 위임**합니다.

### 행동 규칙
- 작업을 독립적인 서브태스크로 **철저히 분해**하세요
- 각 서브태스크를 task() 도구로 병렬/순차 실행
- 서브에이전트 결과를 통합하고 품질 검토
- 아키텍처 결정, 인터페이스 설계, 코드 리뷰에 집중
- 절대 직접 write_file / edit_file / execute 사용 금지"""
```

핵심: "직접 코드를 작성하지 않습니다"라는 강한 제약. ACP 모드의 에이전트는 오케스트레이터로만 동작한다.

## 모드 비교표

| 특성 | Clarify | Code | Cowork | ACP |
|------|---------|------|--------|-----|
| 파일 읽기 | O | O | O | O |
| 파일 쓰기 | X | O | O | X (위임) |
| 셸 실행 | X | O | O | X (위임) |
| 계획 수립 | X | X | O (plan.md) | O (task 분해) |
| 서브에이전트 | X | X | X | O |
| 주 용도 | 분석/질문 | 구현 | 자율 실행 | 대규모 작업 |

## 공통 규칙: 크로스 플랫폼

```python
def _make_common_rules() -> str:
    if config.IS_WIN:
        shell_hint = "**셸**: PowerShell (Windows)..."
    elif config.PLATFORM == "Darwin":
        shell_hint = "**셸**: zsh (macOS)..."
    else:
        shell_hint = "**셸**: bash (Linux)..."

    return f"""
## 공통 규칙
- **언어**: 한국어로 소통, 코드·파일명·기술 용어는 영어
- **경로**: 항상 절대경로 사용
- {shell_hint}
- **도구 자동 실행**: read_file, ls, glob, grep, web_search, memory_read는 승인 없이 즉시 실행
- **HITL 필요**: write_file, edit_file, execute는 사용자 승인 필요
"""
```

OS를 감지해서 셸 명령어 가이드를 자동으로 조정한다. Windows 사용자에게는 PowerShell 명령어를, macOS에서는 zsh 관용구를 안내한다.

## 프롬프트 엔지니어링 교훈

1. **행동 제한이 행동 지침보다 효과적**: "X를 하세요"보다 "X를 하지 마세요"가 더 잘 지켜진다.
2. **구체적 형식 지정**: plan.md의 마크다운 형식을 명시해서 에이전트가 일관된 구조를 유지한다.
3. **"반드시 먼저"**: 선행 조건을 강조해서 에이전트가 맥락 없이 행동하는 것을 방지한다.
4. **환경 정보 주입**: OS, 셸 종류를 프롬프트에 포함해서 플랫폼별 올바른 명령어를 생성한다.

## 자주 묻는 질문

### 모드를 중간에 바꿀 수 있나?

UI에서 모드 스위치를 누르면 다음 메시지부터 새 모드가 적용된다. 진행 중인 스트림에는 영향이 없다.

### 커스텀 모드를 추가할 수 있나?

`prompts.py`의 `_MODE_PROMPTS` 딕셔너리에 새 모드를 추가하면 된다. 프론트엔드 `ModeSwitch` 컴포넌트에도 버튼을 추가해야 한다.

### SOUL.md가 비어있으면?

기본 페르소나가 `main.py`의 `_init_default_soul()`에서 생성된다: "열정적이고 체계적인 시니어 엔지니어처럼 행동합니다."

---

## 시리즈 목차

1. [DeepCoWork: AI 에이전트 데스크톱 앱을 만들었다](/posts/deepcowork-01-introduction)
2. [Tauri 2 + Python 사이드카](/posts/deepcowork-02-tauri-sidecar)
3. [DeepAgents SDK 핵심 해부](/posts/deepcowork-03-deep-agents-sdk)
4. **[이번 글]** 모드별 시스템 프롬프트 설계
5. [SSE 스트리밍 파이프라인](/posts/deepcowork-05-sse-streaming)
6. [HITL 승인 플로우](/posts/deepcowork-06-hitl-approval)
7. [멀티에이전트 ACP 모드](/posts/deepcowork-07-acp-multi-agent)
8. [에이전트 메모리 4계층](/posts/deepcowork-08-agent-memory)
9. [스킬 시스템](/posts/deepcowork-09-skills-system)
10. [LLM 프로바이더 통합](/posts/deepcowork-10-llm-providers)
11. [보안 체크리스트](/posts/deepcowork-11-security)
12. [GitHub Actions 크로스 플랫폼 빌드](/posts/deepcowork-12-ci-cd)
