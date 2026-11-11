interface IconProps {
  size?: number
  className?: string
}

function base(size: number, className?: string) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.9,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className,
    'aria-hidden': true,
  }
}

export function VideoIcon({ size = 20, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <rect x="2.5" y="6" width="12.5" height="12" rx="3.5" />
      <path d="M15 10.5l6-3.5v10l-6-3.5" />
    </svg>
  )
}

export function VideoOffIcon({ size = 20, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M15 10.5l6-3.5v10l-4-2.3" />
      <path d="M12.8 6H6a3.5 3.5 0 0 0-3.5 3.5v2.3" />
      <path d="M2.5 15a3.5 3.5 0 0 0 3.5 3h5" />
      <path d="M3 3l18 18" />
    </svg>
  )
}

export function MicIcon({ size = 20, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <rect x="9" y="2.5" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0" />
      <path d="M12 17.5V21" />
      <path d="M8.5 21h7" />
    </svg>
  )
}

export function MicOffIcon({ size = 20, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M9 9v1.5a3 3 0 0 0 4.6 2.6" />
      <path d="M15 10.8V5.5a3 3 0 0 0-5.4-1.8" />
      <path d="M5.5 11a6.5 6.5 0 0 0 10.2 5.4" />
      <path d="M18.5 11a6.5 6.5 0 0 1-.5 2.5" />
      <path d="M12 17.5V21" />
      <path d="M8.5 21h7" />
      <path d="M3 3l18 18" />
    </svg>
  )
}

export function SkipIcon({ size = 20, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M4.5 5.4c0-.8.9-1.3 1.6-.9l9 5.8c.6.4.6 1.3 0 1.7l-9 5.8c-.7.4-1.6-.1-1.6-.9V5.4z" />
      <rect x="17.5" y="4.5" width="2.6" height="15" rx="1.3" />
    </svg>
  )
}

export function PhoneDownIcon({ size = 20, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M3.2 14.1c5.1-4.2 12.5-4.2 17.6 0l-2.5 3.2c-.6.7-1.6.9-2.4.3l-2.1-1.6a2.3 2.3 0 0 1-.9-1.8v-1.1a12 12 0 0 0-3.8 0v1.1c0 .7-.3 1.4-.9 1.8l-2.1 1.6c-.8.6-1.8.4-2.4-.3l-2.5-3.2z" />
    </svg>
  )
}

export function ChatIcon({ size = 20, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M21 11.5a8.2 8.2 0 0 1-8.5 8.2 8.7 8.7 0 0 1-3.2-.6L4 21l1.5-4.2A8.2 8.2 0 0 1 12.5 3a8.2 8.2 0 0 1 8.5 8.5z" />
      <path d="M8.5 10.5h7M8.5 14h4.5" />
    </svg>
  )
}

export function SendIcon({ size = 20, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M21 3L10.5 13.5" />
      <path d="M21 3l-6.5 18-4-8-8-4L21 3z" />
    </svg>
  )
}

export function FlagIcon({ size = 18, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M5 21V4" />
      <path d="M5 5c4-2.6 8 2.6 14 0v8c-6 2.6-10-2.6-14 0" />
    </svg>
  )
}

export function ShieldIcon({ size = 20, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M12 3l7 2.8V11c0 4.6-3 8-7 10-4-2-7-5.4-7-10V5.8L12 3z" />
      <path d="M9 11.5l2 2 4-4.5" />
    </svg>
  )
}

export function GlobeIcon({ size = 20, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3.5 9.5h17M3.5 14.5h17" />
      <path d="M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18z" />
    </svg>
  )
}

export function UsersIcon({ size = 20, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M3 20a6 6 0 0 1 12 0" />
      <path d="M16 5.3a3.5 3.5 0 0 1 0 5.4" />
      <path d="M17.5 14.2A6 6 0 0 1 21 20" />
    </svg>
  )
}

export function LockIcon({ size = 20, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <rect x="4.5" y="10" width="15" height="11" rx="3" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
      <path d="M12 14.5v2" />
    </svg>
  )
}

export function CheckIcon({ size = 20, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M4.5 12.5l5 5 10-11" />
    </svg>
  )
}

export function ChevronDownIcon({ size = 18, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  )
}

export function ArrowRightIcon({ size = 20, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M4 12h16" />
      <path d="M14 6l6 6-6 6" />
    </svg>
  )
}

export function SparkleIcon({ size = 18, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z" />
      <path d="M19 16l.9 2.1L22 19l-2.1.9L19 22l-.9-2.1L16 19l2.1-.9L19 16z" />
    </svg>
  )
}

export function RefreshIcon({ size = 20, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M20 11a8 8 0 1 0-2.3 6.3" />
      <path d="M20 4v7h-7" />
    </svg>
  )
}

export function XIcon({ size = 20, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M5 5l14 14M19 5L5 19" />
    </svg>
  )
}

export function AlertIcon({ size = 20, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M12 3.5L21 20H3l9-16.5z" />
      <path d="M12 9.5v4.5" />
      <path d="M12 17.2v.1" />
    </svg>
  )
}

export function Logo({ size = 34 }: { size?: number }) {
  return (
    <span className="logo">
      <span className="logo-mark" style={{ width: size, height: size }}>
        <svg viewBox="0 0 40 40" fill="none" aria-hidden>
          <path
            d="M10 7.5h15a6.5 6.5 0 0 1 6.5 6.5v8a6.5 6.5 0 0 1-6.5 6.5h-8.3L10 34V7.5z"
            fill="#fff"
          />
          <circle cx="20.5" cy="17.5" r="4.6" fill="url(#logo-lens)" />
          <circle cx="22.2" cy="15.8" r="1.35" fill="#fff" fillOpacity=".9" />
          <defs>
            <linearGradient id="logo-lens" x1="16" y1="13" x2="25" y2="22" gradientUnits="userSpaceOnUse">
              <stop stopColor="#14c3c8" />
              <stop offset="1" stopColor="#07848c" />
            </linearGradient>
          </defs>
        </svg>
      </span>
      <span className="logo-word">
        riplika<span className="logo-dot">.</span>
      </span>
    </span>
  )
}
