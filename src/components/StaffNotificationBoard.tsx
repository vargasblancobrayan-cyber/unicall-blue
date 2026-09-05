"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Archive, BellRing, CalendarClock, CheckCircle2, Clock3, ExternalLink, FileText, FolderOpen, Gauge, History, PackageCheck, RefreshCw, RotateCcw, Search, ShieldCheck, Trash2, UserCheck } from "lucide-react";
import {
  loadNotifications,
  notificationHref,
  updateNotificationWorkStatus,
  UserNotification
} from "@/lib/notifications";
import { isPageVisible, shouldRefreshNow } from "@/lib/client-cache";
import { focusRefreshThrottleMs, notificationPollMs } from "@/lib/usage-controls";

type WorkStatus = "Nueva" | "En gestion" | "Resuelta";
type QuickFilter = "Todos" | "Revisar primero" | "Sin tomar" | "Con responsable" | "Informados";

function dateTime(value: string) {
  return new Date(value).toLocaleString("es-CO", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit"
  });
}

function ageInfo(value: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 60) return { label: minutes < 1 ? "Ahora" : `Hace ${minutes} min`, urgent: false };
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return { label: `Hace ${hours} h`, urgent: false };
  const days = Math.floor(hours / 24);
  return { label: `Hace ${days} d`, urgent: true };
}

function ageHours(value: string) {
  return Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 3600000));
}

function operationalSubStatus(item: UserNotification) {
  const status = (item.workStatus || "Nueva") as WorkStatus;
  const category = item.category || "Otros";
  const hours = ageHours(item.createdAt);

  if (status === "Resuelta") {
    return {
      label: "Ya informado",
      helper: item.handledBy ? `Cerrado por ${item.handledBy}` : "Gestion finalizada",
      badge: "bg-emerald-100 text-emerald-800",
      priority: 4
    };
  }
  if (status === "En gestion") {
    return {
      label: "En gestion",
      helper: item.handledBy ? `Responsable: ${item.handledBy}` : "Ya lo tomo Staff",
      badge: "bg-blue-100 text-blue-800",
      priority: 2
    };
  }
  if (category === "Certificado" && hours >= 72) {
    return {
      label: "Mas de 3 dias",
      helper: "Atender certificado pendiente",
      badge: "bg-red-100 text-red-700",
      priority: 0
    };
  }
  if (hours >= 24) {
    return {
      label: "Mas de 24 h",
      helper: "Revisar antes de que se acumule",
      badge: "bg-red-100 text-red-700",
      priority: 0
    };
  }
  return {
    label: "Sin tomar",
    helper: "Disponible para Staff/apoyo",
    badge: "bg-amber-100 text-amber-800",
    priority: 1
  };
}

function quickMatches(item: UserNotification, filter: QuickFilter) {
  const status = (item.workStatus || "Nueva") as WorkStatus;
  const sub = operationalSubStatus(item);
  if (filter === "Todos") return true;
  if (filter === "Revisar primero") return status !== "Resuelta" && sub.priority === 0;
  if (filter === "Sin tomar") return status === "Nueva" && sub.priority !== 0;
  if (filter === "Con responsable") return status === "En gestion";
  if (filter === "Informados") return status === "Resuelta";
  return true;
}

function statusStyle(status: WorkStatus) {
  if (status === "Resuelta") return "bg-emerald-100 text-emerald-800";
  if (status === "En gestion") return "bg-blue-100 text-blue-800";
  return "bg-amber-100 text-amber-800";
}

function statusOwnerCopy(status: WorkStatus) {
  if (status === "Resuelta") {
    return {
      label: "Lo resolvio",
      empty: "Resuelto por Staff",
      time: "Cerrado"
    };
  }
  if (status === "En gestion") {
    return {
      label: "Lo esta revisando",
      empty: "Tomado por Staff",
      time: "Tomado"
    };
  }
  return {
    label: "Sin asignar",
    empty: "Aun nadie lo ha tomado",
    time: "Creado"
  };
}

function categoryStyle(category: string) {
  if (category === "Rechazo oculto") return "bg-red-50 text-red-700";
  if (category === "Certificado") return "bg-emerald-50 text-emerald-700";
  if (category === "Productividad") return "bg-amber-50 text-amber-800";
  if (category === "Cambio de turno") return "bg-blue-50 text-blue-700";
  return "bg-slate-100 text-slate-700";
}

