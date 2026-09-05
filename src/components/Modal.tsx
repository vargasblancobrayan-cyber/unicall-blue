"use client";

import { X } from "lucide-react";

export function Modal({
  title,
  open,
  onClose,
  children
}: {
  title: string;
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/40 p-3 sm:items-center sm:p-4">
      <div className="card flex max-h-[calc(100vh-1.5rem)] w-full max-w-lg flex-col overflow-hidden sm:max-h-[calc(100vh-2rem)]">
        <div className="flex shrink-0 items-center justify-between border-b border-line bg-white px-5 py-4">
          <h2 className="font-bold text-ink">{title}</h2>
          <button className="rounded-md p-1 hover:bg-soft" onClick={onClose} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>
        <div className="overflow-y-auto p-4 sm:p-5">{children}</div>
      </div>
    </div>
  );
}
