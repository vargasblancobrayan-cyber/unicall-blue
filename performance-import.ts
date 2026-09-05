import type { PerformanceImportRow } from "@/lib/performance-metrics";

export type PerformanceFileType = "processing" | "hourly";

export type DailyPerformanceSummary = {
  summaryScope?: "day" | "month";
  metricDate: string;
  totalOrders: number;
  callbacks: number;
  noAnswer: number;
  approvedSales: number;
  approvedRate: number;
  rejected: number;
  trash: number;
  averageCheck: number;
  sourceFile: string;
};

export type PerformanceParseResult = {
  rows: PerformanceImportRow[];
  dailySummary?: DailyPerformanceSummary;
};

type ColumnRule = {
  label: string;
  all?: string[];
  any?: string[];
  exclude?: string[];
};

type HeaderMatch = {
  sheetName: string;
  rows: unknown[][];
  headerIndex: number;
  headers: string[];
  operatorColumn: number;
  columns: Record<string, number>;
  score: number;
};

const operatorRules: ColumnRule[] = [
  { label: "Agrupacion Operador", all: ["agrupacion", "operador"] },
  { label: "Agrupacion", all: ["agrupacion"] },
  { label: "Operador", all: ["operador"] },
  { label: "Usuario", all: ["usuario"] },
  { label: "User", all: ["user"] }
];

const processingRules: Record<string, ColumnRule[]> = {
  totalOrders: [
    { label: "Total", any: ["total"], exclude: ["%", "porcentaje"] }
  ],
  callbacks: [
    { label: "Rellamada", any: ["rellamada", "rellamadas"], exclude: ["%", "porcentaje"] }
  ],
  noAnswer: [
    { label: "No contesta", all: ["no", "contesta"], exclude: ["%", "porcentaje"] }
  ],
  approved: [
    { label: "Aprobado", any: ["aprobado", "aprobados"], exclude: ["%", "porcentaje"] }
  ],
  rejected: [
    { label: "Rechazado", any: ["rechazado", "rechazados"], exclude: ["%", "porcentaje"] }
  ],
  trash: [
    { label: "Basura", any: ["basura", "basuras"], exclude: ["%", "porcentaje"] }
  ],
  averageCheck: [
    { label: "Cheque promedio", all: ["cheque", "promedio"] },
    { label: "Promedio sin paquetes", all: ["promedio", "paquetes"] },
    { label: "Ticket promedio", all: ["ticket", "promedio"] },
    { label: "Check promedio", all: ["check", "promedio"] }
  ]
};

const hourlyRules: Record<string, ColumnRule[]> = {
  listTime: [
    { label: "Tiempo en lista", all: ["tiempo", "lista"] },
    { label: "Tiempo lista", all: ["tiempo", "list"] }
  ],
  productivity: [
    { label: "Productividad Nuevos", all: ["productividad", "nuevos"] },
    { label: "Productividad Nuevo", all: ["productividad", "nuevo"] },
    { label: "Prod Nuevos", all: ["prod", "nuevos"] }
  ]
};

function normalizeHeader(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9%]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeOperator(value: unknown) {
  return String(value || "").trim();
}

function numberValue(value: unknown) {
  if (typeof value === "number") return value;
  const text = String(value || "").trim().replace(/\s/g, "");
  if (!text) return 0;
  const firstNumber = text.match(/-?\d+(?:[.,]\d+)?/)?.[0] || "";
  const normalized = firstNumber.includes(",") && !firstNumber.includes(".")
    ? firstNumber.replace(",", ".")
    : firstNumber.replace(/,/g, "");
  const number = Number.parseFloat(normalized);
  return Number.isFinite(number) ? number : 0;
}

function minutesValue(value: unknown) {
  if (typeof value === "number") {
    return value > 0 && value < 1 ? Math.round(value * 24 * 60) : Math.round(value);
  }
  const text = String(value || "").toLowerCase();
  const days = Number(text.match(/(\d+(?:[.,]\d+)?)\s*d/)?.[1]?.replace(",", ".") || 0);
  const hours = Number(text.match(/(\d+(?:[.,]\d+)?)\s*h/)?.[1]?.replace(",", ".") || 0);
  const minutes = Number(text.match(/(\d+)\s*min/)?.[1] || 0);
  if (days || hours || minutes) return Math.round(days * 24 * 60 + hours * 60 + minutes);
  const parts = text.match(/^(\d{1,3}):(\d{2})(?::\d{2})?/);
  if (parts) return Number(parts[1]) * 60 + Number(parts[2]);
  return Math.round(numberValue(value));
}

function termIncluded(text: string, term: string) {
  return text.includes(normalizeHeader(term));
}

