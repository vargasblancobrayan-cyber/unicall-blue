"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Clipboard, Download, Folder, Upload } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { MonthNavigator } from "@/components/PeriodNavigator";
import { commercialMonthRange, loadCommercialRecords } from "@/lib/cloud-records";
import {
  CommercialRecord,
  FailureRecord,
  ShiftRecord,
  createRecordId,
  readStoredFailureRecords,
  readStoredRecords,
  readStoredShiftRecords,
  recordsToCsv,
  writeStoredRecords
} from "@/lib/records";

function recordDateValue(record: CommercialRecord) {
  return (record.recordDate || record.createdAt || "").slice(0, 10);
}

function daysBetween(startDate: string, endDate: string) {
  if (!startDate || !endDate) return 0;
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  return Math.max(1, Math.floor((end.getTime() - start.getTime()) / 86400000) + 1);
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

export default function StaffReportsPage() {
  const [records, setRecords] = useState<CommercialRecord[]>([]);
  const [shiftRecords, setShiftRecords] = useState<ShiftRecord[]>([]);
  const [failureRecords, setFailureRecords] = useState<FailureRecord[]>([]);
  const [exportMessage, setExportMessage] = useState("");
  const [reportMonth, setReportMonth] = useState(() => new Date().toISOString().slice(0, 7));

  useEffect(() => {
    const range = commercialMonthRange(reportMonth);
    loadCommercialRecords({ ...range, recordTypes: ["sale"], limit: 750 })
      .then((storedRecords) => setRecords(storedRecords.filter((record) => record.type === "sale")))
      .catch(() =>
        setRecords(readStoredRecords().filter((record) => record.type === "sale" && recordDateValue(record).startsWith(reportMonth)))
      );
    setShiftRecords(readStoredShiftRecords());
    setFailureRecords(readStoredFailureRecords());
  }, [reportMonth]);

  const totals = useMemo(
    () => ({
      sales: records.filter((record) => record.type === "sale").length
    }),
    [records]
  );

  const today = new Date().toISOString().slice(0, 10);

  const operatorDailyHistory = useMemo(() => {
    const operatorNames = new Set<string>();
    records.forEach((record) => operatorNames.add(record.operator || "Sin operador"));
    shiftRecords.forEach((record) => operatorNames.add(record.operator || "Sin operador"));

    return Array.from(operatorNames).map((operator) => {
      const operatorRecords = records.filter((record) => (record.operator || "Sin operador") === operator);
      const todayRecords = operatorRecords.filter((record) => recordDateValue(record) === today);
      const todaySales = todayRecords.filter((record) => record.type === "sale");
      const todayHours = shiftRecords
        .filter((record) => record.operator === operator && record.date === today)
        .reduce((total, record) => total + workedHoursForRecord(record), 0);
      const campaign = todayRecords[0]?.campaign || operatorRecords[0]?.campaign || "Sin campana";
      const firstCampaignDate =
        operatorRecords
          .filter((record) => (record.campaign || "Sin campana") === campaign)
          .map(recordDateValue)
          .filter(Boolean)
          .sort()[0] || today;
      const soldUnits = todaySales.reduce((total, record) => total + soldUnitsFromTreatment(record.treatment), 0);
      const averageCheck = todaySales.length ? soldUnits / todaySales.length : 0;
      const effectiveHours = Math.max(todayHours, 10);
      const salesPerHour = todaySales.length / effectiveHours;
      const needsAttention = salesPerHour < 1;

      return {
        operator,
        campaign,
        campaignDays: daysBetween(firstCampaignDate, today),
        sales: todaySales.length,
        hours: todayHours,
        salesPerHour,
        averageCheck,
        needsAttention
      };
    });
  }, [records, shiftRecords, today]);

  const shiftRecordsByDay = useMemo(() => {
    const groups = new Map<string, ShiftRecord[]>();
    shiftRecords.forEach((record) => {
      const current = groups.get(record.date) || [];
      groups.set(record.date, [...current, record]);
    });

    return Array.from(groups.entries())
      .map(([date, dayRecords]) => {
        const sortedRecords = [...dayRecords].sort((a, b) => a.operator.localeCompare(b.operator));
        const uniqueOperators = new Set(sortedRecords.map((record) => record.operator));
        const totalHours = sortedRecords.reduce((total, record) => total + workedHoursForRecord(record), 0);
        const openShifts = sortedRecords.filter((record) => record.status === "Abierta").length;
        const extras = sortedRecords.filter((record) => record.shiftType === "Extras").length;

        return {
          date,
          records: sortedRecords,
          operators: uniqueOperators.size,
          totalHours,
          openShifts,
          extras
        };
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [shiftRecords]);

  const todayShiftDay = shiftRecordsByDay.find((day) => day.date === today);
  const archivedShiftDays = shiftRecordsByDay.filter((day) => day.date !== today);

  function shiftRecordsToCsv(dayRecords: ShiftRecord[]) {
    const headers = ["Operador", "Fecha", "Ingreso", "Salida", "Horas", "Tipo", "Equipo", "Estado", "Foto"];
    const rows = dayRecords.map((record) => [
      record.operator,
      record.date,
      record.startTime,
      record.endTime || "",
      workedHoursForRecord(record).toFixed(2),
      record.shiftType,
      `${record.hasMouse ? "Mouse" : "Sin mouse"} / ${record.hasKeyboard ? "Teclado" : "Sin teclado"} / ${record.hasDeskReady ? "Escritorio listo" : "Pendiente"}`,
      record.status,
      record.photoName || ""
    ]);

    return [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))
      .join("\n");
  }

  function downloadShiftCsv(dayRecords: ShiftRecord[], fileName: string) {
    const csv = shiftRecordsToCsv(dayRecords);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
    setExportMessage(`Jornadas descargadas: ${dayRecords.length} registros.`);
  }

  function renderShiftTable(dayRecords: ShiftRecord[]) {
    return (
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1100px]">
          <thead className="bg-soft text-left text-xs uppercase text-muted">
            <tr>
              <th className="table-cell">Operador</th>
              <th className="table-cell">Ingreso</th>
              <th className="table-cell">Salida</th>
              <th className="table-cell">Horas</th>
              <th className="table-cell">Tipo</th>
              <th className="table-cell">Equipo</th>
              <th className="table-cell">Estado</th>
              <th className="table-cell">Foto</th>
            </tr>
          </thead>
          <tbody>
            {dayRecords.map((record) => (
              <tr key={record.id}>
                <td className="table-cell font-semibold">{record.operator}</td>
                <td className="table-cell">{record.startTime}</td>
                <td className="table-cell">{record.endTime || "-"}</td>
                <td className="table-cell">{workedHoursForRecord(record).toFixed(2)}</td>
                <td className="table-cell">{record.shiftType}</td>
                <td className="table-cell">
                  {record.hasMouse ? "Mouse" : "Sin mouse"} / {record.hasKeyboard ? "Teclado" : "Sin teclado"} / {record.hasDeskReady ? "Escritorio listo" : "Pendiente"}
                </td>
                <td className="table-cell">{record.status}</td>
                <td className="table-cell">
                  {record.photoDataUrl ? (
                    <a className="font-semibold text-brand-600" href={record.photoDataUrl} target="_blank">
                      Ver foto
                    </a>
                  ) : (
                    record.photoName || "-"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  function getCell(row: Record<string, unknown>, names: string[]) {
    const entry = Object.entries(row).find(([key]) =>
      names.some((name) => key.trim().toLowerCase() === name.toLowerCase())
    );
    return entry ? String(entry[1] ?? "").trim() : "";
  }

  function exportCsv() {
    const csv = recordsToCsv(records);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `unicall-blue-registros-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    setExportMessage(`Archivo CSV generado con ${records.length} registros.`);
  }

  async function copyCsv() {
    await navigator.clipboard.writeText(recordsToCsv(records));
    setExportMessage(`Tabla copiada con ${records.length} registros.`);
  }

  async function importExcel(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const XLSX = await import("xlsx");
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, { defval: "" });

    const importedRecords = rows
      .map((row): CommercialRecord | null => {
        const recordType = getCell(row, ["Tipo", "type", "Registro", "Categoria"]);
        if (recordType.toLowerCase().includes("rechazo")) return null;
        const orderNumber = getCell(row, ["Pedido No", "Pedido", "Order", "Order Number"]);
        const client = getCell(row, ["Cliente", "Nombre cliente", "client", "Nombre"]);
        const phone = getCell(row, ["Telefono", "Teléfono", "phone", "Celular"]);
        if (!orderNumber && !client && !phone) return null;

        return {
          id: createRecordId(),
          type: "sale",
          operator: getCell(row, ["Operador", "operator", "Asesor"]) || "Importado",
          campaign: getCell(row, ["Campana", "Campaña", "campaign"]) || "Sin campana",
          client: client || "Sin nombre",
          phone: phone || "Sin telefono",
          observation: getCell(row, ["Observacion", "Observación", "Notas", "Comentario"]),
          status: getCell(row, ["Estado", "status"]) || "Importado",
          createdAt: getCell(row, ["Fecha", "createdAt", "Creado"]) || new Date().toISOString(),
          orderNumber,
          recordDate: getCell(row, ["Fecha", "date", "Record Date"]) || new Date().toISOString().slice(0, 10),
          product: getCell(row, ["Producto", "Product"]) || "",
          result: getCell(row, ["Estado de entrega", "Resultado", "Result"]) || "",
          treatment: getCell(row, ["Tratamiento", "Treatment"]) || "",
          paymentMethod: getCell(row, ["Forma de pago", "Pago", "Payment"]) || ""
        };
      })
      .filter((record): record is CommercialRecord => Boolean(record));

    const nextRecords = [...importedRecords, ...records];
    writeStoredRecords(nextRecords);
    setRecords(nextRecords);
    setExportMessage(`Excel importado: ${importedRecords.length} registros agregados.`);
    event.target.value = "";
  }

  return (
    <AppLayout role="staff" title="Reportes y seguimiento">
      <section className="card p-5">
        <div className="grid gap-3 md:grid-cols-[220px_220px_auto]">
          <div><span className="mb-1 block text-sm font-semibold">Mes cargado</span><MonthNavigator value={reportMonth} onChange={setReportMonth} /></div>
          <label>
            <span className="mb-1 block text-sm font-semibold">Campana</span>
            <select className="input-base">
              <option>Todas</option>
              <option>Usablue</option>
              <option>Movil Premium</option>
              <option>Retencion</option>
            </select>
          </label>
          <div className="flex flex-wrap gap-2 self-end">
            <label className="btn-secondary cursor-pointer">
              <Upload size={16} />
              Subir Excel
              <input className="hidden" type="file" accept=".xlsx,.xls,.csv" onChange={importExcel} />
            </label>
            <button className="btn-primary" onClick={exportCsv}>
              <Download size={16} />
              Exportar CSV
            </button>
            <button className="btn-secondary" onClick={copyCsv}>
              <Clipboard size={16} />
              Copiar tabla
            </button>
          </div>
        </div>
        {exportMessage ? <p className="mt-3 rounded-md bg-cyan/10 p-2 text-sm font-semibold text-brand-700">{exportMessage}</p> : null}
      </section>

      <section className="mt-6 grid gap-4 md:grid-cols-1">
        <div className="card p-5">
          <p className="text-sm font-semibold text-muted">Ventas subidas</p>
          <p className="mt-2 text-3xl font-bold text-ink">{totals.sales}</p>
        </div>
      </section>

      <section className="mt-6 card overflow-hidden">
        <div className="border-b border-line p-5">
          <h2 className="text-lg font-bold text-ink">Registros enviados por operadores</h2>
          <p className="mt-1 text-sm text-muted">Ventas listas para validar o exportar. Los rechazos ocultos se gestionan en su apartado.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1120px]">
            <thead className="bg-soft text-left text-xs uppercase text-muted">
              <tr>
                <th className="table-cell">Pedido No</th>
                <th className="table-cell">Fecha</th>
                <th className="table-cell">Producto</th>
                <th className="table-cell">Estado de entrega</th>
                <th className="table-cell">Tratamiento</th>
                <th className="table-cell">Forma de pago</th>
                <th className="table-cell">Telefono</th>
                <th className="table-cell">Operador</th>
                <th className="table-cell">Observacion</th>
              </tr>
            </thead>
            <tbody>
              {records.length ? (
                records.map((record) => (
                  <tr key={record.id}>
                    <td className="table-cell font-semibold">{record.orderNumber || "-"}</td>
                    <td className="table-cell">{record.recordDate || new Date(record.createdAt).toLocaleDateString("es-CO")}</td>
                    <td className="table-cell">{record.product || "-"}</td>
                    <td className="table-cell">{record.result || record.status}</td>
                    <td className="table-cell">{record.treatment || "-"}</td>
                    <td className="table-cell">{record.paymentMethod || "-"}</td>
                    <td className="table-cell">{record.phone || "-"}</td>
                    <td className="table-cell">{record.operator}</td>
                    <td className="table-cell">{record.observation || "-"}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="table-cell text-muted" colSpan={9}>
                    Aun no hay ventas registradas.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-6 card overflow-hidden">
        <div className="border-b border-line p-5">
          <h2 className="text-lg font-bold text-ink">Historial por operador</h2>
          <p className="mt-1 text-sm text-muted">
            Productividad de hoy: minimo 1 venta por hora y 10 horas de meta diaria.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px]">
            <thead className="bg-soft text-left text-xs uppercase text-muted">
              <tr>
                <th className="table-cell">Operador</th>
                <th className="table-cell">Dias campana</th>
                <th className="table-cell">Ventas hoy</th>
                <th className="table-cell">Horas hoy</th>
                <th className="table-cell">Ventas / hora</th>
                <th className="table-cell">Cheque promedio</th>
                <th className="table-cell">Estado</th>
              </tr>
            </thead>
            <tbody>
              {operatorDailyHistory.length ? (
                operatorDailyHistory.map((operator) => (
                  <tr key={operator.operator} className={operator.needsAttention ? "bg-red-50" : undefined}>
                    <td className="table-cell font-semibold">
                      <div>{operator.operator}</div>
                      <div className="text-xs font-normal text-muted">{operator.campaign}</div>
                    </td>
                    <td className="table-cell">{operator.campaignDays}</td>
                    <td className="table-cell font-bold text-emerald-700">{operator.sales}</td>
                    <td className="table-cell">{operator.hours ? operator.hours.toFixed(1) : "0.0"} / 10</td>
                    <td className={`table-cell font-bold ${operator.salesPerHour < 1 ? "text-amber-700" : "text-emerald-700"}`}>
                      {operator.salesPerHour.toFixed(2)}
                    </td>
                    <td className="table-cell">{operator.averageCheck ? operator.averageCheck.toFixed(2) : "-"}</td>
                    <td className={`table-cell font-bold ${operator.needsAttention ? "text-red-700" : "text-emerald-700"}`}>
                      {operator.needsAttention ? "Revisar" : "Bien"}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="table-cell text-muted" colSpan={7}>
                    Aun no hay ventas o jornadas para calcular productividad de hoy.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-6 card overflow-hidden">
        <div className="border-b border-line p-5">
          <h2 className="text-lg font-bold text-ink">Control de jornada de operadores</h2>
          <p className="mt-1 text-sm text-muted">
            Vista operativa solo del dia de hoy. Los dias anteriores quedan guardados en historial descargable.
          </p>
        </div>
        {todayShiftDay ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-5">
              <div className="flex items-center gap-3">
                <CalendarDays className="text-brand-600" size={20} />
                <div>
                  <h3 className="font-bold text-ink">
                    Hoy, {new Date(`${todayShiftDay.date}T00:00:00`).toLocaleDateString("es-CO", {
                      weekday: "long",
                      day: "2-digit",
                      month: "long",
                      year: "numeric"
                    })}
                  </h3>
                  <p className="text-sm text-muted">
                    {todayShiftDay.operators} operadores, {todayShiftDay.records.length} registros, {todayShiftDay.totalHours.toFixed(1)} horas
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="rounded-md bg-soft px-3 py-2 text-xs font-bold text-ink">Abiertas: {todayShiftDay.openShifts}</span>
                <span className="rounded-md bg-soft px-3 py-2 text-xs font-bold text-ink">Extras: {todayShiftDay.extras}</span>
                <button className="btn-secondary py-2" onClick={() => downloadShiftCsv(todayShiftDay.records, `jornadas-hoy-${today}.csv`)}>
                  <Download size={16} />
                  Descargar hoy
                </button>
              </div>
            </div>
            {renderShiftTable(todayShiftDay.records)}
          </>
        ) : (
          <div className="flex items-center gap-3 p-5 text-sm text-muted">
            <CalendarDays size={18} />
            Aun no hay jornadas registradas para hoy.
          </div>
        )}
      </section>

      <section className="mt-6 card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-5">
          <div>
            <h2 className="text-lg font-bold text-ink">Historial de jornadas anteriores</h2>
            <p className="mt-1 text-sm text-muted">Carpetas por fecha para consultar o descargar sin saturar la vista de hoy.</p>
          </div>
          {archivedShiftDays.length ? (
            <button
              className="btn-primary"
              onClick={() =>
                downloadShiftCsv(
                  archivedShiftDays.flatMap((day) => day.records),
                  `historial-jornadas-anteriores-${today}.csv`
                )
              }
            >
              <Download size={16} />
              Descargar historial
            </button>
          ) : null}
        </div>
        <div className="divide-y divide-line">
          {archivedShiftDays.length ? (
            archivedShiftDays.map((day) => (
              <details key={day.date} className="group">
                <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 p-5 hover:bg-soft">
                  <div className="flex items-center gap-3">
                    <Folder className="text-brand-600" size={20} />
                    <div>
                      <h3 className="font-bold text-ink">
                        {new Date(`${day.date}T00:00:00`).toLocaleDateString("es-CO", {
                          weekday: "long",
                          day: "2-digit",
                          month: "long",
                          year: "numeric"
                        })}
                      </h3>
                      <p className="text-sm text-muted">
                        {day.operators} operadores, {day.records.length} registros, {day.totalHours.toFixed(1)} horas
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 text-center text-xs font-bold">
                    <span className="rounded-md bg-soft px-3 py-2 text-ink">Abiertas: {day.openShifts}</span>
                    <span className="rounded-md bg-soft px-3 py-2 text-ink">Extras: {day.extras}</span>
                    <button
                      className="btn-secondary py-2 text-sm"
                      onClick={(event) => {
                        event.preventDefault();
                        downloadShiftCsv(day.records, `jornadas-${day.date}.csv`);
                      }}
                    >
                      <Download size={16} />
                      Descargar
                    </button>
                  </div>
                </summary>
                <div className="border-t border-line bg-white">{renderShiftTable(day.records)}</div>
              </details>
            ))
          ) : (
            <div className="flex items-center gap-3 p-5 text-sm text-muted">
              <CalendarDays size={18} />
              Aun no hay jornadas anteriores guardadas.
            </div>
          )}
        </div>
      </section>

      <section className="mt-6 card overflow-hidden">
        <div className="border-b border-line p-5">
          <h2 className="text-lg font-bold text-ink">Fallas reportadas</h2>
          <p className="mt-1 text-sm text-muted">Tiempo en falla, explicacion y evidencia del operador.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px]">
            <thead className="bg-soft text-left text-xs uppercase text-muted">
              <tr>
                <th className="table-cell">Operador</th>
                <th className="table-cell">Fecha</th>
                <th className="table-cell">Inicio</th>
                <th className="table-cell">Fin</th>
                <th className="table-cell">Minutos</th>
                <th className="table-cell">Explicacion</th>
                <th className="table-cell">Evidencia</th>
                <th className="table-cell">Estado</th>
              </tr>
            </thead>
            <tbody>
              {failureRecords.length ? (
                failureRecords.map((record) => (
                  <tr key={record.id}>
                    <td className="table-cell font-semibold">{record.operator}</td>
                    <td className="table-cell">{record.date}</td>
                    <td className="table-cell">{record.startTime}</td>
                    <td className="table-cell">{record.endTime || "-"}</td>
                    <td className="table-cell">{record.durationMinutes}</td>
                    <td className="table-cell">{record.explanation}</td>
                    <td className="table-cell">
                      {record.evidenceDataUrl ? (
                        <a className="font-semibold text-brand-600" href={record.evidenceDataUrl} target="_blank">
                          Ver evidencia
                        </a>
                      ) : (
                        record.evidenceName || "-"
                      )}
                    </td>
                    <td className="table-cell">{record.status}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="table-cell text-muted" colSpan={8}>Aun no hay fallas reportadas.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

    </AppLayout>
  );
}
