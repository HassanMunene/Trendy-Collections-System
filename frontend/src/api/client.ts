import axios, { AxiosError } from 'axios'

/**
 * One axios instance for the whole app. Laravel Sanctum uses a session cookie plus an
 * XSRF-TOKEN cookie; axios copies that cookie into the X-XSRF-TOKEN header for us.
 */
export const http = axios.create({
  baseURL: '/api',
  withCredentials: true,
  withXSRFToken: true,
  headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
  timeout: 20000,
})

let csrfReady: Promise<unknown> | null = null

/** Fetch the CSRF cookie once before the first request that changes data. */
export function ensureCsrf(force = false): Promise<unknown> {
  if (!csrfReady || force) {
    csrfReady = axios.get('/sanctum/csrf-cookie', { withCredentials: true }).catch((e) => {
      csrfReady = null
      throw e
    })
  }
  return csrfReady
}

http.interceptors.request.use(async (config) => {
  const method = (config.method ?? 'get').toLowerCase()
  if (!['get', 'head', 'options'].includes(method)) await ensureCsrf()
  return config
})

// A 419 means the CSRF token expired (e.g. phone left idle). Refresh it and retry once.
http.interceptors.response.use(undefined, async (error: AxiosError) => {
  const config = error.config as (typeof error.config & { _retried?: boolean }) | undefined
  if (error.response?.status === 419 && config && !config._retried) {
    config._retried = true
    await ensureCsrf(true)
    return http.request(config)
  }
  throw error
})

export type FieldErrors = Record<string, string>

export interface ApiProblem {
  status: number | null
  message: string
  fields: FieldErrors
  code?: string
}

/** Turn any request failure into something a screen can show. */
export function toProblem(error: unknown): ApiProblem {
  if (axios.isAxiosError(error)) {
    if (!error.response) {
      return {
        status: null,
        message: 'Cannot reach the shop system. Check the internet connection and try again.',
        fields: {},
      }
    }
    const { status, data } = error.response as { status: number; data: any }
    const fields: FieldErrors = {}
    if (data?.errors && typeof data.errors === 'object') {
      for (const [key, messages] of Object.entries(data.errors)) {
        fields[key] = Array.isArray(messages) ? String(messages[0]) : String(messages)
      }
    }
    const message =
      status === 403
        ? data?.message && data.message !== 'This action is unauthorized.'
          ? data.message
          : 'Your account is not allowed to do this.'
        : status === 429
          ? 'Too many attempts. Wait a minute and try again.'
          : status >= 500
            ? 'Something went wrong on the server. Please try again; if it keeps happening, tell the owner.'
            : (data?.message ?? 'The request failed.')
    return { status, message, fields, code: data?.code }
  }
  return { status: null, message: 'Unexpected error.', fields: {} }
}
