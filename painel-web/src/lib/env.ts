// URL do backend e token: vêm do MESMO .env.local do app (frontend/.env.local, gitignored),
// lido pelo Vite (envDir + envPrefix EXPO_PUBLIC_, ver vite.config.ts). Só roda local.
const URL_PADRAO = 'https://quasenadaserver2.duckdns.org/bots'

export const env = {
  apiBaseUrl: (import.meta.env.EXPO_PUBLIC_API_URL as string | undefined) || URL_PADRAO,
  apiToken: (import.meta.env.EXPO_PUBLIC_API_TOKEN as string | undefined) || '',
}
