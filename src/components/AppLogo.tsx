export function AppLogo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <svg
        viewBox="0 0 64 64"
        width={compact ? 34 : 40}
        height={compact ? 34 : 40}
        aria-hidden="true"
        className="shrink-0 drop-shadow-sm"
      >
        <defs>
          <linearGradient id="ub-bg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#2563eb" />
            <stop offset="100%" stopColor="#1d4ed8" />
          </linearGradient>
          <linearGradient id="ub-headset" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="100%" stopColor="#bfdbfe" />
          </linearGradient>
        </defs>
        <rect x="2" y="2" width="60" height="60" rx="15" fill="url(#ub-bg)" />
        <path
          d="M15 30 a17 13 0 0 1 34 0"
          fill="none"
          stroke="url(#ub-headset)"
          strokeWidth="5"
          strokeLinecap="round"
        />
        <path d="M15 30 v7 a6 6 0 0 0 12 0 v-7" fill="url(#ub-headset)" />
        <path d="M37 30 v7 a6 6 0 0 0 12 0 v-7" fill="url(#ub-headset)" />
        <path d="M26 43 v3 a6 6 0 0 0 12 0 v-3" fill="none" stroke="url(#ub-headset)" strokeWidth="4" strokeLinecap="round" />
      </svg>
      {!compact ? (
        <span className="text-lg font-bold tracking-tight text-ink">
          Unicall <span className="text-brand-600">Blue</span>
        </span>
      ) : null}
    </div>
  );
}
