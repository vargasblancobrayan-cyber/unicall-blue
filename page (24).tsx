"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, Search, Utensils } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { loadScheduleOperators } from "@/lib/cloud-schedules";
import { BreakSchedule, readStoredBreakSchedules, writeStoredBreakSchedules } from "@/lib/records";

function defaultSchedule(operator: string): BreakSchedule {
  return {
    operator,
    loginTime: "07:00",
    lunch: "12:00",
    breakOne: "09:15",
    breakTwo: "15:15",
    visibleToOperator: false,
    breakOneVisible: false,
    lunchVisible: false,
    breakTwoVisible: false
  };
}

function downloadCsv(rows: BreakSchedule[]) {
  const csv = [["Operador", "Almuerzo", "Estado"], ...rows.map((row) => [row.operator, row.lunch, row.lunchVisible ? "Publicado" : "Oculto"])]
    .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "almuerzos-operadores.csv";
  link.click();
  URL.revokeObjectURL(url);
}

export default function StaffLunchesPage() {
  const [rows, setRows] = useState<BreakSchedule[]>([]);
  const [query, setQuery] = useState("");
  const [bulkLunch, setBulkLunch] = useState("12:00");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const stored = readStoredBreakSchedules();
    setRows(stored);
    loadScheduleOperators()
      .then((operators) => {
        if (!operators.length) return;
        const saved = readStoredBreakSchedules();
        const merged = operators.map((operator) => saved.find((item) => item.operator === operator.username) || defaultSchedule(operator.username));
        setRows(merged);
        writeStoredBreakSchedules(merged);
      })
      .catch(() => undefined);
  }, []);

  const filteredRows = useMemo(() => {
    const value = query.trim().toLowerCase();
    return rows.filter((row) => row.operator.toLowerCase().includes(value));
  }, [query, rows]);

  function persist(nextRows: BreakSchedule[], text: string) {
    setRows(nextRows);
    writeStoredBreakSchedules(nextRows);
    setMessage(text);
  }

  function updateLunch(operator: string, value: string) {
    persist(rows.map((row) => row.operator === operator ? { ...row, lunch: value } : row), `${operator} actualizado.`);
  }

  function publish(operator: string, visible: boolean) {
    persist(
      rows.map((row) =>
        row.operator === operator
          ? { ...row, lunchVisible: visible, visibleToOperator: visible || row.breakOneVisible || row.breakTwoVisible, publishedAt: new Date().toISOString() }
          : row
      ),
      `Almuerzo ${visible ? "publicado" : "oculto"} para ${operator}.`
    );
  }

  function publishFiltered() {
    const operators = new Set(filteredRows.map((row) => row.operator));
    persist(
      rows.map((row) =>
        operators.has(row.operator)
          ? { ...row, lunch: bulkLunch, lunchVisible: true, visibleToOperator: true, publishedAt: new Date().toISOString() }
          : row
      ),
      `Almuerzo ${bulkLunch} publicado a ${operators.size} operadores filtrados.`
    );
  }

  return (
    <AppLayout role="staff" title="Almuerzos">
      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-5">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-md bg-cyan/10 text-brand-700"><Utensils size={22} /></span>
            <div>
              <h2 className="text-lg font-black text-ink">Programar almuerzos</h2>
              <p className="text-sm text-muted">Pagina exclusiva para almuerzo. Publica cuando ya este editado.</p>
            </div>
          </div>
          <button className="btn-secondary" onClick={() => downloadCsv(filteredRows)}><Download size={16} /> Descargar</button>
        </div>
        <div className="grid gap-3 border-b border-line bg-soft p-4 lg:grid-cols-[1fr_auto]">
          <label className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={15} /><input className="input-base pl-9" placeholder="Buscar usuario" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
          <div className="flex gap-2"><input className="input-base w-36" type="time" value={bulkLunch} onChange={(event) => setBulkLunch(event.target.value)} /><button className="btn-primary" onClick={publishFiltered}>Publicar almuerzo</button></div>
        </div>
        {message ? <div className="bg-emerald-50 px-5 py-3 text-sm font-black text-emerald-800">{message}</div> : null}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px]">
            <thead className="bg-soft text-left text-xs uppercase text-muted"><tr><th className="table-cell">Usuario</th><th className="table-cell">Almuerzo</th><th className="table-cell">Enviar al operador</th></tr></thead>
            <tbody>
              {filteredRows.map((row) => (
                <tr key={row.operator}>
                  <td className="table-cell font-black">{row.operator}</td>
                  <td className="table-cell"><input className="input-base max-w-36" type="time" value={row.lunch} onChange={(event) => updateLunch(row.operator, event.target.value)} /></td>
                  <td className="table-cell"><button className={`min-w-28 rounded-md px-3 py-2 text-sm font-black ${row.lunchVisible ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-700"}`} onClick={() => publish(row.operator, !row.lunchVisible)}>{row.lunchVisible ? "Publicado" : "Publicar"}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </AppLayout>
  );
}
