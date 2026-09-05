"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, Eye, History, Search, ShieldCheck, Trash2, XCircle } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { MonthNavigator } from "@/components/PeriodNavigator";
import { Modal } from "@/components/Modal";
import { commercialMonthRange, deleteCommercialRecord, loadCommercialRecords, saveCommercialRecord } from "@/lib/cloud-records";
import { CommercialRecord, readStoredRecords, writeStoredRecords } from "@/lib/records";

const approvedMessage = "Aprobado: El rechazo fue validado y eliminado de su usuario.";
const rejectedMessage = "No aprobado: El pedido no cumple las condiciones de rechazo oculto y permanece como rechazo del operador.";
const isEvidenceComplete = (record: CommercialRecord) =>
  record.communicated === "Si" && record.thirdCallback === "Si" && Boolean(record.observation?.trim());
const isHistoryDecision = (record: CommercialRecord) =>
  record.hiddenRejectionStatus === "Aprobado" || record.hiddenRejectionStatus === "No aprobado";

export default function StaffHiddenRejectionsPage() {
  const [records, setRecords] = useState<CommercialRecord[]>([]);
  const [query, setQuery] = useState("");
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [view, setView] = useState<"pending" | "history">("pending");
  const [historyStatus, setHistoryStatus] = useState<"Todos" | "Aprobado" | "No aprobado">("Todos");
  const [evidenceFilter, setEvidenceFilter] = useState<"Todos" | "Completa" | "Incompleta">("Todos");
  const [operatorFilter, setOperatorFilter] = useState("Todos");
  const [sortOrder, setSortOrder] = useState<"Antiguos" | "Recientes">("Antiguos");
  const [urgentOnly, setUrgentOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<CommercialRecord | null>(null);
  const [decision, setDecision] = useState<"Aprobado" | "No aprobado">("Aprobado");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<CommercialRecord | null>(null);
  const [savingDecision, setSavingDecision] = useState(false);
  const [saveNotice, setSaveNotice] = useState<{ order: string; operator: string; decision: string; synced: boolean } | null>(null);
  const [reviewConfirmation, setReviewConfirmation] = useState<{
    order: string;
    operator: string;
    decision: string;
    synced: boolean;
    nextRecord: CommercialRecord | null;
  } | null>(null);

  useEffect(() => {
    loadCommercialRecords({ ...commercialMonthRange(month), recordTypes: ["hidden_rejection"], limit: 500 }).then(setRecords).catch(() => {
      setRecords(readStoredRecords());
      setMessage("Se muestra el respaldo local; la sincronización se reintentará después.");
    });
  }, [month]);

  const monthRecords = useMemo(() => records.filter((record) => {
    const isHidden = record.status === "Rechazo oculto" || Boolean(record.hiddenRejectionStatus);
    return isHidden && (record.recordDate || record.createdAt || "").slice(0, 7) === month;
  }), [month, records]);

  const totals = useMemo(() => ({
    pending: monthRecords.filter((record) => [undefined, "Pendiente", "En revision"].includes(record.hiddenRejectionStatus)).length,
    approved: monthRecords.filter((record) => record.hiddenRejectionStatus === "Aprobado").length,
    rejected: monthRecords.filter((record) => record.hiddenRejectionStatus === "No aprobado").length
  }), [monthRecords]);

  const pendingRecords = useMemo(
    () => monthRecords.filter((record) => [undefined, "Pendiente", "En revision"].includes(record.hiddenRejectionStatus)),
    [monthRecords]
  );

  const historyRecords = useMemo(
    () => monthRecords.filter(isHistoryDecision),
    [monthRecords]
  );

  const operatorOptions = useMemo(
    () => Array.from(new Set(monthRecords.map((record) => record.operatorUsername || record.operator || "Sin operador"))).sort(),
    [monthRecords]
  );

  const queueMetrics = useMemo(() => ({
    operators: new Set(pendingRecords.map((record) => record.operatorUsername || record.operator || "Sin operador")).size,
    incomplete: pendingRecords.filter((record) => !isEvidenceComplete(record)).length,
    urgent: pendingRecords.filter((record) => Date.now() - new Date(record.createdAt).getTime() >= 24 * 60 * 60 * 1000).length
  }), [pendingRecords]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return monthRecords.filter((record) => {
      const status = record.hiddenRejectionStatus || "Pendiente";
      const matchesView = view === "pending"
        ? ["Pendiente", "En revision"].includes(status)
        : historyStatus === "Todos" || status === historyStatus;
      const matchesQuery = [record.operatorUsername, record.operator, record.orderNumber, record.product, record.treatment]
        .join(" ").toLowerCase().includes(normalized);
      const operator = record.operatorUsername || record.operator || "Sin operador";
      const matchesOperator = operatorFilter === "Todos" || operator === operatorFilter;
      const evidenceComplete = isEvidenceComplete(record);
      const matchesEvidence = evidenceFilter === "Todos" || (evidenceFilter === "Completa" ? evidenceComplete : !evidenceComplete);
      const isUrgent = Date.now() - new Date(record.createdAt).getTime() >= 24 * 60 * 60 * 1000;
      const matchesUrgent = view !== "pending" || !urgentOnly || isUrgent;
      return matchesView && matchesQuery && matchesOperator && matchesEvidence && matchesUrgent;
    }).sort((a, b) => {
      const difference = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      return sortOrder === "Antiguos" ? difference : -difference;
    });
  }, [evidenceFilter, historyStatus, monthRecords, operatorFilter, query, sortOrder, urgentOnly, view]);

  const pageSize = 25;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visibleRecords = filtered.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => setPage(1), [evidenceFilter, historyStatus, month, operatorFilter, query, sortOrder, urgentOnly, view]);

  function ageLabel(createdAt: string) {
    const hours = Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 3600000));
    if (hours < 1) return "Hace menos de 1 hora";
    if (hours < 24) return `Hace ${hours} h`;
    const days = Math.floor(hours / 24);
    return `Hace ${days} ${days === 1 ? "dia" : "dias"}`;
  }

  function openDecision(record: CommercialRecord, nextDecision: "Aprobado" | "No aprobado") {
    setSelected(record);
    setReviewConfirmation(null);
    setDecision(nextDecision);
    setNote(nextDecision === "Aprobado" ? approvedMessage : rejectedMessage);
  }

  function openReview(record: CommercialRecord) {
    openDecision(record, "Aprobado");
  }

  function openNextPending() {
    const nextRecord = filtered.find((record) => [undefined, "Pendiente", "En revision"].includes(record.hiddenRejectionStatus))
      || pendingRecords.slice().sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())[0];
    if (nextRecord) {
      openReview(nextRecord);
    } else {
      setMessage("No hay rechazos ocultos pendientes por revisar.");
    }
  }

  async function confirmDecision(continueReview = false) {
    if (!selected || savingDecision) return;
    setSavingDecision(true);
    const nextRecord = continueReview ? filtered.find((record) => record.id !== selected.id) || null : null;
    const nextRecords = records.map((record) => record.id === selected.id ? {
      ...record,
      hiddenRejectionStatus: decision,
      result: decision === "Aprobado" ? "APROBADO" : "RECHAZO",
      followUpNote: note.trim(),
      followUpAt: new Date().toISOString(),
      verifiedBy: "Staff"
    } : record);
    const storedRecords = readStoredRecords();
    const storedHasRecord = storedRecords.some((record) => record.id === selected.id);
    writeStoredRecords(
      storedHasRecord
        ? storedRecords.map((record) => record.id === selected.id ? nextRecords.find((item) => item.id === selected.id) || record : record)
        : [...nextRecords.filter((record) => record.id === selected.id), ...storedRecords]
    );
    setRecords(nextRecords);
    const changed = nextRecords.find((record) => record.id === selected.id);
    let synced = true;
    if (changed) {
      try {
        await saveCommercialRecord(changed);
        setMessage(`Pedido ${changed.orderNumber || "sin número"}: decisión guardada y operador notificado.`);
      } catch {
        synced = false;
        setMessage("Decisión guardada localmente; pendiente de sincronizar.");
      }
    }
    if (changed) {
      const notice = {
        order: changed.orderNumber || "sin numero",
        operator: changed.operatorUsername || changed.operator || "Operador",
        decision,
        synced
      };
      setSaveNotice(notice);
      if (nextRecord) {
        setReviewConfirmation({ ...notice, nextRecord });
      } else {
        setSelected(null);
      }
    } else {
      setSelected(null);
    }
    setSavingDecision(false);
  }

  async function removeHistoryRecord(record: CommercialRecord) {
    if (!isHistoryDecision(record)) return;
    setDeleteTarget(record);
  }

  async function confirmRemoveHistoryRecord() {
    if (!deleteTarget) return;
    const record = deleteTarget;
    const label = record.orderNumber || "sin numero";
    const previousRecords = records;
    const previousStoredRecords = readStoredRecords();
    const nextRecords = records.filter((item) => item.id !== record.id);
    writeStoredRecords(previousStoredRecords.filter((item) => item.id !== record.id));
    setRecords(nextRecords);
    setDeleteTarget(null);
    try {
      await deleteCommercialRecord(record.id);
      setMessage(`Pedido ${label} eliminado del historial.`);
    } catch {
      writeStoredRecords(previousStoredRecords);
      setRecords(previousRecords);
      setMessage("No se pudo eliminar del historial. Intenta nuevamente.");
    }
  }

  async function clearHistoryRecords() {
    const recordsToDelete = filtered.filter(isHistoryDecision);
    if (!recordsToDelete.length) {
      setMessage("No hay decisiones del historial para eliminar con estos filtros.");
      return;
    }
    if (!window.confirm(`Eliminar ${recordsToDelete.length} decisiones del historial visible? Las solicitudes pendientes no se borran.`)) return;
    const idsToDelete = new Set(recordsToDelete.map((record) => record.id));
    const previousRecords = records;
    const previousStoredRecords = readStoredRecords();
    const nextRecords = records.filter((record) => !idsToDelete.has(record.id));
    writeStoredRecords(previousStoredRecords.filter((record) => !idsToDelete.has(record.id)));
    setRecords(nextRecords);
    try {
      await Promise.all(recordsToDelete.map((record) => deleteCommercialRecord(record.id)));
      setMessage(`${recordsToDelete.length} decisiones eliminadas del historial.`);
    } catch {
      writeStoredRecords(previousStoredRecords);
      setRecords(previousRecords);
      setMessage("No se pudo limpiar el historial. Intenta nuevamente.");
    }
  }

  return (
    <AppLayout role="staff" title="Rechazos ocultos">
      {saveNotice ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm">
          <div className="flex items-start gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-md bg-white text-emerald-700"><CheckCircle2 size={18} /></span>
            <div>
              <p className="font-bold text-emerald-700">Decision guardada y operador notificado.</p>
              <p className="text-emerald-700">Pedido {saveNotice.order} - {saveNotice.operator} - {saveNotice.decision}{saveNotice.synced ? "" : " (pendiente de sincronizar)"}</p>
            </div>
          </div>
          <button className="font-bold text-emerald-700 hover:underline" onClick={() => setSaveNotice(null)}>Cerrar</button>
        </div>
      ) : null}
      <section className="grid gap-3 md:grid-cols-3">
        <button className={`card p-4 text-left transition hover:border-brand-300 ${view === "pending" && evidenceFilter === "Todos" && !urgentOnly ? "ring-2 ring-brand-600" : ""}`} onClick={() => { setView("pending"); setEvidenceFilter("Todos"); setHistoryStatus("Todos"); setUrgentOnly(false); }}>
          <div className="flex items-start justify-between gap-3">
            <div><p className="text-xs font-bold uppercase text-muted">Por revisar</p><p className="mt-2 text-2xl font-bold text-amber-700">{totals.pending}</p><p className="text-xs text-muted">Pendientes de decision</p></div>
            <span className="grid h-9 w-9 place-items-center rounded-md bg-amber-50 text-amber-700"><ShieldCheck size={18} /></span>
          </div>
        </button>
        <button className={`card p-4 text-left transition hover:border-brand-300 ${view === "pending" && urgentOnly ? "ring-2 ring-red-500" : ""}`} onClick={() => { setView("pending"); setEvidenceFilter("Todos"); setHistoryStatus("Todos"); setSortOrder("Antiguos"); setUrgentOnly(true); }}>
          <div className="flex items-start justify-between gap-3">
            <div><p className="text-xs font-bold uppercase text-muted">Mas de 24 horas</p><p className="mt-2 text-2xl font-bold text-red-700">{queueMetrics.urgent}</p><p className="text-xs text-muted">{queueMetrics.urgent ? "No revisados" : "Sin atrasos"}</p></div>
            <span className="grid h-9 w-9 place-items-center rounded-md bg-red-50 text-red-700"><AlertTriangle size={18} /></span>
          </div>
        </button>
        <button className={`card p-4 text-left transition hover:border-brand-300 ${view === "history" ? "ring-2 ring-brand-600" : ""}`} onClick={() => { setView("history"); setHistoryStatus("Todos"); setEvidenceFilter("Todos"); setUrgentOnly(false); }}>
          <div className="flex items-start justify-between gap-3">
            <div><p className="text-xs font-bold uppercase text-muted">Historial</p><p className="mt-2 text-2xl font-bold text-ink">{totals.approved + totals.rejected}</p><p className="text-xs text-muted"><span className="text-emerald-700">{totals.approved} aprobados</span> / <span className="text-red-700">{totals.rejected} no aprobados</span></p></div>
            <span className="grid h-9 w-9 place-items-center rounded-md bg-brand-50 text-brand-700"><History size={18} /></span>
          </div>
        </button>
      </section>
      <section className="hidden">
        <button className={`card p-4 text-left transition hover:border-brand-300 ${view === "pending" && evidenceFilter === "Todos" ? "ring-2 ring-brand-600" : ""}`} onClick={() => { setView("pending"); setEvidenceFilter("Todos"); setHistoryStatus("Todos"); }}>
          <div className="flex items-start justify-between gap-3">
            <div><p className="text-xs font-bold uppercase text-muted">Por revisar</p><p className="mt-2 text-2xl font-bold text-amber-700">{totals.pending}</p><p className="text-xs text-muted">Pendientes de decision</p></div>
            <span className="grid h-9 w-9 place-items-center rounded-md bg-amber-50 text-amber-700"><ShieldCheck size={18} /></span>
          </div>
        </button>
        <button className={`card p-4 text-left transition hover:border-brand-300 ${view === "pending" && sortOrder === "Antiguos" && queueMetrics.urgent > 0 ? "ring-2 ring-red-500" : ""}`} onClick={() => { setView("pending"); setEvidenceFilter("Todos"); setHistoryStatus("Todos"); setSortOrder("Antiguos"); }}>
          <div className="flex items-start justify-between gap-3">
            <div><p className="text-xs font-bold uppercase text-muted">Más de 24 horas</p><p className="mt-2 text-2xl font-bold text-red-700">{queueMetrics.urgent}</p><p className="text-xs text-muted">{queueMetrics.urgent ? "Revisar primero" : "Sin atrasos"}</p></div>
            <span className="grid h-9 w-9 place-items-center rounded-md bg-red-50 text-red-700"><AlertTriangle size={18} /></span>
          </div>
        </button>
        <button className={`card p-4 text-left transition hover:border-brand-300 ${view === "history" && historyStatus === "Aprobado" ? "ring-2 ring-emerald-500" : ""}`} onClick={() => { setView("history"); setHistoryStatus("Aprobado"); setEvidenceFilter("Todos"); }}>
          <div className="flex items-start justify-between gap-3">
            <div><p className="text-xs font-bold uppercase text-muted">Aprobados</p><p className="mt-2 text-2xl font-bold text-emerald-700">{totals.approved}</p><p className="text-xs text-muted">Retirados del conteo</p></div>
            <span className="grid h-9 w-9 place-items-center rounded-md bg-emerald-50 text-emerald-700"><CheckCircle2 size={18} /></span>
          </div>
        </button>
        <button className={`card p-4 text-left transition hover:border-brand-300 ${view === "history" && historyStatus === "No aprobado" ? "ring-2 ring-red-500" : ""}`} onClick={() => { setView("history"); setHistoryStatus("No aprobado"); setEvidenceFilter("Todos"); }}>
          <div className="flex items-start justify-between gap-3">
            <div><p className="text-xs font-bold uppercase text-muted">No aprobados</p><p className="mt-2 text-2xl font-bold text-red-700">{totals.rejected}</p><p className="text-xs text-muted">Permanecen como rechazo</p></div>
            <span className="grid h-9 w-9 place-items-center rounded-md bg-red-50 text-red-700"><XCircle size={18} /></span>
          </div>
        </button>
      </section>
      <section className="hidden">
        <button className={`card overflow-hidden p-0 text-left transition hover:border-brand-300 ${view === "pending" ? "ring-2 ring-brand-600" : ""}`} onClick={() => { setView("pending"); setEvidenceFilter("Todos"); }}>
          <div className="flex items-start justify-between gap-4 border-b border-line p-4">
            <div>
              <p className="text-xs font-bold uppercase text-brand-700">Bandeja activa</p>
              <h2 className="mt-1 text-xl font-bold text-ink">Pendientes por revisar</h2>
              <p className="text-sm text-muted">Casos que necesitan decision de Staff.</p>
            </div>
            <span className="rounded-md bg-amber-100 px-4 py-2 text-2xl font-bold text-amber-700">{totals.pending}</span>
          </div>
          <div className="grid grid-cols-3 divide-x divide-line bg-white text-center">
            <div className="p-3"><p className="text-lg font-bold text-red-700">{queueMetrics.incomplete}</p><p className="text-xs font-semibold text-muted">sin evidencia</p></div>
            <div className="p-3"><p className="text-lg font-bold text-red-700">{queueMetrics.urgent}</p><p className="text-xs font-semibold text-muted">urgentes</p></div>
            <div className="p-3"><p className="text-lg font-bold text-brand-700">{queueMetrics.operators}</p><p className="text-xs font-semibold text-muted">operadores</p></div>
          </div>
        </button>
        <button className={`card overflow-hidden p-0 text-left transition hover:border-brand-300 ${view === "history" ? "ring-2 ring-brand-600" : ""}`} onClick={() => { setView("history"); setHistoryStatus("Todos"); }}>
          <div className="flex items-start justify-between gap-4 border-b border-line p-4">
            <div>
              <p className="text-xs font-bold uppercase text-muted">Consulta y limpieza</p>
              <h2 className="mt-1 text-xl font-bold text-ink">Historial de decisiones</h2>
              <p className="text-sm text-muted">Aprobados y no aprobados, separados del trabajo pendiente.</p>
            </div>
            <span className="rounded-md bg-soft px-4 py-2 text-2xl font-bold text-ink">{historyRecords.length}</span>
          </div>
          <div className="grid grid-cols-2 divide-x divide-line bg-white text-center">
            <div className="p-3"><p className="text-lg font-bold text-emerald-700">{totals.approved}</p><p className="text-xs font-semibold text-muted">aprobados</p></div>
            <div className="p-3"><p className="text-lg font-bold text-red-700">{totals.rejected}</p><p className="text-xs font-semibold text-muted">no aprobados</p></div>
          </div>
        </button>
      </section>
      <section className="hidden">
        <button className={`border-b border-r border-line p-4 text-left transition hover:bg-amber-50 xl:border-b-0 ${view === "pending" && evidenceFilter === "Todos" ? "bg-amber-50" : ""}`} onClick={() => { setView("pending"); setEvidenceFilter("Todos"); }}>
          <p className="text-xs font-bold uppercase text-muted">Por revisar</p><p className="mt-1 text-2xl font-bold text-amber-700">{totals.pending}</p><p className="text-xs text-muted">Decisiones pendientes</p>
        </button>
        <button className={`border-b border-line p-4 text-left transition hover:bg-red-50 xl:border-b-0 xl:border-r ${view === "pending" && evidenceFilter === "Incompleta" ? "bg-red-50" : ""}`} onClick={() => { setView("pending"); setEvidenceFilter("Incompleta"); }}>
          <p className="text-xs font-bold uppercase text-muted">Evidencia incompleta</p><p className="mt-1 text-2xl font-bold text-red-700">{queueMetrics.incomplete}</p><p className="text-xs text-muted">Requieren validación</p>
        </button>
        <button className="border-r border-line p-4 text-left transition hover:bg-red-50" onClick={() => { setView("pending"); setEvidenceFilter("Todos"); setSortOrder("Antiguos"); }}>
          <p className="text-xs font-bold uppercase text-muted">Más de 24 horas</p><p className="mt-1 text-2xl font-bold text-red-700">{queueMetrics.urgent}</p><p className="text-xs text-muted">Atender primero</p>
        </button>
        <div className="p-4">
          <p className="text-xs font-bold uppercase text-muted">Operadores esperando</p><p className="mt-1 text-2xl font-bold text-brand-700">{queueMetrics.operators}</p><p className="text-xs text-muted">Personas en la cola</p>
        </div>
      </section>

      <section className="mt-4 card overflow-hidden">
        <div className="border-b border-line p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-md bg-brand-50 text-brand-700">{view === "pending" ? <ShieldCheck size={21} /> : <History size={21} />}</span>
              <div><h2 className="font-bold text-ink">{view === "pending" ? "Cola de revisión" : "Historial de decisiones"}</h2><p className="text-sm text-muted">{view === "pending" ? "Los casos más antiguos aparecen primero para evitar atrasos." : "Consulta decisiones anteriores sin mezclar el trabajo pendiente."}</p></div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {view === "pending" ? <button className="btn-primary py-2" disabled={!pendingRecords.length} onClick={openNextPending}><Eye size={15} /> Revisar siguiente</button> : null}
              <div className="flex rounded-md bg-soft p-1">
                <button className={`rounded px-4 py-2 text-sm font-bold ${view === "pending" ? "bg-white text-brand-700 shadow-sm" : "text-muted"}`} onClick={() => { setView("pending"); setHistoryStatus("Todos"); setUrgentOnly(false); }}>Pendientes {totals.pending}</button>
                <button className={`rounded px-4 py-2 text-sm font-bold ${view === "history" ? "bg-white text-brand-700 shadow-sm" : "text-muted"}`} onClick={() => { setView("history"); setHistoryStatus("Todos"); setEvidenceFilter("Todos"); setUrgentOnly(false); }}>Historial {totals.approved + totals.rejected}</button>
              </div>
            </div>
          </div>
          <div className="hidden">
            {view === "pending" ? (
              <>
                <button className={`rounded-full px-3 py-1.5 ${evidenceFilter === "Incompleta" ? "bg-red-100 text-red-700" : "bg-soft text-muted"}`} onClick={() => setEvidenceFilter("Incompleta")}>Sin evidencia {queueMetrics.incomplete}</button>
                <button className="rounded-full bg-red-50 px-3 py-1.5 text-red-700" onClick={() => setSortOrder("Antiguos")}>Más de 24h {queueMetrics.urgent}</button>
                <span className="rounded-full bg-brand-50 px-3 py-1.5 text-brand-700">Operadores {queueMetrics.operators}</span>
              </>
            ) : (
              <>
                <button className={`rounded-full px-3 py-1.5 ${historyStatus === "Todos" ? "bg-brand-50 text-brand-700" : "bg-soft text-muted"}`} onClick={() => setHistoryStatus("Todos")}>Todo {historyRecords.length}</button>
                <button className={`rounded-full px-3 py-1.5 ${historyStatus === "Aprobado" ? "bg-emerald-100 text-emerald-700" : "bg-soft text-muted"}`} onClick={() => setHistoryStatus("Aprobado")}>Aprobados {totals.approved}</button>
                <button className={`rounded-full px-3 py-1.5 ${historyStatus === "No aprobado" ? "bg-red-100 text-red-700" : "bg-soft text-muted"}`} onClick={() => setHistoryStatus("No aprobado")}>No aprobados {totals.rejected}</button>
              </>
            )}
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(260px,1fr)_190px_190px]">
            <label className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={16} /><input className="input-base pl-9" placeholder="Buscar operador, pedido o producto" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
            <select className="input-base" value={operatorFilter} onChange={(event) => setOperatorFilter(event.target.value)} aria-label="Filtrar por operador"><option value="Todos">Todos los operadores</option>{operatorOptions.map((operator) => <option key={operator}>{operator}</option>)}</select>
            <select className="input-base" value={evidenceFilter} onChange={(event) => setEvidenceFilter(event.target.value as typeof evidenceFilter)} aria-label="Filtrar por evidencia"><option value="Todos">Toda la evidencia</option><option value="Completa">Evidencia completa</option><option value="Incompleta">Evidencia incompleta</option></select>
            <select className="input-base" value={sortOrder} onChange={(event) => setSortOrder(event.target.value as typeof sortOrder)} aria-label="Orden de solicitudes"><option value="Antiguos">Más antiguos</option><option value="Recientes">Más recientes</option></select>
            <MonthNavigator value={month} onChange={setMonth} />
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
            <p><strong className="text-ink">{filtered.length}</strong> {view === "pending" ? "solicitudes por revisar" : "decisiones encontradas"}</p>
            <div className="flex items-center gap-3">{view === "history" ? <select className="rounded-md border border-line bg-white px-3 py-1.5 font-semibold" value={historyStatus} onChange={(event) => setHistoryStatus(event.target.value as typeof historyStatus)} aria-label="Estado del historial"><option>Todos</option><option>Aprobado</option><option>No aprobado</option></select> : null}{(query || operatorFilter !== "Todos" || evidenceFilter !== "Todos") ? <button className="font-bold text-brand-700 hover:underline" onClick={() => { setQuery(""); setOperatorFilter("Todos"); setEvidenceFilter("Todos"); }}>Limpiar filtros</button> : null}</div>
          </div>
          {view === "history" ? (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-line bg-soft px-3 py-2">
              <p className="text-sm font-semibold text-muted">Limpieza del historial visible. No afecta pendientes.</p>
              <div className="hidden">
                <div className="rounded-md bg-white p-3">
                  <p className="text-xs font-bold uppercase text-muted">Historial del mes</p>
                  <p className="mt-1 text-xl font-bold text-ink">{historyRecords.length}</p>
                </div>
                <div className="rounded-md bg-emerald-50 p-3">
                  <p className="text-xs font-bold uppercase text-emerald-700">Aprobados</p>
                  <p className="mt-1 text-xl font-bold text-emerald-700">{totals.approved}</p>
                </div>
                <div className="rounded-md bg-red-50 p-3">
                  <p className="text-xs font-bold uppercase text-red-700">No aprobados</p>
                  <p className="mt-1 text-xl font-bold text-red-700">{totals.rejected}</p>
                </div>
              </div>
              <button className="inline-flex items-center justify-center gap-2 rounded-md border border-red-200 bg-white px-4 py-2.5 text-sm font-bold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50" disabled={!filtered.some(isHistoryDecision)} onClick={clearHistoryRecords}>
                <Trash2 size={16} /> Eliminar historial filtrado
              </button>
            </div>
          ) : null}
          {message ? <p className="mt-3 rounded-md bg-cyan/10 p-2 text-sm font-semibold text-brand-700">{message}</p> : null}
        </div>

        {view === "history" ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px]">
              <thead className="bg-soft text-left text-xs uppercase text-muted">
                <tr><th className="table-cell">Fecha</th><th className="table-cell">Operador</th><th className="table-cell">Pedido</th><th className="table-cell">Decision</th><th className="table-cell">Respuesta enviada</th><th className="table-cell text-right">Borrar</th></tr>
              </thead>
              <tbody>
                {visibleRecords.length ? visibleRecords.map((record) => (
                  <tr key={record.id} className={record.hiddenRejectionStatus === "Aprobado" ? "bg-emerald-50/35" : "bg-red-50/35"}>
                    <td className="table-cell"><p className="font-bold text-ink">{record.recordDate || new Date(record.createdAt).toLocaleDateString("es-CO")}</p><p className="text-xs text-muted">{ageLabel(record.createdAt)}</p></td>
                    <td className="table-cell font-bold text-ink">{record.operatorUsername || record.operator || "-"}</td>
                    <td className="table-cell"><strong className="block text-ink">{record.orderNumber || "Sin numero"}</strong><span className="text-sm text-muted">{record.product || "Sin producto"}</span></td>
                    <td className="table-cell"><span className={`rounded-full px-3 py-1 text-xs font-bold ${record.hiddenRejectionStatus === "Aprobado" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>{record.hiddenRejectionStatus || "Pendiente"}</span></td>
                    <td className="table-cell"><p className="max-w-xl truncate font-semibold text-ink" title={record.followUpNote || "Operador notificado."}>{record.followUpNote || "Operador notificado."}</p><p className="mt-1 max-w-xl truncate text-xs text-muted" title={record.observation || "Sin comentario del operador"}>Comentario operador: {record.observation || "Sin comentario"}</p></td>
                    <td className="table-cell text-right"><button className="inline-grid h-9 w-9 place-items-center rounded-md border border-red-200 text-red-700 transition hover:bg-red-50" title="Eliminar del historial" onClick={() => removeHistoryRecord(record)}><Trash2 size={16} /></button></td>
                  </tr>
                )) : <tr><td className="table-cell py-12 text-center text-muted" colSpan={6}>No hay decisiones para estos filtros.</td></tr>}
              </tbody>
            </table>
          </div>
        ) : null}

        <div className={view === "history" ? "hidden" : "overflow-x-auto"}>
          <table className="w-full min-w-[940px]">
            <thead className="bg-soft text-left text-xs uppercase text-muted"><tr><th className="table-cell">Prioridad</th><th className="table-cell">Operador</th><th className="table-cell">Pedido y producto</th><th className="table-cell">Evidencia</th><th className="table-cell">Comentario</th><th className="table-cell">Estado</th><th className="table-cell">Acción</th></tr></thead>
            <tbody>
              {visibleRecords.length ? visibleRecords.map((record) => {
                const pending = [undefined, "Pendiente", "En revision"].includes(record.hiddenRejectionStatus);
                const complete = isEvidenceComplete(record);
                const urgent = Date.now() - new Date(record.createdAt).getTime() >= 24 * 60 * 60 * 1000;
                return <tr key={record.id} className={pending && urgent ? "bg-red-50/40" : undefined}>
                  <td className="table-cell"><div className={`flex items-center gap-2 text-xs font-bold ${urgent ? "text-red-700" : "text-muted"}`}>{urgent ? <AlertTriangle size={15} /> : <Clock3 size={15} />}<span>{ageLabel(record.createdAt)}</span></div><span className="mt-1 block text-xs text-muted">{record.recordDate || new Date(record.createdAt).toLocaleDateString("es-CO")}</span></td>
                  <td className="table-cell font-bold text-ink">{record.operatorUsername || record.operator || "-"}</td>
                  <td className="table-cell"><strong className="block text-ink">{record.orderNumber || "Sin número"}</strong><span className="text-sm text-muted">{record.product || "Sin producto"}</span></td>
                  <td className="table-cell"><div className="flex flex-wrap gap-1.5 text-xs font-bold"><span className={`rounded px-2 py-1 ${record.communicated === "Si" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>Comunicado: {record.communicated || "No"}</span><span className={`rounded px-2 py-1 ${record.thirdCallback === "Si" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>3ra llamada: {record.thirdCallback || "No"}</span></div><span className={`mt-1.5 block text-xs font-bold ${complete ? "text-emerald-700" : "text-red-700"}`}>{complete ? "Evidencia completa" : "Falta evidencia"}</span></td>
                  <td className="table-cell"><p className="max-w-xs truncate text-sm text-muted" title={record.observation || "Sin comentario"}>{record.observation || "Sin comentario"}</p></td>
                  <td className="table-cell"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${record.hiddenRejectionStatus === "Aprobado" ? "bg-emerald-100 text-emerald-700" : record.hiddenRejectionStatus === "No aprobado" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>{record.hiddenRejectionStatus || "Pendiente"}</span></td>
                  <td className="table-cell">{pending ? <button className="btn-primary py-2" onClick={() => openReview(record)}><Eye size={15} /> Revisar</button> : <div className="flex min-w-48 items-center gap-2"><div className="max-w-xs text-sm"><p className="font-semibold text-ink">Finalizada por {record.verifiedBy || "Staff"}</p><p className="mt-1 truncate text-muted" title={record.followUpNote || "Operador notificado."}>{record.followUpNote || "Operador notificado."}</p></div><button className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-red-200 text-red-700 transition hover:bg-red-50" title="Eliminar del historial" onClick={() => removeHistoryRecord(record)}><Trash2 size={16} /></button></div>}</td>
                </tr>;
              }) : <tr><td className="table-cell py-12 text-center text-muted" colSpan={7}>{view === "pending" ? <div><CheckCircle2 className="mx-auto mb-2 text-emerald-500" size={28} /><strong className="block text-ink">Bandeja al día</strong><span>No hay solicitudes pendientes con estos filtros.</span></div> : "No hay decisiones para estos filtros."}</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-line px-4 py-3 text-sm"><span className="text-muted">Mostrando {visibleRecords.length} de {filtered.length}</span><div className="flex items-center gap-2"><button className="btn-secondary py-1.5" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Anterior</button><span className="rounded-md bg-soft px-3 py-2 text-xs font-bold">Página {page} de {pageCount}</span><button className="btn-secondary py-1.5" disabled={page >= pageCount} onClick={() => setPage((value) => value + 1)}>Siguiente</button></div></div>
      </section>

      <Modal title="Revisar rechazo oculto" open={Boolean(selected)} onClose={() => { setSelected(null); setReviewConfirmation(null); }}>
        {reviewConfirmation ? (
          <div className="space-y-4">
            <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-emerald-800">
              <div className="flex items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-white text-emerald-700"><CheckCircle2 size={20} /></span>
                <div>
                  <p className="font-bold">Decision guardada y operador notificado.</p>
                  <p className="mt-1 text-sm">Pedido {reviewConfirmation.order} - {reviewConfirmation.operator} - {reviewConfirmation.decision}{reviewConfirmation.synced ? "" : " (pendiente de sincronizar)"}</p>
                </div>
              </div>
            </div>
            {reviewConfirmation.nextRecord ? (
              <div className="rounded-md border border-line p-4">
                <p className="text-xs font-bold uppercase text-muted">Siguiente caso disponible</p>
                <div className="mt-2 grid gap-2 text-sm sm:grid-cols-3">
                  <div><span className="text-muted">Operador</span><strong className="block text-ink">{reviewConfirmation.nextRecord.operatorUsername || reviewConfirmation.nextRecord.operator || "-"}</strong></div>
                  <div><span className="text-muted">Pedido</span><strong className="block text-ink">{reviewConfirmation.nextRecord.orderNumber || "-"}</strong></div>
                  <div><span className="text-muted">Producto</span><strong className="block text-ink">{reviewConfirmation.nextRecord.product || "-"}</strong></div>
                </div>
              </div>
            ) : (
              <div className="rounded-md border border-line bg-soft p-4 text-sm text-muted">No quedan mas rechazos ocultos pendientes con estos filtros.</div>
            )}
            <div className="grid gap-2 sm:grid-cols-2">
              <button className="btn-secondary justify-center" onClick={() => { setSelected(null); setReviewConfirmation(null); }}>Volver a la bandeja</button>
              {reviewConfirmation.nextRecord ? (
                <button className="btn-primary justify-center" onClick={() => openReview(reviewConfirmation.nextRecord!)}><Eye size={16} /> Revisar siguiente caso</button>
              ) : null}
            </div>
          </div>
        ) : selected ? <div className="space-y-4">
          <div className="rounded-md bg-soft p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase text-muted">Operador</p><p className="font-bold text-ink">{selected.operatorUsername || selected.operator}</p></div><span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-700">{ageLabel(selected.createdAt)}</span></div><div className="mt-3 grid grid-cols-2 gap-3 text-sm"><div><span className="text-muted">Pedido</span><strong className="block">{selected.orderNumber || "-"}</strong></div><div><span className="text-muted">Producto</span><strong className="block">{selected.product || "-"}</strong></div></div></div>
          <div className="rounded-md border border-line p-4"><p className="mb-2 text-xs font-bold uppercase text-muted">Evidencia del operador</p><div className="flex flex-wrap gap-2 text-xs font-bold"><span className={`rounded px-2 py-1 ${selected.communicated === "Si" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>Comunicado: {selected.communicated || "No"}</span><span className={`rounded px-2 py-1 ${selected.thirdCallback === "Si" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>3ra llamada: {selected.thirdCallback || "No"}</span></div><p className="mt-3 text-sm text-ink">{selected.observation || "El operador no agregó comentario."}</p></div>
          <div><p className="mb-2 text-sm font-semibold text-ink">Decisión de Staff</p><div className="grid grid-cols-2 gap-2"><button className={`flex items-center justify-center gap-2 rounded-md border px-3 py-2.5 text-sm font-bold ${decision === "Aprobado" ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-line text-muted"}`} onClick={() => { setDecision("Aprobado"); setNote(approvedMessage); }}><CheckCircle2 size={16} /> Aprobar</button><button className={`flex items-center justify-center gap-2 rounded-md border px-3 py-2.5 text-sm font-bold ${decision === "No aprobado" ? "border-red-500 bg-red-50 text-red-700" : "border-line text-muted"}`} onClick={() => { setDecision("No aprobado"); setNote(rejectedMessage); }}><XCircle size={16} /> No aprobar</button></div></div>
          <div className={`rounded-md p-3 text-sm font-semibold ${decision === "Aprobado" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{decision === "Aprobado" ? "Este rechazo dejará de contar para el operador." : "Este registro continuará contando como rechazo."}</div>
          <label className="block"><span className="mb-1 block text-sm font-semibold text-ink">Mensaje para el operador</span><textarea className="input-base min-h-28 resize-none" value={note} onChange={(event) => setNote(event.target.value)} /></label>
          <div className="grid gap-2 sm:grid-cols-3"><button className="btn-secondary justify-center disabled:opacity-60" disabled={savingDecision} onClick={() => setSelected(null)}>Cancelar</button><button className="btn-secondary justify-center disabled:opacity-60" disabled={savingDecision} onClick={() => confirmDecision(false)}>{savingDecision ? "Guardando..." : "Guardar"}</button><button className={`flex items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60 ${decision === "Aprobado" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-red-600 hover:bg-red-700"}`} disabled={savingDecision} onClick={() => confirmDecision(true)}>{decision === "Aprobado" ? <CheckCircle2 size={16} /> : <XCircle size={16} />} {savingDecision ? "Guardando..." : "Guardar y elegir siguiente"}</button></div>
        </div> : null}
      </Modal>

      <Modal title="Eliminar del historial" open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)}>
        {deleteTarget ? <div className="space-y-4">
          <div className="rounded-md border border-red-200 bg-red-50 p-4">
            <p className="text-sm font-bold text-red-700">Vas a quitar este registro del historial.</p>
            <p className="mt-1 text-sm text-red-700">No afecta solicitudes pendientes ni cambia la decision enviada al operador.</p>
          </div>
          <div className="grid gap-3 rounded-md bg-soft p-4 text-sm sm:grid-cols-2">
            <div><span className="text-muted">Operador</span><strong className="block text-ink">{deleteTarget.operatorUsername || deleteTarget.operator || "-"}</strong></div>
            <div><span className="text-muted">Pedido</span><strong className="block text-ink">{deleteTarget.orderNumber || "Sin numero"}</strong></div>
            <div><span className="text-muted">Producto</span><strong className="block text-ink">{deleteTarget.product || "Sin producto"}</strong></div>
            <div><span className="text-muted">Decision</span><strong className={deleteTarget.hiddenRejectionStatus === "Aprobado" ? "block text-emerald-700" : "block text-red-700"}>{deleteTarget.hiddenRejectionStatus}</strong></div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <button className="btn-secondary justify-center" onClick={() => setDeleteTarget(null)}>Conservar</button>
            <button className="inline-flex items-center justify-center gap-2 rounded-md bg-red-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-red-700" onClick={confirmRemoveHistoryRecord}><Trash2 size={16} /> Eliminar del historial</button>
          </div>
        </div> : null}
      </Modal>
    </AppLayout>
  );
}
