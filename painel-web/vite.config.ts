import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

// Painel web local do Quase Nada Bots (versão "profissional" do app, pra rodar no PC).
// Fala direto com o MESMO backend do app (server 2, CORS liberado) e lê a URL + o token do
// MESMO .env.local do app (frontend/.env.local, gitignored) — nada de segredo duplicado.
// Em produção é servido pelo painel-sessao (http://quase-nada-bots.localhost).
export default defineConfig({
  plugins: [react()],
  envDir: fileURLToPath(new URL('../frontend', import.meta.url)),
  envPrefix: ['VITE_', 'EXPO_PUBLIC_'],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: { port: 5179 },
  // /assets já é do app RN exportado (servido em /app) → o painel usa /painel-assets
  build: { assetsDir: 'painel-assets' },
})
