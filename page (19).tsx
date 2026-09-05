"use client";

import { useEffect, useMemo, useState } from "react";
import { Coffee, Download, Search } from "lucide-react";
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
  const csv = [
    ["Operador", "Break 1", "Estado Break 1", "Break opcional", "Estado opcional"],
    ...rows.map((row) => [
      row.operator,
      row.breakOne,
      row.breakOneVisible ? "Publicado" : "Oculto",
      row.breakTwo,
      row.breakTwoVisible ? "Publicado" : "Oculto"
    ])
  ]
    .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "breaks-operadores.csv";
  link.click();
  URL.revokeObjectURL(url);
}

export default function StaffBreaksPage() {
  const [rows, setRows] = useState<BreakSchedule[]>([]);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const [bulkBreakOne, setBulkBreakOne] = useState("09:15");
  const [bulkBreakTwo, setBulkBreakTwo] = useState("15:15");

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

  function updateRow(operator: string, field: "breakOne" | "breakTwo", value: string) {
    persist(rows.map((row) => row.operator === operator ? { ...row, [field]: value } : row), `${operator} actualizado.`);
  }

  function publish(operator: string, field: "breakOneVisible" | "breakTwoVisible", visible: boolean) {
    const label = field === "breakOneVisible" ? "Break 1" : "Break opcional";
    persist(
      rows.map((row) =>
        row.operator === operator
          ? { ...row, [field]: visible, visibleToOperator: visible || row.breakOneVisible || row.breakTwoVisible || row.lunchVisible, publishedAt: new Date().toISOString() }
          : row
      ),
      `${label} ${visible ? "publicado" : "oculto"} para ${operator}.`
    );
  }

  function publishFiltered(field: "breakOne" | "breakTwo", visibleField: "breakOneVisible" | "breakTwoVisible", value: string) {
    const operators = new Set(filteredRows.map((row) => row.operator));
    persist(
      rows.map((row) =>
        operators.has(row.operator)
          ? { ...row, [field]: value, [visibleField]: true, visibleToOperator: true, publishedAt: new Date().toISOString() }
          : row
      ),
      `${field === "breakOne" ? "Break 1" : "Break opcional"} publicado a ${operators.size} operadores filtrados.`
    );
  }

  return (
    <AppLayout role="staff" title="Breaks">
      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-5">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-md bg-amber-50 text-amber-700"><Coffee size={22} /></span>
            <div>
              <h2 className="text-lg font-black text-ink">Programar breaks</h2>
              <p className="text-sm text-muted">Solo breaks. Almuerzos y cambios estan en sus propias paginas.</p>
            </div>
          </div>
          <button className="btn-secondary" onClick={() => downloadCsv(filteredRows)}><Download size={16} /> Descargar</button>
        </div>
        <div className="grid gap-3 border-b border-line bg-soft p-4 lg:grid-cols-[1fr_auto_auto]">
          <label className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={15} /><input className="input-base pl-9" placeholder="Buscar usuario" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
          <div className="flex gap-2"><input className="input-base w-36" type="time" value={bulkBreakOne} onChange={(event) => setBulkBreakOne(event.target.value)} /><button className="btn-primary" onClick={() => publishFiltered("breakOne", "breakOneVisible", bulkBreakOne)}>Publicar Break 1</button></div>
          <div className="flex gap-2"><input className="input-base w-36" type="time" value={bulkBreakTwo} onChange={(event) => setBulkBreakTwo(event.target.value)} /><button className="btn-primary" onClick={() => publishFiltered("breakTwo", "breakTwoVisible", bulkBreakTwo)}>Publicar opcional</button></div>
        </div>
        {message ? <div className="bg-emerald-50 px-5 py-3 text-sm font-black text-emerald-800">{message}</div> : null}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[780px]">
            <thead className="bg-soft text-left text-xs uppercase text-muted"><tr><th className="table-cell">Usuario</th><th className="table-cell">Break 1</th><th className="table-cell">Estado</th><th className="table-cell">Break opcional</th><th className="table-cell">Estado</th></tr></thead>
            <tbody>
              {filteredRows.map((row) => (
                <tr key={row.operator}>
                  <td className="table-cell font-black">{row.operator}</td>
                  <td className="table-cell"><input className="input-base max-w-36" type="time" value={row.breakOne} onChange={(event) => updateRow(row.operator, "breakOne", event.target.value)} /></td>
                  <td className="table-cell"><button className={`min-w-28 rounded-md px-3 py-2 text-sm font-black ${row.breakOneVisible ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-700"}`} onClick={() => publish(row.operator, "breakOneVisible", !row.breakOneVisible)}>{row.breakOneVisible ? "Publicado" : "Publicar"}</button></td>
                  <td className="table-cell"><input className="input-base max-w-36" type="time" value={row.breakTwo} onChange={(event) => updateRow(row.operator, "breakTwo", event.target.value)} /></td>
                  <td className="table-cell"><button className={`min-w-28 rounded-md px-3 py-2 text-sm font-black ${row.breakTwoVisible ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-700"}`} onClick={() => publish(row.operator, "breakTwoVisible", !row.breakTwoVisible)}>{row.breakTwoVisible ? "Publicado" : "Publicar"}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </AppLayout>
  );
}
