import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages(레거시, 그대로 유지 중)는 https://<user>.github.io/CastleBreaker/ 처럼
// 서브패스로 서빙되지만, Cloudflare Pages 는 자기 도메인 루트에서 서빙된다.
// 두 배포가 같은 코드베이스를 쓰면서 서로의 빌드를 깨지 않도록 base 를 분기한다:
//   일반 빌드(GH Actions 가 실행)        → /CastleBreaker/
//   DEPLOY_TARGET=cfpages 로 빌드할 때  → /
// 로컬 dev 서버는 항상 '/' 를 쓴다.
export default defineConfig(({ command }) => ({
  base: command === 'build' && process.env.DEPLOY_TARGET !== 'cfpages' ? '/CastleBreaker/' : '/',
  plugins: [react()],
  server: { port: 5180, strictPort: false },
}));
