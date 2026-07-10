import axios from 'axios';
import { env } from '@/config/env';

// URL do servidor: vem CRAVADA do build (env). Sem config manual dentro do app.
export async function baseUrl(): Promise<string> {
  return env.apiBaseUrl;
}

const instance = axios.create({
  timeout: 30000,
  // 'Bypass-Tunnel-Reminder' pula a página de aviso do localtunnel (ao testar via túnel)
  headers: { 'Content-Type': 'application/json', 'Bypass-Tunnel-Reminder': '1' },
});

instance.interceptors.request.use((config) => {
  config.baseURL = env.apiBaseUrl;
  if (env.apiToken) config.headers.Authorization = `Bearer ${env.apiToken}`;
  return config;
});

// devolve direto o corpo (data), igual ao padrão dos outros apps
instance.interceptors.response.use((r) => r.data, (e) => Promise.reject(e));

export const http = {
  get: <T>(url: string) => instance.get(url) as unknown as Promise<T>,
  post: <T>(url: string, body?: unknown) => instance.post(url, body) as unknown as Promise<T>,
  put: <T>(url: string, body?: unknown) => instance.put(url, body) as unknown as Promise<T>,
  del: <T>(url: string) => instance.delete(url) as unknown as Promise<T>,
};
