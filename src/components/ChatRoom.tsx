import { useEffect, useRef, useState, type FormEvent } from 'react'
import {
  AlertIcon,
  ChatIcon,
  CheckIcon,
  FlagIcon,
  GlobeIcon,
  Logo,
  MicIcon,
  MicOffIcon,
  PhoneDownIcon,
  RefreshIcon,
  SendIcon,
  ShieldIcon,
  SkipIcon,
  VideoIcon,
  VideoOffIcon,
  XIcon,
} from './Icons'
import { countryFlag, countryName } from '../lib/countries'
import type { ChatMessage, MediaState, Partner, Phase, Profile, PublicStats } from '../lib/types'
import { ReportModal, type ReportReason } from './ReportModal'

interface ChatRoomProps {
  profile: Profile
  onExit: () => void
  onReconnect: () => void
  onStats: (stats: PublicStats) => void
}

type SignalData =
  | { kind: 'offer' | 'answer'; sdp: RTCSessionDescriptionInit }
  | { kind: 'ice'; candidate: RTCIceCandidateInit }

type ServerMessage =
  | ({ type: 'welcome'; id: string; demoWaitSeconds?: number } & PublicStats)
  | ({ type: 'stats' } & PublicStats)
  | { type: 'queued' }
  | { type: 'matched'; roomId: string; initiator: boolean; partner: Partner }
  | { type: 'signal'; data: SignalData }
  | { type: 'chat'; from: 'me' | 'them'; text: string; ts: number }
  | { type: 'typing'; on: boolean }
  | { type: 'media'; media: MediaState }
  | { type: 'partner-left'; reason: string }
  | { type: 'queued-cancelled' }
  | { type: 'reported' }
  | { type: 'stopped' }
  | { type: 'error'; message: string }
  | { type: 'pong'; ts: number }

type ClientMessage =
  | { type: 'join'; clientKey: string; profile: Profile }
  | { type: 'find' | 'next' | 'stop' | 'cancel' }
  | { type: 'signal'; data: SignalData }
  | { type: 'chat'; text: string }
  | { type: 'typing'; on: boolean }
  | { type: 'media'; cam: boolean; mic: boolean }
  | { type: 'report'; reason: ReportReason; details: string }

interface Toast {
  id: number
  text: string
  tone: 'info' | 'success' | 'warn'
}

const SEARCH_TIPS = [
  'Open with a question — “where in the world are you?” works every time.',
  'Nobody owes you a conversation. Be easy to talk to.',
  'Ask what they are listening to right now. Instant playlist swap.',
  'Not feeling it? Press Next. You never need to explain yourself.',
]

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
]

const TURN_URL = import.meta.env.VITE_TURN_URL as string | undefined
if (TURN_URL) {
  ICE_SERVERS.push({
    urls: TURN_URL,
    username: import.meta.env.VITE_TURN_USERNAME as string | undefined,
    credential: import.meta.env.VITE_TURN_CREDENTIAL as string | undefined,
  })
}

function getClientKey(): string {
  const storageKey = 'riplika:clientKey'
  try {
    const existing = localStorage.getItem(storageKey)
    if (existing && /^[A-Za-z0-9_-]{8,64}$/.test(existing)) return existing
    const key = crypto.randomUUID()
    localStorage.setItem(storageKey, key)
    return key
  } catch {
    return crypto.randomUUID()
  }
}

function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

