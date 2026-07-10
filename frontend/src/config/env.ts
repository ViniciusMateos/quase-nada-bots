import Constants from 'expo-constants';

const extra = (Constants.expoConfig?.extra ?? {}) as { apiBaseUrl?: string; appVariant?: string };

// URL de produção (fixa) — o app já abre conectado, sem precisar configurar nada.
const URL_PADRAO = 'https://quasenadaserver1.duckdns.org/bots';

export const env = {
  apiBaseUrl: extra.apiBaseUrl || process.env.EXPO_PUBLIC_API_URL || URL_PADRAO,
  // token embutido via env do build (fica no .env.local / EAS, nunca no repo).
  apiToken: process.env.EXPO_PUBLIC_API_TOKEN || '',
  appVariant: extra.appVariant ?? 'preview',
};