function ruleMatches(header: string, rule: ColumnRule) {
  if (!header) return false;
  if (rule.exclude?.some((term) => termIncluded(header, term))) return false;
  const allOk = !rule.all || rule.all.every((term) => termIncluded(header, term));
  const anyOk = !rule.any || rule.any.some((term) => termIncluded(header, term));
  return allOk && anyOk;
}

function findColumn(headers: string[], rules: ColumnRule[]) {
  let bestIndex = -1;
  let bestScore = -1;
  headers.forEach((header, index) => {
    const context = [headers[index - 1], header, headers[index + 1]].filter(Boolean).join(" ");
    rules.forEach((rule, ruleIndex) => {
      const directMatch = ruleMatches(header, rule);
      const contextMatch = !directMatch && ruleMatches(context, rule) && !rule.exclude?.some((term) => termIncluded(header, term));
      if (!directMatch && !contextMatch) return;
      const exactMatch = normalizeHeader(header) === normalizeHeader(rule.label) ? 80 : 0;
      const score = exactMatch + (directMatch ? 40 : 0) + Math.max(0, 20 - ruleIndex) + header.length;
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    });
  });
  return bestIndex;
}

function combinedHeaders(rows: unknown[][], rowIndex: number) {
  const row = rows[rowIndex] || [];
  return row.map((cell, columnIndex) => {
    const above2 = normalizeHeader(rows[rowIndex - 2]?.[columnIndex]);
    const above1 = normalizeHeader(rows[rowIndex - 1]?.[columnIndex]);
    const current = normalizeHeader(cell);
    return [above2, above1, current].filter(Boolean).join(" ");
  });
}

function detectColumns(headers: string[], type: PerformanceFileType) {
  const rules = type === "processing" ? processingRules : hourlyRules;
  return Object.fromEntries(
    Object.entries(rules).map(([key, columnRules]) => [key, findColumn(headers, columnRules)])
  );
}

function parseDateValue(value: unknown) {
  const text = String(value || "").trim();
  const dotParts = text.match(/^(\d{1,2})[,.\/-](\d{1,2})[.\/-](\d{4})$/);
  if (!dotParts) return "";
  const day = dotParts[1].padStart(2, "0");
  const month = dotParts[2].padStart(2, "0");
  return `${dotParts[3]}-${month}-${day}`;
}

function findPercentColumn(headers: string[], valueColumn: number) {
  const candidateIndexes = [valueColumn + 1, valueColumn - 1].filter((index) => index >= 0 && index < headers.length);
  const percentColumn = candidateIndexes.find((index) => {
    const header = normalizeHeader(headers[index]);
    return header === "%" || header.includes("porcentaje") || header.includes("percent");
  });
  return percentColumn ?? -1;
}

function missingColumns(columns: Record<string, number>, type: PerformanceFileType) {
  const labels = type === "processing"
    ? {
        totalOrders: "Total",
        callbacks: "Rellamada",
        noAnswer: "No contesta",
        approved: "Aprobado",
        rejected: "Rechazado",
        trash: "Basura",
        averageCheck: "Cheque promedio"
      }
    : {
        listTime: "Tiempo en lista",
        productivity: "Productividad Nuevos"
      };
  return Object.entries(labels)
    .filter(([key]) => columns[key] < 0)
    .map(([, label]) => label);
}

function findDailySummary(
  workbookSheets: Array<{ sheetName: string; rows: unknown[][] }>,
  fileName: string,
  summaryScope: "day" | "month" = "day",
  fallbackDate?: string
): DailyPerformanceSummary | undefined {
  let summary: DailyPerformanceSummary | undefined;
  workbookSheets.forEach(({ rows }) => {
    rows.forEach((row, headerIndex) => {
      if (!row.some((cell) => normalizeHeader(cell))) return;
      const headers = combinedHeaders(rows, headerIndex);
      const dayColumn = findColumn(headers, [
        { label: "Agrupacion Dia", all: ["agrupacion", "dia"] },
        { label: "Dia", all: ["dia"] },
        { label: "Fecha", all: ["fecha"] }
      ]);
      if (dayColumn < 0) return;
      const columns = detectColumns(headers, "processing");
      if (missingColumns(columns, "processing").length) return;
      const approvedRateColumn = findPercentColumn(headers, columns.approved);
      rows.slice(headerIndex + 1).forEach((dataRow) => {
        const rowLabel = normalizeHeader(dataRow[dayColumn]);
        const metricDate = parseDateValue(dataRow[dayColumn]);
        if (summaryScope === "day" && !metricDate) return;
        if (summaryScope === "month" && rowLabel !== "total" && rowLabel !== "totales") return;
        if (summaryScope === "day" && summary && summary.metricDate >= metricDate) return;
        const totalOrders = numberValue(dataRow[columns.totalOrders]);
        const approvedSales = numberValue(dataRow[columns.approved]);
        summary = {
          summaryScope,
          metricDate: summaryScope === "month" ? (fallbackDate || metricDate || new Date().toISOString().slice(0, 10)) : metricDate,
          totalOrders,
          callbacks: numberValue(dataRow[columns.callbacks]),
          noAnswer: numberValue(dataRow[columns.noAnswer]),
          approvedSales,
          approvedRate: approvedRateColumn >= 0
            ? numberValue(dataRow[approvedRateColumn])
            : totalOrders > 0 ? (approvedSales / totalOrders) * 100 : 0,
          rejected: numberValue(dataRow[columns.rejected]),
          trash: numberValue(dataRow[columns.trash]),
          averageCheck: numberValue(dataRow[columns.averageCheck]),
          sourceFile: fileName
        };
      });
    });
  });
  return summary;
}

