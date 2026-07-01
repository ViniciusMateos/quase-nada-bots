import Constants from 'expo-constants';

const extra = (Constants.expoConfig?.extra ?? {}) as { apiBaseUrl?: string; appVariant?: string };

export const env = {
  // URL padrão vinda do build (app.config.js lê o EXPO_PUBLIC_API_URL do eas.json e
  // joga em `extra`). Pode ser sobrescrita em Configurações dentro do app.
  apiBaseUrl: extra.apiBaseUrl ?? '',
  appVariant: extra.appVariant ?? 'preview',
};
