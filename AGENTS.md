# AGENTS.md

## 빌드/실행
- install: `npm i`
- dev: `npm run dev`
- build: `npm run build`

## 스택
- React + TypeScript + Vite, react-router-dom
- 디자인 시스템 토큰: `src/styles/tokens.css` (스포티파이 · 네온 그린)

## 코드 규칙
- 함수형 컴포넌트만 사용, `any` 사용 금지
- 컴포넌트는 작게, 단일 책임으로 분리
- 새 코드에는 핵심 주석만, 불필요한 주석 지양

## 작업 규칙
- 변경은 작은 단위로, 단계별 검수 후 다음 단계 진행
- 백엔드·API·배포가 필요한 기능은 진행 전 합의
- 외부 키/시크릿은 `.env`로 분리 (커밋 금지)
