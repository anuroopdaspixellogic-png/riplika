import { useEffect, useMemo, useState } from 'react'
import {
  ArrowRightIcon,
  CheckIcon,
  ChevronDownIcon,
  FlagIcon,
  GlobeIcon,
  Logo,
  LockIcon,
  ShieldIcon,
  SkipIcon,
  SparkleIcon,
  UsersIcon,
  VideoIcon,
} from './Icons'
import { COUNTRIES, countryFlag, detectCountry } from '../lib/countries'
import type { Gender, LookingFor, Profile, PublicStats } from '../lib/types'
import { Modal } from './Modal'

interface LandingProps {
  stats: PublicStats | null
  onStart: (profile: Profile) => void
}

const numberFormat = new Intl.NumberFormat('en-US')

interface SavedProfile {
  nickname?: string
  country?: string
  gender?: Gender
  lookingFor?: LookingFor
  countryPref?: string
}

function readSavedProfile(): SavedProfile {
  try {
    const raw = localStorage.getItem('riplika:profile')
    return raw ? (JSON.parse(raw) as SavedProfile) : {}
  } catch {
    return {}
  }
}

const GENDER_OPTIONS: { value: Gender; label: string }[] = [
  { value: 'woman', label: 'Woman' },
  { value: 'man', label: 'Man' },
  { value: 'nonbinary', label: 'Non-binary' },
  { value: 'na', label: 'Private' },
]