function categoryMeta(category: string) {
  if (category === "Rechazo oculto") return {
    label: "Rechazos ocultos",
    helper: "Aprobar, negar y dejar respuesta al operador.",
    icon: ShieldCheck,
    card: "border-red-100 bg-red-50 text-red-800",
    iconBox: "bg-red-100 text-red-700"
  };
  if (category === "Certificado") return {
    label: "Certificados",
    helper: "Solicitudes, documentos y entregas.",
    icon: FileText,
    card: "border-emerald-100 bg-emerald-50 text-emerald-800",
    iconBox: "bg-emerald-100 text-emerald-700"
  };
  if (category === "Productividad") return {
    label: "Productividad",
    helper: "Venta por hora, cheque bajo y alertas de resultado.",
    icon: Gauge,
    card: "border-amber-100 bg-amber-50 text-amber-900",
    iconBox: "bg-amber-100 text-amber-800"
  };
  if (category === "Cambio de turno") return {
    label: "Turnos",
    helper: "Cambios y solicitudes de programacion.",
    icon: CalendarClock,
    card: "border-blue-100 bg-blue-50 text-blue-800",
    iconBox: "bg-blue-100 text-blue-700"
  };
  if (category === "Ventas") return {
    label: "Ventas y pedidos",
    helper: "Pedidos reportados y pendientes de control.",
    icon: PackageCheck,
    card: "border-sky-100 bg-sky-50 text-sky-800",
    iconBox: "bg-sky-100 text-sky-700"
  };
  return {
    label: category || "Otros avisos",
    helper: "Avisos generales del sistema.",
    icon: FolderOpen,
    card: "border-slate-200 bg-white text-slate-800",
    iconBox: "bg-slate-100 text-slate-700"
  };
}

