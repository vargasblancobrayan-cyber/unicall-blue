"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clock3, Eye, Search, ShieldCheck, Trash2, UserCheck, WalletCards } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { CurrentProfile, loadCurrentProfile } from "@/lib/cloud-shifts";
import {
  PaymentIssue,
  PaymentIssueStatus,
  deletePaymentIssue,
  displayPaymentStatus,
  getPaymentProofUrl,
  loadPaymentIssues,
  updatePaymentIssue
} from "@/lib/payment-issues";

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function hoursSince(value: string) {
  return (Date.now() - new Date(value).getTime()) / 3600000;
}

function needsFirstReview(issue: PaymentIssue) {
  return ["Enviado", "Falta prueba"].includes(issue.status) || (!["Resuelto", "No procede", "Cerrado"].includes(issue.status) && hoursSince(issue.createdAt) >= 48);
}

function statusClass(status: string) {
  if (status === "Resuelto") return "bg-emerald-100 text-emerald-700";
  if (status === "No procede") return "bg-red-100 text-red-700";
  if (status === "Falta prueba") return "bg-amber-100 text-amber-700";
  if (status === "En revision") return "bg-blue-100 text-blue-700";
  if (status === "Cerrado") return "bg-slate-100 text-slate-600";
  return "bg-yellow-100 text-yellow-700";
}