const LOOKING_OPTIONS: { value: LookingFor; label: string }[] = [
  { value: 'any', label: 'Anyone' },
  { value: 'woman', label: 'Women' },
  { value: 'man', label: 'Men' },
  { value: 'nonbinary', label: 'Non-binary' },
]

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
}) {
  return (
    <div className="seg-field">
      <span className="field-label">{label}</span>
      <div className="segmented" role="radiogroup" aria-label={label}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={value === option.value}
            className={value === option.value ? 'seg active' : 'seg'}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}

const FAQ_ITEMS = [
  {
    q: 'Is Riplika free?',
    a: 'Yes. There is no account, no subscription and no credit card. Open the page, press start and you are in.',
  },
  {
    q: 'Do I have to turn my camera on?',
    a: 'No. If you deny camera access you can still browse and chat by text. You will see and hear your match when they share their camera. You can also switch your camera or mic off at any time during a call.',
  },
  {
    q: 'How are people matched?',
    a: 'You are paired with the person who has been waiting longest and fits both of your preferences — country and who you want to meet. If nobody fits right now you wait in the queue until someone does.',
  },
  {
    q: 'What does the Next button do?',
    a: 'It ends the current call and puts you straight back in the queue for a new match. The person you were talking to is told the chat ended, nothing more.',
  },
  {
    q: 'Is the chat moderated?',
    a: 'There is an 18+ gate. Messages pass through a profanity filter, and one tap on Report privately blocks the person and logs the report for review. You are always in control: you can leave any chat instantly.',
  },
  {
    q: 'Are my calls recorded?',
    a: 'No. Video and audio travel directly between the two browsers. Text messages are relayed by the server and are not stored. Reports are saved with anonymous session IDs so moderators can review them; live counters and matchmaking state stay in memory.',
  },
]

function LegalContent({ kind }: { kind: 'rules' | 'privacy' }) {
  if (kind === 'rules') {
    return (
      <div className="prose">
        <p>
          Riplika is for adults meeting adults. These rules keep it usable for everyone. Breaking them can get
          you blocked, reported or removed.
        </p>
        <ol className="rules-list">
          <li>
            <strong>You must be 18 or older.</strong> No exceptions. If you believe you are talking to a minor,
            report the chat immediately and leave.
          </li>
          <li>
            <strong>No nudity or sexual content.</strong> Keep it G-rated. No sexual requests, gestures or
            exposure.
          </li>
          <li>
            <strong>No harassment or hate.</strong> No threats, slurs, stalking, doxxing or degrading language.
          </li>
          <li>
            <strong>No recording other people.</strong> Do not screenshot or record a call without the other
            person's clear consent.
          </li>
          <li>
            <strong>No spam, scams or ads.</strong> Do not share phishing links, sell anything or drive traffic
            to other platforms.
          </li>
          <li>
            <strong>Report problems.</strong> Use the report button. Reports block that person for you and are
            logged for review.
          </li>
        </ol>
        <p className="prose-note">Be someone worth meeting. You are talking to a real person.</p>
      </div>
    )
  }

  return (
    <div className="prose">
      <h3>What we collect</h3>
      <p>
        No account, no email, no real name. You choose a nickname (optional), a country and a few matching
        preferences. Those live in the server's memory while you are connected and disappear when the session
        ends.
      </p>
      <h3>Camera, microphone and video</h3>
      <p>
        Video and audio are sent directly between browsers using WebRTC. Riplika's server only helps the two
        browsers find each other; it does not see or record the media.
      </p>
      <h3>Text messages</h3>
      <p>
        Chat messages are relayed through the server to your match. They are not written to a database or kept
        after delivery.
      </p>
      <h3>Local storage</h3>
      <p>
        Your browser stores a random ID so blocks survive a refresh, plus your last used nickname and matching
        preferences for convenience. Clear your browser data to remove them.
      </p>
      <h3>Reports</h3>
      <p>
        Reports are stored in the server's moderation database with the reason, any details you add, the anonymous
        session IDs and client keys involved, and a timestamp. They do not include your video, audio or message
        history. Reviewed reports are deleted automatically after 90 days by default. Blocks are kept so the two of
        you are not matched again.
      </p>
      <h3>Your choices</h3>
      <p>
        You can leave a chat at any time, stop your camera and microphone, or close the tab. Right now Riplika
        does not offer accounts, so there is no profile to delete.
      </p>
    </div>
  )
}

export function Landing({ stats, onStart }: LandingProps) {
  const saved = useMemo(readSavedProfile, [])
  const [nickname, setNickname] = useState(saved.nickname ?? '')
  const [country, setCountry] = useState(saved.country ?? detectCountry())
  const [gender, setGender] = useState<Gender>(saved.gender ?? 'na')
  const [lookingFor, setLookingFor] = useState<LookingFor>(saved.lookingFor ?? 'any')
  const [countryPref, setCountryPref] = useState(saved.countryPref ?? 'any')
  const [adult, setAdult] = useState(false)
  const [legal, setLegal] = useState<'rules' | 'privacy' | null>(null)
  const [openFaq, setOpenFaq] = useState<number | null>(0)
  const [attempted, setAttempted] = useState(false)

  useEffect(() => {
    document.title = 'Riplika — Meet someone new, right now'
  }, [])

  function scrollToStart() {
    document.getElementById('start')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  function start() {
    if (!adult) {
      setAttempted(true)
      return
    }
    const profile: Profile = {
      nickname: nickname.trim().slice(0, 24),
      country,
      gender,
      lookingFor,
      countryPref,
    }
    try {
      localStorage.setItem('riplika:profile', JSON.stringify(profile))
    } catch {
      // Storage may be unavailable; matching still works.
    }
    onStart(profile)
  }

  const online = stats?.online ?? 0
  const chatsToday = stats?.chatsToday ?? 0

  return (
    <div className="landing">
      <header className="site-header">
        <div className="shell header-inner">
          <a className="brand-link" href="#top" aria-label="Riplika home">
            <Logo />
          </a>
          <nav className="site-nav" aria-label="Primary">
            <a href="#how">How it works</a>
            <a href="#safety">Safety</a>
            <a href="#faq">FAQ</a>
          </nav>
          <div className="header-actions">
            <span className="online-pill" title="People currently connected">
              <span className="status-dot" />
              {stats ? `${numberFormat.format(online)} online` : 'Connecting…'}
            </span>
            <button type="button" className="btn btn-dark btn-sm header-cta" onClick={scrollToStart}>
              Start chat
            </button>
          </div>
        </div>
      </header>

      <main id="top">
        <section className="hero shell">
          <div className="hero-copy">
            <span className="eyebrow">
              <SparkleIcon size={15} /> Random video chat, minus the app store
            </span>
            <h1>
              Meet someone new.
              <br />
              <span className="grad-text">Right now.</span>
            </h1>
            <p className="lede">
              Press start and drop into a face-to-face chat with a stranger somewhere in the world. No sign-up,
              no profiles, no swiping — just say hi.
            </p>

            <div className="trust-row">
              <span>
                <CheckIcon size={16} /> No sign-up
              </span>
              <span>
                <VideoIcon size={16} /> Camera optional
              </span>
              <span>
                <ShieldIcon size={16} /> 18+ only
              </span>
            </div>

            <div className="hero-proof">
              <div className="avatar-stack" aria-hidden>
                <span className="avatar avatar-1">😊</span>
                <span className="avatar avatar-2">😎</span>
                <span className="avatar avatar-3">🦊</span>
                <span className="avatar avatar-4">🌍</span>
              </div>
              <p>
                <strong>{numberFormat.format(online)}</strong> online now
                {chatsToday > 0 ? (
                  <>
                    {' '}
                    · <strong>{numberFormat.format(chatsToday)}</strong> chats started today
                  </>
                ) : (
                  <> · be the first to say hi</>
                )}
              </p>
            </div>

            <div className="hero-points">
              <div>
                <GlobeIcon size={18} />
                <span>
                  <strong>Anyone, anywhere</strong>
                  Match by country or leave it open to the world.
                </span>
              </div>
              <div>
                <SkipIcon size={18} />
                <span>
                  <strong>One tap to move on</strong>
                  No awkward exit. Press Next and meet someone else.
                </span>
              </div>
              <div>
                <LockIcon size={18} />
                <span>
                  <strong>Nothing to sign up for</strong>
                  No email, no password, no history of your chats.
                </span>
              </div>
            </div>
          </div>

          <div className="match-card" id="start">
            <div className="call-preview" aria-hidden>
              <div className="preview-top">
                <span className="preview-live">
                  <span className="status-dot" /> live preview
                </span>
                <span className="preview-country">🇪🇸 Spain</span>
              </div>
              <div className="preview-person">
                <span className="preview-avatar">😊</span>
                <div>
                  <strong>Maya, 26</strong>
                  <span>likes hiking &amp; bad puns</span>
                </div>
              </div>
              <div className="preview-bubbles">
                <span className="bubble bubble-them">hey! how&apos;s your day? 👋</span>
                <span className="bubble bubble-me">way better now 😄</span>
              </div>
              <div className="preview-pip" aria-hidden>
                <span>😎</span>
              </div>
              <div className="preview-dock">
                <span className="preview-dot" />
                <span className="preview-dot" />
                <span className="preview-chip">
                  Next <SkipIcon size={11} />
                </span>
              </div>
            </div>

            <div className="match-form">
              <div className="match-head">
                <h2>Jump into a chat</h2>
                <p>Takes ten seconds. All fields except the age check are optional.</p>
              </div>

              <label className="input-field">
                <span className="field-label">
                  Nickname <em>optional</em>
                </span>
                <input
                  type="text"
                  value={nickname}
                  maxLength={24}
                  placeholder="Anonymous"
                  autoComplete="off"
                  onChange={(event) => setNickname(event.target.value)}
                />
              </label>

              <Segmented label="I am" value={gender} options={GENDER_OPTIONS} onChange={setGender} />
              <Segmented
                label="Match me with"
                value={lookingFor}
                options={LOOKING_OPTIONS}
                onChange={setLookingFor}
              />

              <div className="select-row">
                <label className="input-field">
                  <span className="field-label">I&apos;m in</span>
                  <span className="select-wrap">
                    <select value={country} onChange={(event) => setCountry(event.target.value)}>
                      {COUNTRIES.map((item) => (
                        <option key={item.code} value={item.code}>
                          {countryFlag(item.code)} {item.name}
                        </option>
                      ))}
                    </select>
                    <ChevronDownIcon size={16} />
                  </span>
                </label>
                <label className="input-field">
                  <span className="field-label">Only match with</span>
                  <span className="select-wrap">
                    <select value={countryPref} onChange={(event) => setCountryPref(event.target.value)}>
                      <option value="any">🌍 Anywhere</option>
                      {COUNTRIES.map((item) => (
                        <option key={item.code} value={item.code}>
                          {countryFlag(item.code)} {item.name}
                        </option>
                      ))}
                    </select>
                    <ChevronDownIcon size={16} />
                  </span>
                </label>
              </div>

              <button
                type="button"
                className={`btn btn-primary btn-start ${attempted && !adult ? 'nudge' : ''}`}
                onClick={start}
                aria-disabled={!adult}
              >
                <VideoIcon size={19} />
                Start chatting
                <ArrowRightIcon size={18} />
              </button>

              <label className={`consent ${attempted && !adult ? 'consent-alert' : ''}`}>
                <input
                  type="checkbox"
                  checked={adult}
                  onChange={(event) => setAdult(event.target.checked)}
                />
                <span>
                  I&apos;m 18 or older and agree to the{' '}
                  <button type="button" className="inline-link" onClick={() => setLegal('rules')}>
                    community rules
                  </button>
                  .
                </span>
              </label>
              {attempted && !adult ? (
                <p className="form-hint error-hint">Please confirm you are 18+ to start.</p>
              ) : (
                <p className="form-hint">
                  <LockIcon size={13} /> Free · no account · your video never touches our servers
                </p>
              )}
            </div>
          </div>
        </section>

        <section className="stat-strip">
          <div className="shell stat-grid">
            <div>
              <strong>{numberFormat.format(online)}</strong>
              <span>people online now</span>
            </div>
            <div>
              <strong>{numberFormat.format(chatsToday)}</strong>
              <span>chats started today</span>
            </div>
            <div>
              <strong>$0</strong>
              <span>to meet the world</span>
            </div>
            <div>
              <strong>0</strong>
              <span>accounts required</span>
            </div>
          </div>
        </section>

        <section className="section shell" id="how">
          <div className="section-head">
            <span className="eyebrow">How it works</span>
            <h2>Three taps to a new conversation</h2>
            <p>No onboarding funnel, no profile to perfect. Just a face and a hello.</p>
          </div>
          <div className="steps">
            <article className="step-card">
              <span className="step-num">01</span>
              <span className="step-icon">
                <VideoIcon size={24} />
              </span>
              <h3>Allow your camera</h3>
              <p>Your browser asks once. Camera shy? You can match without one and chat by text.</p>
              <span className="step-tag">Takes 2 seconds</span>
            </article>
            <article className="step-card">
              <span className="step-num">02</span>
              <span className="step-icon">
                <UsersIcon size={24} />
              </span>
              <h3>Get matched instantly</h3>
              <p>
                We pair you with someone who is waiting and fits your preferences. No browsing, no swiping, no
                algorithms deciding your worth.
              </p>
              <span className="step-tag">Real people, real time</span>
            </article>
            <article className="step-card">
              <span className="step-num">03</span>
              <span className="step-icon">
                <SkipIcon size={24} />
              </span>
              <h3>Say hi — or press Next</h3>
              <p>Every chat starts with a clean slate. Not feeling it? One tap ends the call and finds someone else.</p>
              <span className="step-tag">Zero awkward exits</span>
            </article>
          </div>
        </section>

        <section className="safety-section" id="safety">
          <div className="shell safety-grid">
            <div className="safety-copy">
              <span className="eyebrow eyebrow-light">
                <ShieldIcon size={15} /> Safety first
              </span>
              <h2>Anonymous doesn&apos;t mean unaccountable.</h2>
              <p className="safety-lede">
                Strangers deserve the same respect as people you already know. Riplika gives you simple, fast
                tools to keep a conversation healthy — and to leave the moment it isn&apos;t.
              </p>
              <ul className="safety-list">
                <li>
                  <CheckIcon size={17} />
                  <span>
                    <strong>18+ gate.</strong> Adults only, every session.
                  </span>
                </li>
                <li>
                  <CheckIcon size={17} />
                  <span>
                    <strong>One-tap report &amp; block.</strong> Ends the call instantly and stops you from seeing
                    them again.
                  </span>
                </li>
                <li>
                  <CheckIcon size={17} />
                  <span>
                    <strong>Filtered messages.</strong> Slurs and abusive language are masked before they land.
                  </span>
                </li>
                <li>
                  <CheckIcon size={17} />
                  <span>
                    <strong>No follow-ups.</strong> No usernames, no friend requests, no way for a stranger to
                    contact you after you leave.
                  </span>
                </li>
                <li>
                  <CheckIcon size={17} />
                  <span>
                    <strong>Nothing to leak.</strong> No profiles, no accounts and no call recordings.
                  </span>
                </li>
              </ul>
              <div className="safety-links">
                <button type="button" className="text-link" onClick={() => setLegal('rules')}>
                  Read the community rules <ArrowRightIcon size={15} />
                </button>
                <button type="button" className="text-link" onClick={() => setLegal('privacy')}>
                  How privacy works <ArrowRightIcon size={15} />
                </button>
              </div>
            </div>

            <div className="safety-card" aria-hidden>
              <div className="safety-card-head">
                <span className="safety-shield">
                  <ShieldIcon size={22} />
                </span>
                <div>
                  <strong>Report this chat</strong>
                  <span>They won&apos;t know it was you</span>
                </div>
              </div>
              <div className="report-reasons">
                <span className="reason active">Nudity or sexual content</span>
                <span className="reason">Harassment or hate</span>
                <span className="reason">Suspected minor</span>
                <span className="reason">Spam or scam</span>
              </div>
              <div className="safety-card-foot">
                <span className="ghost-pill">Cancel</span>
                <span className="solid-pill">Report &amp; block</span>
              </div>
              <div className="safety-note">
                <FlagIcon size={15} />
                Reporting also skips to a new person immediately.
              </div>
            </div>
          </div>
        </section>

        <section className="section shell faq-section" id="faq">
          <div className="section-head">
            <span className="eyebrow">Questions</span>
            <h2>A few things people ask</h2>
          </div>
          <div className="faq-list">
            {FAQ_ITEMS.map((item, index) => {
              const open = openFaq === index
              return (
                <div className={`faq-item ${open ? 'open' : ''}`} key={item.q}>
                  <button
                    type="button"
                    className="faq-question"
                    aria-expanded={open}
                    onClick={() => setOpenFaq(open ? null : index)}
                  >
                    <span>{item.q}</span>
                    <ChevronDownIcon size={19} />
                  </button>
                  {open ? <p className="faq-answer">{item.a}</p> : null}
                </div>
              )
            })}
          </div>
        </section>

        <section className="final-cta">
          <div className="shell final-cta-inner">
            <div>
              <span className="eyebrow eyebrow-light">
                <GlobeIcon size={15} /> There is a whole world online
              </span>
              <h2>Your next favorite conversation is one click away.</h2>
              <p>No plans, no profile, no pressure. Just press start.</p>
            </div>
            <button type="button" className="btn btn-primary btn-lg" onClick={scrollToStart}>
              <VideoIcon size={20} /> Start chatting <ArrowRightIcon size={18} />
            </button>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="shell footer-inner">
          <div className="footer-brand">
            <Logo size={30} />
            <p>Meet someone new, right now.</p>
            <span className="footer-badge">
              <span className="status-dot" /> {stats ? `${numberFormat.format(online)} online` : 'Connecting…'}
            </span>
          </div>
          <div className="footer-links">
            <div>
              <h4>Product</h4>
              <a href="#how">How it works</a>
              <a href="#safety">Safety</a>
              <a href="#faq">FAQ</a>
              <button type="button" onClick={scrollToStart}>
                Start a chat
              </button>
            </div>
            <div>
              <h4>Trust</h4>
              <button type="button" onClick={() => setLegal('rules')}>
                Community rules
              </button>
              <button type="button" onClick={() => setLegal('privacy')}>
                Privacy
              </button>
              <a href="mailto:hello@riplika.chat">Contact</a>
            </div>
          </div>
        </div>
        <div className="shell footer-bottom">
          <span>© 2026 Riplika. Be kind — you&apos;re talking to a person.</span>
          <span>Built with WebRTC · 18+ only</span>
        </div>
      </footer>

      {legal ? (
        <Modal
          title={legal === 'rules' ? 'Community rules' : 'Privacy at Riplika'}
          subtitle={legal === 'rules' ? 'Keep it friendly. Keep it legal. Keep it 18+.' : 'Less data, less drama.'}
          onClose={() => setLegal(null)}
        >
          <LegalContent kind={legal} />
        </Modal>
      ) : null}
    </div>
  )
}
