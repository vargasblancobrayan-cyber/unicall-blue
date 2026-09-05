"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clipboard, Gauge, PackageCheck, Pencil, Search, Target, Trash2, TrendingUp, X } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { Modal } from "@/components/Modal";
import { MonthNavigator } from "@/components/PeriodNavigator";
import { CommercialRecord, readStoredRecords, writeStoredRecords } from "@/lib/records";
import { commercialMonthRange, deleteCommercialRecord, loadCommercialRecords, saveCommercialRecord } from "@/lib/cloud-records";
import { CurrentProfile, loadCurrentProfile } from "@/lib/cloud-shifts";
import {
  DailyPerformanceSummary,
  PerformanceMetric,
  loadLatestDailyPerformanceSummary,
  loadLatestMyPerformance,
  loadMyPerformance,
  readPerformanceTargets
} from "@/lib/performance-metrics";

const resultOptions = ["PENDIENTE", "ENTREGADO", "RECHAZO", "NO CONTESTA", "PROMETE COMPRAR"];
const treatmentOptions = ["2+1", "3+2", "4+3", "5+4", "6+5"];
const productOptions = ["DEFENOX", "OMNILAR", "TALORIX BOLD", "TOXICOFF", "UP VIZOL", "CONGELUM", "MOTION ENERGY", "VENISELLE", "NIAPEPT", "LAVA BLAZE", "FOOT TROOPER", "MATCHA SURI", "BERZEO", "YENKI DERM", "BLUESTONE", "SCRIPT SIMPLA 360", "MAGICOA", "VERDEXEDIL"];

