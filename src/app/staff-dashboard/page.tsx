"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { Eye, PackageCheck, ShoppingCart } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { MetricCard } from "@/components/MetricCard";
import { Modal } from "@/components/Modal";
import { CommercialRecord, ShiftRecord, readStoredRecords, readStoredShiftRecords } from "@/lib/records";
import { loadCommercialRecords } from "@/lib/cloud-records";

function recordDateValue(record: CommercialRecord) {
  return (record.recordDate || record.createdAt || "").slice(0, 10);
}

function soldUnitsFromTreatment(treatment?: string) {
  const firstNumber = treatment?.match(/\d+/)?.[0];
  return firstNumber ? Number(firstNumber) : 0;
}

function workedHoursForRecord(record: ShiftRecord) {
  if (record.status !== "Abierta") return record.workedHours || 0;
  const start = new Date(`${record.date}T${record.startTime}`);
  const diffHours = Math.max(0, (Date.now() - start.getTime()) / 3600000);
  return Number(diffHours.toFixed(2));
}

export default function StaffDashboard() {
  const [records, setRecords] = useState<CommercialRecord[]>([]);
  const [shiftRecords, setShiftRecords] = useState<ShiftRecord[]>([]);
  const [selectedOperator, setSelectedOperator] = useState<string | null>(null);

  useEffect(() => {
    const today = new Date();
    const from = new Date(today);
    from.setDate(today.getDate() - 6);
    loadCommercialRecords({ from: from.toISOString().slice(0, 10), to: today.toISOString().slice(0, 10), recordTypes: ["sale"], limit: 750 })
      .then(setRecords)
      .catch(() => setRecords(readStoredRecords()));
    setShiftRecords(readStoredShiftRecords());
  }, []);

  const today = new Date().toISOString().slice(0, 10);

  const salesByDay = useMemo(() => {
    const days = Array.from({ length: 7 }).map((_, index) => {
      const date = new Date();
      date.setDate(date.getDate() - (6 - index));
      const value = date.toISOString().slice(0, 10);
      return {
        date: value,
        day: date.toLocaleDateString("es-CO", { weekday: "short" }),
        label: date.toLocaleDateString("es-CO", { weekday: "short", day: "2-digit" }),
        ventas: 0
      };
    });

    records.forEach((record) => {
      const day = days.find((item) => item.date === recordDateValue(record));
      if (!day) return;
      if (record.type === "sale") day.ventas += 1;
    });

    return days;
  }, [records]);

  const salesChartSummary = useMemo(() => {
    const total = salesByDay.reduce((sum, day) => sum + day.ventas, 0);
    const bestDay = salesByDay.reduce((best, day) => (day.ventas > best.ventas ? day : best), salesByDay[0]);
    const activeDays = salesByDay.filter((day) => day.ventas > 0).length;
    const average = activeDays ? total / activeDays : 0;
    return { total, bestDay, average };
  }, [salesByDay]);

  const operatorPerformance = useMemo(() => {
    const operatorNames = new Set<string>();
    records.forEach((record) => operatorNames.add(record.operator || "Sin operador"));
    shiftRecords.forEach((record) => operatorNames.add(record.operator || "Sin operador"));

    return Array.from(operatorNames).map((operator) => {
      const operatorRecords = records.filter((record) => (record.operator || "Sin operador") === operator);
      const todayRecords = operatorRecords.filter((record) => recordDateValue(record) === today);
      const sales = todayRecords.filter((record) => record.type === "sale");
      const hours = shiftRecords
        .filter((record) => record.operator === operator && record.date === today)
        .reduce((total, record) => total + workedHoursForRecord(record), 0);
      const soldUnits = sales.reduce((total, record) => total + soldUnitsFromTreatment(record.treatment), 0);
      const averageCheck = sales.length ? soldUnits / sales.length : 0;
      const salesPerHour = sales.length / Math.max(hours, 10);

      return {
        operator,
        username: todayRecords[0]?.operatorUsername || operatorRecords[0]?.operatorUsername || operator,
        campaign: todayRecords[0]?.campaign || operatorRecords[0]?.campaign || "Sin campana",
        sales: sales.length,
        hours,
        salesPerHour,
        averageCheck
      };
    });
  }, [records, shiftRecords, today]);

  const selectedDetails = useMemo(() => {
    if (!selectedOperator) return [];
    return records.filter(
      (record) =>
        (record.operatorUsername || record.operator) === selectedOperator &&
        recordDateValue(record) === today &&
        record.type === "sale"
    );
  }, [records, selectedOperator, today]);

  const totals = useMemo(() => {
    const todayRecords = records.filter((record) => recordDateValue(record) === today);
    const todaySales = todayRecords.filter((record) => record.type === "sale").length;
    const followUps = todayRecords.filter((record) => ["PENDIENTE", "NO CONTESTA", "PROMETE COMPRAR"].includes(record.result || "PENDIENTE")).length;
    const activeOperators = new Set(shiftRecords.filter((record) => record.date === today).map((record) => record.operator)).size;
    const soldUnits = todayRecords
      .filter((record) => record.type === "sale")
      .reduce((total, record) => total + soldUnitsFromTreatment(record.treatment), 0);

    return {
      activeOperators,
      todaySales,
      followUps,
      averageCheck: todaySales ? soldUnits / todaySales : 0
    };
  }, [records, shiftRecords, today]);

  return (
    <AppLayout role="staff" title="Panel de staff">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Operadores con jornada" value={String(totals.activeOperators)} helper="Registrados hoy" />
        <MetricCard label="Ventas hoy" value={String(totals.todaySales)} helper="Meta: 1 por hora" />
        <MetricCard label="Por seguir" value={String(totals.followUps)} helper="Pedidos pendientes de gestion" />
        <MetricCard label="Cheque promedio" value={totals.averageCheck ? totals.averageCheck.toFixed(2) : "-"} helper="Unidades vendidas / compras" />
      </div>

      <section className="mt-6">
        <div className="card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-5">
            <div>
              <p className="text-xs font-bold uppercase text-brand-700">Ultimos 7 dias</p>
              <h2 className="mt-1 text-lg font-black text-ink">Ventas por dia</h2>
              <p className="mt-1 text-sm text-muted">Lectura rapida para detectar picos, dias bajos y ritmo semanal.</p>
            </div>
            <div className="grid min-w-72 grid-cols-3 overflow-hidden rounded-md border border-line bg-soft text-center">
              <div className="p-3">
                <p className="text-xs font-bold uppercase text-muted">Total</p>
                <p className="mt-1 text-xl font-black text-ink">{salesChartSummary.total}</p>
              </div>
              <div className="border-x border-line p-3">
                <p className="text-xs font-bold uppercase text-muted">Mejor dia</p>
                <p className="mt-1 text-xl font-black text-emerald-700">{salesChartSummary.bestDay?.ventas || 0}</p>
              </div>
              <div className="p-3">
                <p className="text-xs font-bold uppercase text-muted">Promedio</p>
                <p className="mt-1 text-xl font-black text-brand-700">{salesChartSummary.average.toFixed(1)}</p>
              </div>
            </div>
          </div>
          <div className="h-80 px-4 py-5">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={salesByDay} margin={{ top: 24, right: 14, bottom: 6, left: 0 }}>
                <defs>
                  <linearGradient id="salesBlue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#1d4ed8" />
                    <stop offset="100%" stopColor="#38bdf8" />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e3eaf5" />
                <XAxis dataKey="label" tick={{ fill: "#53657d", fontSize: 12, fontWeight: 700 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#53657d", fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip
                  cursor={{ fill: "#eff6ff" }}
                  formatter={(value) => [`${value} ventas`, "Ventas"]}
                  labelFormatter={(label) => `Dia ${label}`}
                />
                <Bar dataKey="ventas" fill="url(#salesBlue)" radius={[8, 8, 0, 0]} maxBarSize={92} background={{ fill: "#f4f7fb", radius: 8 }}>
                  <LabelList dataKey="ventas" position="top" className="fill-ink text-xs font-bold" formatter={(value: number) => (value ? String(value) : "")} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      <section className="mt-6 card overflow-hidden">
        <div className="border-b border-line p-5">
          <h2 className="text-lg font-bold text-ink">Desempeno de hoy por operador</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px]">
            <thead className="bg-soft text-left text-xs uppercase text-muted">
              <tr>
                <th className="table-cell">Operador</th>
                <th className="table-cell">Campana</th>
                <th className="table-cell">Ventas hoy</th>
                <th className="table-cell">Horas hoy</th>
                <th className="table-cell">Ventas / hora</th>
                <th className="table-cell">Cheque promedio</th>
                <th className="table-cell">Detalle</th>
              </tr>
            </thead>
            <tbody>
              {operatorPerformance.length ? (
                operatorPerformance.map((operator) => (
                <tr key={operator.operator} className={operator.salesPerHour < 1 ? "bg-red-50" : undefined}>
                  <td className="table-cell font-semibold">{operator.username}</td>
                  <td className="table-cell">{operator.campaign}</td>
                  <td className="table-cell">{operator.sales}</td>
                  <td className="table-cell">{operator.hours.toFixed(1)} / 10</td>
                  <td className={`table-cell font-bold ${operator.salesPerHour < 1 ? "text-amber-700" : "text-emerald-700"}`}>{operator.salesPerHour.toFixed(2)}</td>
                  <td className="table-cell">{operator.averageCheck ? operator.averageCheck.toFixed(2) : "-"}</td>
                  <td className="table-cell">
                    <button className="btn-secondary py-1.5" onClick={() => setSelectedOperator(operator.username)}>
                      <Eye size={15} /> Ver pedidos
                    </button>
                  </td>
                </tr>
                ))
              ) : (
                <tr>
                  <td className="table-cell text-muted" colSpan={7}>
                    Aun no hay registros de hoy para calcular desempeno.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <Modal title={`Movimientos de ${selectedOperator || "operador"}`} open={Boolean(selectedOperator)} onClose={() => setSelectedOperator(null)}>
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3">
            <div className="rounded-md bg-emerald-50 p-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700"><ShoppingCart size={16} /> Ventas</div>
              <p className="mt-1 text-2xl font-bold text-emerald-700">{selectedDetails.filter((record) => record.type === "sale").length}</p>
            </div>
          </div>

          {selectedDetails.length ? (
            <div className="divide-y divide-line overflow-hidden rounded-md border border-line">
              {selectedDetails.map((record) => (
                <div className="flex items-center justify-between gap-3 p-3" key={record.id}>
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="mt-0.5 rounded-md bg-emerald-50 p-2 text-emerald-700">
                      <PackageCheck size={17} />
                    </span>
                    <div className="min-w-0">
                      <p className="font-bold text-ink">Pedido {record.orderNumber || "Sin numero"}</p>
                      <p className="text-sm text-muted">{record.product || record.campaign || "Sin producto"}</p>
                      {record.observation ? <p className="mt-1 text-xs text-muted">{record.observation}</p> : null}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-700">
                      VENTA
                    </span>
                    <p className="mt-2 font-bold text-ink">{record.treatment || "Sin tratamiento"}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-md bg-soft p-5 text-center text-sm text-muted">No hay movimientos registrados hoy para este usuario.</div>
          )}
          <button className="btn-secondary w-full justify-center" onClick={() => setSelectedOperator(null)}>Cerrar</button>
        </div>
      </Modal>
    </AppLayout>
  );
}
