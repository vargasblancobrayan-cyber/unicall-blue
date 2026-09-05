import { Inbox } from "lucide-react";

export function EmptyState({
  title = "Sin datos",
  description,
  action
}: {
  title?: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-2xl border border-line bg-soft text-muted">
        <Inbox size={22} strokeWidth={1.5} />
      </span>
      <div>
        <p className="font-semibold text-ink">{title}</p>
        {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}