function findBestHeader(
  workbookSheets: Array<{ sheetName: string; rows: unknown[][] }>,
  type: PerformanceFileType
): HeaderMatch | null {
  let best: HeaderMatch | null = null;
  workbookSheets.forEach(({ sheetName, rows }) => {
    rows.forEach((row, headerIndex) => {
      if (!row.some((cell) => normalizeHeader(cell))) return;
      const headers = combinedHeaders(rows, headerIndex);
      const operatorColumn = findColumn(headers, operatorRules);
      const columns = detectColumns(headers, type);
      const presentColumns = Object.values(columns).filter((index) => index >= 0).length;
      const score = (operatorColumn >= 0 ? 10 : 0) + presentColumns * 6;
      if (!best || score > best.score) {
        best = { sheetName, rows, headerIndex, headers, operatorColumn, columns, score };
      }
    });
  });
  return best;
}

function isDataRow(sourceOperator: string) {
  const normalized = normalizeHeader(sourceOperator);
  return Boolean(
    sourceOperator &&
    normalized !== "total" &&
    normalized !== "totales" &&
    !normalized.includes("mostrando") &&
    !normalized.includes("agrupacion") &&
    !normalized.includes("operador")
  );
}

export async function parsePerformanceFile(file: File, type: PerformanceFileType): Promise<PerformanceImportRow[]> {
  const result = await parsePerformanceUpload(file, type);
  return result.rows;
}

export async function parsePerformanceUpload(
  file: File,
  type: PerformanceFileType,
  options: { summaryScope?: "day" | "month"; fallbackDate?: string } = {}
): Promise<PerformanceParseResult> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const workbookSheets = workbook.SheetNames.map((sheetName) => ({
    sheetName,
    rows: XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], {
      header: 1,
      raw: false,
      defval: ""
    })
  }));
  const dailySummary = type === "processing"
    ? findDailySummary(workbookSheets, file.name, options.summaryScope || "day", options.fallbackDate)
    : undefined;

  const match = findBestHeader(workbookSheets, type);
  if (!match || match.operatorColumn < 0) {
    if (dailySummary) return { rows: [], dailySummary };
    throw new Error("No se encontro la columna del operador. Revisa que el archivo tenga Agrupacion / Operador / Usuario.");
  }

  const missing = missingColumns(match.columns, type);
  if (missing.length) {
    if (dailySummary) return { rows: [], dailySummary };
    throw new Error(`No pude leer ${file.name}. Faltan columnas: ${missing.join(", ")}. Hoja revisada: ${match.sheetName}.`);
  }

  const importedRows: PerformanceImportRow[] = [];
  match.rows.slice(match.headerIndex + 1).forEach((row) => {
    const sourceOperator = normalizeOperator(row[match.operatorColumn]);
    if (!isDataRow(sourceOperator)) return;

    if (type === "processing") {
      if (parseDateValue(sourceOperator)) return;
      importedRows.push({
        sourceOperator,
        totalOrders: numberValue(row[match.columns.totalOrders]),
        callbacks: numberValue(row[match.columns.callbacks]),
        approvedSales: numberValue(row[match.columns.approved]),
        rejected: numberValue(row[match.columns.rejected]),
        trash: numberValue(row[match.columns.trash]),
        averageCheck: numberValue(row[match.columns.averageCheck]),
        processingFile: file.name
      });
      return;
    }

    importedRows.push({
      sourceOperator,
      listMinutes: minutesValue(row[match.columns.listTime]),
      salesPerHour: numberValue(row[match.columns.productivity]),
      hourlyFile: file.name
    });
  });

  if (!importedRows.length && !dailySummary) {
    throw new Error(`El archivo ${file.name} se pudo abrir, pero no encontre filas de operadores para importar.`);
  }

  return { rows: importedRows, dailySummary };
}
