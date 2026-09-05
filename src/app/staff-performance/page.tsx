"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Clock3, FileSpreadsheet, Search, Upload, XCircle } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { DayNavigator } from "@/components/PeriodNavigator";
import { parsePerformanceFile, parsePerformanceUpload, PerformanceFileType } from "@/lib/performance-import";
import {
  DailyPerformanceSummary,
  defaultPerformanceTargets,
  loadDailyPerformanceSummary,
  loadOperatorProfiles,
  loadStaffPerformance,
  OperatorProfile,
  PerformanceMetric,
  readPerformanceTargets,
  saveDailyPerformanceSummary,
  savePerformanceImport,
  writePerformanceTargets
} from "@/lib/performance-metrics";

function formatMinutes(minutes: number) {
  if (!minutes) return "-";
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return `${hours}h ${remaining}m`;
}

type StaffPerformanceView = "processing" | "hourly" | "general";
type ProcessingReviewScope = "day" | "month";
type UploadTask = PerformanceFileType | "processing-day" | "processing-month" | "daily";

const targetLimits: Record<keyof typeof defaultPerformanceTargets, { min: number; max: number }> = {
  minimumSalesPerHour: { min: 0.1, max: 10 },
  targetApprovedRate: { min: 1, max: 100 },
  minimumApprovedRate: { min: 1, max: 100 },
  minimumAverageCheck: { min: 1, max: 20 }
};

