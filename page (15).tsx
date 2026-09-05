"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, CalendarDays, Eye, FileImage, Send, WalletCards } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { CurrentProfile, loadCurrentProfile } from "@/lib/cloud-shifts";
import {
  PaymentIssue,
  compressPaymentProof,
  createPaymentIssue,
  displayPaymentStatus,
  getPaymentProofUrl,
  loadPaymentIssues,
  paymentIssueTypes,
  uploadPaymentProof
} from "@/lib/payment-issues";

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function statusClass(status: string) {
  if (status === "Resuelto") return "bg-emerald-100 text-emerald-700";
  if (status === "No procede") return "bg-red-100 text-red-700";
  if (status === "Falta prueba") return "bg-amber-100 text-amber-700";
  if (status === "En revision") return "bg-blue-100 text-blue-700";
  return "bg-slate-100 text-slate-700";
}

export default function OperatorPaymentsPage() {
  const [profile, setProfile] = useState<CurrentProfile | null>(null);
  const [month, setMonth] = useState(currentMonth());
  const [issues, setIssues] = useState<PaymentIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [proof, setProof] = useState<File | null>(null);
  const [form, setForm] = useState({
    periodType: "quincena" as "quincena" | "mes",
    periodValue: currentMonth(),
    issueType: paymentIssueTypes[0],
    expectedAmount: "",
    receivedAmount: "",
    comment: ""
  });

  async function refresh(activeProfile = profile) {
    if (!activeProfile) return;
    setLoading(true);
    try {
      setIssues(await loadPaymentIssues(activeProfile, month));
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

  const counters = useMemo(() => ({
    open: issues.filter((item) => ["Enviado", "En revision", "Falta prueba"].includes(item.status)).length,
    resolved: issues.filter((item) => item.status === "Resuelto").length,
    proof: issues.filter((item) => item.status === "Falta prueba").length
  }), [issues]);

  async function submitIssue(event: React.FormEvent) {
    event.preventDefault();
    if (!profile || saving) return;
    if (!form.comment.trim()) {
      setError("Explica brevemente que no cuadra en tu pago.");
      return;
    }
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const created = await createPaymentIssue(profile, form);
      if (proof) {
        const compressed = await compressPaymentProof(proof);
        await uploadPaymentProof(created.id, compressed);
      }
      setMessage("Novedad enviada. Staff fue notificado y podra revisar tu caso.");
      setProof(null);
      setForm((current) => ({ ...current, expectedAmount: "", receivedAmount: "", comment: "" }));
      await refresh(profile);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No fue posible enviar la novedad.");
    } finally {
      setSaving(false);
    }
  }

  async function openProof(issue: PaymentIssue) {
    try {
      const url = await getPaymentProofUrl(issue.id);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No fue posible abrir la prueba.");
    }
  }

  return (
    <AppLayout role="operator" title="Pagos">
      <div className="space-y-4">
        <section className="rounded-md border border-line bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-bold uppercase text-brand-700">Soporte de pago</p>
              <h1 className="text-2xl font-bold text-ink">Reportar novedad de pago</h1>
              <p className="mt-1 text-sm text-muted">Envía solo lo necesario. Staff revisa, responde y deja historial por mes.</p>
            </div>
            <label className="flex items-center gap-2 rounded-md border border-line bg-soft px-3 py-2 text-sm font-semibold">
              <CalendarDays size={16} className="text-brand-600" />
              <input className="bg-transparent outline-none" type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
            </label>
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-3">
          <div className="rounded-md border border-amber-200 bg-amber-50 p-4">
            <p className="text-xs font-bold uppercase text-amber-700">Abiertas</p>
            <p className="mt-2 text-3xl font-black text-ink">{counters.open}</p>
            <p className="text-sm text-muted">Enviado, revisión o falta prueba</p>
          </div>
          <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-xs font-bold uppercase text-emerald-700">Resueltas</p>
            <p className="mt-2 text-3xl font-black text-ink">{counters.resolved}</p>
            <p className="text-sm text-muted">Casos cerrados a favor</p>
          </div>
          <div className="rounded-md border border-blue-200 bg-blue-50 p-4">
            <p className="text-xs font-bold uppercase text-blue-700">Falta prueba</p>
            <p className="mt-2 text-3xl font-black text-ink">{counters.proof}</p>
            <p className="text-sm text-muted">Debes completar evidencia</p>
          </div>
        </section>

        <div className="grid gap-4 xl:grid-cols-[420px_1fr]">
          <form onSubmit={submitIssue} className="rounded-md border border-line bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-3">
              <span className="rounded-md bg-brand-50 p-2 text-brand-700"><WalletCards size={18} /></span>
              <div>
                <h2 className="font-bold text-ink">Nueva novedad</h2>
                <p className="text-sm text-muted">Completa el caso y adjunta prueba si la tienes.</p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm font-bold text-ink">
                  Periodo
                  <select className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2" value={form.periodType} onChange={(event) => setForm({ ...form, periodType: event.target.value as "quincena" | "mes" })}>
                    <option value="quincena">Quincena</option>
                    <option value="mes">Mes</option>
                  </select>
                </label>
                <label className="text-sm font-bold text-ink">
                  Fecha del periodo
                  <input className="mt-1 w-full rounded-md border border-line px-3 py-2" type={form.periodType === "mes" ? "month" : "date"} value={form.periodValue} onChange={(event) => setForm({ ...form, periodValue: event.target.value })} />
                </label>
              </div>
              <label className="text-sm font-bold text-ink">
                Tipo de novedad
                <select className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2" value={form.issueType} onChange={(event) => setForm({ ...form, issueType: event.target.value as typeof form.issueType })}>
                  {paymentIssueTypes.map((type) => <option key={type}>{type}</option>)}
                </select>
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm font-bold text-ink">
                  Valor esperado
                  <input className="mt-1 w-full rounded-md border border-line px-3 py-2" inputMode="decimal" value={form.expectedAmount} onChange={(event) => setForm({ ...form, expectedAmount: event.target.value })} placeholder="Opcional" />
                </label>
                <label className="text-sm font-bold text-ink">
                  Valor recibido
                  <input className="mt-1 w-full rounded-md border border-line px-3 py-2" inputMode="decimal" value={form.receivedAmount} onChange={(event) => setForm({ ...form, receivedAmount: event.target.value })} placeholder="Opcional" />
                </label>
              </div>
              <label className="text-sm font-bold text-ink">
                Comentario
                <textarea className="mt-1 min-h-28 w-full rounded-md border border-line px-3 py-2" value={form.comment} onChange={(event) => setForm({ ...form, comment: event.target.value })} placeholder="Cuenta que no cuadra: fecha, valor, concepto o descuento." />
              </label>
              <label className="flex cursor-pointer items-center gap-3 rounded-md border border-dashed border-brand-200 bg-brand-50 px-3 py-3 text-sm font-bold text-brand-700">
                <FileImage size={18} />
                <span>{proof ? proof.name : "Subir prueba comprimida"}</span>
                <input className="hidden" type="file" accept="image/*,.pdf" onChange={(event) => setProof(event.target.files?.[0] || null)} />
              </label>
              {message ? <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700">{message}</p> : null}
              {error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p> : null}
              <button className="flex w-full items-center justify-center gap-2 rounded-md bg-brand-600 px-4 py-3 text-sm font-bold text-white hover:bg-brand-700 disabled:opacity-60" disabled={saving}>
                <Send size={16} />
                {saving ? "Enviando..." : "Enviar novedad"}
              </button>
            </div>
          </form>

          <section className="rounded-md border border-line bg-white shadow-sm">
            <div className="border-b border-line p-5">
              <h2 className="font-bold text-ink">Historial del mes</h2>
              <p className="text-sm text-muted">Solo se carga el mes seleccionado para no saturar la base.</p>
            </div>
            <div className="divide-y divide-line">
              {loading ? <p className="p-5 text-sm text-muted">Cargando novedades...</p> : null}
              {!loading && !issues.length ? (
                <div className="p-8 text-center text-muted">
                  <AlertCircle className="mx-auto mb-2 text-brand-600" />
                  No tienes novedades de pago en este mes.
                </div>
              ) : null}
              {issues.map((issue) => (
                <article key={issue.id} className="grid gap-3 p-5 lg:grid-cols-[1fr_auto]">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-3 py-1 text-xs font-bold ${statusClass(issue.status)}`}>{displayPaymentStatus(issue.status)}</span>
                      <span className="text-xs font-bold uppercase text-muted">{issue.periodType} · {issue.periodValue}</span>
                    </div>
                    <h3 className="mt-2 font-bold text-ink">{issue.issueType}</h3>
                    <p className="mt-1 text-sm text-muted">{issue.comment}</p>
                    {issue.staffNote ? <p className="mt-2 rounded-md bg-soft px-3 py-2 text-sm font-semibold text-ink">Staff: {issue.staffNote}</p> : null}
                  </div>
                  <div className="flex flex-wrap items-start gap-2">
                    {issue.proofPath ? (
                      <button onClick={() => openProof(issue)} className="flex items-center gap-2 rounded-md border border-line px-3 py-2 text-sm font-bold text-ink hover:bg-soft">
                        <Eye size={16} />
                        Ver prueba
                      </button>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>
      </div>
    </AppLayout>
  );
}
