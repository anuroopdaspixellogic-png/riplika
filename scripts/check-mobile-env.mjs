const origin = (process.env.VITE_API_ORIGIN || '').trim()
const requireHttps = process.argv.includes('--release')

function fail(message) {
  console.error(`\nAndroid build configuration error:\n${message}\n`)
  process.exit(1)
}

if (!origin) {
  fail(
    'VITE_API_ORIGIN is required for Android builds.\n' +
      'Example: VITE_API_ORIGIN=https://chat.example.com npm run android:sync\n' +
      'The phone cannot reach your local Vite server, so the app needs a public backend.',
  )
}

let url
try {
  url = new URL(origin)
} catch {
  fail(`VITE_API_ORIGIN is not a valid URL: ${origin}`)
}

if (url.protocol !== 'https:' && url.protocol !== 'http:') {
  fail('VITE_API_ORIGIN must start with https:// (or http:// for local testing).')
}

const localHosts = new Set(['localhost', '127.0.0.1', '10.0.2.2'])
if (requireHttps && url.protocol !== 'https:') {
  fail('Release builds require HTTPS so WebRTC and camera access work on Android.')
}

if (url.protocol !== 'https:' && !localHosts.has(url.hostname)) {
  fail(
    `Use HTTPS for ${url.hostname}. Android blocks cleartext traffic and camera access outside a secure context.`,
  )
}

console.log(`Android backend: ${origin}`)
if (url.protocol === 'https:' && url.hostname.endsWith('trycloudflare.com')) {
  console.warn('Warning: trycloudflare.com is a temporary tunnel, not a permanent Play Store backend.')
}
