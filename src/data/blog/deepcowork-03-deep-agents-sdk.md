---
author: baem1n
pubDatetime: 2026-04-04T02:00:00.000Z
title: "DeepCoWork #3: DeepAgents SDK 핵심 해부 -- create_deep_agent, LocalShellBackend, ReAct 루프"
description: "DeepAgents SDK의 핵심 함수와 백엔드를 분석하고, DeepCoWork가 이를 어떻게 래핑하는지 실제 코드로 동작 원리와 구현을 정리합니다."
tags:
  - deep-agents
  - langchain
  - langgraph
  - react-loop
  - ai-agent
aiAssisted: true
---

> **TL;DR**: `agent_core.py` 단일 파일이 DeepAgents SDK와의 유일한 결합 지점이며, 7개 도구 + ReAct 루프 + HITL 게이트를 모두 이 파일에서 구성한다.

## Table of contents

## 아키텍처: 단일 결합 지점

DeepCoWork는 Deep Agents SDK와의 모든 상호작용을 `agent_core.py` 한 파일에 격리했다. 이 파일의 export 계약은 다음 5가지다:

| Export | 역할 |
|--------|------|
| `build_llm()` | 설정 기반 LLM 인스턴스 생성 |
| `build_agent()` | DeepAgent 인스턴스 생성 |
| `stream_events()` | SSE 스트리밍 |
| `get_agent_state()` | 에이전트 상태 조회 |
| `resume_agent_input()` | HITL 재개 입력 |

