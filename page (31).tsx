"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, Search, ShieldCheck, UsersRound, XCircle } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { Modal } from "@/components/Modal";
import { MonthNavigator } from "@/components/PeriodNavigator";
import { CommercialRecord, readStoredRecords, writeStoredRecords } from "@/lib/records";
import { commercialMonthRange, loadCommercialRecords, saveCommercialRecord } from "@/lib/cloud-records";

const deliveryStatusOptions = ["PENDIENTE", "ENTREGADO", "RECHAZO", "NO CONTESTA", "PROMETE COMPRAR"];
const hiddenRejectionApprovedMessage =
  "Aprobado: El rechazo fue validado y eliminado de su usuario.";
const hiddenRejectionRejectedMessage =
  "No aprobado: El pedido publicado no cumple con las condiciones para ser considerado un rechazo oculto, por lo que no sera eliminado de su usuario.";

export default function StaffSalesPage() {
  const [allRecords, setAllRecords] = useState<CommercialRecord[]>([]);
  const [records, setRecords] = useState<CommercialRecord[]>([]);
  const [query, setQuery] = useState("");
  const [resultFilter, setResultFilter] = useState("Todos");
  const [operatorFilter, setOperatorFilter] = useState("Todos");
  const [operatorPage, setOperatorPage] = useState(1);
  const [monthFilter, setMonthFilter] = useState(new Date().toISOString().slice(0, 7));
  const [message, setMessage] = useState("");
  const [hiddenQuery, setHiddenQuery] = useState("");
  const [hiddenStatusFilter, setHiddenStatusFilter] = useState("Pendiente");
  const [hiddenPage, setHiddenPage] = useState(1);
  const [selectedHiddenRecord, setSelectedHiddenRecord] = useState<CommercialRecord | null>(null);
  const [hiddenDecision, setHiddenDecision] = useState<"Aprobado" | "No aprobado">("Aprobado");
  const [decisionNote, setDecisionNote] = useState("");

  useEffect(() => {
    loadCommercialRecords({ ...commercialMonthRange(monthFilter), recordTypes: ["sale"], limit: 750 })
      .then((storedRecords) => {
        setAllRecords(storedRecords);
        setRecords(storedRecords.filter((record) => record.type === "sale"));
      })
      .catch(() => {
        const storedRecords = readStoredRecords();
        setAllRecords(storedRecords);
        setRecords(storedRecords.filter((record) => record.type === "sale"));
        setMessage("No se pudo actualizar la base central. Se muestra el respaldo local.");
      });
  }, [monthFilter]);

  const monthlyRecords = useMemo(
    () =>
      records.filter((record) => {
        const monthValue = (record.recordDate || record.createdAt || "").slice(0, 7);
        return monthValue === monthFilter;
      }),
    [monthFilter, records]
  );

  const operatorSummary = useMemo(() => {
    const summary = new Map<
      string,
      {
        operator: string;
        operatorName: string;
        total: number;
        delivered: number;
        pending: number;
        noAnswer: number;
        promise: number;
      rejected: number;
      needsFollowUp: number;
      followed: number;
      withoutFollowUp: number;
      lastFollowUp: string;
      records: CommercialRecord[];
      deliveryRate: number;
      }
    >();

    monthlyRecords.forEach((record) => {
      const operator = record.operatorUsername || record.operator || "Sin operador";
      const current =
        summary.get(operator) ||
        {
          operator,
          operatorName: record.operator || "",
          total: 0,
          delivered: 0,
          pending: 0,
          noAnswer: 0,
          promise: 0,
          rejected: 0,
          needsFollowUp: 0,
          followed: 0,
          withoutFollowUp: 0,
          lastFollowUp: "",
          records: [],
          deliveryRate: 0
        };
      if (!current.operatorName && record.operator) current.operatorName = record.operator;
      const result = record.result || "PENDIENTE";

      current.total += 1;
      current.records.push(record);
      if (result === "ENTREGADO") current.delivered += 1;
      if (result === "PENDIENTE") current.pending += 1;
      if (result === "NO CONTESTA") current.noAnswer += 1;
      if (result === "PROMETE COMPRAR") current.promise += 1;
      if (result === "RECHAZO" || result === "RECHAZADO") current.rejected += 1;
      if (["PENDIENTE", "NO CONTESTA", "PROMETE COMPRAR"].includes(result)) current.needsFollowUp += 1;
      if (record.followUpAt) {
        current.followed += 1;
        if (!current.lastFollowUp || new Date(record.followUpAt).getTime() > new Date(current.lastFollowUp).getTime()) {
          current.lastFollowUp = record.followUpAt;
        }
      } else if (["PENDIENTE", "NO CONTESTA", "PROMETE COMPRAR"].includes(result)) {
        current.withoutFollowUp += 1;
      }
      current.deliveryRate = current.total ? Math.round((current.delivered / current.total) * 100) : 0;

      summary.set(operator, current);
    });

    return Array.from(summary.values()).sort((a, b) => b.withoutFollowUp - a.withoutFollowUp || b.needsFollowUp - a.needsFollowUp || b.total - a.total);
  }, [monthlyRecords]);

  const filteredOperatorSummary = useMemo(() => {
    return operatorSummary
      .map((item) => ({
        ...item,
        records: item.records.filter((record) => {
          const searchable = [
            record.orderNumber,
            record.phone,
            record.product,
            record.result,
            record.operatorUsername,
            record.operator,
            record.paymentMethod
          ]
            .join(" ")
            .toLowerCase();
          const matchesQuery = searchable.includes(query.toLowerCase());
          const matchesResult = resultFilter === "Todos" || (record.result || "PENDIENTE") === resultFilter;
          return matchesQuery && matchesResult;
        })
      }))
      .filter((item) => item.records.length || `${item.operator} ${item.operatorName}`.toLowerCase().includes(query.toLowerCase()))
      .filter((item) => {
        if (operatorFilter === "Sin gestion") return item.withoutFollowUp > 0;
        if (operatorFilter === "Con seguimiento") return item.followed > 0;
        if (operatorFilter === "Al dia") return item.needsFollowUp === 0;
        return true;
      });
  }, [operatorFilter, operatorSummary, query, resultFilter]);

  const operatorPageSize = 25;
  const operatorPageCount = Math.max(1, Math.ceil(filteredOperatorSummary.length / operatorPageSize));
  const pagedOperatorSummary = filteredOperatorSummary.slice(
    (operatorPage - 1) * operatorPageSize,
    operatorPage * operatorPageSize
  );

  useEffect(() => setOperatorPage(1), [query, resultFilter, operatorFilter, monthFilter]);

  function updateRecord(id: string, field: keyof CommercialRecord, value: string) {
    const allRecords = readStoredRecords();
    const nextAllRecords = allRecords.map((record) =>
      record.id === id
        ? {
            ...record,
            [field]: value,
            followUpAt: new Date().toISOString(),
            verifiedBy: "Staff Demo"
          }
        : record
    );
    writeStoredRecords(nextAllRecords);
    setAllRecords(nextAllRecords);
    setRecords(nextAllRecords.filter((record) => record.type === "sale"));
    const changedRecord = nextAllRecords.find((record) => record.id === id);
    if (changedRecord) saveCommercialRecord(changedRecord).catch(() => setMessage("Actualizado localmente; pendiente de sincronizar."));
    setMessage("Seguimiento actualizado.");
  }

  const hiddenRejections = useMemo(
    () =>
      allRecords.filter((record) => {
        const monthValue = (record.recordDate || record.createdAt || "").slice(0, 7);
        const isHiddenRejection = record.status === "Rechazo oculto" || Boolean(record.hiddenRejectionStatus);
        return monthValue === monthFilter && isHiddenRejection;
      }),
    [allRecords, monthFilter]
  );

  function updateHiddenRejection(id: string, value: string, note?: string) {
    const nextAllRecords = allRecords.map((record) =>
      record.id === id
        ? {
            ...record,
            hiddenRejectionStatus: value,
            result: value === "Aprobado" ? "APROBADO" : "RECHAZO",
            followUpNote: note || record.followUpNote,
            followUpAt: new Date().toISOString(),
            verifiedBy: "Staff Demo"
          }
        : record
    );
    writeStoredRecords(nextAllRecords);
    setAllRecords(nextAllRecords);
    setRecords(nextAllRecords.filter((record) => record.type === "sale"));
    const changedRecord = nextAllRecords.find((record) => record.id === id);
    if (changedRecord) saveCommercialRecord(changedRecord).catch(() => setMessage("Actualizado localmente; pendiente de sincronizar."));
    setMessage("Rechazo oculto actualizado.");
  }

  function openHiddenDecision(record: CommercialRecord, decision: "Aprobado" | "No aprobado") {
    setSelectedHiddenRecord(record);
    setHiddenDecision(decision);
    setDecisionNote(decision === "Aprobado" ? hiddenRejectionApprovedMessage : hiddenRejectionRejectedMessage);
  }

  function confirmHiddenDecision() {
    if (!selectedHiddenRecord) return;
    updateHiddenRejection(selectedHiddenRecord.id, hiddenDecision, decisionNote.trim());
    setSelectedHiddenRecord(null);
  }

  const hiddenRejectionTotals = {
    pending: hiddenRejections.filter((record) => ["Pendiente", "En revision", undefined].includes(record.hiddenRejectionStatus)).length,
    approved: hiddenRejections.filter((record) => record.hiddenRejectionStatus === "Aprobado").length,
    rejected: hiddenRejections.filter((record) => record.hiddenRejectionStatus === "No aprobado").length
  };

  const filteredHiddenRejections = useMemo(() => {
    const statusMatches = (record: CommercialRecord) => {
      const status = record.hiddenRejectionStatus || "Pendiente";
      if (hiddenStatusFilter === "Todos") return true;
      if (hiddenStatusFilter === "Pendiente") return ["Pendiente", "En revision"].includes(status);
      return status === hiddenStatusFilter;
    };
    const normalizedQuery = hiddenQuery.trim().toLowerCase();
    return hiddenRejections
      .filter(statusMatches)
      .filter((record) =>
        [record.operatorUsername, record.operator, record.orderNumber, record.product, record.treatment]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery)
      )
      .sort((a, b) => {
        const aPending = ["Pendiente", "En revision", undefined].includes(a.hiddenRejectionStatus);
        const bPending = ["Pendiente", "En revision", undefined].includes(b.hiddenRejectionStatus);
        if (aPending !== bPending) return aPending ? -1 : 1;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
  }, [hiddenQuery, hiddenRejections, hiddenStatusFilter]);

  const hiddenPageSize = 20;
  const hiddenPageCount = Math.max(1, Math.ceil(filteredHiddenRejections.length / hiddenPageSize));
  const pagedHiddenRejections = filteredHiddenRejections.slice((hiddenPage - 1) * hiddenPageSize, hiddenPage * hiddenPageSize);

  useEffect(() => setHiddenPage(1), [hiddenQuery, hiddenStatusFilter, monthFilter]);

  const totals = {
    pending: monthlyRecords.filter((record) => (record.result || "PENDIENTE") === "PENDIENTE").length,
    delivered: monthlyRecords.filter((record) => record.result === "ENTREGADO").length,
    rejected: monthlyRecords.filter((record) => record.result === "RECHAZO" || record.result === "RECHAZADO").length,
    operatorsWithoutFollowUp: operatorSummary.filter((item) => item.withoutFollowUp > 0).length
  };

  return (
    <AppLayout role="staff" title="Seguimiento de ventas">
      <section className="card grid grid-cols-2 overflow-hidden xl:grid-cols-4">
        <button className="border-b border-r border-line p-4 text-left transition hover:bg-amber-50 xl:border-b-0" onClick={() => setResultFilter("PENDIENTE")}>
          <p className="text-xs font-bold uppercase text-muted">Pendientes</p>
          <p className="mt-1 text-2xl font-bold text-amber-700">{totals.pending}</p>
          <p className="text-xs text-muted">Ver pedidos por gestionar</p>
        </button>
        <button className="border-b border-line p-4 text-left transition hover:bg-emerald-50 xl:border-b-0 xl:border-r" onClick={() => setResultFilter("ENTREGADO")}>
          <p className="text-xs font-bold uppercase text-muted">Entregadas</p>
          <p className="mt-1 text-2xl font-bold text-emerald-700">{totals.delivered}</p>
          <p className="text-xs text-muted">Confirmadas este mes</p>
        </button>
        <button className="border-r border-line p-4 text-left transition hover:bg-red-50 xl:border-b-0" onClick={() => setResultFilter("RECHAZO")}>
          <p className="text-xs font-bold uppercase text-muted">Rechazadas</p>
          <p className="mt-1 text-2xl font-bold text-red-700">{totals.rejected}</p>
          <p className="text-xs text-muted">Pedidos no entregados</p>
        </button>
        <button className="p-4 text-left transition hover:bg-red-50" onClick={() => setOperatorFilter("Sin gestion")}>
          <p className="text-xs font-bold uppercase text-muted">Atencion requerida</p>
          <p className="mt-1 text-2xl font-bold text-red-700">{totals.operatorsWithoutFollowUp}</p>
          <p className="text-xs text-muted">Operadores sin gestion</p>
        </button>
      </section>

      <section className="mt-4 card p-4">
        <div className="grid gap-3 md:grid-cols-[1fr_180px_180px_170px]">
          <label className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={16} />
            <input
              className="input-base pl-9"
              placeholder="Buscar operador, pedido, telefono o producto"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <select aria-label="Estado del pedido" className="input-base" value={resultFilter} onChange={(event) => setResultFilter(event.target.value)}>
            <option value="Todos">Todos los estados</option>
            {deliveryStatusOptions.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
          <select aria-label="Gestion del operador" className="input-base" value={operatorFilter} onChange={(event) => setOperatorFilter(event.target.value)}>
            <option value="Todos">Todos los operadores</option>
            <option>Sin gestion</option>
            <option>Con seguimiento</option>
            <option>Al dia</option>
          </select>
          <MonthNavigator value={monthFilter} onChange={setMonthFilter} />
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
          <p><strong className="text-ink">{filteredOperatorSummary.length}</strong> operadores encontrados</p>
          {(query || resultFilter !== "Todos" || operatorFilter !== "Todos") ? (
            <button className="font-bold text-brand-700 hover:underline" onClick={() => { setQuery(""); setResultFilter("Todos"); setOperatorFilter("Todos"); }}>Limpiar filtros</button>
          ) : null}
        </div>
        {message ? (
          <p className="mt-3 rounded-md bg-cyan/10 p-2 text-sm font-semibold text-brand-700">{message}</p>
        ) : null}
      </section>

      <section className="mt-4 card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-4">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-md bg-brand-50 text-brand-700"><UsersRound size={18} /></span>
            <div>
              <h2 className="font-bold text-ink">Control por operador</h2>
              <p className="text-sm text-muted">Los casos sin gestion aparecen primero. Abre una fila para revisar sus pedidos.</p>
            </div>
          </div>
          <span className="rounded-md bg-soft px-3 py-2 text-xs font-bold text-muted">Pagina {operatorPage} de {operatorPageCount}</span>
        </div>
        <div className="hidden grid-cols-[minmax(220px,1.4fr)_110px_125px_150px_minmax(250px,1fr)_32px] gap-3 border-b border-line bg-soft px-4 py-2 text-xs font-bold uppercase text-muted xl:grid">
          <span>Operador</span><span>Por gestionar</span><span>Ultima gestion</span><span>Entrega</span><span>Estado de pedidos</span><span />
        </div>
        <div className="divide-y divide-line">
          {pagedOperatorSummary.length ? (
            pagedOperatorSummary.map((item) => (
              <details key={item.operator}>
                <summary className="group grid cursor-pointer list-none gap-3 px-4 py-3 transition hover:bg-soft xl:grid-cols-[minmax(220px,1.4fr)_110px_125px_150px_minmax(250px,1fr)_32px] xl:items-center">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-bold uppercase text-ink">{item.operator}</h3>
                      {item.withoutFollowUp ? (
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-700">Requiere atencion</span>
                      ) : (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700">Al dia</span>
                      )}
                    </div>
                    <p className="text-xs text-muted">
                      {item.operatorName && item.operatorName !== item.operator ? `${item.operatorName} · ` : ""}{item.total} ventas en el mes
                    </p>
                  </div>
                  <div className={`flex items-center gap-2 text-sm font-bold ${item.withoutFollowUp ? "text-red-700" : "text-emerald-700"}`}>
                    {item.withoutFollowUp ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}
                    {item.withoutFollowUp}
                  </div>
                  <p className="text-xs font-semibold text-muted">{item.lastFollowUp ? new Date(item.lastFollowUp).toLocaleDateString("es-CO", { day: "2-digit", month: "short" }) : "Sin registro"}</p>
                  <div>
                    <div className="mb-1 flex items-center justify-between text-xs font-bold text-muted">
                      <span>{item.delivered}/{item.total}</span>
                      <span>{item.deliveryRate}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-soft">
                      <div className="h-2 rounded-full bg-emerald-500" style={{ width: `${item.deliveryRate}%` }} />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5 text-[11px] font-bold">
                    <span className="rounded bg-emerald-50 px-2 py-1 text-emerald-700">Ent {item.delivered}</span>
                    <span className="rounded bg-amber-50 px-2 py-1 text-amber-700">Pend {item.pending}</span>
                    <span className="rounded bg-slate-100 px-2 py-1 text-slate-700">NC {item.noAnswer}</span>
                    <span className="rounded bg-cyan/10 px-2 py-1 text-brand-700">PC {item.promise}</span>
                    <span className="rounded bg-red-50 px-2 py-1 text-red-700">Rech {item.rejected}</span>
                  </div>
                  <ChevronDown className="text-muted transition group-open:rotate-180" size={18} />
                </summary>
                <div className="border-t border-line bg-white">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[980px]">
                      <thead className="bg-soft text-left text-xs uppercase text-muted">
                        <tr>
                          <th className="table-cell">Pedido No</th>
                          <th className="table-cell">Telefono</th>
                          <th className="table-cell">Fecha</th>
                          <th className="table-cell">Producto</th>
                          <th className="table-cell">Estado de entrega</th>
                          <th className="table-cell">Seguimiento</th>
                          <th className="table-cell">Verificado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {item.records.map((record) => {
                          const needsAction = ["PENDIENTE", "NO CONTESTA", "PROMETE COMPRAR"].includes(record.result || "PENDIENTE") && !record.followUpAt;
                          return (
                          <tr key={record.id} className={needsAction ? "bg-red-50/60" : undefined}>
                            <td className="table-cell font-semibold">{record.orderNumber || "-"}</td>
                            <td className="table-cell">{record.phone || "-"}</td>
                            <td className="table-cell">{record.recordDate || "-"}</td>
                            <td className="table-cell">{record.product || "-"}</td>
                            <td className="table-cell">
                              <select
                                className="input-base min-w-36"
                                value={record.result || "PENDIENTE"}
                                onChange={(event) => updateRecord(record.id, "result", event.target.value)}
                              >
                                {deliveryStatusOptions.map((option) => (
                                  <option key={option}>{option}</option>
                                ))}
                              </select>
                            </td>
                            <td className="table-cell">
                              <input
                                className="input-base min-w-64"
                                placeholder="Nota de seguimiento"
                                value={record.followUpNote || ""}
                                onChange={(event) => updateRecord(record.id, "followUpNote", event.target.value)}
                              />
                            </td>
                            <td className="table-cell text-sm">
                              {record.followUpAt ? new Date(record.followUpAt).toLocaleString("es-CO") : <span className="font-bold text-red-700">Sin gestion</span>}
                            </td>
                          </tr>
                        );})}
                      </tbody>
                    </table>
                  </div>
                </div>
              </details>
            ))
          ) : (
            <div className="p-5 text-sm text-muted">
              No hay ventas para seguimiento con los filtros actuales.
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 text-sm">
          <p className="text-muted">Mostrando {pagedOperatorSummary.length} de {filteredOperatorSummary.length} operadores</p>
          <div className="flex gap-2">
            <button className="btn-secondary py-2" disabled={operatorPage === 1} onClick={() => setOperatorPage((page) => Math.max(1, page - 1))}>Anterior</button>
            <button className="btn-secondary py-2" disabled={operatorPage === operatorPageCount} onClick={() => setOperatorPage((page) => Math.min(operatorPageCount, page + 1))}>Siguiente</button>
          </div>
        </div>
      </section>

      {false ? <section className="mt-6 card overflow-hidden">
        <div className="border-b border-line p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2"><ShieldCheck className="text-brand-600" size={20} /><h2 className="text-lg font-bold text-ink">Gestion de rechazos ocultos</h2></div>
              <p className="mt-1 text-sm text-muted">Los pendientes se atienden aqui; las decisiones anteriores quedan en el historial.</p>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-xs font-bold">
              <button className={`rounded-md px-3 py-2 ${hiddenStatusFilter === "Pendiente" ? "bg-amber-500 text-white" : "bg-amber-50 text-amber-700"}`} onClick={() => setHiddenStatusFilter("Pendiente")}>Pendientes {hiddenRejectionTotals.pending}</button>
              <button className={`rounded-md px-3 py-2 ${hiddenStatusFilter === "Aprobado" ? "bg-emerald-600 text-white" : "bg-emerald-50 text-emerald-700"}`} onClick={() => setHiddenStatusFilter("Aprobado")}>Aprobados {hiddenRejectionTotals.approved}</button>
              <button className={`rounded-md px-3 py-2 ${hiddenStatusFilter === "No aprobado" ? "bg-red-600 text-white" : "bg-red-50 text-red-700"}`} onClick={() => setHiddenStatusFilter("No aprobado")}>No aprobados {hiddenRejectionTotals.rejected}</button>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <label className="relative min-w-64 flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={16} />
              <input className="input-base pl-9" placeholder="Buscar usuario, pedido o producto" value={hiddenQuery} onChange={(event) => setHiddenQuery(event.target.value)} />
            </label>
            <button className={`btn-secondary ${hiddenStatusFilter === "Todos" ? "bg-soft" : ""}`} onClick={() => setHiddenStatusFilter("Todos")}>Ver todo el historial</button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px]">
            <thead className="bg-soft text-left text-xs uppercase text-muted">
              <tr><th className="table-cell">Operador</th><th className="table-cell">Pedido</th><th className="table-cell">Producto / tratamiento</th><th className="table-cell">Fecha</th><th className="table-cell">Gestion previa</th><th className="table-cell">Estado</th><th className="table-cell">Decision Staff</th></tr>
            </thead>
            <tbody>
              {pagedHiddenRejections.length ? pagedHiddenRejections.map((record) => {
                const pending = ["Pendiente", "En revision", undefined].includes(record.hiddenRejectionStatus);
                return (
                  <tr key={record.id} className={record.hiddenRejectionStatus === "No aprobado" ? "bg-red-50/60" : record.hiddenRejectionStatus === "Aprobado" ? "bg-emerald-50/60" : undefined}>
                    <td className="table-cell"><strong className="block text-ink">{record.operatorUsername || record.operator || "-"}</strong></td>
                    <td className="table-cell font-semibold">{record.orderNumber || "Sin numero"}</td>
                    <td className="table-cell"><span className="block">{record.product || "Sin producto"}</span><strong className="text-brand-700">{record.treatment || "Sin tratamiento"}</strong></td>
                    <td className="table-cell">{record.recordDate || new Date(record.createdAt).toLocaleDateString("es-CO")}</td>
                    <td className="table-cell text-sm"><span className="block">Comunicado: {record.communicated || "No"}</span><span className="block">3ra llamada: {record.thirdCallback || "No"}</span><span className="mt-1 block max-w-xs text-muted">{record.observation || "Sin comentario"}</span></td>
                    <td className="table-cell"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${record.hiddenRejectionStatus === "Aprobado" ? "bg-emerald-100 text-emerald-700" : record.hiddenRejectionStatus === "No aprobado" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>{record.hiddenRejectionStatus || "Pendiente"}</span></td>
                    <td className="table-cell">
                      {pending ? <div className="flex gap-2"><button className="btn-secondary py-1.5 text-emerald-700" onClick={() => openHiddenDecision(record, "Aprobado")}><CheckCircle2 size={15} /> Aprobar</button><button className="btn-secondary py-1.5 text-red-700" onClick={() => openHiddenDecision(record, "No aprobado")}><XCircle size={15} /> No aprobar</button></div> : <div className="max-w-xs text-sm"><p className="font-semibold text-ink">Decision finalizada</p><p className="mt-1 text-muted">{record.followUpNote || "Notificacion enviada al operador."}</p></div>}
                    </td>
                  </tr>
                );
              }) : <tr><td className="table-cell py-8 text-center text-muted" colSpan={7}>No hay solicitudes en esta bandeja.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-line px-4 py-3 text-sm">
          <span className="text-muted">{filteredHiddenRejections.length} solicitudes</span>
          <div className="flex items-center gap-2"><button className="btn-secondary py-1.5" disabled={hiddenPage <= 1} onClick={() => setHiddenPage((page) => page - 1)}>Anterior</button><span>{hiddenPage} / {hiddenPageCount}</span><button className="btn-secondary py-1.5" disabled={hiddenPage >= hiddenPageCount} onClick={() => setHiddenPage((page) => page + 1)}>Siguiente</button></div>
        </div>
      </section> : null}

      <Modal title={hiddenDecision === "Aprobado" ? "Aprobar rechazo oculto" : "No aprobar rechazo oculto"} open={Boolean(selectedHiddenRecord)} onClose={() => setSelectedHiddenRecord(null)}>
        {selectedHiddenRecord ? <div className="space-y-4">
          <div className="rounded-md bg-soft p-4"><p className="text-sm text-muted">Operador</p><p className="font-bold text-ink">{selectedHiddenRecord.operatorUsername || selectedHiddenRecord.operator}</p><div className="mt-3 grid grid-cols-2 gap-3 text-sm"><div><span className="text-muted">Pedido</span><strong className="block">{selectedHiddenRecord.orderNumber || "-"}</strong></div><div><span className="text-muted">Tratamiento</span><strong className="block">{selectedHiddenRecord.treatment || "-"}</strong></div></div></div>
          <div className={`rounded-md p-3 text-sm font-semibold ${hiddenDecision === "Aprobado" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{hiddenDecision === "Aprobado" ? "Al aprobar, este registro deja de contar como rechazo del operador." : "Al no aprobar, este registro permanece como rechazo efectivo del operador."}</div>
          <label className="block"><span className="mb-1 block text-sm font-semibold text-ink">Mensaje para el operador</span><textarea className="input-base min-h-28 resize-none" value={decisionNote} onChange={(event) => setDecisionNote(event.target.value)} /></label>
          <div className="flex gap-3"><button className="btn-secondary flex-1 justify-center" onClick={() => setSelectedHiddenRecord(null)}>Cancelar</button><button className={`flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold text-white ${hiddenDecision === "Aprobado" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-red-600 hover:bg-red-700"}`} onClick={confirmHiddenDecision}>{hiddenDecision === "Aprobado" ? <CheckCircle2 size={16} /> : <XCircle size={16} />} Confirmar</button></div>
        </div> : null}
      </Modal>

    </AppLayout>
  );
}