export function ChatRoom({ profile, onExit, onReconnect, onStats }: ChatRoomProps) {
  const [connection, setConnection] = useState<'connecting' | 'open' | 'lost'>('connecting')
  const [phase, setPhase] = useState<Phase>('setup')
  const [mediaSettled, setMediaSettled] = useState(false)
  const [mediaNote, setMediaNote] = useState<string | null>(null)
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null)
  const [remoteVideoLive, setRemoteVideoLive] = useState(false)
  const [camOn, setCamOn] = useState(false)
  const [micOn, setMicOn] = useState(false)
  const [partner, setPartner] = useState<Partner | null>(null)
  const [partnerMedia, setPartnerMedia] = useState<MediaState | null>(null)
  const [partnerTyping, setPartnerTyping] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [unread, setUnread] = useState(0)
  const [chatOpen, setChatOpen] = useState(() => window.matchMedia('(min-width: 901px)').matches)
  const [reportOpen, setReportOpen] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [tipIndex, setTipIndex] = useState(0)
  const [stats, setStats] = useState<PublicStats | null>(null)
  const [demoWaitSeconds, setDemoWaitSeconds] = useState(0)
  const [toasts, setToasts] = useState<Toast[]>([])

  const wsRef = useRef<WebSocket | null>(null)
  const localStreamRef = useRef<MediaStream | null>(null)
  const pcRef = useRef<RTCPeerConnection | null>(null)
  const pendingIceRef = useRef<RTCIceCandidateInit[]>([])
  const leavingRef = useRef(false)
  const chatOpenRef = useRef(chatOpen)
  const toastSeq = useRef(0)
  const typingTimerRef = useRef<number | null>(null)
  const partnerTypingTimerRef = useRef<number | null>(null)
  const lastTypingSentRef = useRef(0)

  const localVideoRef = useRef<HTMLVideoElement | null>(null)
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const chatInputRef = useRef<HTMLInputElement | null>(null)

  const hasVideo = Boolean(localStream?.getVideoTracks().length)
  const online = stats?.online ?? 1

  function send(message: ClientMessage) {
    const ws = wsRef.current
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message))
    }
  }

  function pushToast(text: string, tone: Toast['tone'] = 'info') {
    const id = ++toastSeq.current
    setToasts((current) => [...current.slice(-2), { id, text, tone }])
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id))
    }, 4200)
  }

  function currentMedia(): MediaState {
    const stream = localStreamRef.current
    return {
      cam: Boolean(stream?.getVideoTracks().some((track) => track.enabled && track.readyState === 'live')),
      mic: Boolean(stream?.getAudioTracks().some((track) => track.enabled && track.readyState === 'live')),
    }
  }

  function sendCurrentMedia() {
    send({ type: 'media', ...currentMedia() })
  }

  function teardownPeer(updateState = true) {
    pendingIceRef.current = []
    const pc = pcRef.current
    pcRef.current = null
    if (pc) {
      pc.onicecandidate = null
      pc.ontrack = null
      pc.onconnectionstatechange = null
      try {
        pc.close()
      } catch {
        // ignore
      }
    }
    if (updateState) {
      setRemoteStream(null)
      setRemoteVideoLive(false)
    }
  }

  function addVideoTrackToPeers(stream: MediaStream) {
    const pc = pcRef.current
    if (!pc) return
    const track = stream.getVideoTracks()[0]
    if (!track) return
    const sender = pc.getSenders().find((item) => item.track?.kind === 'video')
    if (sender) {
      void sender.replaceTrack(track)
    }
  }

  function createPeer(initiator: boolean): RTCPeerConnection {
    teardownPeer()
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
    pcRef.current = pc

    const stream = localStreamRef.current
    if (stream) {
      for (const track of stream.getTracks()) {
        pc.addTrack(track, stream)
      }
    }

    // Only the offerer needs placeholder transceivers when it has no tracks of its own.
    // The answerer inherits them from the offer.
    if (initiator) {
      if (!stream?.getVideoTracks().length) pc.addTransceiver('video', { direction: 'recvonly' })
      if (!stream?.getAudioTracks().length) pc.addTransceiver('audio', { direction: 'recvonly' })
    }

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        send({ type: 'signal', data: { kind: 'ice', candidate: event.candidate.toJSON() } })
      }
    }

    pc.ontrack = (event) => {
      const incoming = event.streams[0]
      if (incoming) {
        setRemoteStream(incoming)
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = incoming
          void remoteVideoRef.current.play().catch(() => undefined)
        }
      }
      if (event.track.kind === 'video') {
        setRemoteVideoLive(true)
        event.track.onended = () => setRemoteVideoLive(false)
        event.track.onmute = () => setRemoteVideoLive(false)
        event.track.onunmute = () => setRemoteVideoLive(true)
      }
    }

    pc.onconnectionstatechange = () => {
      if (pcRef.current !== pc) return
      if (pc.connectionState === 'failed') {
        pushToast('The video connection failed. Press Next to try someone else.', 'warn')
      }
    }

    return pc
  }

  async function startOffer(pc: RTCPeerConnection) {
    try {
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      if (pc.localDescription && pcRef.current === pc) {
        send({ type: 'signal', data: { kind: 'offer', sdp: pc.localDescription.toJSON() } })
      }
    } catch (error) {
      console.warn('Could not create offer', error)
      pushToast('Could not start the video connection. Try Next.', 'warn')
    }
  }

  async function flushPendingIce(pc: RTCPeerConnection) {
    const queued = pendingIceRef.current
    pendingIceRef.current = []
    for (const candidate of queued) {
      try {
        await pc.addIceCandidate(candidate)
      } catch {
        // A candidate can fail if the call already ended; safe to ignore.
      }
    }
  }

  async function handleSignal(data: SignalData) {
    const pc = pcRef.current
    if (!pc) return
    try {
      if (data.kind === 'offer') {
        await pc.setRemoteDescription(data.sdp)
        await flushPendingIce(pc)
        const answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)
        if (pc.localDescription && pcRef.current === pc) {
          send({ type: 'signal', data: { kind: 'answer', sdp: pc.localDescription.toJSON() } })
        }
      } else if (data.kind === 'answer') {
        await pc.setRemoteDescription(data.sdp)
        await flushPendingIce(pc)
      } else if (data.kind === 'ice') {
        if (pc.remoteDescription) {
          await pc.addIceCandidate(data.candidate)
        } else {
          pendingIceRef.current.push(data.candidate)
        }
      }
    } catch (error) {
      console.warn('WebRTC signal error', error)
    }
  }

  async function mediaPermissionsDenied(): Promise<boolean> {
    try {
      if (!navigator.permissions?.query) return false
      const states = await Promise.all(
        (['camera', 'microphone'] as PermissionName[]).map((name) =>
          navigator.permissions
            .query({ name })
            .then((result) => result.state)
            .catch(() => 'prompt' as PermissionState),
        ),
      )
      return states.every((state) => state === 'denied')
    } catch {
      return false
    }
  }

  function requestMedia(constraints: MediaStreamConstraints): Promise<MediaStream | 'timeout' | Error> {
    return new Promise((resolve) => {
      let settled = false
      let timedOut = false
      const timer = window.setTimeout(() => {
        timedOut = true
        if (!settled) {
          settled = true
          resolve('timeout')
        }
      }, 7000)

      navigator.mediaDevices
        .getUserMedia(constraints)
        .then((stream) => {
          if (timedOut || settled) {
            stream.getTracks().forEach((track) => track.stop())
            return
          }
          settled = true
          window.clearTimeout(timer)
          resolve(stream)
        })
        .catch((error: unknown) => {
          if (timedOut || settled) return
          settled = true
          window.clearTimeout(timer)
          resolve(error instanceof Error ? error : new Error(String(error)))
        })
    })
  }

  async function acquireMedia(): Promise<MediaStream | null> {
    if (!navigator.mediaDevices?.getUserMedia) {
      setMediaNote('Camera and microphone are not available in this browser. You can still chat by text.')
      return null
    }

    if (await mediaPermissionsDenied()) {
      setCamOn(false)
      setMicOn(false)
      setMediaNote('Camera and mic are blocked here. You can still see your match and chat by text.')
      return null
    }

    const first = await requestMedia({
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        facingMode: 'user',
      },
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    })

    if (first instanceof MediaStream) {
      localStreamRef.current = first
      setLocalStream(first)
      setCamOn(true)
      setMicOn(true)
      return first
    }

    if (first === 'timeout') {
      setCamOn(false)
      setMicOn(false)
      setMediaNote('Your camera took too long to start. You can still see your match and chat by text.')
      return null
    }

    const name = first instanceof DOMException ? first.name : 'Error'
    const audio = await requestMedia({ audio: true })
    if (audio instanceof MediaStream) {
      localStreamRef.current = audio
      setLocalStream(audio)
      setCamOn(false)
      setMicOn(true)
      setMediaNote(
        name === 'NotAllowedError'
          ? 'Camera access is off, so you are joining with audio only. You can still see your match.'
          : 'No camera was found. You can still see and hear your match.',
      )
      return audio
    }

    setCamOn(false)
    setMicOn(false)
    setMediaNote('Camera and mic are off. You can still see your match and chat by text.')
    return null
  }

  function connect() {
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const ws = new WebSocket(`${protocol}://${window.location.host}/ws`)
    wsRef.current = ws

    ws.onopen = () => {
      setConnection('open')
      send({ type: 'join', clientKey: getClientKey(), profile })
    }

    ws.onmessage = (event) => {
      let message: ServerMessage
      try {
        message = JSON.parse(String(event.data)) as ServerMessage
      } catch {
        return
      }
      handleServerMessage(message)
    }

    ws.onclose = () => {
      if (!leavingRef.current) setConnection('lost')
    }

    ws.onerror = () => {
      if (!leavingRef.current) setConnection('lost')
    }

    function handleServerMessage(message: ServerMessage) {
      switch (message.type) {
        case 'welcome': {
          const nextStats: PublicStats = {
            online: message.online,
            searching: message.searching,
            chatting: message.chatting,
            chatsToday: message.chatsToday,
          }
          setStats(nextStats)
          onStats(nextStats)
          setDemoWaitSeconds(message.demoWaitSeconds ?? 0)
          setPhase('searching')
          send({ type: 'find' })
          break
        }

        case 'stats': {
          const nextStats: PublicStats = {
            online: message.online,
            searching: message.searching,
            chatting: message.chatting,
            chatsToday: message.chatsToday,
          }
          setStats(nextStats)
          onStats(nextStats)
          break
        }

        case 'queued': {
          setPhase((current) => (current === 'matched' ? current : 'searching'))
          break
        }

        case 'matched': {
          const isDemo = Boolean(message.partner.demo)
          setPartner(message.partner)
          setPartnerMedia(null)
          setPartnerTyping(false)
          setUnread(0)
          setSeconds(0)
          setRemoteVideoLive(false)
          setMessages([
            {
              id: `system-${Date.now()}`,
              from: 'system',
              text: isDemo
                ? "You're connected with the Demo Partner 🤖 — a bot so you can try Riplika solo. Real people are always matched first."
                : `You're connected with ${message.partner.nickname} ${countryFlag(message.partner.country)}. Say hi 👋`,
              ts: Date.now(),
            },
          ])
          setPhase('matched')
          setReportOpen(false)
          if (isDemo) {
            setPartnerMedia({ cam: false, mic: false })
            break
          }
          const pc = createPeer(message.initiator)
          if (message.initiator) void startOffer(pc)
          window.setTimeout(sendCurrentMedia, 120)
          break
        }

        case 'signal': {
          void handleSignal(message.data)
          break
        }

        case 'chat': {
          const chatMessage: ChatMessage = {
            id: `${message.ts}-${Math.random().toString(36).slice(2, 8)}`,
            from: message.from,
            text: message.text,
            ts: message.ts,
          }
          setMessages((current) => [...current.slice(-149), chatMessage])
          if (message.from === 'them') {
            setPartnerTyping(false)
            if (!chatOpenRef.current) setUnread((count) => count + 1)
          }
          break
        }

        case 'typing': {
          if (partnerTypingTimerRef.current) window.clearTimeout(partnerTypingTimerRef.current)
          setPartnerTyping(message.on)
          if (message.on) {
            partnerTypingTimerRef.current = window.setTimeout(() => setPartnerTyping(false), 3000)
          }
          break
        }

        case 'media': {
          setPartnerMedia(message.media)
          break
        }

        case 'partner-left': {
          teardownPeer()
          setPartner(null)
          setPartnerMedia(null)
          setPartnerTyping(false)
          setReportOpen(false)
          setPhase('idle')
          setMessages((current) => [
            ...current,
            {
              id: `system-left-${Date.now()}`,
              from: 'system',
              text: 'The chat ended. Find someone new whenever you are ready.',
              ts: Date.now(),
            },
          ])
          break
        }

        case 'reported': {
          teardownPeer()
          setPartner(null)
          setPartnerMedia(null)
          setPartnerTyping(false)
          setReportOpen(false)
          setMessages([])
          setUnread(0)
          setPhase('searching')
          pushToast('Report sent. They are blocked for you.', 'success')
          send({ type: 'find' })
          break
        }

        case 'error': {
          pushToast(message.message, 'warn')
          break
        }

        default:
          break
      }
    }
  }

  useEffect(() => {
    let cancelled = false

    async function boot() {
      const stream = await acquireMedia()
      if (cancelled) {
        stream?.getTracks().forEach((track) => track.stop())
        return
      }
      setMediaSettled(true)
      connect()
    }

    void boot()

    return () => {
      cancelled = true
      leavingRef.current = true
      if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current)
      if (partnerTypingTimerRef.current) window.clearTimeout(partnerTypingTimerRef.current)
      try {
        wsRef.current?.close()
      } catch {
        // ignore
      }
      teardownPeer(false)
      localStreamRef.current?.getTracks().forEach((track) => track.stop())
      localStreamRef.current = null
    }
    // The room is intentionally booted once per mount with the profile captured at entry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    chatOpenRef.current = chatOpen
  }, [chatOpen])

  useEffect(() => {
    const video = localVideoRef.current
    if (video && localStream) {
      video.srcObject = localStream
      void video.play().catch(() => undefined)
    }
  }, [localStream, phase])

  useEffect(() => {
    const video = remoteVideoRef.current
    if (!video) return
    if (remoteStream) {
      video.srcObject = remoteStream
      void video.play().catch(() => undefined)
    } else {
      video.srcObject = null
    }
  }, [remoteStream])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, partnerTyping])

  useEffect(() => {
    if (phase !== 'matched') {
      setSeconds(0)
      return
    }
    const timer = window.setInterval(() => setSeconds((value) => value + 1), 1000)
    return () => window.clearInterval(timer)
  }, [phase])

  useEffect(() => {
    if (phase !== 'searching') return
    const timer = window.setInterval(() => {
      setTipIndex((index) => (index + 1) % SEARCH_TIPS.length)
    }, 6500)
    return () => window.clearInterval(timer)
  }, [phase])

  useEffect(() => {
    document.title = partner ? 'In a chat · Riplika' : 'Riplika — Meet someone new'
    return () => {
      document.title = 'Riplika — Meet someone new, right now'
    }
  }, [partner])

  function openChat(open: boolean) {
    chatOpenRef.current = open
    setChatOpen(open)
    if (open) {
      setUnread(0)
      window.setTimeout(() => chatInputRef.current?.focus(), 120)
    }
  }

  function toggleMic() {
    const tracks = localStreamRef.current?.getAudioTracks() ?? []
    if (!tracks.length) {
      pushToast('No microphone available. Check your browser permission.', 'warn')
      return
    }
    const next = !tracks.some((track) => track.enabled)
    tracks.forEach((track) => {
      track.enabled = next
    })
    setMicOn(next)
    sendCurrentMedia()
  }

  function toggleCam() {
    const tracks = localStreamRef.current?.getVideoTracks() ?? []
    if (!tracks.length) {
      pushToast('No camera available. Use “Enable cam” to retry.', 'warn')
      return
    }
    const next = !tracks.some((track) => track.enabled)
    tracks.forEach((track) => {
      track.enabled = next
    })
    setCamOn(next)
    sendCurrentMedia()
  }

  async function retryCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      pushToast('This browser does not support camera access.', 'warn')
      return
    }
    try {
      const camStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' },
        audio: false,
      })
      const videoTrack = camStream.getVideoTracks()[0]
      if (!videoTrack) return

      const existing = localStreamRef.current
      const audioTracks = existing?.getAudioTracks() ?? []
      existing?.getVideoTracks().forEach((track) => track.stop())

      const nextStream = new MediaStream([...audioTracks, videoTrack])
      localStreamRef.current = nextStream
      setLocalStream(nextStream)
      setCamOn(true)
      setMediaNote(null)
      addVideoTrackToPeers(nextStream)
      sendCurrentMedia()
      pushToast(partner ? 'Camera on — live for your next match.' : 'Camera on. You look great.', 'success')
    } catch {
      pushToast('Could not access the camera. Check your browser settings.', 'warn')
    }
  }

  async function flipCamera() {
    const track = localStreamRef.current?.getVideoTracks()[0]
    if (!track) return
    const currentFacing = track.getSettings().facingMode
    const nextFacing = currentFacing === 'environment' ? 'user' : 'environment'
    try {
      const camStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: nextFacing },
        audio: false,
      })
      const nextTrack = camStream.getVideoTracks()[0]
      if (!nextTrack) return
      const existing = localStreamRef.current
      const audioTracks = existing?.getAudioTracks() ?? []
      track.stop()
      const nextStream = new MediaStream([...audioTracks, nextTrack])
      localStreamRef.current = nextStream
      setLocalStream(nextStream)
      addVideoTrackToPeers(nextStream)
      pushToast(nextFacing === 'user' ? 'Front camera' : 'Back camera', 'info')
    } catch {
      pushToast('No other camera found on this device.', 'info')
    }
  }

  function next() {
    teardownPeer()
    setPartner(null)
    setPartnerMedia(null)
    setPartnerTyping(false)
    setReportOpen(false)
    setMessages([])
    setUnread(0)
    setPhase('searching')
    send({ type: 'next' })
  }

  function stop() {
    if (leavingRef.current) return
    leavingRef.current = true
    send({ type: 'stop' })
    window.setTimeout(() => {
      try {
        wsRef.current?.close()
      } catch {
        // ignore
      }
    }, 80)
    onExit()
  }

  function handleInputChange(value: string) {
    setInput(value)
    if (!partner) return
    const now = Date.now()
    if (now - lastTypingSentRef.current > 1400) {
      lastTypingSentRef.current = now
      send({ type: 'typing', on: true })
    }
    if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current)
    typingTimerRef.current = window.setTimeout(() => send({ type: 'typing', on: false }), 1800)
  }

  function submitChat(event: FormEvent) {
    event.preventDefault()
    const text = input.trim()
    if (!text || !partner) return
    send({ type: 'chat', text })
    setInput('')
    send({ type: 'typing', on: false })
    lastTypingSentRef.current = 0
  }

  function submitReport(reason: ReportReason, details: string) {
    send({ type: 'report', reason, details })
    setReportOpen(false)
  }

  const lookingLabel =
    profile.lookingFor === 'any'
      ? 'anyone'
      : profile.lookingFor === 'woman'
        ? 'women'
        : profile.lookingFor === 'man'
          ? 'men'
          : 'non-binary people'

  return (
    <div className="room">
      <header className="room-topbar">
        <div className="room-brand">
          <Logo size={28} />
          <span className="live-pill">
            <span className="live-dot" /> Live
          </span>
        </div>
        <div className="room-top-actions">
          <span className="room-online">
            <span className="status-dot" />
            {stats ? `${online.toLocaleString()} online` : 'Connecting…'}
          </span>
          <button type="button" className="icon-button room-leave" onClick={stop} title="Leave the chat">
            <XIcon size={18} />
          </button>
        </div>
      </header>

      <main className="room-main">
        <section className={`stage ${phase}`}>
          <div className="stage-ambient" aria-hidden>
            <span className="blob blob-a" />
            <span className="blob blob-b" />
            <span className="blob blob-c" />
          </div>

          <video
            ref={remoteVideoRef}
            className={`remote-video ${remoteVideoLive ? 'is-live' : ''}`}
            autoPlay
            playsInline
            onClick={() => void remoteVideoRef.current?.play().catch(() => undefined)}
          />

          <div className="stage-scrim" aria-hidden />

          {phase === 'setup' ? (
            <div className="stage-panel">
              <div className="halo-orb">
                <VideoIcon size={30} />
              </div>
              <h2>{mediaSettled ? 'Connecting you…' : 'Setting up your camera'}</h2>
              <p>
                {mediaNote ??
                  'Allow camera and microphone access if your browser asks. Prefer to stay off camera? Deny it and you can still chat by text.'}
              </p>
              <div className="setup-track">
                <span className={mediaSettled ? 'done' : 'active'}>
                  {mediaSettled ? <CheckIcon size={14} /> : <span className="spinner" />} Camera &amp; mic
                </span>
                <span className={mediaSettled ? 'active' : ''}>
                  {mediaSettled ? <span className="spinner" /> : <span className="dot-idle" />} Matchmaking
                </span>
              </div>
            </div>
          ) : null}

          {phase === 'searching' ? (
            <div className="stage-panel search-panel">
              <div className="radar" aria-hidden>
                <span className="ring ring-1" />
                <span className="ring ring-2" />
                <span className="ring ring-3" />
                <span className="radar-core">
                  <GlobeIcon size={30} />
                </span>
              </div>
              <h2>Looking for someone…</h2>
              <p>
                {profile.countryPref === 'any'
                  ? `Matching you with ${lookingLabel}, anywhere in the world.`
                  : `Matching you with ${lookingLabel} from ${countryName(profile.countryPref)}.`}
              </p>
              {stats && stats.searching > 0 ? (
                <span className="search-count">
                  <span className="live-dot" /> {stats.searching} in the queue
                </span>
              ) : null}
              {demoWaitSeconds > 0 ? (
                <p className="search-demo">
                  🤖 No one else waiting? A demo partner will say hi in about {demoWaitSeconds}s.
                </p>
              ) : null}
              {!hasVideo ? (
                <p className="search-media">
                  <VideoOffIcon size={13} /> Browsing without a camera — you can still chat by text.
                </p>
              ) : null}
              <p className="search-tip">{SEARCH_TIPS[tipIndex]}</p>
              <button type="button" className="btn btn-ghost-light" onClick={stop}>
                Cancel and leave
              </button>
            </div>
          ) : null}

          {phase === 'idle' ? (
            <div className="stage-panel">
              <div className="halo-orb muted">
                <SkipIcon size={28} />
              </div>
              <h2>That conversation has ended</h2>
              <p>
                {partnerMedia?.cam === false
                  ? 'They moved on.'
                  : 'They left the chat.'}{' '}
                You can meet someone else right away.
              </p>
              <button type="button" className="btn btn-primary" onClick={next}>
                <SkipIcon size={18} /> Find someone new
              </button>
            </div>
          ) : null}

          {phase === 'matched' && partner ? (
            <>
              {!remoteVideoLive ? (
                <div className="remote-placeholder">
                  <div className={`remote-orb ${partnerMedia?.cam === false ? 'off' : ''}`}>
                    {countryFlag(partner.country)}
                  </div>
                  <h2>{partnerMedia?.cam === false ? `${partner.nickname} is off camera` : `Connecting to ${partner.nickname}…`}</h2>
                  <p>
                    {partner.demo
                      ? 'This is a demo bot so you can try the chat solo. Real people are always matched first.'
                      : partnerMedia?.cam === false
                        ? 'Say hi in the chat — they can still type back.'
                        : 'This usually takes a second. Their video will appear here.'}
                  </p>
                </div>
              ) : null}

              {partnerMedia?.cam === false && remoteVideoLive ? (
                <div className="cam-off-cover">
                  <span className="partner-flag big">{countryFlag(partner.country)}</span>
                  <strong>{partner.nickname}&apos;s camera is off</strong>
                  <span>Keep the conversation going in the chat.</span>
                </div>
              ) : null}

              <div className="stage-top">
                <div className="partner-chip">
                  <span className="partner-flag">{countryFlag(partner.country)}</span>
                  <div className="partner-meta">
                    <strong>{partner.nickname}</strong>
                    <span>{partner.demo ? 'Demo bot · replies are automatic' : countryName(partner.country)}</span>
                  </div>
                  {partnerMedia?.mic === false ? (
                    <span className="chip-icon" title="Microphone muted">
                      <MicOffIcon size={14} />
                    </span>
                  ) : null}
                  <span className="call-timer">{formatDuration(seconds)}</span>
                </div>
                <button
                  type="button"
                  className="stage-report"
                  onClick={() => setReportOpen(true)}
                  title="Report this chat"
                >
                  <FlagIcon size={15} />
                  <span>Report</span>
                </button>
              </div>
            </>
          ) : null}

          <div className={`local-pip ${camOn ? '' : 'cam-off'}`}>
            <video ref={localVideoRef} muted autoPlay playsInline />
            {!camOn ? (
              <div className="pip-fallback">
                <span className="pip-face">{hasVideo ? '🙂' : '👻'}</span>
                <small>{hasVideo ? 'Camera off' : 'No camera'}</small>
                {!hasVideo ? (
                  <button type="button" className="pip-enable" onClick={() => void retryCamera()}>
                    Enable cam
                  </button>
                ) : null}
              </div>
            ) : null}
            <span className="pip-label">You</span>
            {!micOn ? (
              <span className="pip-muted" title="Your mic is muted">
                <MicOffIcon size={12} />
              </span>
            ) : null}
            {hasVideo && camOn ? (
              <button type="button" className="pip-flip" onClick={() => void flipCamera()} title="Flip camera">
                <RefreshIcon size={13} />
              </button>
            ) : null}
          </div>

          <div className="control-dock">
            <button
              type="button"
              className={`round-btn ${micOn ? '' : 'off'}`}
              onClick={toggleMic}
              title={micOn ? 'Mute microphone' : 'Unmute microphone'}
              aria-pressed={!micOn}
            >
              {micOn ? <MicIcon size={20} /> : <MicOffIcon size={20} />}
            </button>
            <button
              type="button"
              className={`round-btn ${camOn ? '' : 'off'}`}
              onClick={toggleCam}
              title={camOn ? 'Turn camera off' : 'Turn camera on'}
              aria-pressed={!camOn}
            >
              {camOn ? <VideoIcon size={20} /> : <VideoOffIcon size={20} />}
            </button>
            <button
              type="button"
              className="round-btn chat-toggle"
              onClick={() => openChat(!chatOpen)}
              title="Open chat"
            >
              <ChatIcon size={20} />
              {unread > 0 ? <span className="unread-badge">{unread > 9 ? '9+' : unread}</span> : null}
            </button>

            <span className="dock-sep" aria-hidden />

            <button type="button" className="stop-btn" onClick={stop} title="End the chat and leave">
              <PhoneDownIcon size={19} />
              <span>Stop</span>
            </button>
            <button
              type="button"
              className="next-btn"
              onClick={next}
              disabled={phase === 'searching' || phase === 'setup'}
            >
              {phase === 'searching' ? (
                <span className="spinner" />
              ) : (
                <SkipIcon size={17} />
              )}
              <span>
                {phase === 'matched' ? 'Next' : phase === 'idle' ? 'Find someone' : 'Finding…'}
              </span>
            </button>
          </div>
        </section>

        <aside className={`chat-panel ${chatOpen ? 'open' : 'closed'}`} aria-label="Text chat">
          <header className="chat-head">
            <div className="chat-head-top">
              <span className="chat-title">
                <ChatIcon size={17} /> Chat
              </span>
              <button
                type="button"
                className="icon-button chat-close"
                onClick={() => openChat(false)}
                aria-label="Close chat"
              >
                <XIcon size={18} />
              </button>
            </div>
            {partner ? (
              <div className="chat-partner">
                <span className="partner-flag">{countryFlag(partner.country)}</span>
                <div>
                  <strong>{partner.nickname}</strong>
                  <span>
                    {partner.demo ? 'Demo bot' : countryName(partner.country)}
                    {partnerMedia?.mic === false && !partner.demo ? ' · muted' : ''}
                  </span>
                </div>
                <span className="chat-live">
                  <span className="live-dot" /> live
                </span>
              </div>
            ) : (
              <div className="chat-partner idle">
                <span className="chat-idle-dot" />
                <span>{phase === 'searching' ? 'Waiting for a match…' : 'No one connected'}</span>
              </div>
            )}
          </header>

          <div className="chat-messages">
            {messages.length === 0 ? (
              <div className="chat-empty">
                <span className="chat-empty-icon">
                  <ChatIcon size={24} />
                </span>
                <strong>{phase === 'searching' ? 'Finding someone…' : 'No messages yet'}</strong>
                <p>
                  {phase === 'searching'
                    ? 'Your next conversation starts as soon as you match.'
                    : 'Say hello first — first messages get the best replies.'}
                </p>
              </div>
            ) : null}

            {messages.map((message) =>
              message.from === 'system' ? (
                <div className="system-message" key={message.id}>
                  {message.text}
                </div>
              ) : (
                <div className={`message-row ${message.from}`} key={message.id}>
                  {message.from === 'them' && partner ? (
                    <span className="message-avatar">{countryFlag(partner.country)}</span>
                  ) : null}
                  <div className={`message-bubble ${message.from}`}>{message.text}</div>
                </div>
              ),
            )}

            {partnerTyping ? (
              <div className="message-row them typing-row">
                <span className="typing-dots" aria-label="Your match is typing">
                  <span />
                  <span />
                  <span />
                </span>
              </div>
            ) : null}
            <div ref={messagesEndRef} />
          </div>

          <form className="chat-form" onSubmit={submitChat}>
            <input
              ref={chatInputRef}
              type="text"
              value={input}
              maxLength={500}
              placeholder={partner ? 'Type a message…' : 'Waiting for a match…'}
              disabled={!partner}
              onChange={(event) => handleInputChange(event.target.value)}
              aria-label="Message"
            />
            <button type="submit" className="send-btn" disabled={!partner || !input.trim()} aria-label="Send message">
              <SendIcon size={19} />
            </button>
          </form>
          <p className="chat-footnote">
            <ShieldIcon size={12} /> Messages are filtered. Never share personal info.
          </p>
        </aside>

        <div
          className={`chat-backdrop ${chatOpen ? 'show' : ''}`}
          onClick={() => openChat(false)}
          aria-hidden
        />
      </main>

      {reportOpen && partner ? (
        <ReportModal
          partnerName={partner.nickname}
          onClose={() => setReportOpen(false)}
          onSubmit={submitReport}
        />
      ) : null}

      <div className="toast-stack" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div className={`toast ${toast.tone}`} key={toast.id}>
            {toast.tone === 'success' ? <CheckIcon size={16} /> : toast.tone === 'warn' ? <AlertIcon size={16} /> : null}
            <span>{toast.text}</span>
          </div>
        ))}
      </div>

      {connection === 'lost' ? (
        <div className="room-overlay">
          <div className="overlay-card">
            <span className="halo-orb muted">
              <AlertIcon size={27} />
            </span>
            <h2>Connection lost</h2>
            <p>We lost touch with the matchmaking server. Check your connection and jump back in.</p>
            <div className="overlay-actions">
              <button type="button" className="btn btn-ghost" onClick={stop}>
                Leave
              </button>
              <button type="button" className="btn btn-primary" onClick={onReconnect}>
                <RefreshIcon size={17} /> Reconnect
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