export default function OperatorOrdersPage() {
  const [records, setRecords] = useState<CommercialRecord[]>([]);
  const [operatorProfile, setOperatorProfile] = useState<CurrentProfile | null>(null);
  const [query, setQuery] = useState("");
  const [resultFilter, setResultFilter] = useState("PENDIENTE");
  const [monthFilter, setMonthFilter] = useState(new Date().toISOString().slice(0, 7));
  const [selectedRecord, setSelectedRecord] = useState<CommercialRecord | null>(null);
  const [editForm, setEditForm] = useState({ orderNumber: "", recordDate: "", product: "DEFENOX", treatment: "2+1", paymentMethod: "MONEY ORDEN", result: "PENDIENTE", followUpNote: "" });
  const [savedAnimation, setSavedAnimation] = useState(false);
  const [message, setMessage] = useState("");
  const [lastStatusMove, setLastStatusMove] = useState<{ orderNumber: string; from: string; to: string } | null>(null);
  const [recordToDelete, setRecordToDelete] = useState<CommercialRecord | null>(null);
  const [dailyPerformance, setDailyPerformance] = useState<PerformanceMetric | null>(null);
  const [monthlyPerformance, setMonthlyPerformance] = useState<PerformanceMetric | null>(null);
  const [generalSummary, setGeneralSummary] = useState<DailyPerformanceSummary | null>(null);

  useEffect(() => {
    let isMounted = true;
    async function loadOrders() {
      const profile = await loadCurrentProfile().catch(() => null);
      const storedRecords = await loadCommercialRecords({
        ...commercialMonthRange(monthFilter),
        recordTypes: ["sale"],
        limit: 400
      }).catch(() => readStoredRecords());
      const salesRecords = storedRecords.filter((record) => record.type === "sale");
      if (!isMounted) return;
      setOperatorProfile(profile);
      setRecords(salesRecords.filter((record) => belongsToOperator(record, profile)));
    }
    loadOrders();
    return () => {
      isMounted = false;
    };
  }, [monthFilter]);

  useEffect(() => {
    let isMounted = true;
    async function loadMonthPerformance() {
      const today = new Date().toISOString().slice(0, 10);
      const monthStart = `${monthFilter}-01`;
      const [exactDayMetric, latestDayMetric, exactMonthMetric, latestMonthMetric, latestGeneralSummary] = await Promise.all([
        loadMyPerformance(today, "day").catch(() => null),
        loadLatestMyPerformance("day").catch(() => null),
        loadMyPerformance(monthStart, "month").catch(() => null),
        loadLatestMyPerformance("month").catch(() => null),
        loadLatestDailyPerformanceSummary("day").catch(() => null)
      ]);
      const dayMetric = exactDayMetric || latestDayMetric;
      const metricForMonth = (exactMonthMetric || latestMonthMetric)?.metricDate?.slice(0, 7) === monthFilter
        ? (exactMonthMetric || latestMonthMetric)
        : null;
      const visibleGeneralSummary = latestGeneralSummary;
      if (isMounted) {
        setDailyPerformance(dayMetric);
        setMonthlyPerformance(metricForMonth);
        setGeneralSummary(visibleGeneralSummary);
      }
    }
    loadMonthPerformance();
    return () => {
      isMounted = false;
    };
  }, [monthFilter]);

  function belongsToOperator(record: CommercialRecord, profile: CurrentProfile | null) {
    if (!profile || profile.role !== "operator") return true;
    return (
      record.operatorId === profile.id ||
      record.operatorUsername === profile.username ||
      record.operator === profile.fullName
    );
  }

  const filteredRecords = useMemo(
    () =>
      records.filter((record) => {
        const searchable = [record.orderNumber, record.product, record.result, record.paymentMethod]
          .join(" ")
          .toLowerCase();
        const matchesQuery = searchable.includes(query.toLowerCase());
        const matchesResult = resultFilter === "TODOS" || (record.result || "PENDIENTE") === resultFilter;
        const matchesMonth = (record.recordDate || record.createdAt || "").slice(0, 7) === monthFilter;
        return matchesQuery && matchesResult && matchesMonth;
      }),
    [monthFilter, query, records, resultFilter]
  );

  const monthlyRecords = useMemo(
    () =>
      records.filter((record) => {
        const monthValue = (record.recordDate || record.createdAt || "").slice(0, 7);
        return monthValue === monthFilter;
      }),
    [monthFilter, records]
  );

  const monthlySummary = {
    total: monthlyRecords.length,
    delivered: monthlyRecords.filter((record) => record.result === "ENTREGADO").length,
    pending: monthlyRecords.filter((record) => (record.result || "PENDIENTE") === "PENDIENTE").length,
    noAnswer: monthlyRecords.filter((record) => record.result === "NO CONTESTA").length,
    promise: monthlyRecords.filter((record) => record.result === "PROMETE COMPRAR").length,
    rejected: monthlyRecords.filter((record) => record.result === "RECHAZO" || record.result === "RECHAZADO").length
  };

  const missingToClose =
    monthlySummary.total -
    monthlySummary.delivered -
    monthlySummary.rejected;

  const targets = readPerformanceTargets();
  const monthLabel = new Date(`${monthFilter}-01T12:00:00`).toLocaleDateString("es-CO", {
    month: "long",
    year: "numeric"
  });
  const deliveredRate = monthlySummary.total ? Math.round((monthlySummary.delivered / monthlySummary.total) * 100) : 0;
  const closedOrders = monthlySummary.delivered + monthlySummary.rejected;
  const averageCheck = monthlyPerformance?.averageCheck || 0;
  const hasAverageCheck = averageCheck > 0;
  const averageCheckOk = hasAverageCheck && averageCheck >= targets.minimumAverageCheck;
  const generalApprovedRate = generalSummary?.approvedRate || (generalSummary?.totalOrders ? (generalSummary.approvedSales / generalSummary.totalOrders) * 100 : 0);
  const hasTodayPerformance = Boolean(dailyPerformance?.processingFile || dailyPerformance?.hourlyFile || generalSummary);

  const statusFilters = [
    { label: "Todos", value: "TODOS", count: monthlySummary.total },
    { label: "Pendientes", value: "PENDIENTE", count: monthlySummary.pending },
    { label: "No contesta", value: "NO CONTESTA", count: monthlySummary.noAnswer },
    { label: "Promete", value: "PROMETE COMPRAR", count: monthlySummary.promise },
    { label: "Entregados", value: "ENTREGADO", count: monthlySummary.delivered },
    { label: "Rechazos", value: "RECHAZO", count: monthlySummary.rejected }
  ];

  function statusLabel(status: string) {
    return statusFilters.find((filter) => filter.value === status)?.label || status;
  }

  function openOrder(record: CommercialRecord) {
    setSelectedRecord(record);
    setSavedAnimation(false);
    setEditForm({
      orderNumber: record.orderNumber || "",
      recordDate: record.recordDate || "",
      product: record.product || "DEFENOX",
      treatment: record.treatment || "2+1",
      paymentMethod: record.paymentMethod || "MONEY ORDEN",
      result: record.result || "PENDIENTE",
      followUpNote: record.followUpNote || ""
    });
  }

  async function saveOrderChanges() {
    if (!selectedRecord || !editForm.orderNumber.trim()) {
      setMessage("El numero de pedido es obligatorio.");
      return;
    }
    const previousResult = selectedRecord.result || "PENDIENTE";
    const nextResult = editForm.result || "PENDIENTE";
    const storedRecords = readStoredRecords();
    const allRecords = storedRecords.some((record) => record.id === selectedRecord.id)
      ? storedRecords
      : [...storedRecords, selectedRecord];
    const nextAllRecords = allRecords.map((record) =>
      record.id === selectedRecord.id
        ? {
            ...record,
            ...editForm,
            orderNumber: editForm.orderNumber.trim(),
            followUpAt: new Date().toISOString(),
            verifiedBy: operatorProfile?.fullName || "Operador"
          }
        : record
    );
    writeStoredRecords(nextAllRecords);
    const nextOperatorRecords = nextAllRecords.filter(
      (record) => record.type === "sale" && belongsToOperator(record, operatorProfile)
    );
    setRecords(nextOperatorRecords);
    const changedRecord = nextAllRecords.find((record) => record.id === selectedRecord.id);
    setSelectedRecord(null);
    setQuery("");
    setResultFilter(nextResult);
    setLastStatusMove({
      orderNumber: editForm.orderNumber.trim(),
      from: previousResult,
      to: nextResult
    });
    try {
      if (changedRecord) await saveCommercialRecord(changedRecord);
      setSavedAnimation(true);
      setMessage(
        previousResult === nextResult
          ? `Pedido ${editForm.orderNumber.trim()} actualizado en ${statusLabel(nextResult)}.`
          : `Pedido ${editForm.orderNumber.trim()} movido a ${statusLabel(nextResult)}.`
      );
      window.setTimeout(() => setSavedAnimation(false), 1800);
    } catch {
      setMessage("Actualizado en este equipo; pendiente de sincronizar con la base central.");
    }
  }

  async function copyOrder(record: CommercialRecord) {
    const text = [
      `Pedido No: ${record.orderNumber || "-"}`,
      `Fecha: ${record.recordDate || "-"}`,
      `Producto: ${record.product || "-"}`,
      `Tratamiento: ${record.treatment || "-"}`,
      `Forma de pago: ${record.paymentMethod || "-"}`,
      `Estado de entrega: ${record.result || "PENDIENTE"}`,
      `Seguimiento: ${record.followUpNote || "-"}`
    ].join("\n");

    await navigator.clipboard.writeText(text);
    setMessage("Datos copiados.");
  }

  async function confirmDeleteOrder() {
    if (!recordToDelete) return;
    const allRecords = readStoredRecords();
    const nextAllRecords = allRecords.filter((record) => record.id !== recordToDelete.id);
    writeStoredRecords(nextAllRecords);
    setRecords((current) => current.filter((record) => record.id !== recordToDelete.id));
    try {
      await deleteCommercialRecord(recordToDelete.id);
      setMessage(`Pedido ${recordToDelete.orderNumber || "sin numero"} eliminado.`);
    } catch {
      writeStoredRecords(allRecords);
      setRecords(allRecords.filter((record) => record.type === "sale"));
      setMessage("No se pudo eliminar el pedido de la base central.");
    }
    setRecordToDelete(null);
  }

  function statusClass(result?: string) {
    if (result === "ENTREGADO") return "bg-emerald-100 text-emerald-700";
    if (result === "RECHAZO" || result === "RECHAZADO") return "bg-red-100 text-red-700";
    if (result === "NO CONTESTA") return "bg-slate-200 text-slate-700";
    if (result === "PROMETE COMPRAR") return "bg-cyan/10 text-brand-700";
    return "bg-amber-100 text-amber-700";
  }

  function formatMetricDate(value?: string) {
    if (!value) return "Pendiente";
    return new Date(`${value}T12:00:00`).toLocaleDateString("es-CO", { day: "numeric", month: "short" });
  }

  function formatMetricTime(value?: string) {
    if (!value) return "Sin publicar";
    return new Date(value).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
  }

  function metricStatusClass(ready: boolean) {
    return ready ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600";
  }

  return (
    <AppLayout role="operator" title="Mis pedidos">
            {/* Bloque de rendimiento publicado removido de Mis pedidos para evitar duplicidad visual. */}


      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line p-4 sm:p-5">
          <div>
            <p className="text-xs font-black uppercase tracking-wide text-brand-700">Mi mes de entregas</p>
            <h2 className="mt-1 text-lg font-bold capitalize text-ink">{monthLabel}</h2>
            <p className="mt-1 text-sm text-muted">Ventas, entregas y calidad del mes sin buscar entre tablas.</p>
          </div>
          <div><span className="mb-1 block text-sm font-semibold text-ink">Mes</span><MonthNavigator value={monthFilter} onChange={setMonthFilter} /></div>
        </div>
        <div className="grid gap-3 p-4 sm:p-5 lg:grid-cols-3">
          <div className="rounded-lg border border-brand-100 bg-brand-50/70 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-wide text-brand-700">1. General del mes</p>
                <h3 className="mt-1 text-lg font-black text-ink">Base de pedidos</h3>
              </div>
              <PackageCheck className="rounded-md bg-white p-2 text-brand-700 shadow-sm" size={34} />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-md bg-white p-3">
                <p className="text-xs font-bold text-muted">Ventas</p>
                <p className="mt-1 text-2xl font-black text-ink">{monthlySummary.total}</p>
              </div>
              <div className="rounded-md bg-white p-3">
                <p className="text-xs font-bold text-muted">Por cerrar</p>
                <p className="mt-1 text-2xl font-black text-amber-700">{Math.max(0, missingToClose)}</p>
              </div>
            </div>
            <p className="mt-3 rounded-md bg-white/70 px-3 py-2 text-xs font-semibold text-muted">
              {monthlySummary.total ? `${closedOrders} pedidos ya tienen cierre registrado.` : "Aun no hay pedidos cargados para este mes."}
            </p>
          </div>

          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-wide text-emerald-700">2. Entregas</p>
                <h3 className="mt-1 text-lg font-black text-ink">Avance del mes</h3>
              </div>
              <TrendingUp className="rounded-md bg-white p-2 text-emerald-700 shadow-sm" size={34} />
            </div>
            <div className="mt-4 rounded-md bg-white p-4">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase text-muted">Entregados</p>
                  <p className="mt-1 text-3xl font-black text-emerald-700">{monthlySummary.delivered}<span className="text-base text-muted"> / {monthlySummary.total}</span></p>
                </div>
                <p className="text-2xl font-black text-ink">{deliveredRate}%</p>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${Math.min(100, deliveredRate)}%` }} />
              </div>
            </div>
            <p className="mt-3 rounded-md bg-white/70 px-3 py-2 text-xs font-semibold text-emerald-800">
              {monthlySummary.pending ? `${monthlySummary.pending} pendientes necesitan seguimiento.` : "Sin pendientes abiertos en este filtro mensual."}
            </p>
          </div>

          <div className={`rounded-lg border p-4 ${hasAverageCheck ? averageCheckOk ? "border-cyan/30 bg-cyan/10" : "border-amber-200 bg-amber-50" : "border-line bg-soft"}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-wide text-brand-700">3. Calidad del mes</p>
                <h3 className="mt-1 text-lg font-black text-ink">Factura promedio</h3>
              </div>
              <Target className="rounded-md bg-white p-2 text-brand-700 shadow-sm" size={34} />
            </div>
            <div className="mt-4 rounded-md bg-white p-4">
              <p className="text-xs font-bold uppercase text-muted">Promedio actual</p>
              <p className={`mt-1 text-3xl font-black ${hasAverageCheck ? averageCheckOk ? "text-emerald-700" : "text-amber-700" : "text-muted"}`}>
                {hasAverageCheck ? averageCheck.toFixed(2) : "--"}
              </p>
              <p className="mt-1 text-xs font-semibold text-muted">Meta minima {targets.minimumAverageCheck.toFixed(2)}</p>
            </div>
            <p className={`mt-3 rounded-md px-3 py-2 text-xs font-semibold ${hasAverageCheck ? averageCheckOk ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800" : "bg-white text-muted"}`}>
              {hasAverageCheck ? averageCheckOk ? "Meta cumplida para el mes." : "Por debajo de la meta: revisar calidad de cierre." : "Staff aun no sube el resumen mensual de Procesando."}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 divide-x divide-y divide-line border-t border-line bg-white sm:grid-cols-4 lg:grid-cols-7 lg:divide-y-0">
          {[
            ["Ventas", monthlySummary.total, "text-ink"],
            ["Entregados", monthlySummary.delivered, "text-emerald-700"],
            ["Pendientes", monthlySummary.pending, "text-amber-700"],
            ["No contesta", monthlySummary.noAnswer, "text-slate-700"],
            ["Promete", monthlySummary.promise, "text-brand-700"],
            ["Rechazos", monthlySummary.rejected, "text-red-700"],
            ["Por cerrar", Math.max(0, missingToClose), "text-amber-700"]
          ].map(([label, value, color]) => (
            <div className="p-3 text-center" key={String(label)}>
              <p className="text-xs font-semibold text-muted">{label}</p>
              <p className={`mt-1 text-xl font-bold ${color}`}>{value}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-5 card overflow-hidden">
        <div className="border-b border-line p-4 sm:p-5">
          <div className="grid gap-3 md:grid-cols-[1fr_auto]">
          <label className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={16} />
            <input
              className="input-base pl-9"
              placeholder="Buscar por pedido o producto"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
            <p className="self-center text-sm text-muted">{filteredRecords.length} pedido{filteredRecords.length === 1 ? "" : "s"}</p>
          </div>
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {statusFilters.map((filter) => (
              <button
                className={`shrink-0 rounded-md px-3 py-2 text-sm font-semibold transition ${resultFilter === filter.value ? "bg-brand-600 text-white" : "bg-soft text-ink hover:bg-slate-200"}`}
                key={filter.value}
                onClick={() => setResultFilter(filter.value)}
              >
                {filter.label} <span className="ml-1 opacity-75">{filter.count}</span>
              </button>
            ))}
          </div>
        </div>
        {lastStatusMove ? (
          <div className="m-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-cyan/30 bg-cyan/10 p-3 text-sm text-brand-800 sm:m-5">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 shrink-0 text-emerald-600" size={18} />
              <div>
                <p className="font-bold">
                  Pedido {lastStatusMove.orderNumber} ahora esta en {statusLabel(lastStatusMove.to)}.
                </p>
                <p className="mt-0.5 text-muted">
                  Si cambio de estado, sale de {statusLabel(lastStatusMove.from)} y queda guardado en su nueva lista.
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button className="btn-secondary py-2" onClick={() => setResultFilter(lastStatusMove.to)}>
                Ver {statusLabel(lastStatusMove.to)}
              </button>
              <button className="btn-secondary py-2" onClick={() => setResultFilter("TODOS")}>
                Ver todos
              </button>
            </div>
          </div>
        ) : null}
        {message ? (
          <p className="mx-4 mt-3 rounded-md bg-soft p-2 text-sm font-semibold text-brand-700 sm:mx-5">{message}</p>
        ) : null}
        {filteredRecords.length ? (
          <div className="overflow-x-auto">
                <table className="w-full min-w-[900px]">
                  <thead className="bg-soft text-left text-xs uppercase text-muted">
                    <tr>
                      <th className="table-cell">Pedido No</th>
                      <th className="table-cell">Fecha</th>
                      <th className="table-cell">Producto</th>
                      <th className="table-cell">Tratamiento</th>
                      <th className="table-cell">Forma de pago</th>
                      <th className="table-cell">Estado</th>
                      <th className="table-cell">Seguimiento</th>
                      <th className="table-cell">Accion</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRecords.map((record) => (
                        <tr key={record.id}>
                          <td className="table-cell font-semibold">{record.orderNumber || "-"}</td>
                          <td className="table-cell">{record.recordDate || "-"}</td>
                          <td className="table-cell">{record.product || "-"}</td>
                          <td className="table-cell">{record.treatment || "-"}</td>
                          <td className="table-cell">{record.paymentMethod || "-"}</td>
                          <td className="table-cell"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${statusClass(record.result)}`}>{record.result || "PENDIENTE"}</span></td>
                          <td className="table-cell">{record.followUpNote || "-"}</td>
                          <td className="table-cell">
                            <div className="flex gap-2">
                            <button className="btn-secondary py-1.5" onClick={() => openOrder(record)}>
                              <Pencil size={15} />
                              Abrir
                            </button>
                            <button className="inline-flex items-center justify-center rounded-md border border-red-200 bg-white p-2 text-red-600 transition hover:bg-red-50" onClick={() => setRecordToDelete(record)} aria-label={`Eliminar pedido ${record.orderNumber || ""}`} title="Eliminar pedido">
                              <Trash2 size={16} />
                            </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
        ) : (
          <div className="p-8 text-center text-sm text-muted">
            <p className="font-semibold text-ink">No hay pedidos en {statusLabel(resultFilter)}.</p>
            <p className="mt-1">Cambia de estado arriba o revisa todos los pedidos del mes.</p>
            <button className="btn-secondary mx-auto mt-4 justify-center" onClick={() => setResultFilter("TODOS")}>
              Ver todos
            </button>
          </div>
        )}
      </section>

      <Modal
        title={`Pedido ${selectedRecord?.orderNumber || ""}`}
        open={Boolean(selectedRecord)}
        onClose={() => setSelectedRecord(null)}
      >
        {selectedRecord ? (
          <div className="space-y-4">
            {savedAnimation ? <div className="flex items-center gap-3 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700"><CheckCircle2 className="animate-bounce" size={20} /><strong>Correccion guardada correctamente</strong></div> : null}

            <div className="grid gap-3 md:grid-cols-2">
              <label><span className="mb-1 block text-sm font-semibold text-ink">Pedido No</span><input className="input-base" value={editForm.orderNumber} onChange={(event) => setEditForm((current) => ({ ...current, orderNumber: event.target.value }))} /></label>
              <label><span className="mb-1 block text-sm font-semibold text-ink">Fecha</span><input className="input-base" type="date" value={editForm.recordDate} onChange={(event) => setEditForm((current) => ({ ...current, recordDate: event.target.value }))} /></label>
              <label><span className="mb-1 block text-sm font-semibold text-ink">Producto</span><select className="input-base" value={editForm.product} onChange={(event) => setEditForm((current) => ({ ...current, product: event.target.value }))}>{productOptions.map((option) => <option key={option}>{option}</option>)}</select></label>
              <label><span className="mb-1 block text-sm font-semibold text-ink">Tratamiento</span><select className="input-base" value={editForm.treatment} onChange={(event) => setEditForm((current) => ({ ...current, treatment: event.target.value }))}>{treatmentOptions.map((option) => <option key={option}>{option}</option>)}</select></label>
              <label><span className="mb-1 block text-sm font-semibold text-ink">Forma de pago</span><select className="input-base" value={editForm.paymentMethod} onChange={(event) => setEditForm((current) => ({ ...current, paymentMethod: event.target.value }))}><option>TARJETA</option><option>MONEY ORDEN</option></select></label>
              <label><span className="mb-1 block text-sm font-semibold text-ink">Estado</span><select className="input-base" value={editForm.result} onChange={(event) => setEditForm((current) => ({ ...current, result: event.target.value }))}>{resultOptions.map((option) => <option key={option}>{option}</option>)}</select></label>
            </div>

            <button className="btn-secondary w-full justify-center py-2" onClick={() => copyOrder(selectedRecord)}>
              <Clipboard size={16} />
              Copiar datos
            </button>

            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-ink">Nota de seguimiento</span>
              <textarea
                className="input-base min-h-20 resize-none"
                placeholder="Ejemplo: no contesta, promete comprar, entregado confirmado..."
                value={editForm.followUpNote}
                onChange={(event) => setEditForm((current) => ({ ...current, followUpNote: event.target.value }))}
              />
            </label>
            <div className="sticky bottom-0 -mx-4 flex gap-3 border-t border-line bg-white px-4 pt-4 sm:-mx-5 sm:px-5">
              <button className="btn-secondary flex-1 justify-center" onClick={() => setSelectedRecord(null)}><X size={16} /> Cancelar</button>
              <button className="btn-primary flex-1 justify-center" onClick={saveOrderChanges}><CheckCircle2 size={16} /> Guardar</button>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal title="Eliminar pedido" open={Boolean(recordToDelete)} onClose={() => setRecordToDelete(null)}>
        {recordToDelete ? <div className="space-y-4">
          <div className="rounded-md bg-red-50 p-4 text-red-800">
            <p className="font-bold">Pedido {recordToDelete.orderNumber || "sin numero"}</p>
            <p className="mt-1 text-sm">Esta acción eliminará el registro y dejará de contar en tus estadísticas.</p>
          </div>
          <div className="flex gap-3"><button className="btn-secondary flex-1 justify-center" onClick={() => setRecordToDelete(null)}>Cancelar</button><button className="inline-flex flex-1 items-center justify-center gap-2 rounded-md bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700" onClick={confirmDeleteOrder}><Trash2 size={16} /> Eliminar</button></div>
        </div> : null}
      </Modal>
    </AppLayout>
  );
}
