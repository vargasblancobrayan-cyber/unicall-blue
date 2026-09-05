export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded-lg bg-slate-200/70 ${className}`}
    />
  );
}

export function SkeletonCard() {
  return (
    <div className="card p-4">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-3 h-7 w-16" />
      <Skeleton className="mt-2 h-3 w-32" />
    </div>
  );
}

export function SkeletonTable({ rows = 5, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-panel shadow-panel">
      <div className="flex items-center justify-between gap-3 border-b border-line p-5">
        <div className="space-y-2">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-5 w-48" />
        </div>
        <Skeleton className="h-9 w-28" />
      </div>
      <div className="divide-y divide-line">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-5 py-4">
            {Array.from({ length: cols }).map((_, j) => (
              <Skeleton key={j} className={`h-3.5 ${j === 0 ? "w-24" : "flex-1"}`} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}