export function MetricCard({
  label,
  value,
  helper
}: {
  label: string;
  value: string;
  helper?: string;
}) {
  return (
    <div className="card p-4">
      <p className="text-sm font-medium text-muted">{label}</p>
      <p className="mt-2 text-2xl font-bold text-ink">{value}</p>
      {helper ? <p className="mt-1 text-xs text-muted">{helper}</p> : null}
    </div>
  );
}
