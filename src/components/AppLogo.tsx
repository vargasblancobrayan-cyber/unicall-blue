export function AppLogo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <svg
        viewBox="0 0 64 64"
        width={compact ? 34 : 40}
        height={compact ? 34 : 40}
        aria-hidden="true"
        className="shrink-0 drop-shadow-[0_4px_16px_rgba(29,78,216,0.45)]"
      >
        <defs>
          <linearGradient id="ub-bg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#60a5fa" />
            <stop offset="50%" stopColor="#2563eb" />
            <stop offset="100%" stopColor="#1e3a8a" />
          </linearGradient>
          <radialGradient id="ub-gloss" cx="0.25" cy="0.15" r="0.9">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.5" />
            <stop offset="45%" stopColor="#ffffff" stopOpacity="0.08" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="ub-u" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="100%" stopColor="#bfdbfe" />
          </linearGradient>
          <linearGradient id="ub-eq" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#7dd3fc" />
            <stop offset="100%" stopColor="#38bdf8" />
          </linearGradient>
        </defs>
        {/* Fondo redondeado */}
        <rect x="2" y="2" width="60" height="60" rx="18" fill="url(#ub-bg)" />
        <rect x="2" y="2" width="60" height="60" rx="18" fill="url(#ub-gloss)" />
        <rect x="2.5" y="2.5" width="59" height="59" rx="17.5" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1" />
        {/* Monograma U */}
        <path
          d="M22 18 v14 a10 10 0 0 0 20 0 v-14"
          fill="none"
          stroke="url(#ub-u)"
          strokeWidth="6"
          strokeLinecap="round"
        />
        {/* Ecualizador de sonido dentro de la U */}
        <rect x="25" y="30" width="3.4" height="8" rx="1.7" fill="url(#ub-eq)" />
        <rect x="30.3" y="26" width="3.4" height="12" rx="1.7" fill="url(#ub-eq)" />
        <rect x="35.6" y="29" width="3.4" height="9" rx="1.7" fill="url(#ub-eq)" />
      </svg>
      {!compact ? (
        <span className="text-lg font-bold tracking-tight leading-none text-ink">
          Unicall&nbsp;<span className="bg-gradient-to-r from-brand-600 via-brand-500 to-cyan-600 bg-clip-text text-transparent">Blue</span>
        </span>
      ) : null}
    </div>
  );
}
