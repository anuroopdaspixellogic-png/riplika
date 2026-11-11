import { useEffect, useState } from 'react'
import { Landing } from './components/Landing'
import { ChatRoom } from './components/ChatRoom'
import { apiUrl } from './lib/api'
import type { Profile, PublicStats } from './lib/types'

export default function App() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [stats, setStats] = useState<PublicStats | null>(null)
  const [callKey, setCallKey] = useState(0)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const response = await fetch(apiUrl('/api/stats'))
        if (!response.ok) return
        const data = (await response.json()) as PublicStats
        if (!cancelled) setStats(data)
      } catch {
        // The landing page still works without live counters.
      }
    }

    void load()
    const timer = window.setInterval(load, 10_000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [])

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
  }, [profile])

  function start(nextProfile: Profile) {
    setProfile(nextProfile)
    setCallKey((key) => key + 1)
  }

  function reconnect() {
    setCallKey((key) => key + 1)
  }

  if (profile) {
    return (
      <ChatRoom
        key={`call-${callKey}`}
        profile={profile}
        onExit={() => setProfile(null)}
        onReconnect={reconnect}
        onStats={setStats}
      />
    )
  }

  return <Landing stats={stats} onStart={start} />
}
