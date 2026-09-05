export function AppLogo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <svg
        viewBox="0 0 64 64"
        width={compact ? 34 : 40}
        height={compact ? 34 : 40}
        aria-hidden="true"
        className="shrink-0 drop-shadow-[0_4px_14px_rgba(29,78,216,0.4)]"
      >
        <defs>
          <linearGradient id="ub-bg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#3b82f6" />
            <stop offset="45%" stopColor="#1d4ed8" />
            <stop offset="100%" stopColor="#1e1b4b" />
          </linearGradient>
          <radialGradient id="ub-gloss" cx="0.22" cy="0.12" r="0.85">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.4" />
            <stop offset="55%" stopColor="#ffffff" stopOpacity="0.06" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="ub-headset" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="100%" stopColor="#c7d2fe" />
          </linearGradient>
          <linearGradient id="ub-wave" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#93c5fd" />
            <stop offset="100%" stopColor="#e0e7ff" />
          </linearGradient>
        </defs>
        <rect x="2" y="2" width="60" height="60" rx="17" fill="url(#ub-bg)" />
        <rect x="2" y="2" width="60" height="60" rx="17" fill="url(#ub-gloss)" />
        <rect x="2.5" y="2.5" width="59" height="59" rx="16.5" fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="1" />
        {/* Banda en forma de U (la U de Unicall) */}
        <path
          d="M17 32 a15 11.5 0 0 1 30 0"
          fill="none"
          stroke="url(#ub-headset)"
          strokeWidth="5.5"
          strokeLinecap="round"
        />
        {/* Copas del auricular */}
        <path d="M17 32.5 v5.5 a6 6 0 0 0 12 0 v-5.5" fill="url(#ub-headset)" />
        <path d="M35 32.5 v5.5 a6 6 0 0 0 12 0 v-5.5" fill="url(#ub-headset)" />
        {/* Micrófono con punto de señal */}
        <path d="M26 43.5 v2 a6 6 0 0 0 12 0 v-2" fill="none" stroke="url(#ub-headset)" strokeWidth="3.6" strokeLinecap="round" />
        <circle cx="32" cy="50.5" r="1.8" fill="#93c5fd" />
        {/* Ondas de sonido emergiendo de la copa derecha */}
        <path d="M47 21 a9.5 9.5 0 0 1 0 7" fill="none" stroke="url(#ub-wave)" strokeWidth="2.4" strokeLinecap="round" />
        <path d="M52 17.5 a14 14 0 0 1 0 12" fill="none" stroke="url(#ub-wave)" strokeWidth="2.4" strokeLinecap="round" opacity="0.75" />
      </svg>
      {!compact ? (
        <span className="text-lg font-bold tracking-tight leading-none text-ink">
          Unicall&nbsp;<span className="bg-gradient-to-r from-brand-600 via-brand-500 to-cyan-600 bg-clip-text text-transparent">Blue</span>
        </span>
      ) : null}
    </div>
  );
}
