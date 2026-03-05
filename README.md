# baem1n.github.io

개인 개발 블로그 (Astro + GitHub Pages).

## 로컬 실행

```bash
npm install
npm run dev
```

## 빌드

```bash
npm run build
npm run preview
```

## GitHub Pages 배포

이 저장소는 `.github/workflows/deploy.yml`로 Pages에 자동 배포됩니다.

1. GitHub 저장소 `Settings > Pages`에서 **Source = GitHub Actions** 선택
2. `Settings > Environments/Variables`에 아래 변수 등록
   - `PUBLIC_GA_MEASUREMENT_ID` (예: `G-XXXXXXXXXX`)
   - `PUBLIC_GOOGLE_SITE_VERIFICATION` (선택)
3. `master` 브랜치에 push하면 자동 배포

## SEO / 색인

- `@astrojs/sitemap` 사용 (자동 sitemap 생성)
- `public/robots.txt` 제공
- 기본 JSON-LD(WebSite/WebPage/BlogPosting) 삽입
- RSS 제공: `/rss.xml`
- LLM 안내 파일: `/llms.txt`