export default function StaffPerformancePage() {
  const [metricDate, setMetricDate] = useState(new Date().toISOString().slice(0, 10));
  const [profiles, setProfiles] = useState<OperatorProfile[]>([]);
  const [metrics, setMetrics] = useState<PerformanceMetric[]>([]);
  const [monthlyProcessingMetrics, setMonthlyProcessingMetrics] = useState<PerformanceMetric[]>([]);
  const [query, setQuery] = useState("");
  const [, setLoadingType] = useState<PerformanceFileType | null>(null);
  const [loadingTask, setLoadingTask] = useState<UploadTask | null>(null);
  const [uploadProgress, setUploadProgress] = useState<{ label: string; detail: string; percent: number } | null>(null);
  const [message, setMessage] = useState("");
  const [unmatched, setUnmatched] = useState<string[]>([]);
  const [targets, setTargets] = useState(defaultPerformanceTargets);
  const [targetInputs, setTargetInputs] = useState<Record<keyof typeof defaultPerformanceTargets, string>>({
    minimumSalesPerHour: String(defaultPerformanceTargets.minimumSalesPerHour),
    minimumAverageCheck: String(defaultPerformanceTargets.minimumAverageCheck),
    targetApprovedRate: String(defaultPerformanceTargets.targetApprovedRate),
    minimumApprovedRate: String(defaultPerformanceTargets.minimumApprovedRate)
  });
  const [dailySummary, setDailySummary] = useState<DailyPerformanceSummary | null>(null);
  const [monthlySummary, setMonthlySummary] = useState<DailyPerformanceSummary | null>(null);
  const [performanceView, setPerformanceView] = useState<StaffPerformanceView>("processing");
  const [processingReviewScope, setProcessingReviewScope] = useState<ProcessingReviewScope>("day");
  const repairedSummaryRef = useRef("");

  useEffect(() => {
    loadOperatorProfiles().then(setProfiles).catch(() => setMessage("No fue posible cargar los operadores."));
    const savedTargets = readPerformanceTargets();
    setTargets(savedTargets);
    setTargetInputs({
      minimumSalesPerHour: String(savedTargets.minimumSalesPerHour),
      minimumAverageCheck: String(savedTargets.minimumAverageCheck),
      targetApprovedRate: String(savedTargets.targetApprovedRate),
      minimumApprovedRate: String(savedTargets.minimumApprovedRate)
    });
  }, []);

  useEffect(() => {
    const monthDate = `${metricDate.slice(0, 7)}-01`;
    loadStaffPerformance(metricDate, "day").then(setMetrics).catch(() => setMetrics([]));
    loadStaffPerformance(monthDate, "month").then(setMonthlyProcessingMetrics).catch(() => setMonthlyProcessingMetrics([]));
    loadDailyPerformanceSummary(metricDate, "day").then(setDailySummary).catch(() => setDailySummary(null));
    loadDailyPerformanceSummary(monthDate, "month").then(setMonthlySummary).catch(() => setMonthlySummary(null));
  }, [metricDate]);

  useEffect(() => {
    if (!dailySummary?.updatedAt) return;
    const publishedDay = new Date(dailySummary.updatedAt).toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
    const publicationKey = `${dailySummary.metricDate}:${dailySummary.updatedAt}`;
    if (publishedDay !== today || repairedSummaryRef.current === publicationKey) return;
    repairedSummaryRef.current = publicationKey;
    saveDailyPerformanceSummary(dailySummary).catch(() => {
      repairedSummaryRef.current = "";
    });
  }, [dailySummary]);

  const filteredMetrics = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return metrics;
    return metrics.filter((metric) =>
      `${metric.operatorName} ${metric.operatorUsername}`.toLowerCase().includes(normalized)
    );
  }, [metrics, query]);

  const processingMetrics = useMemo(
    () => filteredMetrics.filter((metric) => metric.processingFile || metric.totalOrders || metric.approvedSales || metric.rejected || metric.trash || metric.averageCheck),
    [filteredMetrics]
  );

  const monthlyFilteredMetrics = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return monthlyProcessingMetrics;
    return monthlyProcessingMetrics.filter((metric) =>
      `${metric.operatorName} ${metric.operatorUsername}`.toLowerCase().includes(normalized)
    );
  }, [monthlyProcessingMetrics, query]);

  const activeProcessingMetrics = processingReviewScope === "day" ? processingMetrics : monthlyFilteredMetrics;

  const hourlyMetrics = useMemo(
    () => filteredMetrics.filter((metric) => metric.hourlyFile || metric.listMinutes || metric.salesPerHour),
    [filteredMetrics]
  );

  const processingTotals = useMemo(() => ({
    operators: activeProcessingMetrics.length,
    totalOrders: activeProcessingMetrics.reduce((total, metric) => total + metric.totalOrders, 0),
    callbacks: activeProcessingMetrics.reduce((total, metric) => total + metric.callbacks, 0),
    sales: activeProcessingMetrics.reduce((total, metric) => total + metric.approvedSales, 0),
    rejected: activeProcessingMetrics.reduce((total, metric) => total + metric.rejected, 0),
    trash: activeProcessingMetrics.reduce((total, metric) => total + metric.trash, 0),
    averageCheck: activeProcessingMetrics.length
      ? activeProcessingMetrics.reduce((total, metric) => total + metric.averageCheck, 0) / activeProcessingMetrics.length
      : 0
  }), [activeProcessingMetrics]);

  const hourlyTotals = useMemo(() => ({
    operators: hourlyMetrics.length,
    listMinutes: hourlyMetrics.reduce((total, metric) => total + metric.listMinutes, 0),
    averageSalesPerHour: hourlyMetrics.length
      ? hourlyMetrics.reduce((total, metric) => total + metric.salesPerHour, 0) / hourlyMetrics.length
      : 0,
    belowGoal: hourlyMetrics.filter((metric) => metric.salesPerHour < targets.minimumSalesPerHour).length
  }), [hourlyMetrics, targets.minimumSalesPerHour]);

  async function importFile(type: PerformanceFileType, event: React.ChangeEvent<HTMLInputElement>, metricScope: "day" | "month" = "day") {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const uploadKey: UploadTask = type === "processing" ? (metricScope === "month" ? "processing-month" : "processing-day") : type;
    const effectiveMetricDate = metricScope === "month" ? `${metricDate.slice(0, 7)}-01` : metricDate;
    setLoadingType(type);
    setLoadingTask(uploadKey);
    setUploadProgress({
      label: type === "processing"
        ? `Leyendo Procesando ${metricScope === "month" ? "del mes" : "del dia"}`
        : "Leyendo Venta por hora",
      detail: "Revisando columnas del archivo...",
      percent: 25
    });
    setMessage("");
    setUnmatched([]);
    try {
      const rows = await parsePerformanceFile(file, type);
      setUploadProgress({ label: "Reconociendo operadores", detail: `${rows.length} filas encontradas. Cruzando con usuarios activos...`, percent: 55 });
      const result = await savePerformanceImport(rows, profiles, effectiveMetricDate, targets, metricScope);
      setUploadProgress({ label: "Publicando resultados", detail: `${result.matched.length} operadores reconocidos. Guardando cambios...`, percent: 85 });
      setUnmatched(result.unmatched);
      if (type === "processing" && metricScope === "month") {
        setMonthlyProcessingMetrics(await loadStaffPerformance(effectiveMetricDate, "month"));
      } else {
        setMetrics(await loadStaffPerformance(metricDate, "day"));
      }
      const label = type === "processing" ? `Procesando ${metricScope === "month" ? "del mes" : "del dia"}` : "Venta por hora";
      setMessage(`${label} actualizado: ${result.matched.length} operadores reconocidos. Alertas nuevas: ${result.alerts.length}.`);
      setUploadProgress({ label: `${label} publicado`, detail: "La vista de Staff y operadores ya puede actualizarse.", percent: 100 });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No fue posible leer el archivo.");
      setUploadProgress(null);
    } finally {
      setLoadingType(null);
      setLoadingTask(null);
      window.setTimeout(() => setUploadProgress(null), 1800);
    }
  }

  async function importDailySummary(event: React.ChangeEvent<HTMLInputElement>, summaryScope: "day" | "month") {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setLoadingType("processing");
    setLoadingTask("daily");
    setUploadProgress({
      label: summaryScope === "day" ? "Leyendo aprobado del dia" : "Leyendo aprobado del mes",
      detail: summaryScope === "day" ? "Buscando la ultima fila por dia del archivo..." : "Buscando la fila Total del archivo...",
      percent: 30
    });
    setMessage("");
    setUnmatched([]);
    try {
      const result = await parsePerformanceUpload(file, "processing", {
        summaryScope,
        fallbackDate: summaryScope === "month" ? `${metricDate.slice(0, 7)}-01` : metricDate
      });
      if (!result.dailySummary) {
        setMessage(summaryScope === "day"
          ? "No encontre una fila por dia. El archivo debe tener Agrupacion Dia y las columnas marcadas en rojo."
          : "No encontre la fila Total para el mes. El archivo debe traer el resumen total con las columnas marcadas en rojo.");
        setUploadProgress(null);
        return;
      }
      setUploadProgress({ label: "Guardando aprobado general", detail: `Publicando ${summaryScope === "day" ? "dia" : "mes"} ${result.dailySummary.metricDate}...`, percent: 75 });
      const saved = await saveDailyPerformanceSummary(result.dailySummary);
      if (summaryScope === "day") {
        setMetricDate(saved.metricDate);
        setDailySummary(saved);
      } else {
        setMonthlySummary(saved);
      }
      setMessage(`Aprobado general ${summaryScope === "day" ? "del dia" : "del mes"} publicado. El operador lo vera separado en su panel.`);
      setUploadProgress({ label: "Aprobado general publicado", detail: `Vista ${summaryScope === "day" ? "Dia" : "Mes"} actualizada para operadores.`, percent: 100 });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No fue posible leer el resumen diario.");
      setUploadProgress(null);
    } finally {
      setLoadingType(null);
      setLoadingTask(null);
      window.setTimeout(() => setUploadProgress(null), 1800);
    }
  }

  function updateTarget(key: keyof typeof targets, value: string) {
    const normalized = value.replace(",", ".").replace(/[^\d.]/g, "");
    setTargetInputs((current) => ({ ...current, [key]: normalized }));
    if (!normalized) return;
    const numericValue = Number(normalized);
    if (!Number.isFinite(numericValue)) return;
    const limit = targetLimits[key];
    if (numericValue < limit.min || numericValue > limit.max) return;
    const nextTargets = { ...targets, [key]: numericValue };
    setTargets(nextTargets);
    writePerformanceTargets(nextTargets);
  }

  function commitTarget(key: keyof typeof targets) {
    const value = Number(targetInputs[key]);
    const limit = targetLimits[key];
    if (!Number.isFinite(value) || value < limit.min || value > limit.max) {
      const fallback = defaultPerformanceTargets[key];
      const nextTargets = { ...targets, [key]: fallback };
      setTargets(nextTargets);
      writePerformanceTargets(nextTargets);
      setTargetInputs((current) => ({ ...current, [key]: String(fallback) }));
      return;
    }
    setTargetInputs((current) => ({ ...current, [key]: String(value) }));
  }

  function resetTargets() {
    setTargets(defaultPerformanceTargets);
    setTargetInputs({
      minimumSalesPerHour: String(defaultPerformanceTargets.minimumSalesPerHour),
      minimumAverageCheck: String(defaultPerformanceTargets.minimumAverageCheck),
      targetApprovedRate: String(defaultPerformanceTargets.targetApprovedRate),
      minimumApprovedRate: String(defaultPerformanceTargets.minimumApprovedRate)
    });
    writePerformanceTargets(defaultPerformanceTargets);
    setMessage("Metas predeterminadas restauradas: venta/hora 1, aprobado 21%, minimo 19% y cheque 3.42.");
  }

  const dailyApprovedRate = dailySummary
    ? dailySummary.approvedRate || (dailySummary.totalOrders > 0 ? (dailySummary.approvedSales / dailySummary.totalOrders) * 100 : 0)
    : 0;
  const dailyApprovedOk = dailyApprovedRate >= targets.minimumApprovedRate;
  const dailyApprovedGoalOk = dailyApprovedRate >= targets.targetApprovedRate;
  const dailyApprovedStatus = dailyApprovedGoalOk
    ? `Llegamos al aprobado ${targets.targetApprovedRate.toFixed(0)}%`
    : dailyApprovedOk
      ? `Sobre el minimo ${targets.minimumApprovedRate.toFixed(0)}%`
      : "Debajo del minimo";
  const positiveMessage = message.includes("actualizado") || message.includes("publicado") || message.includes("restauradas");
  const processingReady = processingMetrics.length > 0;
  const monthlyProcessingReady = monthlyProcessingMetrics.some((metric) => metric.processingFile || metric.totalOrders || metric.approvedSales || metric.rejected || metric.trash || metric.averageCheck);
  const hourlyReady = hourlyMetrics.length > 0;
  const generalReady = Boolean(dailySummary);
  const generalStatusTone = generalReady
    ? dailyApprovedGoalOk
      ? "bg-emerald-100 text-emerald-700"
      : dailyApprovedOk
        ? "bg-amber-100 text-amber-800"
        : "bg-red-100 text-red-700"
    : "bg-slate-100 text-slate-600";
  const generalStatusText = generalReady ? dailyApprovedStatus : "Falta cargar";

  return (
    <AppLayout role="staff" title="Estadisticas operativas">
      <section className="card overflow-hidden shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line bg-gradient-to-r from-brand-50 via-white to-sky-50 p-5">
          <div>
            <p className="text-xs font-black uppercase text-brand-700">Actualizacion del dia</p>
            <h2 className="text-2xl font-black text-ink">Centro de productividad</h2>
            <p className="mt-1 text-sm text-muted">Carga cada archivo por separado y revisa el avance sin mezclar datos.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-3 py-1.5 text-xs font-black ${processingReady || monthlyProcessingReady ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>Procesando {processingReady || monthlyProcessingReady ? "listo" : "pendiente"}</span>
            <span className={`rounded-full px-3 py-1.5 text-xs font-black ${hourlyReady ? "bg-sky-100 text-sky-700" : "bg-slate-100 text-slate-600"}`}>Venta/hora {hourlyReady ? "lista" : "pendiente"}</span>
            <span className={`rounded-full px-3 py-1.5 text-xs font-black ${generalReady ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>General {generalReady ? "listo" : "pendiente"}</span>
          </div>
          <div className="w-full sm:w-auto"><span className="mb-1 block text-sm font-semibold text-ink">Fecha de los datos</span><DayNavigator value={metricDate} onChange={setMetricDate} /></div>
        </div>

        <div className="grid items-start gap-4 border-b border-line bg-soft/70 p-4 xl:grid-cols-[280px_1fr]">
          <div className="rounded-md border border-line bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase text-muted">Metas activas</p>
                <p className="mt-1 text-xs text-muted">Editables. Predeterminado: 1 / 21 / 19 / 3.42.</p>
              </div>
              <button className="rounded-md border border-line px-3 py-2 text-xs font-bold text-brand-700 hover:bg-brand-50" type="button" onClick={resetTargets}>
                Restaurar
              </button>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <label className="block">
                <span className="flex items-center justify-between text-xs font-bold uppercase text-muted">
                  Venta / hora <small className="font-black text-brand-700">1</small>
                </span>
            <input
                  className="input-base mt-1"
              inputMode="decimal"
              type="text"
              value={targetInputs.minimumSalesPerHour}
              onChange={(event) => updateTarget("minimumSalesPerHour", event.target.value)}
              onBlur={() => commitTarget("minimumSalesPerHour")}
            />
              </label>

              <label className="block">
                <span className="flex items-center justify-between text-xs font-bold uppercase text-muted">
                  Meta aprobado <small className="font-black text-emerald-700">21%</small>
                </span>
            <input
                  className="input-base mt-1"
              inputMode="decimal"
              type="text"
              value={targetInputs.targetApprovedRate}
              onChange={(event) => updateTarget("targetApprovedRate", event.target.value)}
              onBlur={() => commitTarget("targetApprovedRate")}
            />
              </label>

              <label className="block">
                <span className="flex items-center justify-between text-xs font-bold uppercase text-muted">
                  Minimo aprobado <small className="font-black text-amber-700">19%</small>
                </span>
            <input
                  className="input-base mt-1"
              inputMode="decimal"
              type="text"
              value={targetInputs.minimumApprovedRate}
              onChange={(event) => updateTarget("minimumApprovedRate", event.target.value)}
              onBlur={() => commitTarget("minimumApprovedRate")}
            />
              </label>

              <label className="block">
                <span className="flex items-center justify-between text-xs font-bold uppercase text-muted">
                  Cheque <small className="font-black text-brand-700">3.42</small>
                </span>
            <input
                  className="input-base mt-1"
              inputMode="decimal"
              type="text"
              value={targetInputs.minimumAverageCheck}
              onChange={(event) => updateTarget("minimumAverageCheck", event.target.value)}
              onBlur={() => commitTarget("minimumAverageCheck")}
            />
              </label>
            </div>
          </div>

          <div className="grid items-start gap-3 md:grid-cols-3">
            <div className={`h-fit rounded-md border bg-white p-4 shadow-sm transition ${loadingTask === "processing" ? "border-brand-500 ring-2 ring-brand-100" : "border-line"}`}>
              <div className="flex items-start justify-between gap-2">
                <span className="grid h-10 w-10 place-items-center rounded-md bg-brand-50 text-brand-700"><FileSpreadsheet size={18} /></span>
                <div>
                  <p className="text-xs font-black uppercase text-brand-700">1. Procesando</p>
                  <h3 className="font-black text-ink">Ventas y calidad</h3>
                </div>
                <span className={`rounded-full px-2 py-1 text-[11px] font-black ${processingReady || monthlyProcessingReady ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{processingReady || monthlyProcessingReady ? "Listo" : "Pendiente"}</span>
              </div>
              <p className="mt-3 text-sm leading-5 text-muted">Total, rellamada, aprobado, rechazado, basura y cheque.</p>
              <div className="mt-3 grid gap-2">
                <div className="grid grid-cols-2 gap-2 text-xs font-bold">
                  <span className={`rounded-md px-3 py-2 ${processingReady ? "bg-emerald-50 text-emerald-700" : "bg-slate-50 text-slate-600"}`}>Dia: {processingReady ? "listo" : "pendiente"}</span>
                  <span className={`rounded-md px-3 py-2 ${monthlyProcessingReady ? "bg-emerald-50 text-emerald-700" : "bg-slate-50 text-slate-600"}`}>Mes: {monthlyProcessingReady ? "listo" : "pendiente"}</span>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                <label className="btn-primary cursor-pointer justify-center shadow-sm">
                  <Upload size={16} />
                  {loadingTask === "processing-day" ? "Procesando..." : "Subir dia"}
                  <input className="hidden" type="file" accept=".xlsx,.xls,.csv" disabled={Boolean(loadingTask)} onChange={(event) => importFile("processing", event, "day")} />
                </label>
                <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-md border border-brand-200 bg-brand-50 px-4 py-2.5 text-sm font-bold text-brand-700 transition hover:bg-brand-100">
                  <Upload size={16} />
                  {loadingTask === "processing-month" ? "Procesando..." : "Subir mes"}
                  <input className="hidden" type="file" accept=".xlsx,.xls,.csv" disabled={Boolean(loadingTask)} onChange={(event) => importFile("processing", event, "month")} />
                </label>
                </div>
              </div>
            </div>

            <div className={`h-fit rounded-md border bg-white p-4 shadow-sm transition ${loadingTask === "hourly" ? "border-sky-500 ring-2 ring-sky-100" : "border-line"}`}>
              <div className="flex items-start justify-between gap-2">
                <span className="grid h-10 w-10 place-items-center rounded-md bg-sky-50 text-sky-700"><Clock3 size={18} /></span>
                <div>
                  <p className="text-xs font-black uppercase text-sky-700">2. Venta por hora</p>
                  <h3 className="font-black text-ink">Ritmo actual</h3>
                </div>
                <span className={`rounded-full px-2 py-1 text-[11px] font-black ${hourlyReady ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{hourlyReady ? "Listo" : "Pendiente"}</span>
              </div>
              <p className="mt-3 text-sm leading-5 text-muted">Tiempo en lista y productividad nuevos.</p>
                <label className="btn-primary mt-4 cursor-pointer justify-center shadow-sm">
                  <Upload size={16} />
                  {loadingTask === "hourly" ? "Procesando..." : "Subir Venta por hora"}
                  <input className="hidden" type="file" accept=".xlsx,.xls,.csv" disabled={Boolean(loadingTask)} onChange={(event) => importFile("hourly", event)} />
                </label>
            </div>

            <div className={`h-fit rounded-md border bg-white p-4 shadow-sm transition ${loadingTask === "daily" ? "border-emerald-500 ring-2 ring-emerald-100" : "border-line"}`}>
              <div className="flex items-start justify-between gap-2">
                <span className="grid h-10 w-10 place-items-center rounded-md bg-emerald-50 text-emerald-700"><CheckCircle2 size={18} /></span>
                <div>
                  <p className="text-xs font-black uppercase text-emerald-700">3. General</p>
                  <h3 className="font-black text-ink">Operacion del dia</h3>
                </div>
                <span className={`rounded-full px-2 py-1 text-[11px] font-black ${generalReady ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{generalReady ? "Listo" : "Pendiente"}</span>
              </div>
              <p className="mt-3 text-sm leading-5 text-muted">Aprobado general diario de la operacion.</p>
              <div className="mt-3 grid gap-2">
                <div className="flex items-center justify-between rounded-md bg-soft px-3 py-2 text-xs font-bold text-muted">
                  <span>Dia: {dailySummary ? dailySummary.metricDate : "pendiente"}</span>
                  <span className={dailySummary ? "text-emerald-700" : "text-slate-500"}>{dailySummary ? "Listo" : "Pendiente"}</span>
                </div>
                <label className="btn-primary cursor-pointer justify-center shadow-sm">
                  <Upload size={16} />
                  {loadingTask === "daily" ? "Leyendo..." : "Subir resumen diario"}
                  <input className="hidden" type="file" accept=".xlsx,.xls,.csv" disabled={Boolean(loadingTask)} onChange={(event) => importDailySummary(event, "day")} />
                </label>
              </div>
            </div>
          </div>
        </div>

        {uploadProgress ? (
          <div className="mx-4 mt-4 rounded-md border border-brand-100 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <span className="grid h-9 w-9 place-items-center rounded-md bg-brand-50 text-brand-700">
                  {uploadProgress.percent < 100 ? <Clock3 className="animate-pulse" size={18} /> : <CheckCircle2 size={18} />}
                </span>
                <div>
                  <p className="text-sm font-black text-ink">{uploadProgress.label}</p>
                  <p className="text-xs font-semibold text-muted">{uploadProgress.detail}</p>
                </div>
              </div>
              <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-black text-brand-700">{uploadProgress.percent}%</span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-gradient-to-r from-brand-600 to-sky-500 transition-all duration-500"
                style={{ width: `${uploadProgress.percent}%` }}
              />
            </div>
            {uploadProgress.percent < 100 ? (
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-50">
                <div className="h-full w-1/3 animate-pulse rounded-full bg-sky-300" />
              </div>
            ) : null}
          </div>
        ) : null}

        {message ? (
          <div className={`mt-4 flex items-center gap-2 rounded-md p-3 text-sm font-semibold ${positiveMessage ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
            {positiveMessage ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
            {message}
          </div>
        ) : null}
        {unmatched.length ? (
          <div className="mt-3 rounded-md bg-amber-50 p-3 text-sm text-amber-800">
            <strong>No se actualizaron porque no coinciden con un usuario:</strong> {Array.from(new Set(unmatched)).join(", ")}
          </div>
        ) : null}
      </section>

      {dailySummary ? (
        <section className={`mt-5 overflow-hidden rounded-md border bg-white shadow-sm ${dailyApprovedGoalOk ? "border-emerald-200" : dailyApprovedOk ? "border-amber-200" : "border-red-200"}`}>
          <div className={`grid gap-4 p-5 xl:grid-cols-[340px_1fr] ${dailyApprovedGoalOk ? "bg-emerald-50/70" : dailyApprovedOk ? "bg-amber-50/70" : "bg-red-50/70"}`}>
            <div className="rounded-md bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className={`text-xs font-black uppercase ${dailyApprovedGoalOk ? "text-emerald-700" : dailyApprovedOk ? "text-amber-700" : "text-red-700"}`}>Cartel general</p>
                  <h2 className="mt-1 text-xl font-black text-ink">Operacion {dailySummary.metricDate}</h2>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-black ${dailyApprovedGoalOk ? "bg-emerald-600 text-white" : dailyApprovedOk ? "bg-amber-500 text-white" : "bg-red-600 text-white"}`}>
                  {dailyApprovedStatus}
                </span>
              </div>
              <p className={`mt-4 text-5xl font-black leading-none ${dailyApprovedGoalOk ? "text-emerald-700" : dailyApprovedOk ? "text-amber-700" : "text-red-700"}`}>
                {dailyApprovedRate.toFixed(1)}%
              </p>
              <p className="mt-2 text-sm font-semibold text-muted">
                Meta {targets.targetApprovedRate.toFixed(1)}% / minimo {targets.minimumApprovedRate.toFixed(1)}%
              </p>
              <p className="mt-4 truncate rounded-md bg-soft px-3 py-2 text-xs font-semibold text-muted">
                Archivo: {dailySummary.sourceFile || "Resumen diario"}
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-md bg-white p-4 shadow-sm">
                <p className="text-xs font-bold uppercase text-muted">Total operacion</p>
                <p className="mt-1 text-3xl font-black text-ink">{dailySummary.totalOrders}</p>
                <p className="text-xs font-semibold text-muted">Registros del archivo diario</p>
              </div>
              <div className="rounded-md bg-white p-4 shadow-sm">
                <p className="text-xs font-bold uppercase text-muted">Aprobados</p>
                <p className="mt-1 text-3xl font-black text-emerald-700">{dailySummary.approvedSales}</p>
              </div>
              <div className="rounded-md bg-white p-4 shadow-sm">
                <p className="text-xs font-bold uppercase text-muted">Rechazado</p>
                <p className="mt-1 text-3xl font-black text-red-700">{dailySummary.rejected}</p>
              </div>
              <div className="rounded-md bg-white p-4 shadow-sm">
                <p className="text-xs font-bold uppercase text-muted">Cheque</p>
                <p className={`mt-1 text-3xl font-black ${dailySummary.averageCheck >= targets.minimumAverageCheck ? "text-emerald-700" : "text-red-700"}`}>{dailySummary.averageCheck.toFixed(2)}</p>
              </div>
              <div className="rounded-md bg-white p-4 shadow-sm xl:col-span-2">
                <p className="text-xs font-bold uppercase text-muted">Rellamada</p>
                <p className="mt-1 text-2xl font-black text-brand-700">{dailySummary.callbacks}</p>
              </div>
              <div className="rounded-md bg-white p-4 shadow-sm">
                <p className="text-xs font-bold uppercase text-muted">No contesta</p>
                <p className="mt-1 text-2xl font-black text-amber-700">{dailySummary.noAnswer}</p>
              </div>
              <div className="rounded-md bg-white p-4 shadow-sm">
                <p className="text-xs font-bold uppercase text-muted">Basura</p>
                <p className="mt-1 text-2xl font-black text-orange-700">{dailySummary.trash}</p>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      <section className="mt-5 card overflow-hidden shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-gradient-to-r from-slate-50 to-white p-4">
          <div>
            <p className="text-xs font-black uppercase text-brand-700">Control independiente</p>
            <h2 className="text-xl font-black text-ink">Ver cada archivo sin mezclar</h2>
            <p className="mt-1 text-sm text-muted">Cada acceso abre solo su lectura: Procesando, Venta por hora o Aprobado general.</p>
          </div>
          <span className="rounded-full bg-soft px-3 py-1.5 text-xs font-black text-muted">Fecha seleccionada: {metricDate}</span>
        </div>
        <div className="grid gap-3 p-4 md:grid-cols-3">
          <button
            className={`rounded-md border p-4 text-left transition ${performanceView === "processing" ? "border-brand-600 bg-brand-50 shadow-sm ring-2 ring-brand-100" : "border-line bg-white hover:border-brand-300"}`}
            onClick={() => setPerformanceView("processing")}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase text-brand-700">1. Procesando</p>
                <h3 className="mt-1 text-lg font-black text-ink">Ventas y calidad</h3>
              </div>
              <FileSpreadsheet className="text-brand-600" size={24} />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2" onClick={(event) => event.stopPropagation()}>
              <span
                role="button"
                tabIndex={0}
                onClick={() => { setPerformanceView("processing"); setProcessingReviewScope("day"); }}
                className={`rounded-md border px-3 py-2 text-center text-xs font-black transition ${processingReviewScope === "day" ? "border-brand-600 bg-brand-600 text-white" : processingReady ? "border-emerald-200 bg-emerald-100 text-emerald-700" : "border-line bg-slate-100 text-slate-600"}`}
              >
                Dia {processingReady ? "listo" : "pendiente"}
              </span>
              <span
                role="button"
                tabIndex={0}
                onClick={() => { setPerformanceView("processing"); setProcessingReviewScope("month"); }}
                className={`rounded-md border px-3 py-2 text-center text-xs font-black transition ${processingReviewScope === "month" ? "border-brand-600 bg-brand-600 text-white" : monthlyProcessingReady ? "border-emerald-200 bg-emerald-100 text-emerald-700" : "border-line bg-slate-100 text-slate-600"}`}
              >
                Mes {monthlyProcessingReady ? "listo" : "pendiente"}
              </span>
            </div>
            <div className="mt-3 rounded-md bg-white/70 p-3">
              <p className="text-2xl font-black text-ink">{processingTotals.operators}</p>
              <p className="text-xs font-semibold text-muted">operadores con lectura del {processingReviewScope === "day" ? "dia" : "mes"}</p>
            </div>
          </button>

          <button
            className={`rounded-md border p-4 text-left transition ${performanceView === "hourly" ? "border-sky-500 bg-sky-50 shadow-sm ring-2 ring-sky-100" : "border-line bg-white hover:border-sky-300"}`}
            onClick={() => setPerformanceView("hourly")}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase text-sky-700">2. Venta por hora</p>
                <h3 className="mt-1 text-lg font-black text-ink">Ritmo actual</h3>
              </div>
              <Clock3 className="text-sky-600" size={24} />
            </div>
            <div className="mt-4 rounded-md bg-white/70 p-3">
              <p className={`text-3xl font-black ${hourlyTotals.belowGoal ? "text-red-700" : "text-emerald-700"}`}>{hourlyTotals.averageSalesPerHour.toFixed(2)}</p>
              <p className="text-xs font-semibold text-muted">promedio venta/hora</p>
            </div>
            <p className="mt-3 rounded-md bg-white/70 px-3 py-2 text-xs font-semibold text-muted">
              {hourlyTotals.belowGoal} operadores bajo meta {targets.minimumSalesPerHour.toFixed(2)}.
            </p>
          </button>

          <button
            className={`rounded-md border p-4 text-left transition ${performanceView === "general" ? "border-emerald-500 bg-emerald-50 shadow-sm ring-2 ring-emerald-100" : "border-line bg-white hover:border-emerald-300"}`}
            onClick={() => setPerformanceView("general")}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase text-emerald-700">3. Aprobado general</p>
                <h3 className="mt-1 text-lg font-black text-ink">Operacion del dia</h3>
              </div>
              <CheckCircle2 className="text-emerald-600" size={24} />
            </div>
            <div className="mt-4 rounded-md bg-white/70 p-3">
              <p className={`text-3xl font-black ${dailyApprovedGoalOk ? "text-emerald-700" : dailyApprovedOk ? "text-amber-700" : "text-red-700"}`}>{dailySummary ? `${dailyApprovedRate.toFixed(1)}%` : "Sin carga"}</p>
              <p className="text-xs font-semibold text-muted">Meta {targets.targetApprovedRate.toFixed(1)}% / minimo {targets.minimumApprovedRate.toFixed(1)}%</p>
            </div>
            <span className={`mt-3 inline-flex rounded-full px-3 py-1.5 text-xs font-black ${generalStatusTone}`}>
              {generalStatusText}
            </span>
          </button>
        </div>
      </section>

      <section className="mt-5 card overflow-hidden">
        {performanceView === "processing" ? (
          <div className="grid grid-cols-2 divide-x divide-y divide-line md:grid-cols-7 md:divide-y-0">
            <div className="p-4"><p className="text-xs font-bold uppercase text-muted">Operadores</p><p className="mt-1 text-2xl font-bold text-ink">{processingTotals.operators}</p></div>
            <div className="p-4"><p className="text-xs font-bold uppercase text-muted">Total</p><p className="mt-1 text-2xl font-bold text-ink">{processingTotals.totalOrders}</p></div>
            <div className="p-4"><p className="text-xs font-bold uppercase text-muted">Rellamadas</p><p className="mt-1 text-2xl font-bold text-brand-700">{processingTotals.callbacks}</p></div>
            <div className="p-4"><p className="text-xs font-bold uppercase text-muted">Aprobados</p><p className="mt-1 text-2xl font-bold text-emerald-700">{processingTotals.sales}</p></div>
            <div className="p-4"><p className="text-xs font-bold uppercase text-muted">Rechazos</p><p className="mt-1 text-2xl font-bold text-red-700">{processingTotals.rejected}</p></div>
            <div className="p-4"><p className="text-xs font-bold uppercase text-muted">Basura</p><p className="mt-1 text-2xl font-bold text-amber-700">{processingTotals.trash}</p></div>
            <div className="p-4"><p className="text-xs font-bold uppercase text-muted">Cheque</p><p className="mt-1 text-2xl font-bold text-brand-700">{processingTotals.averageCheck.toFixed(2)}</p></div>
          </div>
        ) : performanceView === "hourly" ? (
          <div className="grid grid-cols-2 divide-x divide-y divide-line md:grid-cols-4 md:divide-y-0">
            <div className="p-4"><p className="text-xs font-bold uppercase text-muted">Operadores</p><p className="mt-1 text-2xl font-bold text-ink">{hourlyTotals.operators}</p></div>
            <div className="p-4"><p className="text-xs font-bold uppercase text-muted">Tiempo en lista</p><p className="mt-1 text-2xl font-bold text-brand-700">{formatMinutes(hourlyTotals.listMinutes)}</p></div>
            <div className="p-4"><p className="text-xs font-bold uppercase text-muted">Promedio V/H</p><p className={`mt-1 text-2xl font-bold ${hourlyTotals.averageSalesPerHour >= targets.minimumSalesPerHour ? "text-emerald-700" : "text-red-700"}`}>{hourlyTotals.averageSalesPerHour.toFixed(2)}</p></div>
            <div className="p-4"><p className="text-xs font-bold uppercase text-muted">Bajo meta</p><p className="mt-1 text-2xl font-bold text-red-700">{hourlyTotals.belowGoal}</p></div>
          </div>
        ) : (
          <div className="grid grid-cols-2 divide-x divide-y divide-line md:grid-cols-5 md:divide-y-0">
            <div className="p-4"><p className="text-xs font-bold uppercase text-muted">Fecha</p><p className="mt-1 text-xl font-bold text-ink">{dailySummary?.metricDate || metricDate}</p></div>
            <div className="p-4"><p className="text-xs font-bold uppercase text-muted">Aprobado general</p><p className={`mt-1 text-2xl font-bold ${dailyApprovedGoalOk ? "text-emerald-700" : dailyApprovedOk ? "text-amber-700" : "text-red-700"}`}>{dailySummary ? `${dailyApprovedRate.toFixed(1)}%` : "-"}</p></div>
            <div className="p-4"><p className="text-xs font-bold uppercase text-muted">Total operacion</p><p className="mt-1 text-2xl font-bold text-ink">{dailySummary?.totalOrders || 0}</p></div>
            <div className="p-4"><p className="text-xs font-bold uppercase text-muted">Aprobados</p><p className="mt-1 text-2xl font-bold text-emerald-700">{dailySummary?.approvedSales || 0}</p></div>
            <div className="p-4"><p className="text-xs font-bold uppercase text-muted">Rechazados</p><p className="mt-1 text-2xl font-bold text-red-700">{dailySummary?.rejected || 0}</p></div>
          </div>
        )}
      </section>

      <section className="mt-5 card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-4">
          <div className="flex items-center gap-2">
            {performanceView === "processing" ? <FileSpreadsheet size={18} className="text-brand-600" /> : performanceView === "hourly" ? <Clock3 size={18} className="text-sky-600" /> : <CheckCircle2 size={18} className="text-emerald-600" />}
            <div>
              <h2 className="font-bold text-ink">
                {performanceView === "processing" ? `Detalle de Procesando - ${processingReviewScope === "day" ? "Dia" : "Mes"}` : performanceView === "hourly" ? "Detalle de Venta por hora" : "Detalle de Aprobado general"}
              </h2>
              <p className="text-sm text-muted">
                {performanceView === "processing"
                  ? `Solo datos del archivo Procesando del ${processingReviewScope === "day" ? "dia seleccionado" : "mes seleccionado"}.`
                  : performanceView === "hourly"
                    ? "Solo tiempo en lista y productividad nuevos para revisar ritmo."
                    : "Resumen diario de toda la operacion, separado de los operadores."}
              </p>
            </div>
          </div>
          {performanceView !== "general" ? (
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
              {performanceView === "processing" ? (
                <div className="flex rounded-md border border-line bg-soft p-1" aria-label="Periodo de Procesando">
                  <button
                    type="button"
                    className={`rounded px-4 py-2 text-sm font-black transition ${processingReviewScope === "day" ? "bg-brand-600 text-white shadow-sm" : "text-muted"}`}
                    onClick={() => setProcessingReviewScope("day")}
                  >
                    Ver dia
                  </button>
                  <button
                    type="button"
                    className={`rounded px-4 py-2 text-sm font-black transition ${processingReviewScope === "month" ? "bg-brand-600 text-white shadow-sm" : "text-muted"}`}
                    onClick={() => setProcessingReviewScope("month")}
                  >
                    Ver mes
                  </button>
                </div>
              ) : null}
              <label className="relative w-full sm:w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={16} />
                <input className="input-base pl-9" placeholder="Buscar operador" value={query} onChange={(event) => setQuery(event.target.value)} />
              </label>
            </div>
          ) : null}
        </div>
        {performanceView === "processing" ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px]">
              <thead className="bg-soft text-left text-xs uppercase text-muted">
                <tr>
                  <th className="table-cell">Operador</th><th className="table-cell">Total</th><th className="table-cell">Rellamada</th><th className="table-cell">Aprobado</th><th className="table-cell">Rechazado</th><th className="table-cell">Basura</th><th className="table-cell">Cheque</th><th className="table-cell">Archivo</th><th className="table-cell">Actualizado</th>
                </tr>
              </thead>
              <tbody>
                {activeProcessingMetrics.length ? activeProcessingMetrics.map((metric) => (
                  <tr key={`processing-${processingReviewScope}-${metric.operatorUsername}-${metric.metricDate}`}>
                    <td className="table-cell"><strong className="block text-ink">{metric.operatorUsername}</strong><span className="text-xs text-muted">{metric.operatorName}</span></td>
                    <td className="table-cell font-bold text-ink">{metric.totalOrders}</td>
                    <td className="table-cell font-bold text-brand-700">{metric.callbacks}</td>
                    <td className="table-cell font-bold text-emerald-700">{metric.approvedSales}</td>
                    <td className="table-cell font-bold text-red-700">{metric.rejected}</td>
                    <td className="table-cell font-bold text-amber-700">{metric.trash}</td>
                    <td className={`table-cell font-bold ${metric.averageCheck >= targets.minimumAverageCheck ? "text-emerald-700" : "text-red-700"}`}>{metric.averageCheck.toFixed(2)}</td>
                    <td className="table-cell text-xs text-muted">{metric.processingFile || "-"}</td>
                    <td className="table-cell text-xs text-muted">{metric.updatedAt ? new Date(metric.updatedAt).toLocaleString("es-CO") : "-"}</td>
                  </tr>
                )) : <tr><td className="table-cell py-8 text-center text-muted" colSpan={9}>Aun no hay archivo Procesando para este {processingReviewScope === "day" ? "dia" : "mes"}.</td></tr>}
              </tbody>
            </table>
          </div>
        ) : performanceView === "hourly" ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px]">
              <thead className="bg-soft text-left text-xs uppercase text-muted">
                <tr>
                  <th className="table-cell">Operador</th><th className="table-cell">Tiempo en lista</th><th className="table-cell">Venta / hora</th><th className="table-cell">Estado</th><th className="table-cell">Archivo</th><th className="table-cell">Actualizado</th>
                </tr>
              </thead>
              <tbody>
                {hourlyMetrics.length ? hourlyMetrics.map((metric) => {
                  const meetsGoal = metric.salesPerHour >= targets.minimumSalesPerHour;
                  return (
                    <tr key={`hourly-${metric.operatorUsername}-${metric.metricDate}`}>
                      <td className="table-cell"><strong className="block text-ink">{metric.operatorUsername}</strong><span className="text-xs text-muted">{metric.operatorName}</span></td>
                      <td className="table-cell font-bold text-ink">{formatMinutes(metric.listMinutes)}</td>
                      <td className={`table-cell font-bold ${meetsGoal ? "text-emerald-700" : "text-red-700"}`}>{metric.salesPerHour.toFixed(2)}</td>
                      <td className="table-cell">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-black ${meetsGoal ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                          {meetsGoal ? "Cumple" : "Bajo meta"}
                        </span>
                      </td>
                      <td className="table-cell text-xs text-muted">{metric.hourlyFile || "-"}</td>
                      <td className="table-cell text-xs text-muted">{metric.updatedAt ? new Date(metric.updatedAt).toLocaleString("es-CO") : "-"}</td>
                    </tr>
                  );
                }) : <tr><td className="table-cell py-8 text-center text-muted" colSpan={6}>Aun no hay archivo Venta por hora para este dia.</td></tr>}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-5">
            {dailySummary ? (
              <div className={`rounded-md border p-5 ${dailyApprovedGoalOk ? "border-emerald-200 bg-emerald-50" : dailyApprovedOk ? "border-amber-200 bg-amber-50" : "border-red-200 bg-red-50"}`}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase text-muted">Operacion general</p>
                    <h3 className="text-2xl font-black text-ink">{dailySummary.metricDate}</h3>
                    <p className="text-sm text-muted">Este resultado se muestra como cartel general para la operacion.</p>
                  </div>
                  <span className={`rounded-full px-4 py-2 text-sm font-black ${dailyApprovedGoalOk ? "bg-emerald-600 text-white" : dailyApprovedOk ? "bg-amber-500 text-white" : "bg-red-600 text-white"}`}>
                    {dailyApprovedStatus}
                  </span>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-4">
                  <div className="rounded-md bg-white p-4"><p className="text-xs font-bold uppercase text-muted">Aprobado general</p><p className={`mt-1 text-3xl font-black ${dailyApprovedGoalOk ? "text-emerald-700" : dailyApprovedOk ? "text-amber-700" : "text-red-700"}`}>{dailyApprovedRate.toFixed(1)}%</p><p className="text-xs font-semibold text-muted">Meta {targets.targetApprovedRate.toFixed(1)}% · minimo {targets.minimumApprovedRate.toFixed(1)}%</p></div>
                  <div className="rounded-md bg-white p-4"><p className="text-xs font-bold uppercase text-muted">Total</p><p className="mt-1 text-3xl font-black text-ink">{dailySummary.totalOrders}</p></div>
                  <div className="rounded-md bg-white p-4"><p className="text-xs font-bold uppercase text-muted">Aprobados</p><p className="mt-1 text-3xl font-black text-emerald-700">{dailySummary.approvedSales}</p></div>
                  <div className="rounded-md bg-white p-4"><p className="text-xs font-bold uppercase text-muted">Rechazados</p><p className="mt-1 text-3xl font-black text-red-700">{dailySummary.rejected}</p></div>
                </div>
              </div>
            ) : (
              <div className="rounded-md bg-soft p-8 text-center text-muted">Aun no hay resumen general diario para este dia.</div>
            )}
          </div>
        )}
      </section>
    </AppLayout>
  );
}
