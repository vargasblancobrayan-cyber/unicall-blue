"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Bell,
  BellRing,
  CheckCheck,
  CheckCircle2,
  ExternalLink,
  FileText,
  FolderOpen,
  Gauge,
  Info,
  ShieldCheck
  ,Trash2
} from "lucide-react";
import {
  deleteOperatorNotifications,
  loadNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  notificationHref,
  updateNotificationWorkStatus,
  UserNotification
} from "@/lib/notifications";
import { isPageVisible, shouldRefreshNow } from "@/lib/client-cache";
import { focusRefreshThrottleMs, notificationPollMs } from "@/lib/usage-controls";

function relativeDate(value: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 1) return "Ahora";
  if (minutes < 60) return `Hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Hace ${hours} h`;
  return new Date(value).toLocaleDateString("es-CO", { day: "numeric", month: "short" });
}

function notificationTone(item: UserNotification) {
  const text = `${item.title} ${item.message}`.toLowerCase();
  const isHiddenRejection = text.includes("rechazo oculto");
  const isNotApproved = text.includes("no aprobado");
  const isApproved = text.includes("aprobado") && !isNotApproved;

  if (isApproved || text.includes("entregado") || text.includes("listo") || text.includes("solucionada")) {
    return {
      label: "Resuelto",
      icon: CheckCircle2,
      row: !item.readAt ? "border-l-emerald-500 bg-emerald-50" : "border-l-emerald-200 bg-white",
      dot: "bg-emerald-600",
      badge: "bg-emerald-100 text-emerald-700",
      iconColor: "text-emerald-700"
    };
  }

  if (
    text.includes("productividad") ||
    text.includes("venta por hora") ||
    text.includes("cheque bajo") ||
    isNotApproved ||
    (text.includes("rechazo") && !isHiddenRejection) ||
    text.includes("eliminado") ||
    text.includes("eliminada")
  ) {
    return {
      label: "Revisar",
      icon: AlertTriangle,
      row: !item.readAt ? "border-l-red-500 bg-red-50" : "border-l-red-200 bg-white",
      dot: "bg-red-600",
      badge: "bg-red-100 text-red-700",
      iconColor: "text-red-700"
    };
  }

  if (text.includes("pendiente") || text.includes("seguimiento") || text.includes("promete")) {
    return {
      label: "Pendiente",
      icon: BellRing,
      row: !item.readAt ? "border-l-amber-500 bg-amber-50" : "border-l-amber-200 bg-white",
      dot: "bg-amber-500",
      badge: "bg-amber-100 text-amber-800",
      iconColor: "text-amber-800"
    };
  }

  return {
    label: "Aviso",
    icon: Info,
    row: !item.readAt ? "border-l-brand-500 bg-brand-50" : "border-l-slate-200 bg-white",
    dot: !item.readAt ? "bg-brand-600" : "bg-slate-300",
    badge: "bg-brand-50 text-brand-700",
    iconColor: "text-brand-700"
  };
}

function notificationWorkType(item: UserNotification, role: "operator" | "staff") {
  const text = `${item.title} ${item.message}`.toLowerCase();
  if (text.includes("rechazo oculto")) {
    return {
      group: "Rechazo oculto",
      instruction: role === "staff" ? "Tomar decision: aprobar o no aprobar." : "Revisar respuesta de staff.",
      action: role === "staff" ? "Gestionar rechazo" : "Ver respuesta",
      icon: ShieldCheck
    };
  }
  if (text.includes("certificado")) {
    return {
      group: "Certificado",
      instruction: role === "staff" ? "Responder solicitud o adjuntar documento." : "Revisar estado del certificado.",
      action: role === "staff" ? "Gestionar certificado" : "Ver certificado",
      icon: FileText
    };
  }
  if (text.includes("productividad") || text.includes("venta por hora") || text.includes("cheque bajo")) {
    return {
      group: "Productividad",
      instruction: role === "staff" ? "Revisar operador con bajo resultado." : "Ajustar gestion del dia.",
      action: "Ver estadistica",
      icon: Gauge
    };
  }
  if (text.includes("cambio de turno")) {
    return {
      group: "Cambio de turno",
      instruction: role === "staff" ? "Aprobar o denegar la solicitud." : "Revisar la respuesta de Staff.",
      action: "Ver cambio",
      icon: BellRing
    };
  }
  if (text.includes("pendiente") && (text.includes("vencido") || text.includes("mas de"))) {
    return {
      group: "Pendiente vencido",
      instruction: role === "staff" ? "Atender el caso atrasado." : "Revisar el estado pendiente.",
      action: "Atender ahora",
      icon: AlertTriangle
    };
  }
  return {
    group: "Aviso",
    instruction: "Revisar informacion.",
    action: "Abrir",
    icon: Info
  };
}

