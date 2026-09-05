"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clock3, ShieldCheck, XCircle } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { MonthNavigator } from "@/components/PeriodNavigator";
import { commercialMonthRange, loadCommercialRecords } from "@/lib/cloud-records";
import { CommercialRecord, readStoredRecords } from "@/lib/records";

function statusClass(status?: string) {
  if (status === "Aprobado") return "bg-emerald-100 text-emerald-700";
  if (status === "No aprobado") return "bg-red-100 text-red-700";
  return "bg-amber-100 text-amber-800";
}

function statusIcon(status?: string) {
  if (status === "Aprobado") return <CheckCircle2 size={18} className="text-emerald-700" />;
  if (status === "No aprobado") return <XCircle size={18} className="text-red-700" />;
  return <Clock3 size={18} className="text-amber-700" />;
}

export default function OperatorHiddenRejectionsPage() {
  const [records, setRecords] = useState<CommercialRecord[]>([]);
  const [monthFilter, setMonthFilter] = useState(new Date().toISOString().slice(0, 7));

  useEffect(() => {
    loadCommercialRecords({ ...commercialMonthRange(monthFilter), recordTypes: ["hidden_rejection"], limit: 250 })
      .then((storedRecords) => setRecords(storedRecords))
      .catch(() => setRecords(readStoredRecords()));
  }, [monthFilter]);

  const hiddenRejections = useMemo(
    () =>
      records
        .filter((record) => record.status === "Rechazo oculto" || Boolean(record.hiddenRejectionStatus))
        .filter((record) => (record.recordDate || record.createdAt || "").slice(0, 7) === monthFilter)
        .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || "")),
    [monthFilter, records]
  );

  const totals = {
    pending: hiddenRejections.filter((record) => !record.hiddenRejectionStatus || ["Pendiente", "En revision"].includes(record.hiddenRejectionStatus)).length,
    approved: hiddenRejections.filter((record) => record.hiddenRejectionStatus === "Aprobado").length,
    rejected: hiddenRejections.filter((record) => record.hiddenRejectionStatus === "No aprobado").length
  };

  return (
    <AppLayout role="operator" title="Rechazos ocultos">
      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line p-5">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-md bg-red-50 text-red-700">
              <ShieldCheck size={21} />
            </span>
            <div>
              <h2 className="text-lg font-bold text-ink">Gestion de rechazos ocultos</h2>
              <p className="mt-1 text-sm text-muted">Aqui ves solo las respuestas de staff sobre rechazos ocultos. Tus ventas siguen en Mis pedidos.</p>
            </div>
          </div>
          <div><span className="mb-1 block text-sm font-semibold text-ink">Mes</span><MonthNavigator value={monthFilter} onChange={setMonthFilter} /></div>
        </div>
        <div className="grid grid-cols-3 divide-x divide-line border-b border-line">
          <div className="p-4 text-center">
            <p className="text-xs font-bold uppercase text-muted">Pendientes</p>
            <p className="mt-1 text-2xl font-black text-amber-700">{totals.pending}</p>
          </div>
          <div className="p-4 text-center">
            <p className="text-xs font-bold uppercase text-muted">Aprobados</p>
            <p className="mt-1 text-2xl font-black text-emerald-700">{totals.approved}</p>
          </div>
          <div className="p-4 text-center">
            <p className="text-xs font-bold uppercase text-muted">No aprobados</p>
            <p className="mt-1 text-2xl font-black text-red-700">{totals.rejected}</p>
          </div>
        </div>
        {hiddenRejections.length ? (
          <div className="divide-y divide-line">
            {hiddenRejections.map((record) => {
              const status = record.hiddenRejectionStatus || "Pendiente";
              return (
                <div className="grid gap-3 p-4 md:grid-cols-[1fr_180px]" key={record.id}>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {statusIcon(status)}
                      <p className="font-bold text-ink">Pedido {record.orderNumber || "-"}</p>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${statusClass(status)}`}>{status}</span>
                    </div>
                    <p className="mt-2 text-sm text-muted">
                      {record.product || "Sin producto"} {record.recordDate ? `- ${record.recordDate}` : ""}
                    </p>
                    <div className={`mt-3 rounded-md p-3 text-sm font-semibold ${status === "Aprobado" ? "bg-emerald-50 text-emerald-800" : status === "No aprobado" ? "bg-red-50 text-red-800" : "bg-amber-50 text-amber-800"}`}>
                      {record.followUpNote || (status === "Aprobado" ? "Aprobado: este rechazo oculto fue validado por staff." : status === "No aprobado" ? "No aprobado: permanece como rechazo del operador." : "Pendiente de revision por staff.")}
                    </div>
                  </div>
                  <div className="rounded-md bg-soft p-3 text-sm">
                    <p className="font-bold text-ink">Evidencia enviada</p>
                    <p className="mt-1 text-muted">Comunicado: {record.communicated || "-"}</p>
                    <p className="text-muted">3ra llamada: {record.thirdCallback || "-"}</p>
                    <p className="mt-2 text-muted">{record.observation || "Sin comentario"}</p>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-8 text-center">
            <p className="font-bold text-ink">No tienes rechazos ocultos en este mes.</p>
            <p className="mt-1 text-sm text-muted">Cuando staff responda una solicitud, aparecera aqui y en la campana.</p>
          </div>
        )}
      </section>
    </AppLayout>
  );
}
