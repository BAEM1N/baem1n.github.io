---
author: baem1n
pubDatetime: 2026-04-04T10:00:00.000Z
title: "DeepCoWork #11: 보안 체크리스트 -- 경로 탈출, 입력 검증, CSP, CORS"
description: "AI 에이전트 데스크톱 앱에서 구현한 보안 조치들을 체크리스트 형태로 정리합니다."
tags:
  - security
  - cors
  - path-traversal
  - input-validation
  - ai-safety
aiAssisted: true
---

> **TL;DR**: AI 에이전트가 파일 시스템에 직접 접근하는 데스크톱 앱은 보안이 핵심이다. DeepCoWork는 경로 탈출 방지, 스킬 이름 검증, CORS 화이트리스트, 파일 크기 제한, 워크스페이스 경계 검사, HITL 승인으로 다층 방어를 구현했다.

## Table of contents

## 위협 모델

AI 에이전트 앱의 주요 위협:

| 위협 | 벡터 | 영향 |
|------|------|------|
| 경로 탈출 | `../../etc/passwd` | 시스템 파일 읽기/쓰기 |
| 프롬프트 인젝션 | 악성 사용자 입력 | 에이전트가 의도하지 않은 명령 실행 |
| 무제한 셸 실행 | `rm -rf /` | 시스템 파괴 |
| API 키 유출 | 로그, 에러 메시지 | 비용 발생, 데이터 유출 |
| 대용량 파일 공격 | 10GB 파일 업로드 | 메모리/디스크 고갈 |

## 1. 경로 탈출 방지

`is_safe_path()` 함수가 모든 파일 접근에서 경로를 검증한다:

```python
def is_safe_path(base: Path, target: Path) -> bool:
    """Path escape prevention."""
    try:
        target.resolve().relative_to(base.resolve())
        return True
    except ValueError:
        return False
```

사용 위치:

```python
# 파일 읽기
target = (ws / file_path).resolve()
if not is_safe_path(ws, target):
    raise HTTPException(403, "접근 거부")

# 스킬 디렉토리
if not is_safe_path(config.WORKSPACE_ROOT / "skills", skill_dir.resolve()):
    raise HTTPException(403, "접근 거부")

# 워크스페이스 경로
if not is_safe_path(Path.home(), ws):
    raise HTTPException(403, "접근 거부")
```

`Path.resolve()`가 심볼릭 링크와 `..`을 풀어서 실제 경로로 변환한 후, `relative_to()`로 기준 디렉토리 내에 있는지 확인한다.

## 2. 워크스페이스 경계 검사

```python
def get_or_create(self, thread_id, mode, workspace_path):
    if workspace_path:
        ws = Path(workspace_path).resolve()
        try:
            ws.relative_to(Path.home())
        except ValueError:
            config.logger.warning("workspace_path가 홈 디렉토리 밖: %s", workspace_path)
            ws = config.WORKSPACE_ROOT / thread_id
```

사용자가 지정한 워크스페이스 경로가 홈 디렉토리(`~`) 밖이면 기본 경로로 대체한다. 루트 파일 시스템에 접근하는 것을 방지한다.

## 3. 스킬 이름 검증

```python
def _validate_skill_name(name: str) -> str:
    clean = name.strip()
    if not re.match(r'^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]?$', clean):
        raise HTTPException(400, "스킬 이름은 영문 소문자, 숫자, 하이픈만 허용 (1-64자)")
    if ".." in clean or "/" in clean or "\\" in clean:
        raise HTTPException(400, "잘못된 스킬 이름")
    return clean
```

스킬 이름으로 디렉토리가 생성되므로, 경로 구분자가 포함되면 거부한다.

## 4. CORS 화이트리스트

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1",
        "http://localhost",
        "tauri://localhost",
        "https://tauri.localhost",
    ],
    allow_origin_regex=r"http://(127\.0\.0\.1|localhost):\d+",
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Content-Type", "Accept"],
)
```

로컬호스트와 Tauri 전용 오리진만 허용한다. 외부 웹사이트에서 API를 호출할 수 없다.

## 5. 파일 크기 제한

```python
_MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB

# 파일 읽기
if target.stat().st_size > _MAX_FILE_SIZE:
    raise HTTPException(413, f"파일이 너무 큽니다 ({size}MB > 10MB)")

# 파일 쓰기
if len(content_bytes) > _MAX_FILE_SIZE:
    raise HTTPException(413, f"파일 크기는 10MB를 초과할 수 없습니다")