export default function StaffPaymentsPage() {
  const [profile, setProfile] = useState<CurrentProfile | null>(null);
  const [month, setMonth] = useState(currentMonth());
  const [issues, setIssues] = useState<PaymentIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("Activos");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function refresh(activeProfile = profile) {
    if (!activeProfile) return;
    setLoading(true);
    try {
      const rows = await loadPaymentIssues(activeProfile, month);
      setIssues(rows);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No fue posible cargar pagos.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    loadCurrentProfile().then((loaded) => {
      if (!active) return;
      setProfile(loaded);
      if (loaded) {
        loadPaymentIssues(loaded, month)
          .then(setIssues)
          .catch((err) => setError(err instanceof Error ? err.message : "No fue posible cargar pagos."))
          .finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, [month]);

  const counters = useMemo(() => {
    const activeRows = issues.filter((item) => item.status !== "Cerrado");
    return {
      review: activeRows.filter(needsFirstReview).length,
      pending: activeRows.filter((item) => ["Enviado", "En revision"].includes(item.status)).length,
      proof: activeRows.filter((item) => item.status === "Falta prueba").length,
      resolved: activeRows.filter((item) => ["Resuelto", "No procede"].includes(item.status)).length
    };
  }, [issues]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return issues.filter((issue) => {
      const matchesSearch = !needle || [
        issue.operatorName,
        issue.username,
        issue.issueType,
        issue.periodValue,
        issue.comment
      ].join(" ").toLowerCase().includes(needle);
      const matchesStatus =
        statusFilter === "Todos" ||
        (statusFilter === "Activos" && !["Resuelto", "No procede", "Cerrado"].includes(issue.status)) ||
        (statusFilter === "Revisar primero" && needsFirstReview(issue)) ||
        issue.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [issues, query, statusFilter]);

  async function openProof(issue: PaymentIssue) {
    try {
      const url = await getPaymentProofUrl(issue.id);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No fue posible abrir la prueba.");
    }
  }

  async function applyAction(issue: PaymentIssue, status: PaymentIssueStatus, fallbackNote: string) {
    if (!profile || busyId) return;
    setBusyId(issue.id);
    setMessage("");
    setError("");
    try {
      const staffNote = notes[issue.id]?.trim() || fallbackNote;
      await updatePaymentIssue(issue, profile, { status, staffNote });
      setMessage(`${displayPaymentStatus(status)} guardado para ${issue.operatorName}. El operador fue notificado.`);
      await refresh(profile);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No fue posible actualizar la novedad.");
    } finally {
      setBusyId("");
    }
  }

  async function removeIssue(issue: PaymentIssue) {
    if (!confirm(`Eliminar novedad de pago de ${issue.operatorName}?`)) return;
    setBusyId(issue.id);
    setMessage("");
    setError("");
    try {
      await deletePaymentIssue(issue.id);
      setMessage("Novedad eliminada de la bandeja.");
      await refresh(profile);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No fue posible eliminar la novedad.");
    } finally {
      setBusyId("");
    }
  }

  return (
    <AppLayout role="staff" title="Pagos">
      <div className="space-y-4">
        <section className="rounded-md border border-line bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <span className="rounded-md bg-brand-50 p-2 text-brand-700"><WalletCards size={20} /></span>
              <div>
                <p className="text-xs font-bold uppercase text-brand-700">Bandeja de pagos</p>
                <h1 className="text-2xl font-bold text-ink">Novedades de pago</h1>
                <p className="text-sm text-muted">Casos con prueba bajo demanda, responsable y respuesta al operador.</p>
              </div>
            </div>
            <input className="rounded-md border border-line px-3 py-2 text-sm font-semibold" type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-4">
          <button onClick={() => setStatusFilter("Revisar primero")} className="rounded-md border border-red-200 bg-red-50 p-4 text-left">
            <p className="text-xs font-bold uppercase text-red-700">Revisar primero</p>
            <p className="mt-2 text-3xl font-black text-ink">{counters.review}</p>
            <p className="text-sm text-muted">Nuevos o más de 48 horas</p>
          </button>
          <button onClick={() => setStatusFilter("Activos")} className="rounded-md border border-amber-200 bg-amber-50 p-4 text-left">
            <p className="text-xs font-bold uppercase text-amber-700">Pendientes</p>
            <p className="mt-2 text-3xl font-black text-ink">{counters.pending}</p>
            <p className="text-sm text-muted">Por gestionar</p>
          </button>
          <button onClick={() => setStatusFilter("Falta prueba")} className="rounded-md border border-blue-200 bg-blue-50 p-4 text-left">
            <p className="text-xs font-bold uppercase text-blue-700">Falta prueba</p>
            <p className="mt-2 text-3xl font-black text-ink">{counters.proof}</p>
            <p className="text-sm text-muted">Esperando operador</p>
          </button>
          <button onClick={() => setStatusFilter("Resuelto")} className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-left">
            <p className="text-xs font-bold uppercase text-emerald-700">Resueltos</p>
            <p className="mt-2 text-3xl font-black text-ink">{counters.resolved}</p>
            <p className="text-sm text-muted">Con respuesta final</p>
          </button>
        </section>

        <section className="rounded-md border border-line bg-white shadow-sm">
          <div className="grid gap-3 border-b border-line p-4 md:grid-cols-[1fr_220px]">
            <label className="flex items-center gap-2 rounded-md border border-line px-3 py-2">
              <Search size={16} className="text-muted" />
              <input className="w-full outline-none" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar operador, usuario, periodo o novedad" />
            </label>
            <select className="rounded-md border border-line bg-white px-3 py-2" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option>Activos</option>
              <option>Revisar primero</option>
              <option>Enviado</option>
              <option>En revision</option>
              <option>Falta prueba</option>
              <option>Resuelto</option>
              <option>No procede</option>
              <option>Cerrado</option>
              <option>Todos</option>
            </select>
          </div>
          {message ? <p className="mx-4 mt-4 rounded-md bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700">{message}</p> : null}
          {error ? <p className="mx-4 mt-4 rounded-md bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p> : null}

          <div className="divide-y divide-line">
            {loading ? <p className="p-5 text-sm text-muted">Cargando novedades...</p> : null}
            {!loading && !filtered.length ? (
              <div className="p-10 text-center text-muted">
                <CheckCircle2 className="mx-auto mb-2 text-emerald-600" />
                No hay novedades con estos filtros.
              </div>
            ) : null}
            {filtered.map((issue) => (
              <article key={issue.id} className="grid gap-4 p-5 xl:grid-cols-[260px_1fr_300px]">
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-3 py-1 text-xs font-bold ${statusClass(issue.status)}`}>{displayPaymentStatus(issue.status)}</span>
                    {hoursSince(issue.createdAt) >= 48 && !["Resuelto", "No procede", "Cerrado"].includes(issue.status) ? (
                      <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-700">+48h</span>
                    ) : null}
                  </div>
                  <h3 className="mt-3 font-black text-ink">{issue.operatorName}</h3>
                  <p className="text-sm font-bold text-brand-700">{issue.username}</p>
                  <p className="mt-2 text-xs text-muted">
                    Actualizado {new Date(issue.updatedAt).toLocaleString("es-CO")}
                  </p>
                  {issue.staffName ? <p className="mt-2 text-xs text-muted">Responsable: <b>{issue.staffName}</b></p> : null}
                </div>

                <div className="grid gap-3 lg:grid-cols-2">
                  <div className="rounded-md bg-soft p-3">
                    <p className="text-xs font-bold uppercase text-muted">Novedad</p>
                    <p className="mt-1 font-bold text-ink">{issue.issueType}</p>
                    <p className="text-sm text-muted">{issue.periodType} · {issue.periodValue}</p>
                  </div>
                  <div className="rounded-md bg-soft p-3">
                    <p className="text-xs font-bold uppercase text-muted">Valores</p>
                    <p className="mt-1 text-sm text-ink">Esperado: <b>{issue.expectedAmount ?? "-"}</b></p>
                    <p className="text-sm text-ink">Recibido: <b>{issue.receivedAmount ?? "-"}</b></p>
                  </div>
                  <div className="rounded-md border border-line p-3 lg:col-span-2">
                    <p className="text-xs font-bold uppercase text-muted">Comentario del operador</p>
                    <p className="mt-1 text-sm text-ink">{issue.comment}</p>
                  </div>
                  {issue.staffNote ? (
                    <div className="rounded-md bg-brand-50 p-3 lg:col-span-2">
                      <p className="text-xs font-bold uppercase text-brand-700">Última respuesta</p>
                      <p className="mt-1 text-sm font-semibold text-ink">{issue.staffNote}</p>
                    </div>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <textarea
                    className="min-h-24 w-full rounded-md border border-line px-3 py-2 text-sm"
                    value={notes[issue.id] || ""}
                    onChange={(event) => setNotes({ ...notes, [issue.id]: event.target.value })}
                    placeholder="Respuesta o instrucción para el operador"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => applyAction(issue, "En revision", "Staff tomo el caso y lo esta revisando.")} disabled={busyId === issue.id} className="flex items-center justify-center gap-2 rounded-md border border-line px-3 py-2 text-sm font-bold hover:bg-soft">
                      <UserCheck size={15} /> Tomar
                    </button>
                    <button onClick={() => issue.proofPath && openProof(issue)} disabled={!issue.proofPath} className="flex items-center justify-center gap-2 rounded-md border border-line px-3 py-2 text-sm font-bold hover:bg-soft disabled:opacity-40">
                      <Eye size={15} /> Ver prueba
                    </button>
                    <button onClick={() => applyAction(issue, "Falta prueba", "Necesitamos una prueba adicional para continuar la revision.")} disabled={busyId === issue.id} className="rounded-md bg-amber-100 px-3 py-2 text-sm font-bold text-amber-800">
                      Pedir prueba
                    </button>
                    <button onClick={() => applyAction(issue, "Resuelto", "Caso revisado y resuelto a favor.")} disabled={busyId === issue.id} className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-bold text-white">
                      Resolver
                    </button>
                    <button onClick={() => applyAction(issue, "No procede", "El caso no procede con la informacion validada.")} disabled={busyId === issue.id} className="rounded-md bg-red-100 px-3 py-2 text-sm font-bold text-red-700">
                      No procede
                    </button>
                    <button onClick={() => applyAction(issue, "Cerrado", "Caso cerrado por Staff.")} disabled={busyId === issue.id} className="flex items-center justify-center gap-2 rounded-md bg-slate-100 px-3 py-2 text-sm font-bold text-slate-700">
                      <ShieldCheck size={15} /> Cerrar
                    </button>
                    <button onClick={() => removeIssue(issue)} disabled={busyId === issue.id} className="col-span-2 flex items-center justify-center gap-2 rounded-md border border-red-200 px-3 py-2 text-sm font-bold text-red-700 hover:bg-red-50">
                      <Trash2 size={15} /> Eliminar de la bandeja
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
          <div className="flex items-center gap-2 border-t border-line px-5 py-4 text-sm text-muted">
            <Clock3 size={16} />
            Mostrando {filtered.length} de {issues.length} novedades del mes seleccionado.
          </div>
        </section>
      </div>
    </AppLayout>
  );
}
