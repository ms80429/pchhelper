import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// base './' = 상대 경로 → GitHub Pages 하위 경로(/pchhelper/)에서도 동작
export default defineConfig({ plugins: [react()], base: './' });
