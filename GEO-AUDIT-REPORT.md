# GEO/SEO 감사 보고서 — baem1n.dev

> 감사일: 2026-04-08

## 종합 점수

| 영역 | 점수 | 등급 |
|------|:----:|:----:|
| **Technical SEO** | 72/100 | Good |
| **Content Quality (E-E-A-T)** | 74/100 | Good |
| **Schema & Structured Data** | 52/100 | Fair |
| **AI Visibility** | 52/100 | Fair |
| **Platform Readiness** | 52/100 | Fair |
| **종합** | **60/100** | **Fair** |

---

## CRITICAL 이슈 (즉시 수정)

### 1. Canonical URL 도메인 불일치

`src/config.ts`의 `SITE.website`가 `https://baem1n.github.io/`로 설정되어 있어 모든 canonical, OG URL, sitemap, Schema.org URL이 리다이렉트 원본 도메인을 가리킴.

**영향**: 모든 AI 크롤러와 검색엔진에서 엔티티 분산
**수정**: `src/config.ts` → `https://baem1n.dev/`

### 2. HTTP → HTTPS 미강제

`http://baem1n.dev/`가 200 OK로 콘텐츠 제공 (HTTPS 리다이렉트 없음). GitHub Pages 301도 `http://baem1n.dev/`로 연결.

**수정**: GitHub Settings > Pages > "Enforce HTTPS" 활성화

### 3. Organization 스키마 없음

홈페이지에 Organization JSON-LD 없음. 블로그 포스트의 publisher가 Person 타입.

**수정**: 홈페이지에 Organization 스키마 추가, BlogPosting publisher를 Organization으로 변경

---

## HIGH 이슈

### 4. 블로그 포스트 author 엔티티 빈약

포스트 페이지의 author = `{name, url}`만 존재. About 페이지의 풍부한 Person 스키마(jobTitle, sameAs, worksFor)가 포스트에 반영 안 됨.

### 5. sameAs 플랫폼 2개뿐 (GitHub, LinkedIn)

Wikipedia, YouTube, Twitter/X, Hugging Face 등 미연결 → AI 모델의 엔티티 그래프 구축 불가.

### 6. speakable 속성 없음

AI 어시스턴트가 읽어줄 콘텐츠 섹션 미지정. BlogPosting에 speakable CSS selector 추가 필요.

### 7. 홈페이지 title 너무 짧음

"BAEM1N.DEV" (10자) → 50-60자 예산 낭비. 키워드 없음.
**제안**: "BAEM1N.DEV — AI, RAG, LLMOps 개발 블로그"

### 8. 홈페이지 hreflang 없음

포스트 페이지에는 hreflang(ko/en/x-default) 있지만 홈페이지에 누락.

### 9. 외부 소스 인용 부재

벤치마크 포스트에 Qwen3.5 모델카드, llama.cpp 릴리즈, HW 스펙시트 등 외부 링크 없음 → 신뢰성 신호 약화.

### 10. 포스트 byline에 저자 자격증명 없음

TensorFlow Certificate, 빅데이터분석기사 등 자격이 About에만 있고 포스트 본문에 없음.

---

## MEDIUM 이슈

### 11. 시각화 0개

벤치마크 포스트가 100% 테이블. 차트/히트맵 없음 → 공유성, AI 인용성 저하.

### 12. FAQ 형식 헤딩 없음

선언적 라벨("하드웨어", "MoE 효율") 대신 질문형 헤딩("Qwen3.5는 어떤 HW에서 가장 빠른가?") + 40-60단어 답변 문단 → AIO 스니펫 추출 최적화.

### 13. IndexNow 미구현

Bing Copilot 즉시 인덱싱을 위한 IndexNow 프로토콜 없음.

### 14. 보안 헤더 전무

HSTS, CSP, X-Frame-Options 등 → GitHub Pages 제한. Cloudflare 프록시로 해결 가능.

### 15. dateModified 일관성

