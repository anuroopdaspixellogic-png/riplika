/**
 * Sliding-window limiter. One instance per policy; keys are usually IPs or
 * client keys.
 */
export function createRateLimiter({ windowMs, max }) {
  const hits = new Map()

  const timer = setInterval(() => {
    const cutoff = Date.now() - windowMs
    for (const [key, times] of hits) {
      const fresh = times.filter((time) => time > cutoff)
      if (fresh.length === 0) hits.delete(key)
      else hits.set(key, fresh)
    }
  }, Math.min(Math.max(windowMs, 10_000), 60_000))
  timer.unref?.()

  return {
    take(key) {
      const now = Date.now()
      const cutoff = now - windowMs
      const times = (hits.get(key) ?? []).filter((time) => time > cutoff)
      if (times.length >= max) {
        hits.set(key, times)
        return false
      }
      times.push(now)
      hits.set(key, times)
      return true
    },
    reset(key) {
      hits.delete(key)
    },
    stop() {
      clearInterval(timer)
    },
  }
}
