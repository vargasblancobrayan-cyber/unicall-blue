"use client";

import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useRef } from "react";

function moveMonth(value: string, amount: number) {
  const [year, month] = value.split("-").map(Number);
  const target = new Date(year, month - 1 + amount, 1);
  return `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, "0")}`;
}

function moveDay(value: string, amount: number) {
  const target = new Date(`${value}T12:00:00`);
  target.setDate(target.getDate() + amount);
  return `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, "0")}-${String(target.getDate()).padStart(2, "0")}`;
}

function openPicker(input: HTMLInputElement | null) {
  input?.showPicker?.();
  input?.focus();
}

export function MonthNavigator({ value, onChange, className = "" }: { value: string; onChange: (value: string) => void; className?: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const label = new Date(`${value}-01T12:00:00`).toLocaleDateString("es-CO", { month: "long", year: "numeric" });
  return (
    <div className={`inline-grid min-w-48 grid-cols-[40px_minmax(112px,1fr)_40px] overflow-hidden rounded-md border border-line bg-white shadow-sm ${className}`}>
      <button type="button" className="grid h-10 place-items-center text-muted transition hover:bg-brand-50 hover:text-brand-700" onClick={() => onChange(moveMonth(value, -1))} title="Mes anterior"><ChevronLeft size={17} /></button>
      <button type="button" className="relative flex h-10 items-center justify-center gap-2 border-x border-line px-2 text-sm font-black capitalize text-ink transition hover:bg-soft" onClick={() => openPicker(inputRef.current)}>
        <CalendarDays size={15} className="text-brand-600" /> {label}
        <input ref={inputRef} className="pointer-events-none absolute h-px w-px opacity-0" type="month" value={value} onChange={(event) => onChange(event.target.value)} tabIndex={-1} />
      </button>
      <button type="button" className="grid h-10 place-items-center text-muted transition hover:bg-brand-50 hover:text-brand-700" onClick={() => onChange(moveMonth(value, 1))} title="Mes siguiente"><ChevronRight size={17} /></button>
    </div>
  );
}

export function DayNavigator({ value, onChange, className = "" }: { value: string; onChange: (value: string) => void; className?: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const today = new Date();
  const todayValue = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const label = new Date(`${value}T12:00:00`).toLocaleDateString("es-CO", { weekday: "short", day: "numeric", month: "short" });
  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <div className="inline-grid min-w-52 grid-cols-[40px_minmax(120px,1fr)_40px] overflow-hidden rounded-md border border-line bg-white shadow-sm">
        <button type="button" className="grid h-10 place-items-center text-muted transition hover:bg-brand-50 hover:text-brand-700" onClick={() => onChange(moveDay(value, -1))} title="Dia anterior"><ChevronLeft size={17} /></button>
        <button type="button" className="relative flex h-10 items-center justify-center gap-2 border-x border-line px-2 text-sm font-black capitalize text-ink transition hover:bg-soft" onClick={() => openPicker(inputRef.current)}>
          <CalendarDays size={15} className="text-brand-600" /> {label}
          <input ref={inputRef} className="pointer-events-none absolute h-px w-px opacity-0" type="date" value={value} onChange={(event) => onChange(event.target.value)} tabIndex={-1} />
        </button>
        <button type="button" className="grid h-10 place-items-center text-muted transition hover:bg-brand-50 hover:text-brand-700" onClick={() => onChange(moveDay(value, 1))} title="Dia siguiente"><ChevronRight size={17} /></button>
      </div>
      {value !== todayValue ? <button type="button" className="rounded-md bg-brand-50 px-3 py-2 text-xs font-black text-brand-700" onClick={() => onChange(todayValue)}>Hoy</button> : null}
    </div>
  );
}
