---
author: baem1n
pubDatetime: 2026-04-04T01:00:00.000Z
title: "DeepCoWork #2: Tauri 2 + Python 사이드카 — 데스크톱 AI 앱의 뼈대"
description: "Tauri 2가 Python FastAPI 서버를 sidecar로 실행하고, 헬스체크, graceful shutdown, PyInstaller 번들링까지 처리하는 구조를 구현하며 배운 것."
tags:
  - tauri
  - python
  - desktop-app
  - rust
  - ai-agent
aiAssisted: true
---

> **TL;DR**: Tauri 2가 PyInstaller로 번들된 Python 서버를 sidecar로 실행해 사용자는 Python 설치 없이 바로 쓸 수 있다.

## Table of contents

## 왜 Tauri + Python인가

AI 에이전트 앱은 두 가지 런타임이 필요하다:

| 역할 | 최적 언어 | 이유 |
|------|----------|------|
| **데스크톱 UI** | Rust (Tauri) / JS | 네이티브 윈도우, 작은 바이너리 |
| **에이전트 로직** | Python | LangChain, DeepAgents SDK, AI 에코시스템 |

Electron은 Chromium을 통째로 번들해서 150MB+지만, [Tauri](https://v2.tauri.app/)는 OS 웹뷰를 재사용해서 10MB 수준이다. Rust로 Python 프로세스를 관리하면 안정적이고 메모리도 적다. [Tauri sidecar 문서](https://v2.tauri.app/develop/sidecar/)에 외부 바이너리를 앱에 포함하는 방법이 상세히 나와 있다.

## 프로세스 구조

```
[사용자가 앱 실행]
     │
     ▼
  Tauri (Rust)
     │
     ├── 1. 사용 가능한 포트 탐색 (8008~8108)
     ├── 2. Python 서버 spawn (포트 전달)
     ├── 3. /health 폴링 (최대 30초)
     ├── 4. server_ready 이벤트 → 프론트엔드
     └── 5. 주기적 헬스체크 (10초마다)
            │
            ▼ (크래시 감지 시)
       agent_crashed 이벤트 → UI 에러 표시
```

## 핵심 코드: spawn_python

개발 모드와 배포 모드에서 Python 실행 방식이 다르다:

```rust
fn spawn_python(app: &tauri::AppHandle, port: u16) -> Result<CommandChild, String> {
    // 개발: uv run python main.py
    #[cfg(debug_assertions)]
    {
        let agent_dir = /* 프로젝트 루트에서 agent/ 경로 계산 */;
        let (_, child) = app.shell()
            .command("uv")
            .args(["run", "python", "main.py"])
            .env("PORT", port.to_string())
            .current_dir(&agent_dir)
            .spawn()
            .map_err(|e| format!("uv run 실패: {e}"))?;
        Ok(child)
    }

    // 배포: PyInstaller 바이너리를 사이드카로 실행
    #[cfg(not(debug_assertions))]
    {
        let (_, child) = app.shell()
            .sidecar("agent-server")  // binaries/agent-server-{target}
            .map_err(|e| format!("사이드카 없음: {e}"))?
            .args(["--port", &port.to_string()])
            .spawn()
            .map_err(|e| format!("사이드카 실행 실패: {e}"))?;
        Ok(child)
    }
}
```

`#[cfg(debug_assertions)]`로 컴파일 타임에 분기:
- **개발**: `uv run python main.py` — 핫 리로드, 소스 직접 실행
- **배포**: `sidecar("agent-server")` — PyInstaller 바이너리, Python 설치 불필요

## 포트 탐색

8008번이 이미 사용 중이면 다음 포트를 시도한다:

```rust
fn find_available_port(preferred: u16) -> u16 {
    for port in preferred..preferred + 100 {
        if std::net::TcpListener::bind(format!("127.0.0.1:{}", port)).is_ok() {
            return port;
        }
    }
    preferred
}
```

최대 100개 포트를 탐색하고, 찾은 포트를 Python에 `PORT` 환경변수 또는 `--port` 인자로 전달한다.

## 헬스체크

서버가 준비될 때까지 폴링한다:

```rust
async fn wait_for_health(port: u16, max_retries: u32) -> Result<(), String> {
    let client = reqwest::Client::new();
    let url = format!("http://127.0.0.1:{}/health", port);
    for i in 0..max_retries {
        if let Ok(res) = client.get(&url).send().await {
            if res.status().is_success() {
                return Ok(());
            }
        }
        tokio::time::sleep(Duration::from_millis(500)).await;
    }
    Err("서버 응답 없음".into())
}
```

준비 완료 시 `server_ready` 이벤트를 프론트엔드로 emit:

```rust
let _ = handle.emit("server_ready", port);
```

프론트엔드는 이 이벤트를 받아 API base URL의 포트를 설정하고 UI를 활성화한다.

## 크래시 감지

서버 준비 후 10초마다 헬스체크를 계속한다:

```rust
loop {
    tokio::time::sleep(Duration::from_secs(10)).await;
    match client.get(&url).timeout(Duration::from_secs(5)).send().await {
        Ok(res) if res.status().is_success() => {} // 정상
        _ => {
            let _ = handle.emit("agent_crashed", "에이전트 서버가 응답하지 않습니다");
            break;
        }
    }
}
```

Python이 크래시하면 프론트엔드에 에러 메시지가 표시된다.

## Graceful Shutdown

앱 종료 시 Python 프로세스를 안전하게 정리한다:

```rust
.run(move |_app_handle, event| {
    if let tauri::RunEvent::ExitRequested { .. } = event {
        if let Some(child) = child_arc.lock().unwrap().take() {
            let pid = child.pid();
            // 1. SIGTERM 전송 (graceful)
            #[cfg(unix)]
            {
                let _ = Command::new("kill").args(["-15", &pid.to_string()]).output();
                std::thread::sleep(Duration::from_millis(2000));
            }
            // 2. SIGKILL (강제)
            let _ = child.kill();
        }
    }
});
```

SIGTERM으로 FastAPI의 lifespan shutdown을 트리거하고 (DB 연결 정리, 큐 비우기), 2초 후 SIGKILL로 확실히 종료한다.

## PyInstaller 번들링

배포 시 Python 전체를 단일 바이너리로 만든다:

```python
# agent/bundle.py
cmd = [
    sys.executable, "-m", "PyInstaller",
    "--onefile",
    "--name", f"agent-server-{target_triple}",
    "--collect-submodules", "deepagents",
    "--collect-submodules", "langgraph",
    "--collect-submodules", "langchain_core",
    "main.py",
]
```

[PyInstaller](https://pyinstaller.org/en/stable/) `--onefile` 모드는 모든 의존성을 단일 실행 파일로 패킹한다. 결과물을 `app/src-tauri/binaries/`에 복사하면 Tauri가 앱 번들에 포함한다:

```json
// tauri.conf.json
{
  "bundle": {
    "externalBin": ["binaries/agent-server"]
  }
}
```

Tauri는 `agent-server-{target-triple}` 파일을 자동으로 현재 플랫폼에 맞는 것만 선택한다.

## CI에서의 빌드 흐름

```
GitHub Actions (각 OS 러너)
  │
  ├── 1. pip install -e . + pyinstaller
  ├── 2. python bundle.py → binaries/agent-server-{target}
  ├── 3. npm ci
  └── 4. tauri build → .dmg / .msi / .deb (sidecar 포함)
```

## 실측 데이터

| 항목 | macOS (arm64) | Linux (x64) | Windows (x64) |
|------|--------------|-------------|---------------|
| PyInstaller 바이너리 크기 | ~95MB | ~88MB | ~102MB |
| 콜드 스타트 (sidecar → /health 응답) | ~3.8초 | ~4.5초 | ~5.2초 |
| 핫 리로드 재시작 (dev 모드) | ~1.2초 | ~1.5초 | ~1.8초 |
| 유휴 메모리 (Python 프로세스) | ~135MB | ~120MB | ~145MB |
| 헬스체크 폴링 평균 횟수 | 7회 (3.5초) | 9회 (4.5초) | 10회 (5.0초) |

## 자주 묻는 질문

### PyInstaller 바이너리 크기는?

DeepAgents + LangChain + FastAPI 포함 약 80-120MB. 큰 편이지만 Python 설치를 요구하지 않는 트레이드오프로 충분히 가치 있다.

### Windows에서도 SIGTERM이 동작하나?

Windows에는 SIGTERM이 없다. `child.kill()`이 `TerminateProcess()`를 호출해서 즉시 종료된다. FastAPI의 lifespan shutdown이 실행되지 않을 수 있지만, SQLite WAL 모드가 데이터 무결성을 보장한다.

### 포트 충돌이 나면?

100개 포트를 순차 탐색하므로 사실상 충돌이 없다. 만약 모두 사용 중이면 기본 포트(8008)로 시도하고, Python 서버 시작 시 에러가 발생한다.

---

## 시리즈 목차

1. [DeepCoWork: AI 에이전트 데스크톱 앱을 만들었다](/posts/deepcowork-01-introduction)
2. **[이번 글]** Tauri 2 + Python 사이드카
3. [DeepAgents SDK 핵심 해부](/posts/deepcowork-03-deep-agents-sdk)
4. [모드별 시스템 프롬프트 설계](/posts/deepcowork-04-system-prompts)
5. [SSE 스트리밍 파이프라인](/posts/deepcowork-05-sse-streaming)
6. [HITL 승인 플로우](/posts/deepcowork-06-hitl-approval)
7. [멀티에이전트 ACP 모드](/posts/deepcowork-07-acp-multi-agent)
8. [에이전트 메모리 4계층](/posts/deepcowork-08-agent-memory)
9. [스킬 시스템](/posts/deepcowork-09-skills-system)
10. [LLM 프로바이더 통합](/posts/deepcowork-10-llm-providers)
11. [보안 체크리스트](/posts/deepcowork-11-security)
12. [GitHub Actions 크로스 플랫폼 빌드](/posts/deepcowork-12-ci-cd)
