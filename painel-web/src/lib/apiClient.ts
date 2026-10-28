import axios from 'axios'
import { env } from '@/lib/env'

// Mesmo cliente do app: base fixa do env + Bearer token, devolve direto o corpo (data).
export async function baseUrl(): Promise<string> {
  return env.apiBaseUrl
}

const instance = axios.create({
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
})

instance.interceptors.request.use((config) => {
  config.baseURL = env.apiBaseUrl
  if (env.apiToken) config.headers.Authorization = `Bearer ${env.apiToken}`
  return config
})

instance.interceptors.response.use((r) => r.data, (e) => Promise.reject(e))

type Cfg = { timeout?: number }
export const http = {
  get: <T>(url: string) => instance.get(url) as unknown as Promise<T>,
  post: <T>(url: string, body?: unknown, cfg?: Cfg) => instance.post(url, body, cfg) as unknown as Promise<T>,
  put: <T>(url: string, body?: unknown) => instance.put(url, body) as unknown as Promise<T>,
  del: <T>(url: string) => instance.delete(url) as unknown as Promise<T>,
}

/** Mensagem legível de um erro do axios (detail do FastAPI, senão a mensagem). */
export function erroMsg(e: unknown): string {
  const r = (e as { response?: { data?: { detail?: unknown }; status?: number } })?.response
  const det = r?.data?.detail
  if (typeof det === 'string') return det
  if (r?.status) return `erro ${r.status}`
  return (e as Error)?.message || 'erro desconhecido'
}
