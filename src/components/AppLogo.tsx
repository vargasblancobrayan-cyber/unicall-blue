export function AppLogo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <svg
        viewBox="0 0 64 64"
        width={compact ? 34 : 40}
        height={compact ? 34 : 40}
        aria-hidden="true"
        className="shrink-0 drop-shadow-[0_2px_8px_rgba(29,78,216,0.35)]"
      >
        <defs>
          <linearGradient id="ub-bg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#2563eb" />
            <stop offset="55%" stopColor="#1d4ed8" />
            <stop offset="100%" stopColor="#172e8a" />
          </linearGradient>
          <linearGradient id="ub-ring" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#60a5fa" />
            <stop offset="100%" stopColor="#2563eb" />
          </linearGradient>
          <linearGradient id="ub-headset" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="100%" stopColor="#dbeafe" />
          </linearGradient>
        </defs>
        <rect x="2" y="2" width="60" height="60" rx="16" fill="url(#ub-bg)" />
        <rect x="2.75" y="2.75" width="58.5" height="58.5" rx="15.25" fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="1.5" />
        <path
          d="M14.5 30.5 a17.5 13.5 0 0 1 35 0"
          fill="none"
          stroke="url(#ub-headset)"
          strokeWidth="5.5"
          strokeLinecap="round"
        />
        <path d="M14.5 31 v6.5 a6.25 6.25 0 0 0 12.5 0 v-6.5" fill="url(#ub-headset)" />
        <path d="M37 31 v6.5 a6.25 6.25 0 0 0 12.5 0 v-6.5" fill="url(#ub-headset)" />
        <path d="M26 44 v2.5 a6 6 0 0 0 12 0 v-2.5" fill="none" stroke="url(#ub-headset)" strokeWidth="4" strokeLinecap="round" />
        <path d="M41.5 23.5 a8.5 8.5 0 0 1 0 4" fill="none" stroke="url(#ub-ring)" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
      {!compact ? (
        <span className="text-lg font-bold tracking-tight leading-none text-ink">
          Unicall&nbsp;<span className="bg-gradient-to-r from-brand-600 to-cyan-600 bg-clip-text text-transparent">Blue</span>
        </span>
      ) : null}
    </div>
  );
}