export function StaffNotificationBoard({ historyOnly = false }: { historyOnly?: boolean }) {
  const [items, setItems] = useState<UserNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Todas");
  const [status, setStatus] = useState(historyOnly ? "Resuelta" : "Activas");
  const [quickFilter, setQuickFilter] = useState<QuickFilter>(historyOnly ? "Informados" : "Todos");
  const [savingKey, setSavingKey] = useState("");
  const [message, setMessage] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await loadNotifications(100, "staff"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No fue posible actualizar los avisos.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = window.setInterval(() => {
      if (isPageVisible()) refresh();
    }, notificationPollMs());
    const onFocus = () => {
      if (isPageVisible() && shouldRefreshNow("unicall-blue:staff-board-focus", focusRefreshThrottleMs())) refresh();
    };
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);

  const counts = useMemo(() => ({
    new: items.filter((item) => item.workStatus === "Nueva").length,
    working: items.filter((item) => item.workStatus === "En gestion").length,
    resolved: items.filter((item) => item.workStatus === "Resuelta").length,
    urgent: items.filter((item) => (item.workStatus || "Nueva") !== "Resuelta" && operationalSubStatus(item).priority === 0).length,
    active: items.filter((item) => (item.workStatus || "Nueva") !== "Resuelta").length
  }), [items]);

  const categories = useMemo(() => ["Todas", ...Array.from(new Set(items.map((item) => item.category || "Otros")))], [items]);
  const categoryCounts = useMemo(() => {
    const values = new Map<string, number>();
    items
      .filter((item) => {
        if (historyOnly) return item.workStatus === "Resuelta";
        if (status === "Activas") return item.workStatus !== "Resuelta";
        if (status === "Todas") return true;
        return item.workStatus === status;
      })
      .forEach((item) => values.set(item.category || "Otros", (values.get(item.category || "Otros") || 0) + 1));
    return values;
  }, [historyOnly, items, status]);

  useEffect(() => {
    if (category !== "Todas" && !categoryCounts.has(category)) setCategory("Todas");
  }, [category, categoryCounts]);

  const filtered = useMemo(() => {
    const search = query.trim().toLowerCase();
    return items.filter((item) => {
      const itemStatus = item.workStatus || "Nueva";
      const statusMatches = historyOnly
        ? itemStatus === "Resuelta"
        : status === "Activas"
          ? itemStatus !== "Resuelta"
          : status === "Todas" || itemStatus === status;
      const categoryMatches = category === "Todas" || (item.category || "Otros") === category;
      const queryMatches = !search || `${item.title} ${item.message} ${item.category} ${item.handledBy}`.toLowerCase().includes(search);
      const quickFilterMatches = quickMatches(item, quickFilter);
      return statusMatches && categoryMatches && queryMatches && quickFilterMatches;
    }).sort((a, b) => historyOnly
      ? new Date(b.handledAt || b.createdAt).getTime() - new Date(a.handledAt || a.createdAt).getTime()
      : operationalSubStatus(a).priority - operationalSubStatus(b).priority || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }, [category, historyOnly, items, query, quickFilter, status]);

  async function updateStatus(item: UserNotification, action: "claim" | "resolve" | "reopen" | "delete") {
    if (!item.workflowKey) return;
    if (action === "delete" && item.workStatus !== "Resuelta") {
      setMessage("Solo puedes limpiar avisos que ya esten resueltos.");
      return;
    }
    setSavingKey(item.workflowKey);
    setMessage("");
    try {
      const updated = await updateNotificationWorkStatus(item, action);
      setItems((current) => action === "delete"
        ? current.filter((value) => value.workflowKey !== item.workflowKey)
        : current.map((value) => value.workflowKey === item.workflowKey ? { ...value, ...updated } : value)
      );
      setMessage(
        action === "claim"
          ? "Aviso tomado. El equipo ya puede ver quien lo esta gestionando."
          : action === "resolve"
            ? "Aviso resuelto y enviado al historial compartido."
            : action === "reopen"
              ? "Aviso reabierto en la bandeja activa."
              : "Aviso limpio de la bandeja. La accion quedo guardada en auditoria."
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No fue posible actualizar el aviso.");
    } finally {
      setSavingKey("");
    }
  }

  return (
    <section className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <button
          type="button"
          onClick={() => {
            if (historyOnly) return;
            setStatus("Activas");
            setQuickFilter("Revisar primero");
          }}
          className={`card border-l-4 border-l-red-500 p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md ${quickFilter === "Revisar primero" ? "ring-2 ring-red-300" : ""}`}
        >
          <div className="flex items-center justify-between"><p className="text-xs font-black uppercase text-muted">Revisar primero</p><AlertTriangle size={18} className="text-red-700" /></div>
          <p className="mt-2 text-3xl font-black text-red-700">{counts.urgent}</p>
          <p className="mt-1 text-xs font-semibold text-muted">Mas de 24 h o certificado +3 dias</p>
        </button>
        <button
          type="button"
          onClick={() => {
            if (historyOnly) return;
            setStatus("Nueva");
            setQuickFilter("Sin tomar");
          }}
          className={`card border-l-4 border-l-amber-500 p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md ${quickFilter === "Sin tomar" ? "ring-2 ring-amber-300" : ""}`}
        >
          <div className="flex items-center justify-between"><p className="text-xs font-black uppercase text-muted">Pendientes</p><BellRing size={18} className="text-amber-700" /></div>
          <p className="mt-2 text-3xl font-black text-amber-700">{counts.new}</p>
          <p className="mt-1 text-xs font-semibold text-muted">Sin responsable asignado</p>
        </button>
        <button
          type="button"
          onClick={() => {
            if (historyOnly) return;
            setStatus("En gestion");
            setQuickFilter("Con responsable");
          }}
          className={`card border-l-4 border-l-blue-500 p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md ${quickFilter === "Con responsable" ? "ring-2 ring-blue-300" : ""}`}
        >
          <div className="flex items-center justify-between"><p className="text-xs font-black uppercase text-muted">En gestion</p><UserCheck size={18} className="text-blue-700" /></div>
          <p className="mt-2 text-3xl font-black text-blue-700">{counts.working}</p>
          <p className="mt-1 text-xs font-semibold text-muted">Ya tiene Staff/apoyo</p>
        </button>
        <button
          type="button"
          onClick={() => {
            setStatus("Resuelta");
            setQuickFilter("Informados");
          }}
          className={`card border-l-4 border-l-emerald-500 p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md ${quickFilter === "Informados" ? "ring-2 ring-emerald-300" : ""}`}
        >
          <div className="flex items-center justify-between"><p className="text-xs font-black uppercase text-muted">Ya informado</p><CheckCircle2 size={18} className="text-emerald-700" /></div>
          <p className="mt-2 text-3xl font-black text-emerald-700">{counts.resolved}</p>
          <p className="mt-1 text-xs font-semibold text-muted">Resueltos e historial</p>
        </button>
      </div>

      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-4">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-md bg-brand-50 text-brand-700">{historyOnly ? <History size={20} /> : <Archive size={20} />}</span>
            <div>
              <h2 className="font-black text-ink">{historyOnly ? "Historial compartido" : "Bandeja compartida"}</h2>
              <p className="text-xs font-semibold text-muted">{filtered.length} avisos</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={refresh} disabled={loading}><RefreshCw size={16} className={loading ? "animate-spin" : ""} /> Actualizar</button>
            <Link className="btn-secondary" href={historyOnly ? "/staff-notifications" : "/staff-notification-history"}>
              {historyOnly ? <BellRing size={16} /> : <History size={16} />}
              {historyOnly ? "Bandeja activa" : "Ver historial"}
            </Link>
          </div>
        </div>

        <div className="grid gap-3 border-b border-line bg-soft p-4 md:grid-cols-2 xl:grid-cols-4">
          {[...categoryCounts.entries()].map(([value, count]) => {
            const meta = categoryMeta(value);
            const Icon = meta.icon;
            return (
              <button
                key={value}
                type="button"
                onClick={() => setCategory(value)}
                className={`rounded-md border p-3 text-left transition hover:-translate-y-0.5 hover:shadow-md ${meta.card} ${category === value ? "ring-2 ring-brand-300" : ""}`}
              >
                <span className="flex items-start justify-between gap-3">
                  <span className="flex min-w-0 gap-3">
                    <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-md ${meta.iconBox}`}>
                      <Icon size={19} />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-black">{meta.label}</span>
                      <span className="mt-1 block text-xs leading-4 opacity-80">{meta.helper}</span>
                    </span>
                  </span>
                  <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-sm font-black shadow-sm">{count}</span>
                </span>
              </button>
            );
          })}
          {!categoryCounts.size ? (
            <div className="rounded-md border border-line bg-white p-4 text-sm font-semibold text-muted">Sin carpetas pendientes para revisar.</div>
          ) : null}
        </div>

        <div className="grid gap-3 border-b border-line bg-soft p-4 lg:grid-cols-[1fr_220px_190px_190px]">
          <label className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={16} />
            <input className="input-base pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar aviso u operador" />
          </label>
          <select className="input-base" value={category} onChange={(event) => setCategory(event.target.value)}>
            {categories.map((value) => <option key={value}>{value}</option>)}
          </select>
          <select className="input-base" value={quickFilter} onChange={(event) => setQuickFilter(event.target.value as QuickFilter)}>
            <option>Todos</option>
            <option>Revisar primero</option>
            <option>Sin tomar</option>
            <option>Con responsable</option>
            <option>Informados</option>
          </select>
          {!historyOnly ? (
            <select className="input-base" value={status} onChange={(event) => setStatus(event.target.value)}>
              <option>Activas</option>
              <option>Nueva</option>
              <option>En gestion</option>
              <option>Resuelta</option>
              <option>Todas</option>
            </select>
          ) : <div className="input-base flex items-center font-bold text-emerald-700">Solo resueltas</div>}
        </div>

        <div className="flex flex-wrap gap-2 border-b border-line px-4 py-3">
          <button type="button" onClick={() => { setCategory("Todas"); setQuickFilter(historyOnly ? "Informados" : "Todos"); }} className={`rounded-md px-3 py-1.5 text-xs font-black ${category === "Todas" && (quickFilter === "Todos" || quickFilter === "Informados") ? "bg-brand-600 text-white" : "bg-soft text-muted"}`}>
            Todos {Array.from(categoryCounts.values()).reduce((total, value) => total + value, 0)}
          </button>
          <button type="button" onClick={() => setQuickFilter("Revisar primero")} className={`rounded-md px-3 py-1.5 text-xs font-black ${quickFilter === "Revisar primero" ? "bg-red-600 text-white" : "bg-red-50 text-red-700"}`}>
            Mas de 24 h {items.filter((item) => (item.workStatus || "Nueva") !== "Resuelta" && operationalSubStatus(item).priority === 0).length}
          </button>
          <button type="button" onClick={() => setQuickFilter("Con responsable")} className={`rounded-md px-3 py-1.5 text-xs font-black ${quickFilter === "Con responsable" ? "bg-blue-600 text-white" : "bg-blue-50 text-blue-700"}`}>
            Con responsable {counts.working}
          </button>
          {[...categoryCounts.entries()].map(([value, count]) => (
            <button key={value} type="button" onClick={() => setCategory(value)} className={`rounded-md px-3 py-1.5 text-xs font-black ${category === value ? "bg-brand-600 text-white" : categoryStyle(value)}`}>
              {value} {count}
            </button>
          ))}
        </div>

        {message ? <div className="border-b border-line bg-brand-50 px-4 py-3 text-sm font-bold text-brand-800">{message}</div> : null}

        <div className="divide-y divide-line">
          {filtered.map((item) => {
            const itemStatus = (item.workStatus || "Nueva") as WorkStatus;
            const age = ageInfo(item.createdAt);
            return (
              <article key={item.workflowKey || item.id} className={`grid gap-3 border-l-4 p-4 transition hover:bg-soft/70 lg:grid-cols-[170px_1fr_190px_230px] lg:items-center ${itemStatus === "Nueva" ? "border-l-amber-500" : itemStatus === "En gestion" ? "border-l-blue-500" : "border-l-emerald-500"}`}>
                <div>
                  <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-black ${categoryStyle(item.category || "Otros")}`}>{item.category || "Otros"}</span>
                  <p className={`mt-2 flex items-center gap-1 text-xs font-black ${age.urgent && itemStatus !== "Resuelta" ? "text-red-700" : "text-muted"}`}><Clock3 size={13} /> {age.label}</p>
                  <p className="mt-0.5 text-xs text-muted">{dateTime(item.createdAt)}</p>
                </div>
                <div className="min-w-0">
                  <p className="font-black text-ink">{item.title}</p>
                  <p className="mt-1 text-sm leading-5 text-muted">{item.message}</p>
                </div>
                <div>
                  <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-black ${statusStyle(itemStatus)}`}>{itemStatus}</span>
                  <span className={`ml-2 inline-flex rounded-full px-2.5 py-1 text-xs font-black ${operationalSubStatus(item).badge}`}>{operationalSubStatus(item).label}</span>
                  <div className="mt-2 rounded-md border border-line bg-white px-3 py-2">
                    <p className="text-[11px] font-black uppercase text-muted">{statusOwnerCopy(itemStatus).label}</p>
                    <p className="mt-0.5 text-sm font-black text-ink">{item.handledBy || statusOwnerCopy(itemStatus).empty}</p>
                    <p className="mt-0.5 text-xs text-muted">{statusOwnerCopy(itemStatus).time}: {dateTime(item.handledAt || item.createdAt)}</p>
                    <p className="mt-1 text-xs font-semibold text-muted">{operationalSubStatus(item).helper}</p>
                  </div>
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  <Link className="btn-secondary px-3 py-2" href={notificationHref(item.title, "staff")}><ExternalLink size={15} /> Abrir</Link>
                  {itemStatus === "Nueva" ? <button className="btn-primary px-3 py-2" disabled={savingKey === item.workflowKey} onClick={() => updateStatus(item, "claim")}><UserCheck size={15} /> {savingKey === item.workflowKey ? "Tomando..." : "Tomar"}</button> : null}
                  {itemStatus === "En gestion" ? <button className="btn-primary bg-emerald-600 px-3 py-2 hover:bg-emerald-700" disabled={savingKey === item.workflowKey} onClick={() => updateStatus(item, "resolve")}><CheckCircle2 size={15} /> {savingKey === item.workflowKey ? "Guardando..." : "Resolver"}</button> : null}
                  {itemStatus !== "Nueva" ? <button className="btn-secondary px-3 py-2" disabled={savingKey === item.workflowKey} onClick={() => updateStatus(item, "reopen")}><RotateCcw size={15} /> Reabrir</button> : null}
                  {itemStatus === "Resuelta" ? <button className="btn-secondary border-red-200 px-3 py-2 text-red-700 hover:bg-red-50" disabled={savingKey === item.workflowKey} onClick={() => updateStatus(item, "delete")}><Trash2 size={15} /> Limpiar</button> : null}
                </div>
              </article>
            );
          })}
          {!loading && !filtered.length ? (
            <div className="p-10 text-center">
              <CheckCircle2 className="mx-auto text-emerald-600" size={28} />
              <p className="mt-2 font-black text-ink">Sin avisos en esta vista</p>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