# 메모리 파일
if len(encoded) > config.MAX_MEMORY_BYTES:  # 50KB
    raise HTTPException(413, "메모리 파일 크기는 50KB를 초과할 수 없습니다")
```

| 리소스 | 제한 |
|--------|------|
| 일반 파일 | 10MB |
| 메모리 파일 (SOUL/USER/AGENTS.md) | 50KB |
| 셸 명령 출력 | 50KB (`max_output_bytes`) |
| 도구 결과 SSE 전송 | 2KB (truncated) |

## 6. HITL: 인간 승인 게이트

위험한 도구 호출은 사용자 승인 없이 실행되지 않는다:

```python
interrupt_on = {"write_file": True, "edit_file": True, "execute": True}
```

- 읽기 전용 도구는 자동 승인
- 300초 타임아웃 후 자동 거부
- 서브에이전트는 메인 에이전트의 승인으로 대체

## 7. 셸 명령 제한

`LocalShellBackend` 설정:

```python
backend = LocalShellBackend(
    root_dir=str(workspace_dir),  # 작업 디렉토리 제한
    timeout=60,                    # 60초 타임아웃
    max_output_bytes=50_000,       # 출력 크기 제한
)
```

`root_dir` 밖의 파일에 대한 셸 명령도 제한되고, 60초 이상 실행되는 명령은 자동 종료된다.

## 8. API 키 보호

```python
# 설정 조회 시 키 값 대신 존재 여부만 반환
@router.get("/settings")
async def get_settings():
    return {
        "api_key_set": bool(_active_key()),  # 키 자체는 미노출
        # ...
    }
```

API 키는 설정 API에서 마스킹되고, 환경 변수에만 저장된다. `~/.cowork.env` 파일은 사용자 홈 디렉토리에 있어 다른 사용자가 접근할 수 없다.

## 보안 체크리스트 요약

- [x] 경로 탈출 방지 (`is_safe_path` + `Path.resolve`)
- [x] 워크스페이스 경계 검사 (홈 디렉토리 기준)
- [x] 입력 검증 (스킬 이름, 파일 경로)
- [x] CORS 화이트리스트 (로컬호스트 + Tauri)
- [x] 파일 크기 제한 (10MB/50KB)
- [x] HITL 승인 (쓰기/실행 도구)
- [x] 셸 명령 타임아웃 (60초)
- [x] API 키 마스킹
- [x] SQLite WAL 모드 (데이터 무결성)
- [ ] CSP 헤더 (Tauri 기본 정책 사용)
- [ ] 감사 로깅 (향후 추가 예정)

## 자주 묻는 질문

### 에이전트가 sudo 명령을 실행할 수 있나?

기술적으로 가능하지만, HITL이 사용자에게 `$ sudo ...` 명령을 보여주므로 거부할 수 있다. `execute` 도구의 모든 셸 명령은 승인이 필요하다.

### 프롬프트 인젝션을 방지하나?

시스템 프롬프트 레벨에서 직접적인 방어는 없다. HITL이 실질적인 방어선이다. 에이전트가 악의적인 명령을 생성해도 사용자가 승인하지 않으면 실행되지 않는다.

---

## 시리즈 목차

1. [DeepCoWork: AI 에이전트 데스크톱 앱을 만들었다](/posts/deepcowork-01-introduction)
2. [Tauri 2 + Python 사이드카](/posts/deepcowork-02-tauri-sidecar)
3. [DeepAgents SDK 핵심 해부](/posts/deepcowork-03-deep-agents-sdk)
4. [모드별 시스템 프롬프트 설계](/posts/deepcowork-04-system-prompts)
5. [SSE 스트리밍 파이프라인](/posts/deepcowork-05-sse-streaming)
6. [HITL 승인 플로우](/posts/deepcowork-06-hitl-approval)
7. [멀티에이전트 ACP 모드](/posts/deepcowork-07-acp-multi-agent)
8. [에이전트 메모리 4계층](/posts/deepcowork-08-agent-memory)
9. [스킬 시스템](/posts/deepcowork-09-skills-system)
10. [LLM 프로바이더 통합](/posts/deepcowork-10-llm-providers)
11. **[이번 글]** 보안 체크리스트
12. [GitHub Actions 크로스 플랫폼 빌드](/posts/deepcowork-12-ci-cd)
