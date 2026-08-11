import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages 는 https://<user>.github.io/CastleBreaker/ 서브패스로 서빙되므로
// 프로덕션 빌드에서만 base 를 저장소 이름과 맞춘다. 로컬 dev 서버는 그대로 '/' 를 쓴다.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/CastleBreaker/' : '/',
  plugins: [react()],
  server: { port: 5180, strictPort: false },
}));
