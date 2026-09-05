export function MetricCard({
  label,
  value,
  helper,
  icon
}: {
  label: string;
  value: string;
  helper?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="card group relative overflow-hidden p-4 transition duration-200 ease-out hover:-translate-y-0.5 hover:shadow-panel-lg">
      <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-brand-50 opacity-0 transition duration-300 group-hover:opacity-100" />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-muted">{label}</p>
          <p className="mt-2 text-2xl font-bold tracking-tight text-ink">{value}</p>
          {helper ? <p className="mt-1 text-xs text-muted">{helper}</p> : null}
        </div>
        {icon ? (
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600 transition duration-200 group-hover:bg-brand-100">
            {icon}
          </span>
        ) : null}
      </div>
    </div>
  );
}