function notificationFolder(item: UserNotification, role: "operator" | "staff") {
  const text = `${item.title} ${item.message}`.toLowerCase();
  if (text.includes("rechazo oculto")) {
    return {
      key: "hidden-rejections",
      title: "Rechazos ocultos",
      description: role === "staff" ? "Casos para aprobar o negar." : "Respuestas de Staff sobre tus solicitudes.",
      href: role === "staff" ? "/staff-hidden-rejections" : "/operator-hidden-rejections",
      icon: ShieldCheck,
      card: "border-red-100 bg-red-50 text-red-800",
      iconBox: "bg-red-100 text-red-700"
    };
  }
  if (text.includes("certificado")) {
    return {
      key: "certificates",
      title: "Certificados",
      description: role === "staff" ? "Solicitudes y entregas documentales." : "Estados y documentos enviados.",
      href: role === "staff" ? "/staff-certificates" : "/operator-certificates",
      icon: FileText,
      card: "border-emerald-100 bg-emerald-50 text-emerald-800",
      iconBox: "bg-emerald-100 text-emerald-700"
    };
  }
  if (text.includes("productividad") || text.includes("venta por hora") || text.includes("cheque bajo")) {
    return {
      key: "performance",
      title: "Productividad",
      description: role === "staff" ? "Alertas de venta/hora o cheque bajo." : "Indicadores que debes corregir hoy.",
      href: role === "staff" ? "/staff-performance" : "/operator-dashboard",
      icon: Gauge,
      card: "border-amber-100 bg-amber-50 text-amber-900",
      iconBox: "bg-amber-100 text-amber-800"
    };
  }
  if (text.includes("cambio de turno")) {
    return {
      key: "workday",
      title: "Cambios de turno",
      description: role === "staff" ? "Solicitudes para aprobar o denegar." : "Respuestas a tus solicitudes de cambio.",
      href: role === "staff" ? "/staff-shift-changes" : "/operator-workday",
      icon: BellRing,
      card: "border-blue-100 bg-blue-50 text-blue-800",
      iconBox: "bg-blue-100 text-blue-700"
    };
  }
  if (text.includes("pendiente") && (text.includes("vencido") || text.includes("mas de"))) {
    return {
      key: "overdue",
      title: "Pendientes vencidos",
      description: role === "staff" ? "Casos atrasados que requieren atencion." : "Solicitudes pendientes que debes revisar.",
      href: role === "staff" ? "/staff-certificates" : "/operator-certificates",
      icon: AlertTriangle,
      card: "border-amber-100 bg-amber-50 text-amber-900",
      iconBox: "bg-amber-100 text-amber-800"
    };
  }
  return {
    key: "other",
    title: "Otros avisos",
    description: "Avisos generales del sistema.",
    href: role === "staff" ? "/staff-notifications" : "/operator-notifications",
    icon: Info,
    card: "border-slate-200 bg-white text-slate-800",
    iconBox: "bg-slate-100 text-slate-700"
  };
}

