export function AppLogo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <svg
        viewBox="0 0 64 64"
        width={compact ? 34 : 40}
        height={compact ? 34 : 40}
        aria-hidden="true"
        className="shrink-0 drop-shadow-[0_6px_20px_rgba(29,78,216,0.5)]"
      >
        <defs>
          <linearGradient id="ub-bg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#38bdf8" />
            <stop offset="35%" stopColor="#2563eb" />
            <stop offset="75%" stopColor="#1d4ed8" />
            <stop offset="100%" stopColor="#1e1b4b" />
          </linearGradient>
          <radialGradient id="ub-gloss" cx="0.25" cy="0.12" r="0.95">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.55" />
            <stop offset="40%" stopColor="#ffffff" stopOpacity="0.1" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="ub-ring" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#7dd3fc" />
            <stop offset="100%" stopColor="#a5b4fc" />
          </linearGradient>
          <linearGradient id="ub-u" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="100%" stopColor="#dbeafe" />
          </linearGradient>
          <linearGradient id="ub-eq" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#67e8f9" />
            <stop offset="100%" stopColor="#38bdf8" />
          </linearGradient>
        </defs>
        {/* Fondo redondeado */}
        <rect x="2" y="2" width="60" height="60" rx="19" fill="url(#ub-bg)" />
        <rect x="2" y="2" width="60" height="60" rx="19" fill="url(#ub-gloss)" />
        {/* Anillo interior decorativo */}
        <circle cx="32" cy="32" r="27.5" fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="1.2" />
        {/* Ondas de sonido concéntricas (llamada) */}
        <path d="M45 20 a17 16 0 0 1 0 24" fill="none" stroke="url(#ub-ring)" strokeWidth="2.2" strokeLinecap="round" opacity="0.9" />
        <path d="M50 16.5 a22 21 0 0 1 0 31" fill="none" stroke="url(#ub-ring)" strokeWidth="2.2" strokeLinecap="round" opacity="0.55" />
        {/* Monograma U */}
        <path
          d="M23 19 v13 a9 9 0 0 0 18 0 v-13"
          fill="none"
          stroke="url(#ub-u)"
          strokeWidth="6"
          strokeLinecap="round"
        />
        {/* Ecualizador de sonido dentro de la U */}
        <rect x="25.5" y="31" width="3.2" height="7" rx="1.6" fill="url(#ub-eq)" />
        <rect x="30.4" y="27" width="3.2" height="11" rx="1.6" fill="url(#ub-eq)" />
        <rect x="35.3" y="29.5" width="3.2" height="8.5" rx="1.6" fill="url(#ub-eq)" />
      </svg>
      {!compact ? (
        <span className="text-lg font-bold tracking-tight leading-none text-ink">
          Unicall&nbsp;<span className="bg-gradient-to-r from-brand-600 via-brand-500 to-cyan-500 bg-clip-text text-transparent">Blue</span>
        </span>
      ) : null}
    </div>
  );
}
