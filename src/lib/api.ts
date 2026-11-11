/**
 * The web build normally talks to the same origin that served it. The Android
 * build is bundled inside the app, so it needs an absolute backend URL.
 *
 * Set VITE_API_ORIGIN at build time, for example:
 *   VITE_API_ORIGIN=https://chat.example.com npm run android:sync
 *
 * VITE_WS_URL is an optional override if the WebSocket lives somewhere else.
 */
const rawOrigin = (import.meta.env.VITE_API_ORIGIN as string | undefined)?.trim() ?? ''
const explicitWsUrl = (import.meta.env.VITE_WS_URL as string | undefined)?.trim() ?? ''

export const API_ORIGIN = rawOrigin.replace(/\/+$/, '')

export function apiUrl(path: string): string {
  return API_ORIGIN ? `${API_ORIGIN}${path}` : path
}

export function websocketUrl(): string {
  if (explicitWsUrl) return explicitWsUrl

  if (API_ORIGIN) {
    const url = new URL(API_ORIGIN)
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
    url.pathname = '/ws'
    url.search = ''
    url.hash = ''
    return url.toString()
  }

  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
  return `${protocol}://${window.location.host}/ws`
}