export function NotificationCenter({ role, full = false }: { role: "operator" | "staff"; full?: boolean }) {
  const [items, setItems] = useState<UserNotification[]>([]);
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<UserNotification | null>(null);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("unsupported");
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleteMessage, setDeleteMessage] = useState("");
  const knownIds = useRef<Set<string>>(new Set());
  const initialized = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const nextItems = await loadNotifications(full ? 35 : 10, role);
      if (initialized.current) {
        const newest = nextItems.find((item) => !knownIds.current.has(item.id) && (role !== "staff" || item.workStatus === "Nueva"));
        if (newest) {
          setToast(newest);
          window.setTimeout(() => setToast(null), 6500);
          if (typeof Notification !== "undefined" && Notification.permission === "granted") {
            new Notification(newest.title, { body: newest.message, tag: newest.id });
          }
        }
      }
      knownIds.current = new Set(nextItems.map((item) => item.id));
      initialized.current = true;
      setItems(nextItems);
    } catch {
      // Keep the last successful state during short network interruptions.
    }
  }, [full, role]);

  useEffect(() => {
    setPermission(typeof Notification === "undefined" ? "unsupported" : Notification.permission);
    refresh();
    const timer = window.setInterval(() => {
      if (isPageVisible()) refresh();
    }, notificationPollMs());
    const onFocus = () => {
      if (isPageVisible() && shouldRefreshNow(`unicall-blue:notif-focus:${role}:${full ? "full" : "mini"}`, focusRefreshThrottleMs())) refresh();
    };
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);

  const unread = items.filter((item) => role === "staff" ? item.workStatus === "Nueva" : !item.readAt).length;
  const urgent = items.filter((item) => !item.readAt && notificationTone(item).label === "Revisar").length;
  const pending = items.filter((item) => !item.readAt && notificationTone(item).label === "Pendiente").length;
  const resolved = items.filter((item) => item.readAt || notificationTone(item).label === "Resuelto").length;
  const usefulUnread = items.filter((item) => role === "staff" ? item.workStatus === "Nueva" : !item.readAt);
  const activeItems = full && role === "operator" ? usefulUnread : full ? items : usefulUnread;
  const historyItems = items.filter((item) => item.readAt).slice(0, 12);
  const nextAction = usefulUnread[0] || (!full ? items[0] || null : null);
  const centerHref = role === "staff" ? "/staff-notifications" : "/operator-notifications";
  const folders = useMemo(() => {
    const grouped = new Map<string, {
      meta: ReturnType<typeof notificationFolder>;
      items: UserNotification[];
      urgent: number;
      latest: UserNotification;
    }>();
    activeItems.forEach((item) => {
      const meta = notificationFolder(item, role);
      const current = grouped.get(meta.key);
      const urgentItem = notificationTone(item).label === "Revisar" ? 1 : 0;
      if (current) {
        current.items.push(item);
        current.urgent += urgentItem;
        if (new Date(item.createdAt).getTime() > new Date(current.latest.createdAt).getTime()) current.latest = item;
      } else {
        grouped.set(meta.key, { meta, items: [item], urgent: urgentItem, latest: item });
      }
    });
    return [...grouped.values()].sort((a, b) => b.urgent - a.urgent || b.items.length - a.items.length);
  }, [activeItems, role]);

  async function readOne(item: UserNotification) {
    if (role === "staff" && item.workStatus === "Nueva") {
      const updated = await updateNotificationWorkStatus(item, "claim");
      setItems((current) => current.map((value) => value.id === item.id ? { ...value, ...updated, workStatus: "En gestion" } : value));
      return;
    }
    if (!item.readAt) {
      await markNotificationRead(item.id);
      setItems((current) => {
        if (!full) return current.filter((value) => value.id !== item.id);
        return current.map((value) => value.id === item.id ? { ...value, readAt: new Date().toISOString() } : value);
      });
    }
  }

  async function readAll() {
    await markAllNotificationsRead();
    setItems((current) => {
      if (!full) return [];
      return current.map((item) => ({ ...item, readAt: item.readAt || new Date().toISOString() }));
    });
  }

  async function enableBrowserAlerts() {
    if (typeof Notification === "undefined") return;
    const nextPermission = await Notification.requestPermission();
    setPermission(nextPermission);
  }

  async function deleteHistoryItem(id: string) {
    if (deleteConfirm !== id) {
      setDeleteConfirm(id);
      return;
    }
    try {
      await deleteOperatorNotifications(id);
      setItems((current) => current.filter((item) => item.id !== id));
      setDeleteMessage("Aviso eliminado del historial.");
      setDeleteConfirm("");
    } catch (error) {
      setDeleteMessage(error instanceof Error ? error.message : "No fue posible borrar el aviso.");
    }
  }

  async function clearHistory() {
    if (deleteConfirm !== "all") {
      setDeleteConfirm("all");
      return;
    }
    try {
      await deleteOperatorNotifications();
      setItems((current) => current.filter((item) => !item.readAt));
      setDeleteMessage("Historial atendido eliminado.");
      setDeleteConfirm("");
    } catch (error) {
      setDeleteMessage(error instanceof Error ? error.message : "No fue posible limpiar el historial.");
    }
  }

  const renderItem = (item: UserNotification) => {
    const tone = notificationTone(item);
    const workType = notificationWorkType(item, role);
    const Icon = workType.icon;
    return (
      <Link
        href={notificationHref(item.title, role)}
        key={item.id}
        onClick={() => readOne(item)}
        className={`block border-l-4 p-4 transition hover:bg-soft ${tone.row} ${full ? "rounded-md border border-line" : "border-b border-b-line"}`}
      >
        <div className="flex items-start gap-3">
          <span className={`mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-md ${tone.badge}`}>
            <Icon size={19} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-start justify-between gap-2">
              <span className="flex min-w-0 items-center gap-2">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${tone.dot}`} />
                <strong className="truncate text-sm text-ink">{workType.group}</strong>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${tone.badge}`}>{tone.label}</span>
              </span>
              <span className="shrink-0 text-xs text-muted">{relativeDate(item.createdAt)}</span>
            </span>
            <span className="mt-1 block text-sm font-bold leading-5 text-ink">{item.title}</span>
            <span className="mt-1 block text-sm leading-5 text-muted">{item.message}</span>
            <span className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold text-ink">{workType.instruction}</span>
              <span className="inline-flex items-center gap-1 rounded-md bg-white px-2.5 py-1 text-xs font-bold text-brand-700 shadow-sm">
                {workType.action}
                <ExternalLink size={12} />
              </span>
            </span>
          </span>
        </div>
      </Link>
    );
  };

  const list = (
    <div className={full ? "space-y-3" : "max-h-[420px] overflow-y-auto"}>
      {activeItems.length ? activeItems.map(renderItem) : (
        <div className="flex items-center gap-3 p-5">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-emerald-50 text-emerald-700"><ShieldCheck size={20} /></span>
          <div>
            <p className="font-bold text-ink">Sin tareas pendientes</p>
            <p className="text-sm text-muted">Las nuevas solicitudes y avisos importantes apareceran aqui.</p>
          </div>
        </div>
      )}
    </div>
  );

  const folderGrid = folders.length ? (
    <div className={`grid gap-3 ${full ? "md:grid-cols-2 xl:grid-cols-3" : ""}`}>
      {folders.map((folder) => {
        const Icon = folder.meta.icon;
        const inProgress = folder.items.filter((item) => item.workStatus === "En gestion").length;
        const waiting = folder.items.filter((item) => item.workStatus === "Nueva" || !item.readAt).length;
        return (
          <Link
            key={folder.meta.key}
            href={folder.meta.href}
            onClick={() => setOpen(false)}
            className={`rounded-md border p-3 transition hover:-translate-y-0.5 hover:shadow-md ${folder.meta.card}`}
          >
            <span className="flex items-start justify-between gap-3">
              <span className="flex min-w-0 gap-3">
                <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-md ${folder.meta.iconBox}`}>
                  <Icon size={19} />
                </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-black">{folder.meta.title}</span>
                    <span className="mt-1 block text-xs leading-4 opacity-80">{folder.meta.description}</span>
                    <span className="mt-2 flex flex-wrap gap-1 text-[11px] font-black">
                      <span className="rounded-full bg-white/80 px-2 py-0.5">Nuevo {waiting}</span>
                      {role === "staff" ? <span className="rounded-full bg-white/80 px-2 py-0.5">Gestion {inProgress}</span> : null}
                    </span>
                    <span className="mt-2 block text-xs font-bold opacity-80">Ultimo: {relativeDate(folder.latest.createdAt)}</span>
                  </span>
                </span>
                <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-sm font-black shadow-sm">{folder.items.length}</span>
              </span>
          </Link>
        );
      })}
    </div>
  ) : null;

  if (full) {
    return (
      <section id="notificaciones" className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-4">
          <div className="flex items-center gap-3">
            <span className="relative grid h-10 w-10 place-items-center rounded-md bg-brand-50 text-brand-700">
              <BellRing size={20} />
              {unread ? <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-red-600 px-1 text-center text-xs font-bold text-white">{unread}</span> : null}
            </span>
            <div>
              <h2 className="text-lg font-black text-ink">Centro de avisos</h2>
              <p className="text-sm text-muted">{unread ? `${unread} alerta${unread === 1 ? "" : "s"} requiere${unread === 1 ? "" : "n"} revision` : "Todo al dia"}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {permission === "default" ? <button className="btn-primary" onClick={enableBrowserAlerts}><BellRing size={16} /> Activar alertas</button> : null}
            {permission === "denied" ? <span className="rounded-md bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">Alertas bloqueadas en el navegador</span> : null}
            {permission === "granted" ? <span className="rounded-md bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">Alertas activas</span> : null}
            {role !== "staff" && unread ? <button className="btn-secondary" onClick={readAll}><CheckCheck size={16} /> Marcar todas leidas</button> : null}
          </div>
        </div>

        {items.length ? (
          <div className="grid gap-3 border-b border-line bg-soft p-4 md:grid-cols-3">
            <div className="rounded-md border border-red-100 bg-white p-3">
              <p className="text-xs font-bold uppercase text-muted">Revisar primero</p>
              <p className="mt-1 text-2xl font-black text-red-700">{urgent}</p>
            </div>
            <div className="rounded-md border border-amber-100 bg-white p-3">
              <p className="text-xs font-bold uppercase text-muted">Pendientes</p>
              <p className="mt-1 text-2xl font-black text-amber-700">{pending}</p>
            </div>
            <div className="rounded-md border border-emerald-100 bg-white p-3">
              <p className="text-xs font-bold uppercase text-muted">Ya informado</p>
              <p className="mt-1 text-2xl font-black text-emerald-700">{resolved}</p>
            </div>
          </div>
        ) : null}

          {nextAction && !folders.length ? (
            <div className="border-b border-line p-4">
              <p className="mb-2 text-xs font-bold uppercase text-muted">Siguiente accion recomendada</p>
              {renderItem(nextAction)}
            </div>
          ) : null}

        <div className="p-4">
          <div className="mb-3">
            <h3 className="font-bold text-ink">{activeItems.length ? "Avisos pendientes" : "Sin pendientes"}</h3>
            <p className="text-sm text-muted">Solo aparecen alertas que ayudan a actuar: certificados, rechazos ocultos, turnos y productividad.</p>
          </div>
          {folderGrid || list}
          {folderGrid ? (
            <details className="mt-4 rounded-md border border-line bg-white">
              <summary className="cursor-pointer px-4 py-3 text-sm font-black text-ink">Ver detalle de avisos pendientes</summary>
              <div className="grid gap-2 border-t border-line p-3">{list}</div>
            </details>
          ) : null}
          {role === "operator" && historyItems.length ? (
            <details className="mt-4 rounded-md border border-line bg-white">
              <summary className="cursor-pointer px-4 py-3 text-sm font-black text-ink">Ver historial de avisos ya atendidos</summary>
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line bg-slate-50 px-3 py-2">
                <p className="text-xs font-semibold text-muted">Puedes borrar los avisos que ya revisaste.</p>
                <button type="button" className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-xs font-black ${deleteConfirm === "all" ? "bg-red-600 text-white" : "border border-red-200 bg-white text-red-700"}`} onClick={clearHistory}>
                  <Trash2 size={14} /> {deleteConfirm === "all" ? "Confirmar limpieza" : "Borrar historial atendido"}
                </button>
              </div>
              {deleteMessage ? <p className="border-t border-line bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700">{deleteMessage}</p> : null}
              <div className="grid gap-2 border-t border-line p-3">
                {historyItems.map((item) => (
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2" key={item.id}>
                    {renderItem(item)}
                    <button type="button" title="Borrar aviso" className={`grid h-10 w-10 place-items-center rounded-md border ${deleteConfirm === item.id ? "border-red-600 bg-red-600 text-white" : "border-red-200 bg-white text-red-600"}`} onClick={() => deleteHistoryItem(item.id)}>
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            </details>
          ) : null}
        </div>
      </section>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        title="Notificaciones"
        aria-label={`Notificaciones${unread ? `, ${unread} sin leer` : ""}`}
        onClick={() => setOpen((value) => !value)}
        className={`relative grid h-10 w-10 place-items-center rounded-md border transition ${unread ? "border-brand-200 bg-brand-50 text-brand-700" : "border-line bg-white text-muted hover:bg-soft"}`}
      >
        {unread ? <BellRing className="animate-pulse" size={19} /> : <Bell size={19} />}
        {unread ? <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-red-600 px-1 text-center text-[11px] font-bold leading-5 text-white">{unread > 99 ? "99+" : unread}</span> : null}
      </button>
      {open ? (
        <div className="absolute right-0 top-12 z-40 w-[min(92vw,390px)] overflow-hidden rounded-md border border-line bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-line p-4">
            <div>
              <p className="font-bold text-ink">{urgent ? "Atencion requerida" : "Centro de avisos"}</p>
              <p className="text-xs text-muted">{unread ? `${unread} pendiente${unread === 1 ? "" : "s"}` : "Estas al dia"}</p>
            </div>
            {role !== "staff" && unread ? <button className="text-xs font-bold text-brand-700" onClick={readAll}>Leer todas</button> : null}
          </div>
          <div className="border-b border-line bg-soft p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-xs font-bold uppercase text-muted">Carpetas de trabajo</p>
              {urgent ? <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-black text-red-700">{urgent} urgente{urgent === 1 ? "" : "s"}</span> : null}
            </div>
            {folderGrid || (nextAction ? renderItem(nextAction) : null)}
          </div>
          <div className="max-h-[320px] overflow-y-auto">
            {!folderGrid ? activeItems.filter((item) => item.id !== nextAction?.id).slice(0, 5).map(renderItem) : null}
            {!activeItems.length ? list : null}
          </div>
          <div className="border-t border-line p-3">
            <Link href={centerHref} onClick={() => setOpen(false)} className="btn-secondary w-full justify-center">
              Ver centro completo
            </Link>
          </div>
        </div>
      ) : null}
      {toast ? (
        <div className="fixed bottom-5 right-5 z-50 w-[min(90vw,380px)] rounded-md border border-brand-200 bg-white p-4 shadow-2xl">
          <div className="flex gap-3">
            <BellRing className="shrink-0 text-brand-600" size={20} />
            <div>
              <p className="font-bold text-ink">{toast.title}</p>
              <p className="mt-1 text-sm text-muted">{toast.message}</p>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