일부 포스트(01 methodology)에 dateModified 없음. pubDatetime fallback 필요.

### 16. Dataset 스키마 없음

5,100회 측정 벤치마크 데이터에 schema.org/Dataset 스키마 없음. GitHub CSV 연결 가능.

---

## 외부 활동 (브랜드 멘션 22/100 → 개선)

| 우선순위 | 액션 | 영향 플랫폼 | 난이도 |
|---------|------|-----------|--------|
| **1** | r/LocalLLaMA에 벤치마크 결과 포스트 | Perplexity, ChatGPT, Google AIO | 낮음 |
| **2** | Hacker News Show HN 제출 | Perplexity, Google AIO | 낮음 |
| **3** | HuggingFace Datasets에 CSV 업로드 | ChatGPT, Perplexity | 낮음 |
| **4** | YouTube 벤치마크 결과 워크스루 (3-5분) | Gemini, Google AIO | 중간 |
| **5** | LangChain-OpenTutorial README에 블로그 링크 | 전체 | 낮음 |
| **6** | Wikidata에 DDOK.AI 엔티티 생성 | ChatGPT, Gemini, Copilot | 중간 |
| **7** | Bing Webmaster Tools 인증 | Copilot | 낮음 |

---

## 강점 (이미 잘 되어 있는 것)

- **AI 크롤러 접근 100/100** — robots.txt에 12개 AI 크롤러 명시적 Allow (매우 드뭄)
- **llms.txt + llms-full.txt** — 선진적 AI 최적화 (85/100)
- **Astro SSG** — 100% 서버 렌더링, JS 의존성 제로 → AI 크롤러 완벽 접근
- **원본 데이터** — 5,100회 측정, 고유한 크로스 플랫폼 벤치마크 (인용성 72/100)
- **BlogPosting JSON-LD** — 날짜, 키워드, 이미지 포함
- **BreadcrumbList** — 올바른 구현
- **bilingual (ko/en)** — hreflang 포스트 레벨에서 올바른 구현
- **AI 콘텐츠 탐지 리스크 없음** — 100% 인간 작성 원본 데이터

---

## 구현 우선순위 (코드 변경)

### Phase 1: CRITICAL (30분)

```
1. src/config.ts → SITE.website = "https://baem1n.dev/"
2. GitHub Settings > Pages > Enforce HTTPS
3. 홈페이지 title 확장
```

### Phase 2: HIGH (1-2시간)

```
4. Layout.astro — Organization 스키마 추가
5. Layout.astro — publisher Person → Organization
6. Layout.astro — author 엔티티 enrichment (jobTitle, sameAs, worksFor)
7. Layout.astro — speakable 속성 추가
8. AboutLayout.astro — sameAs 확장
9. 홈페이지 hreflang 추가
```

### Phase 3: MEDIUM (2-3시간)

```
10. 벤치마크 포스트에 외부 소스 링크 추가
11. 질문형 헤딩 + 답변 문단 추가
12. Dataset 스키마 추가
13. dateModified fallback 로직
14. IndexNow 구현
```

### Phase 4: 외부 활동 (지속)

```
15. Reddit r/LocalLLaMA 포스트
16. HuggingFace Datasets 업로드
17. YouTube 워크스루 비디오
```

---

## 관련 소스 파일

| 파일 | 수정 내용 |
|------|----------|
| `src/config.ts` | SITE.website URL 수정 |
| `src/layouts/Layout.astro` | Organization, author, publisher, speakable |
| `src/layouts/AboutLayout.astro` | Person sameAs 확장 |
| `src/layouts/PostDetails.astro` | author byline 자격증명 |
| `src/components/Breadcrumb.astro` | 변경 불필요 |
| `src/utils/extractFaq.ts` | 변경 불필요 |
| `public/robots.txt` | 변경 불필요 (이미 완벽) |
| `public/llms.txt` | 영문 설명 추가 (선택) |
