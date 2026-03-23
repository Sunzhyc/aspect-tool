import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  
  // 核心逻辑：如果是 Vercel 部署，就用根目录 '/'；否则用 GitHub 的仓库路径
  const base = process.env.VERCEL ? '/' : '/aspect-tool/';

  return {
    plugins: [react(), tailwindcss()],
    base: base, // <--- 自动切换路径
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});