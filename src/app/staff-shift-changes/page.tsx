"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRightLeft, CalendarDays, CheckCircle2, Search, Shuffle, XCircle } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { MonthNavigator } from "@/components/PeriodNavigator";
import { Modal } from "@/components/Modal";
import { loadStaffShiftChangeRequests, reviewShiftChangeRequest } from "@/lib/cloud-schedules";
import { loadCurrentProfile } from "@/lib/cloud-shifts";
import {
  ShiftChangeRequest,
  readStoredShiftCalendarSettings,
  readStoredShiftChangeRequests,
  writeStoredShiftCalendarSettings,
  writeStoredShiftChangeRequests
} from "@/lib/records";
import { generateTwoByTwoSchedule, toDateInputValue } from "@/lib/schedule";

export default function StaffShiftChangesPage() {
  const [month, setMonth] = useState("2026-06");
  const [firstWorkDay, setFirstWorkDay] = useState("2026-06-03");
  const [requests, setRequests] = useState<ShiftChangeRequest[]>([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"Pendiente" | "Aprobado" | "Denegado" | "Todos">("Pendiente");
  const [savingId, setSavingId] = useState("");
  const [message, setMessage] = useState("");
  const [selectedDate, setSelectedDate] = useState(toDateInputValue(new Date()));
  const [staffUser, setStaffUser] = useState("");
  const [staffId, setStaffId] = useState("");
  const [operatorFilter, setOperatorFilter] = useState("Todos");
  const [denialTarget, setDenialTarget] = useState<ShiftChangeRequest | null>(null);
  const [denialReason, setDenialReason] = useState("");
  const [denialError, setDenialError] = useState("");

  const deductionNote = "Nota: si el operador no cumple el turno aprobado o no respeta el cambio acordado, Staff podra aplicar la deduccion o novedad operativa correspondiente.";

  const formatRequestDate = (date: string) => {
    if (!date) return "sin fecha";
    return new Date(`${date}T00:00:00`).toLocaleDateString("es-CO", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric"
    });
  };

  const shortRequestDate = (date: string) => {
    if (!date) return "-";
    return new Date(`${date}T00:00:00`).toLocaleDateString("es-CO", {
      weekday: "short",
      day: "numeric",
      month: "short"
    });
  };

  const requesterLabel = (request: ShiftChangeRequest) => (
    request.operatorUsername || request.operator || "Operador"
  );

  const requestAgeLabel = (request: ShiftChangeRequest) => {
    const createdAt = new Date(request.createdAt).getTime();
    if (!Number.isFinite(createdAt)) return "Reciente";
    const hours = Math.max(0, Math.floor((Date.now() - createdAt) / 36e5));
    if (hours < 1) return "Hace menos de 1h";
    if (hours < 24) return `Hace ${hours}h`;
    return `Hace ${Math.floor(hours / 24)}d`;
  };

  const requestStatusTone = (status: ShiftChangeRequest["status"]) =>
    status === "Aprobado"
      ? "bg-emerald-100 text-emerald-700"
      : status === "Denegado"
        ? "bg-red-100 text-red-700"
        : "bg-amber-100 text-amber-800";

  const teamTone = (color: ShiftChangeRequest["color"]) =>
    color === "green"
      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
      : "border-blue-200 bg-blue-50 text-blue-900";

  useEffect(() => {
    const settings = readStoredShiftCalendarSettings();
    setMonth(settings.scheduleMonth);
    setFirstWorkDay(settings.firstWorkDay);
    setSelectedDate(toDateInputValue(new Date()).slice(0, 7) === settings.scheduleMonth ? toDateInputValue(new Date()) : `${settings.scheduleMonth}-01`);
    loadCurrentProfile()
      .then((profile) => {
        setStaffUser(profile?.username || profile?.fullName || "Staff");
        setStaffId(profile?.id || "");
      })
      .catch(() => setStaffUser("Staff"));
  }, []);

  useEffect(() => {
    const local = readStoredShiftChangeRequests().filter((request) => request.workDate.slice(0, 7) === month);
    setRequests(local);
    loadStaffShiftChangeRequests(month)
      .then((cloud) => setRequests(cloud.length ? cloud : local))
      .catch(() => setRequests(local));
  }, [month]);

  useEffect(() => {
    writeStoredShiftCalendarSettings({ scheduleMonth: month, firstWorkDay });
  }, [firstWorkDay, month]);

  const stats = useMemo(() => {
    const pendingRequests = requests.filter((item) => item.status === "Pendiente");
    return {
      pending: pendingRequests.length,
      approved: requests.filter((item) => item.status === "Aprobado").length,
      denied: requests.filter((item) => item.status === "Denegado").length,
      urgent: pendingRequests.filter((item) => {
        const createdAt = new Date(item.createdAt).getTime();
        return Number.isFinite(createdAt) && Date.now() - createdAt > 24 * 60 * 60 * 1000;
      }).length,
      incomplete: pendingRequests.filter((item) => !item.returnDate).length
    };
  }, [requests]);

  const filtered = useMemo(() => {
    const value = query.trim().toLowerCase();
    return requests
      .filter((item) => statusFilter === "Todos" || item.status === statusFilter)
      .filter((item) => [item.operator, item.operatorUsername, item.replacementUser, item.reason, item.workDate].join(" ").toLowerCase().includes(value))
      .sort((a, b) => {
        if (a.status === "Pendiente" && b.status !== "Pendiente") return -1;
        if (a.status !== "Pendiente" && b.status === "Pendiente") return 1;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
  }, [query, requests, statusFilter]);

  const nextPendingRequest = useMemo(
    () => filtered.find((item) => item.status === "Pendiente") || requests.find((item) => item.status === "Pendiente") || null,
    [filtered, requests]
  );

  const operatorOptions = useMemo(() => {
    const values = new Set<string>();
    requests.forEach((request) => {
      const requester = request.operatorUsername || request.operator;
      if (requester) values.add(requester);
      if (request.replacementUser) values.add(request.replacementUser);
    });
    return ["Todos", ...Array.from(values).sort((a, b) => a.localeCompare(b))];
  }, [requests]);

  const calendarRequests = useMemo(() => {
    if (operatorFilter === "Todos") return requests;
    return requests.filter((request) => [request.operatorUsername, request.operator, request.replacementUser].includes(operatorFilter));
  }, [operatorFilter, requests]);

  const calendarDays = useMemo(() => generateTwoByTwoSchedule(month, firstWorkDay), [firstWorkDay, month]);

  const approvedByDate = useMemo(() => {
    const values = new Map<string, ShiftChangeRequest[]>();
    calendarRequests.filter((request) => request.status === "Aprobado").forEach((request) => {
      values.set(request.workDate, [...(values.get(request.workDate) || []), request]);
      if (request.returnDate) values.set(request.returnDate, [...(values.get(request.returnDate) || []), request]);
    });
    return values;
  }, [calendarRequests]);

  const selectedChanges = approvedByDate.get(selectedDate) || [];
  const selectedDay = calendarDays.find((day) => day.date === selectedDate);

  async function review(request: ShiftChangeRequest, status: "Aprobado" | "Denegado", customReason = "") {
    const cleanReason = customReason.trim();
    const visibleStaffNote =
      status === "Aprobado"
        ? `Aprobado: ${request.replacementUser} cubre el ${request.workDate} y ${request.operatorUsername || request.operator} devuelve el ${request.returnDate || "dia acordado"}. ${deductionNote}`
        : `Denegado: ${cleanReason || `no se autoriza el intercambio del ${request.workDate}`}.`;
    const cloudStaffNote = `Devuelve: ${request.returnDate || request.workDate}\n${visibleStaffNote}`;
    const nextRequest = { ...request, status, staffNote: visibleStaffNote, reviewedBy: staffUser, updatedAt: new Date().toISOString() };
    setSavingId(request.id);
    try {
      await reviewShiftChangeRequest(request.id, status, cloudStaffNote, staffId || undefined);
    } catch {
      // Respaldo local si la tabla central aun no esta aplicada.
    }
    const nextRequests = [nextRequest, ...requests.filter((item) => item.id !== request.id)];
    setRequests(nextRequests);
    writeStoredShiftChangeRequests([nextRequest, ...readStoredShiftChangeRequests().filter((item) => item.id !== request.id)]);
    setSavingId("");
    setMessage(`${status}: ${request.operatorUsername || request.operator} ya fue notificado. Responsable: ${staffUser}.`);
  }

  function openDenial(request: ShiftChangeRequest) {
    setDenialTarget(request);
    setDenialReason("");
    setDenialError("");
  }

  async function confirmDenial() {
    if (!denialTarget) return;
    if (denialReason.trim().length < 8) {
      setDenialError("Escribe un motivo claro para que el operador entienda por que se nego.");
      return;
    }
    await review(denialTarget, "Denegado", denialReason);
    setDenialTarget(null);
    setDenialReason("");
    setDenialError("");
  }

  return (
    <AppLayout role="staff" title="Cambios de turno">
      <div className="flex flex-col">
      <section className="order-1 grid gap-3 lg:grid-cols-5">
        <button className={`card p-4 text-left transition hover:-translate-y-0.5 hover:border-amber-300 hover:shadow-md ${statusFilter === "Pendiente" ? "ring-2 ring-amber-300" : ""}`} onClick={() => setStatusFilter("Pendiente")}>
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-black uppercase text-muted">Por decidir</p>
            <span className="grid h-9 w-9 place-items-center rounded-md bg-amber-50 text-amber-700"><ArrowRightLeft size={18} /></span>
          </div>
          <p className="mt-3 text-3xl font-black text-amber-700">{stats.pending}</p>
          <p className="text-sm font-semibold text-muted">Cola activa</p>
        </button>
        <button className="card p-4 text-left transition hover:-translate-y-0.5 hover:border-red-300 hover:shadow-md" onClick={() => setStatusFilter("Pendiente")}>
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-black uppercase text-muted">Mas de 24h</p>
            <span className="grid h-9 w-9 place-items-center rounded-md bg-red-50 text-red-700"><AlertTriangle size={18} /></span>
          </div>
          <p className="mt-3 text-3xl font-black text-red-700">{stats.urgent}</p>
          <p className="text-sm font-semibold text-muted">Prioridad alta</p>
        </button>
        <button className="card p-4 text-left transition hover:-translate-y-0.5 hover:border-violet-300 hover:shadow-md" onClick={() => setStatusFilter("Pendiente")}>
          <p className="text-xs font-black uppercase text-muted">Sin devolucion</p>
          <p className="mt-3 text-3xl font-black text-violet-700">{stats.incomplete}</p>
          <p className="text-sm font-semibold text-muted">Completar antes de aprobar</p>
        </button>
        <button className={`card p-4 text-left transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md ${statusFilter === "Aprobado" ? "ring-2 ring-emerald-300" : ""}`} onClick={() => setStatusFilter("Aprobado")}>
          <p className="text-xs font-black uppercase text-muted">Aprobados</p>
          <p className="mt-3 text-3xl font-black text-emerald-700">{stats.approved}</p>
          <p className="text-sm font-semibold text-muted">Ya modifican calendario</p>
        </button>
        <button className={`card p-4 text-left transition hover:-translate-y-0.5 hover:border-red-300 hover:shadow-md ${statusFilter === "Denegado" ? "ring-2 ring-red-300" : ""}`} onClick={() => setStatusFilter("Denegado")}>
          <p className="text-xs font-black uppercase text-muted">Denegados</p>
          <p className="mt-3 text-3xl font-black text-red-700">{stats.denied}</p>
          <p className="text-sm font-semibold text-muted">No cambian turno</p>
        </button>
      </section>

      {nextPendingRequest ? (
        <section className="card order-2 mt-5 overflow-hidden border-amber-200 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-5 py-4">
            <p className="text-xs font-black uppercase text-amber-800">Siguiente caso recomendado</p>
            <h2 className="text-lg font-black text-ink">Revisar intercambio de {requesterLabel(nextPendingRequest)}</h2>
            <p className="mt-1 text-sm font-semibold text-amber-900">
              {requestAgeLabel(nextPendingRequest)} - {nextPendingRequest.returnDate ? "Tiene dia de devolucion" : "Falta confirmar dia de devolucion"}
            </p>
          </div>
          <div className="grid gap-4 p-5 lg:grid-cols-[1fr_auto]">
            <div className="grid gap-3 md:grid-cols-4">
              <div className="rounded-md border border-red-100 bg-red-50 p-4">
                <p className="text-xs font-black uppercase text-red-700">Entrega turno</p>
                <p className="mt-1 text-sm font-black text-ink">{requesterLabel(nextPendingRequest)}</p>
                <p className="mt-1 text-sm font-semibold text-red-800">{formatRequestDate(nextPendingRequest.workDate)}</p>
              </div>
              <div className={`rounded-md border p-4 ${teamTone(nextPendingRequest.color)}`}>
                <p className="text-xs font-black uppercase">Lo cubre</p>
                <p className="mt-1 text-sm font-black">{nextPendingRequest.replacementUser}</p>
                <p className="mt-1 text-sm font-semibold">{nextPendingRequest.color === "green" ? "Equipo Green" : "Equipo Blue"}</p>
              </div>
              <div className="rounded-md border border-violet-100 bg-violet-50 p-4">
                <p className="text-xs font-black uppercase text-violet-700">Devuelve turno</p>
                <p className="mt-1 text-sm font-black text-ink">{requesterLabel(nextPendingRequest)}</p>
                <p className="mt-1 text-sm font-semibold text-violet-800">{nextPendingRequest.returnDate ? shortRequestDate(nextPendingRequest.returnDate) : "Pendiente"}</p>
              </div>
              <div className="rounded-md border border-line bg-white p-4">
                <p className="text-xs font-black uppercase text-muted">Motivo</p>
                <p className="mt-1 text-sm font-black text-ink">{nextPendingRequest.reason}</p>
              </div>
            </div>
            <div className="grid min-w-48 gap-2">
              <button className="btn-primary justify-center bg-emerald-600 hover:bg-emerald-700" disabled={savingId === nextPendingRequest.id} onClick={() => review(nextPendingRequest, "Aprobado")}><CheckCircle2 size={16} /> Aprobar</button>
              <button className="btn-secondary justify-center text-red-700" disabled={savingId === nextPendingRequest.id} onClick={() => openDenial(nextPendingRequest)}><XCircle size={16} /> Denegar</button>
            </div>
          </div>
          <div className="border-t border-amber-100 bg-amber-50/70 px-5 py-3 text-sm font-semibold text-amber-900">
            {deductionNote}
          </div>
        </section>
      ) : null}

      <section className="card order-4 mt-5 overflow-hidden">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line p-5">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-md bg-brand-50 text-brand-700"><CalendarDays size={22} /></span>
            <div>
              <h2 className="text-lg font-black text-ink">Calendario de intercambios</h2>
              <p className="text-sm text-muted">Cada intercambio aprobado marca el dia cubierto y el dia devuelto.</p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <label>
              <span className="mb-1 block text-sm font-semibold text-ink">Ver operador</span>
              <select className="input-base" value={operatorFilter} onChange={(event) => setOperatorFilter(event.target.value)}>
                {operatorOptions.map((operator) => <option key={operator}>{operator}</option>)}
              </select>
            </label>
            <div><span className="mb-1 block text-sm font-semibold text-ink">Mes</span><MonthNavigator value={month} onChange={setMonth} /></div>
            <label>
              <span className="mb-1 block text-sm font-semibold text-ink">Primer dia trabajado</span>
              <input className="input-base" type="date" value={firstWorkDay} onChange={(event) => setFirstWorkDay(event.target.value)} />
            </label>
          </div>
        </div>
        <div className="grid lg:grid-cols-[1fr_280px]">
          <div className="grid grid-cols-7 gap-px bg-line p-px">
            {["Lun", "Mar", "Mie", "Jue", "Vie", "Sab", "Dom"].map((dayName) => (
              <div key={dayName} className="bg-soft p-1 text-center text-[10px] font-bold uppercase text-muted sm:p-2 sm:text-xs">{dayName}</div>
            ))}
            {Array.from({ length: (new Date(`${month}-01T00:00:00`).getDay() + 6) % 7 }).map((_, index) => (
              <div key={`empty-${index}`} className="min-h-12 bg-slate-100 sm:min-h-20" />
            ))}
            {calendarDays.map((day) => {
              const changes = approvedByDate.get(day.date) || [];
              const isSelected = selectedDate === day.date;
              return (
                <button
                  key={day.date}
                  className={`min-h-12 p-1 text-left transition sm:min-h-24 sm:p-2 ${isSelected ? "ring-2 ring-brand-600" : ""} ${changes.length ? "bg-white text-ink" : day.isWorkDay ? "bg-brand-600 text-white" : "bg-white text-muted"}`}
                  onClick={() => setSelectedDate(day.date)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-base font-black sm:text-lg">{day.day}</span>
                    <span className="hidden text-xs font-bold uppercase sm:block">{day.weekday}</span>
                  </div>
                  <p className="mt-1 hidden text-xs font-black sm:block">{day.isWorkDay ? "Trabajamos" : "Descanso"}</p>
                  {changes.slice(0, 1).map((change) => (
                    <p key={`${change.id}-${day.date}`} className={`mt-0.5 hidden truncate rounded px-1.5 py-0.5 text-[11px] font-black text-white sm:mt-1 sm:block ${change.color === "green" ? "bg-emerald-600" : "bg-blue-600"}`}>
                      {change.returnDate === day.date
                        ? `${change.operatorUsername || change.operator} devuelve`
                        : `${change.replacementUser} cubre a ${change.operatorUsername || change.operator}`}
                    </p>
                  ))}
                  {changes.length >0 ? <p className="mt-0.5 text-[10px] font-black sm:mt-1 sm:text-[11px]">{changes.length}+</p> : null}
                </button>
              );
            })}
          </div>
          <aside className="border-t border-line bg-soft p-5 lg:border-l lg:border-t-0">
            <p className="text-xs font-black uppercase text-muted">Dia seleccionado</p>
            <h3 className="mt-1 text-lg font-black text-ink">
              {selectedDay ? new Date(`${selectedDay.date}T00:00:00`).toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" }) : "Selecciona un dia"}
            </h3>
            <p className="mt-1 text-sm font-semibold text-muted">{selectedDay?.isWorkDay ? "Dia programado" : "Dia de descanso"}</p>
            <div className="mt-4 space-y-2">
              {selectedChanges.length ? selectedChanges.map((change) => (
                <div key={`selected-${change.id}`} className="rounded-md border border-line bg-white p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-black text-ink">{change.operator || change.operatorUsername || "Operador"}</p>
                    <span className={`rounded-full px-2 py-1 text-xs font-black ${change.color === "green" ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"}`}>{change.color === "green" ? "Green" : "Blue"}</span>
                  </div>
                  <p className="mt-1 text-sm text-muted">Solicita: <b>{change.operatorUsername || change.operator || "Sin usuario"}</b></p>
                  <p className="text-sm text-muted">Lo cubre: <b>{change.replacementUser}</b></p>
                  <p className="text-sm text-muted">Dia cubierto: <b>{change.workDate}</b></p>
                  <p className="text-sm text-muted">Dia devuelto: <b>{change.returnDate || "-"}</b></p>
                  <p className="text-sm text-muted">Motivo: {change.reason}</p>
                  {change.reviewedBy ? <p className="mt-2 text-xs font-bold text-muted">Aprobado por {change.reviewedBy}</p> : null}
                </div>
              )) : (
                <div className="rounded-md border border-line bg-white p-4 text-sm font-semibold text-muted">Sin cambios aprobados para este dia.</div>
              )}
            </div>
          </aside>
        </div>
      </section>

      <section className="card order-3 mt-5 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-5">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-md bg-brand-50 text-brand-700"><Shuffle size={22} /></span>
            <div>
              <h2 className="text-lg font-black text-ink">Control de intercambios Blue / Green</h2>
              <p className="text-sm text-muted">Aprueba solo si el reemplazo cubre el turno y queda claro el dia que se devuelve.</p>
            </div>
          </div>
          <MonthNavigator value={month} onChange={setMonth} />
        </div>
        <div className="grid gap-3 border-b border-line bg-soft p-4 lg:grid-cols-[1fr_220px]">
          <label className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={15} /><input className="input-base pl-9" placeholder="Buscar operador, reemplazo o motivo" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
          <select className="input-base" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}>
            <option>Pendiente</option>
            <option>Aprobado</option>
            <option>Denegado</option>
            <option>Todos</option>
          </select>
        </div>
        {message ? <div className="bg-emerald-50 px-5 py-3 text-sm font-black text-emerald-800">{message}</div> : null}
        <div className="grid gap-3 p-5 lg:grid-cols-2">
          {filtered.length ? filtered.map((request) => (
            <div key={request.id} className={`rounded-md border p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${request.status === "Pendiente" ? "border-amber-200 bg-amber-50/60" : "border-line bg-white"}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase text-muted">Solicita el intercambio</p>
                  <h3 className="text-xl font-black text-ink">{request.operatorUsername || request.operator || "Operador"}</h3>
                  <p className="text-sm font-semibold text-muted">{request.operator || "Nombre no registrado"}</p>
                  <p className="mt-1 text-sm font-semibold text-muted">
                    Turno del {new Date(`${request.workDate}T00:00:00`).toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                  </p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-black ${requestStatusTone(request.status)}`}>{request.status}</span>
              </div>
              <div className="mt-3 rounded-md border border-brand-100 bg-brand-50 p-3">
                <p className="text-xs font-black uppercase text-brand-700">Intercambio solicitado</p>
                <p className="mt-1 text-sm font-semibold text-ink">
                  <b>{request.operatorUsername || request.operator || "Operador"}</b> no puede trabajar el <b>{new Date(`${request.workDate}T00:00:00`).toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" })}</b>. Lo cubre <b>{request.replacementUser}</b> y devuelve el <b>{request.returnDate ? new Date(`${request.returnDate}T00:00:00`).toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" }) : "dia pendiente"}</b>.
                </p>
              </div>
              <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-900">
                {deductionNote}
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <div className="rounded-md border border-red-100 bg-red-50 p-3"><p className="text-xs font-bold uppercase text-red-700">Dia que entrega</p><p className="font-black text-ink">{new Date(`${request.workDate}T00:00:00`).toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" })}</p><p className="text-xs font-semibold text-red-700">Lo cubre {request.replacementUser}</p></div>
                <div className="rounded-md border border-violet-100 bg-violet-50 p-3"><p className="text-xs font-bold uppercase text-violet-700">Dia que devuelve</p><p className="font-black text-ink">{request.returnDate ? new Date(`${request.returnDate}T00:00:00`).toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" }) : "Sin definir"}</p><p className="text-xs font-semibold text-violet-700">{request.operatorUsername || request.operator} cubre a {request.replacementUser}</p></div>
                <div className={`rounded-md border p-3 ${teamTone(request.color)}`}><p className="text-xs font-bold uppercase">Equipo del reemplazo</p><p className="font-black">{request.color === "green" ? "Green" : "Blue"}</p></div>
                <div className="rounded-md border border-line bg-white p-3"><p className="text-xs font-bold uppercase text-muted">Motivo</p><p className="font-black text-ink">{request.reason}</p></div>
              </div>
              {request.status === "Pendiente" ? (
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <button className="btn-primary justify-center bg-emerald-600 hover:bg-emerald-700" disabled={savingId === request.id} onClick={() => review(request, "Aprobado")}><CheckCircle2 size={16} /> Aprobar intercambio</button>
                  <button className="btn-secondary justify-center text-red-700" disabled={savingId === request.id} onClick={() => openDenial(request)}><XCircle size={16} /> Denegar</button>
                </div>
              ) : (
                <div className="mt-3 rounded-md bg-soft p-3 text-sm font-semibold text-muted">
                  <p>{request.staffNote || "Decision registrada."}</p>
                  <p className="mt-1 text-xs font-black text-ink">Gestionado por: {request.reviewedBy || "Staff"}</p>
                </div>
              )}
            </div>
          )) : (
            <div className="rounded-md border border-line bg-soft p-6 text-center text-sm font-semibold text-muted lg:col-span-2">No hay solicitudes con estos filtros.</div>
          )}
        </div>
      </section>
      </div>
      <Modal
        title="Motivo para denegar"
        open={Boolean(denialTarget)}
        onClose={() => {
          setDenialTarget(null);
          setDenialReason("");
          setDenialError("");
        }}
      >
        <div className="space-y-4">
          {denialTarget ? (
            <div className="rounded-md border border-line bg-soft p-4">
              <p className="text-xs font-black uppercase text-muted">Intercambio solicitado</p>
              <p className="mt-1 font-black text-ink">{denialTarget.operatorUsername || denialTarget.operator} cambia con {denialTarget.replacementUser}</p>
              <p className="mt-1 text-sm text-muted">Turno: {formatRequestDate(denialTarget.workDate)}</p>
            </div>
          ) : null}
          <label className="block">
            <span className="mb-1 block text-sm font-bold text-ink">Nota para el operador</span>
            <textarea
              className="input-base min-h-28"
              placeholder="Ejemplo: no se autoriza porque el reemplazo no cubre el horario completo."
              value={denialReason}
              onChange={(event) => setDenialReason(event.target.value)}
            />
          </label>
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-900">
            Esta nota se enviara al operador y quedara en el historial del cambio.
          </div>
          {denialError ? <p className="rounded-md bg-red-50 p-3 text-sm font-bold text-red-700">{denialError}</p> : null}
          <div className="grid gap-2 sm:grid-cols-2">
            <button className="btn-secondary justify-center" onClick={() => setDenialTarget(null)}>Cancelar</button>
            <button className="btn-primary justify-center bg-red-600 hover:bg-red-700" disabled={Boolean(denialTarget && savingId === denialTarget.id)} onClick={confirmDenial}>
              <XCircle size={16} /> Denegar y notificar
            </button>
          </div>
        </div>
      </Modal>
    </AppLayout>
  );
}