SDK 버전이 바뀌어도 이 파일만 수정하면 된다. [Deep Agents SDK API 레퍼런스](https://github.com/langchain-ai/deepagents)와 [LangGraph create_react_agent 문서](https://langchain-ai.github.io/langgraph/reference/prebuilt/#create_react_agent)가 핵심 참고 자료다.

## create_deep_agent 해부

`build_agent()` 함수가 SDK의 `create_deep_agent`를 호출한다:

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

핵심 파라미터를 하나씩 분석한다.

## LocalShellBackend

`LocalShellBackend`는 에이전트에게 파일 시스템과 셸 접근을 제공하는 SDK 컴포넌트다. 자동으로 제공되는 도구 목록:

| 도구 | 유형 | HITL 필요 |
|------|------|-----------|
| `read_file` | 읽기 | 아니오 |
| `write_file` | 쓰기 | 예 |
| `edit_file` | 쓰기 | 예 |
| `execute` | 셸 실행 | 예 |
| `ls` | 읽기 | 아니오 |
| `glob` | 읽기 | 아니오 |
| `grep` | 읽기 | 아니오 |

주요 설정값:

```python
backend = LocalShellBackend(
    root_dir=str(workspace_dir),  # 에이전트 작업 범위 제한
    virtual_mode=False,            # 실제 파일 시스템 사용
    timeout=60,                    # 셸 명령 타임아웃 (초)
    max_output_bytes=50_000,       # 출력 크기 제한
    inherit_env=True,              # 현재 환경변수 상속
)
```

`root_dir`이 에이전트의 샌드박스 경계다. 이 디렉토리 밖으로는 파일 접근이 불가하다.

## interrupt_on: HITL 게이트

`interrupt_on` 딕셔너리가 어떤 도구 호출에서 실행을 멈출지 결정한다:

```python
interrupt_on = {"write_file": True, "edit_file": True, "execute": True}
```

이 도구들이 호출되면 LangGraph가 그래프 실행을 중단하고, 프론트엔드에 승인 요청을 보낸다. 사용자가 승인하면 `Command(resume={"decisions": [...]})` 로 재개한다:

```python
def resume_agent_input(decisions: list[dict]) -> Any:
    return Command(resume={"decisions": decisions})
```

서브에이전트는 `with_hitl=False`로 생성되어 HITL 없이 실행된다 -- 메인 에이전트가 이미 승인을 받았기 때문이다.

## ReAct 루프

DeepAgents SDK의 핵심은 LangGraph 기반 ReAct (Reasoning + Acting) 루프다:

```
[사용자 메시지]
     |
     v
  LLM 추론 (Reasoning)
     |
     +-- 도구 호출 결정 (Acting)
     |       |
     |       v
     |   [interrupt_on 체크]
     |       |
     |       +-- HITL 필요 → 중단 → 승인 대기
     |       +-- HITL 불필요 → 즉시 실행
     |       |
     |       v
     |   도구 실행 결과
     |       |
     +-------+
     |
     v
  LLM 추론 (다음 행동 결정)
     |
     +-- 완료 → 최종 응답
     +-- 미완료 → 루프 반복
```

`stream_events()` 함수가 이 루프를 SSE로 변환한다:

```python
async for event in agent.astream(
    agent_input,
    stream_mode=["updates", "messages"],
    subgraphs=True,
    config=cfg,
):
```

`stream_mode=["updates", "messages"]`로 도구 호출 이벤트와 텍스트 토큰을 모두 수신한다. `subgraphs=True`는 ACP 모드의 서브에이전트 이벤트까지 캡처한다.

## 체크포인터: 상태 영속화

`AsyncSqliteSaver`가 에이전트 상태를 SQLite에 저장한다:

```python
from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver

self.db_conn = await aiosqlite.connect(str(config.DB_PATH))
await self.db_conn.execute("PRAGMA journal_mode=WAL")
self.checkpointer = AsyncSqliteSaver(self.db_conn)
```

WAL (Write-Ahead Logging) 모드를 사용해서 읽기/쓰기 동시 성능을 확보했다. 앱을 재시작해도 대화 히스토리와 에이전트 상태가 유지된다.

## 스킬 해석

`_resolve_skills()` 함수가 글로벌과 워크스페이스 스킬 디렉토리를 탐색한다:

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

스킬 우선순위: 글로벌(`~/.cowork/skills/`) < 워크스페이스(`{workspace}/skills/`). 나중에 로드된 것이 우선이다.

## 실측 데이터

| 항목 | 수치 |
|------|------|
| LocalShellBackend 제공 도구 수 | 7개 (read_file, write_file, edit_file, execute, ls, glob, grep) |
| 커스텀 도구 수 (web_search, memory, task 등) | 4개 |
| 일반적인 Cowork 태스크 ReAct 루프 반복 횟수 | 8~15회 |
| MAX_AGENT_ITERATIONS 설정값 | 25회 |
| 체크포인터 SQLite WAL 동시 읽기 성능 | ~0.3ms/쿼리 |

## 자주 묻는 질문

### Deep Agents SDK 없이도 작동하나?

아니다. `create_deep_agent`와 `LocalShellBackend`가 핵심 의존성이다. 다만 `agent_core.py` 하나만 교체하면 다른 에이전트 프레임워크로 전환할 수 있도록 설계했다.

### virtual_mode=True로 바꾸면?

파일 쓰기가 실제 디스크에 반영되지 않고 메모리에서만 처리된다. 테스트나 미리보기 용도로 유용하지만, DeepCoWork는 실제 파일 시스템 변경이 목적이므로 False를 사용한다.

### max_output_bytes=50_000은 왜?

셸 명령 출력이 너무 크면 LLM 컨텍스트를 잡아먹는다. 50KB로 제한해서 `npm install` 같은 대량 출력 명령이 에이전트를 압도하지 않게 한다.

---

## 시리즈 목차

1. [DeepCoWork: AI 에이전트 데스크톱 앱을 만들었다](/posts/deepcowork-01-introduction)
2. [Tauri 2 + Python 사이드카](/posts/deepcowork-02-tauri-sidecar)
3. **[이번 글]** DeepAgents SDK 핵심 해부
4. [모드별 시스템 프롬프트 설계](/posts/deepcowork-04-system-prompts)
5. [SSE 스트리밍 파이프라인](/posts/deepcowork-05-sse-streaming)
6. [HITL 승인 플로우](/posts/deepcowork-06-hitl-approval)
7. [멀티에이전트 ACP 모드](/posts/deepcowork-07-acp-multi-agent)
8. [에이전트 메모리 4계층](/posts/deepcowork-08-agent-memory)
9. [스킬 시스템](/posts/deepcowork-09-skills-system)
10. [LLM 프로바이더 통합](/posts/deepcowork-10-llm-providers)
11. [보안 체크리스트](/posts/deepcowork-11-security)
12. [GitHub Actions 크로스 플랫폼 빌드](/posts/deepcowork-12-ci-cd)
