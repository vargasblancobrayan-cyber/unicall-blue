"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, Download, GripVertical, Plus, Search, Trash2, Upload, WandSparkles, XCircle } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { DayNavigator, MonthNavigator } from "@/components/PeriodNavigator";
import { operators } from "@/lib/data";
import { generateTwoByTwoSchedule } from "@/lib/schedule";
import { automateMonthlySchedules, loadScheduleOperators, loadStaffShiftChangeRequests, publishDailyRestSchedules, reviewShiftChangeRequest } from "@/lib/cloud-schedules";
import {
  BreakAssignment,
  BreakSchedule,
  DailyShiftAssignment,
  ShiftChangeRequest,
  createRecordId,
  readStoredBreakAssignments,
  readStoredBreakSchedules,
  readStoredDailyShiftAssignments,
  readStoredRecords,
  readStoredShiftCalendarSettings,
  readStoredShiftChangeRequests,
  readStoredShiftRecords,
  writeStoredBreakAssignments,
  writeStoredBreakSchedules,
  writeStoredDailyShiftAssignments,
  writeStoredShiftCalendarSettings,
  writeStoredShiftChangeRequests
} from "@/lib/records";

const workScheduleOptions = [
  "07:00 - 19:00",
  "07:00 - 13:00 / 16:00 - 22:00",
  "08:00 - 16:00",
  "10:00 - 18:00",
  "13:00 - 21:00"
];
function to12HourParts(hour24: number, minute: string) {
  const period = hour24 >= 12 ? "PM" : "AM";
  const hour = hour24 % 12 || 12;
  return { hour: String(hour).padStart(2, "0"), minute, period };
}

function parseWorkSchedule(value: string) {
  const match = value.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?\s*-\s*(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  const startHourRaw = Number(match?.[1] || "7");
  const startMinute = match?.[2] || "00";
  const endHourRaw = Number(match?.[4] || "19");
  const endMinute = match?.[5] || "00";
  const startPeriodRaw = match?.[3]?.toUpperCase();
  const endPeriodRaw = match?.[6]?.toUpperCase();
  const start = startPeriodRaw ? { hour: String(startHourRaw).padStart(2, "0"), minute: startMinute, period: startPeriodRaw } : to12HourParts(startHourRaw, startMinute);
  const end = endPeriodRaw ? { hour: String(endHourRaw).padStart(2, "0"), minute: endMinute, period: endPeriodRaw } : to12HourParts(endHourRaw, endMinute);
  return {
    startHour: start.hour,
    startMinute: start.minute,
    startPeriod: start.period,
    endHour: end.hour,
    endMinute: end.minute,
    endPeriod: end.period
  };
}

function to24Hour(hour: string, period: string) {
  const numeric = Number(hour);
  if (period === "PM") return String(numeric === 12 ? 12 : numeric + 12).padStart(2, "0");
  return String(numeric === 12 ? 0 : numeric).padStart(2, "0");
}

function getScheduleLoginTime(value: string) {
  const parts = parseWorkSchedule(value);
  return `${to24Hour(parts.startHour, parts.startPeriod)}:${parts.startMinute}`;
}

function parseScheduleTimeRange(value: string) {
  const match = value.match(/(\d{1,2}):(\d{2})\s*(?:AM|PM)?\s*-\s*(\d{1,2}):(\d{2})/i);
  const startHour = String(match?.[1] || "07").padStart(2, "0");
  const startMinute = match?.[2] || "00";
  const endHour = String(match?.[3] || "19").padStart(2, "0");
  const endMinute = match?.[4] || "00";
  return { start: `${startHour}:${startMinute}`, end: `${endHour}:${endMinute}` };
}

function escapeHtml(value: string | number) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function openTableInBrowser(title: string, headers: string[], rows: Array<Array<string | number>>) {
  const html = `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 24px; color: #0f172a; }
    h1 { font-size: 22px; margin: 0 0 6px; }
    p { margin: 0 0 18px; color: #64748b; }
    table { border-collapse: collapse; width: 100%; font-size: 13px; }
    th { background: #0f766e; color: white; text-align: left; padding: 10px; border: 1px solid #115e59; }
    td { padding: 9px 10px; border: 1px solid #cbd5e1; }
    tr:nth-child(even) td { background: #f8fafc; }
    .toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
    button { border: 0; border-radius: 6px; background: #1d4ed8; color: white; font-weight: 700; padding: 10px 14px; cursor: pointer; }
    @media print { button { display: none; } body { margin: 10mm; } }
  </style>
</head>
<body>
  <div class="toolbar">
    <div>
      <h1>${escapeHtml(title)}</h1>
      <p>Vista editable en Chrome. Puedes corregir celdas antes de imprimir o guardar como PDF.</p>
    </div>
    <button onclick="window.print()">Imprimir / Guardar PDF</button>
  </div>
  <table>
    <thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead>
    <tbody>
      ${rows.map((row) => `<tr>${row.map((cell) => `<td contenteditable="true">${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}
    </tbody>
  </table>
</body>
</html>`;
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener,noreferrer");
}

function shortUserName(name: string) {
  const parts = name.split(" ").filter(Boolean);
  const first = parts[0] || "User";
  const last = parts[1] || parts[parts.length - 1] || "";
  return `${first[0]}.${last}`.replace(/\.$/, "");
}

function createDefaultAssignments(): DailyShiftAssignment[] {
  return [
    {
      id: "OP-DEMO",
      user: "O.Demo",
      name: "Operador Demo",
      workMode: "Oficina",
      location: "CL 72 - Coworking",
      workSchedule: "07:00 - 19:00"
    },
    ...operators.map((operator, index) => {
      const workMode = index % 2 === 0 ? "Oficina" : "Casa";
      return {
        id: operator.id,
        user: shortUserName(operator.name),
        name: operator.name,
        workMode,
        location: workMode === "Oficina" ? "CL 72 - Coworking" : "Homeoffice",
        workSchedule: operator.shift || "07:00 - 19:00"
      } satisfies DailyShiftAssignment;
    })
  ];
}

function createDefaultBreakAssignments(assignments: DailyShiftAssignment[]): BreakAssignment[] {
  const breakTimes = ["09:15", "09:35", "09:55", "10:15"];
  return assignments.map((assignment, index) => ({
    id: assignment.id,
    operator: assignment.user,
    breakTime: breakTimes[Math.floor(index / 12) % breakTimes.length]
  }));
}

function defaultBreakSchedule(assignment: DailyShiftAssignment, breakTime = "09:15"): BreakSchedule {
  return {
    operator: assignment.user,
    loginTime: getScheduleLoginTime(assignment.workSchedule || "07:00 - 19:00"),
    lunch: "12:00",
    breakOne: breakTime,
    breakTwo: "15:15",
    visibleToOperator: false,
    breakOneVisible: false,
    lunchVisible: false,
    breakTwoVisible: false
  };
}

const quickBreakSlots = ["09:15", "09:35", "09:55", "10:15"];
const quickLunchSlots = ["12:00", "12:45", "13:30", "14:15"];
const quickOptionalBreakSlots = ["15:15", "15:35", "15:55", "16:15"];

type ExternalScheduleType = "breakOne" | "lunch" | "breakTwo";

const externalScheduleLabels: Record<ExternalScheduleType, { title: string; visibleField: "breakOneVisible" | "lunchVisible" | "breakTwoVisible" }> = {
  breakOne: { title: "Break 1", visibleField: "breakOneVisible" },
  lunch: { title: "Almuerzo", visibleField: "lunchVisible" },
  breakTwo: { title: "Break opcional", visibleField: "breakTwoVisible" }
};

function normalizeImportedTime(value: string, type: ExternalScheduleType) {
  const match = value.match(/\b(\d{1,2})(?::|\.)(\d{2})\s*(a\.?\s*m\.?|p\.?\s*m\.?|am|pm)?\b/i);
  if (!match) return "";
  let hour = Number(match[1]);
  const minute = match[2];
  const period = (match[3] || "").replace(/\s|\./g, "").toLowerCase();

  if (period === "pm" && hour < 12) hour += 12;
  if (period === "am" && hour === 12) hour = 0;
  if (!period && (type === "lunch" || type === "breakTwo") && hour > 0 && hour <= 6) hour += 12;

  if (hour < 0 || hour > 23) return "";
  return `${String(hour).padStart(2, "0")}:${minute}`;
}

function parseExternalScheduleText(text: string, type: ExternalScheduleType) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      if (/^(operador|operator|user|usuario|break|break am|almuerzos?|hora)$/i.test(line.replace(/\s+/g, " "))) return null;
      const timeMatch = line.match(/\b\d{1,2}(?::|\.)\d{2}\s*(?:a\.?\s*m\.?|p\.?\s*m\.?|am|pm)?\b/i);
      if (!timeMatch) return null;
      const time = normalizeImportedTime(timeMatch[0], type);
      const operator = line
        .replace(timeMatch[0], " ")
        .replace(/[|,;\t]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (!operator || !time || /^(operador|operator|user|usuario)$/i.test(operator)) return null;
      return { operator, time };
    })
    .filter((item): item is { operator: string; time: string } => Boolean(item));
}

function dateKeyFromRecord(value?: string) {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) {
    return `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
  }
  return value.slice(0, 10);
}

function normalizeOperatorKey(value?: string) {
  return (value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

export default function StaffSchedulesPage() {
  const [dailyShiftDate, setDailyShiftDate] = useState("2026-06-03");
  const [scheduleMonth, setScheduleMonth] = useState("2026-06");
  const [firstWorkDay, setFirstWorkDay] = useState("2026-06-03");
  const [assignments, setAssignments] = useState<DailyShiftAssignment[]>([]);
  const [breakAssignments, setBreakAssignments] = useState<BreakAssignment[]>([]);
  const [breakSchedules, setBreakSchedules] = useState<BreakSchedule[]>([]);
  const [newOperator, setNewOperator] = useState({ user: "", name: "" });
  const [operatorQuery, setOperatorQuery] = useState("");
  const [bulkWorkSchedule, setBulkWorkSchedule] = useState("07:00 - 19:00");
  const [bulkBreakTimes, setBulkBreakTimes] = useState({ breakOne: "09:15", lunch: "12:00", breakTwo: "15:15" });
  const [selectedBreakOperators, setSelectedBreakOperators] = useState<string[]>([]);
  const [scheduleView, setScheduleView] = useState<"rests" | "shifts">("rests");
  const [draggedOperator, setDraggedOperator] = useState("");
  const [clearingSchedule, setClearingSchedule] = useState("");
  const [lastPublishedAction, setLastPublishedAction] = useState("");
  const [automating, setAutomating] = useState(false);
  const [message, setMessage] = useState("");
  const [shiftChangeRequests, setShiftChangeRequests] = useState<ShiftChangeRequest[]>([]);
  const [reviewingChangeId, setReviewingChangeId] = useState("");
  const [salesWithoutShift, setSalesWithoutShift] = useState<Array<{ operator: string; count: number }>>([]);
  const [externalScheduleType, setExternalScheduleType] = useState<ExternalScheduleType>("breakOne");
  const [externalScheduleText, setExternalScheduleText] = useState("");
  const [externalScheduleImageName, setExternalScheduleImageName] = useState("");

  useEffect(() => {
    const settings = readStoredShiftCalendarSettings();
    setScheduleMonth(settings.scheduleMonth);
    setFirstWorkDay(settings.firstWorkDay);

    const storedAssignments = readStoredDailyShiftAssignments();
    const initialAssignments = storedAssignments.length ? storedAssignments : createDefaultAssignments();
    setAssignments(initialAssignments);
    writeStoredDailyShiftAssignments(initialAssignments);

    loadScheduleOperators().then((cloudOperators) => {
      if (!cloudOperators.length) return;
      const nextAssignments = cloudOperators.map((operator) => {
        const saved = initialAssignments.find((item) => item.id === operator.id || item.user.toLowerCase() === operator.username.toLowerCase());
        return saved || {
          id: operator.id,
          user: operator.username,
          name: operator.fullName,
          workMode: "Oficina" as const,
          location: "CL 72 - Coworking",
          workSchedule: "07:00 - 19:00"
        };
      });
      setAssignments(nextAssignments);
      writeStoredDailyShiftAssignments(nextAssignments);
      const generatedBreaks = createDefaultBreakAssignments(nextAssignments);
      setBreakAssignments(generatedBreaks);
      writeStoredBreakAssignments(generatedBreaks);
    }).catch(() => setMessage("No se pudieron actualizar los operadores desde la base central."));

    const storedBreaks = readStoredBreakAssignments();
    const nextBreaks = storedBreaks.length ? storedBreaks : createDefaultBreakAssignments(initialAssignments);
    setBreakAssignments(nextBreaks);
    writeStoredBreakAssignments(nextBreaks);

    setBreakSchedules(readStoredBreakSchedules());
  }, []);

  useEffect(() => {
    writeStoredShiftCalendarSettings({ scheduleMonth, firstWorkDay });
  }, [firstWorkDay, scheduleMonth]);

  useEffect(() => {
    const salesForDay = readStoredRecords().filter((record) => {
      const recordDate = dateKeyFromRecord(record.recordDate) || dateKeyFromRecord(record.createdAt);
      return record.type === "sale" && recordDate === dailyShiftDate;
    });
    const shiftsForDay = readStoredShiftRecords().filter((record) => record.date === dailyShiftDate);
    const shiftOperators = new Set(
      shiftsForDay.flatMap((record) => [
        normalizeOperatorKey(record.operator),
        normalizeOperatorKey(assignments.find((assignment) => assignment.name === record.operator)?.user)
      ])
    );
    const grouped = new Map<string, number>();
    salesForDay.forEach((record) => {
      const operator = record.operatorUsername || record.operator || "Sin operador";
      const keys = [record.operatorUsername, record.operator].map(normalizeOperatorKey);
      const hasShift = keys.some((key) => key && shiftOperators.has(key));
      if (!hasShift) grouped.set(operator, (grouped.get(operator) || 0) + 1);
    });
    setSalesWithoutShift(Array.from(grouped, ([operator, count]) => ({ operator, count })).sort((a, b) => b.count - a.count));
  }, [assignments, dailyShiftDate]);

  useEffect(() => {
    const localRequests = readStoredShiftChangeRequests().filter((request) => request.workDate.slice(0, 7) === scheduleMonth);
    setShiftChangeRequests(localRequests);
    loadStaffShiftChangeRequests(scheduleMonth)
      .then((requests) => setShiftChangeRequests(requests.length ? requests : localRequests))
      .catch(() => setShiftChangeRequests(localRequests));
  }, [scheduleMonth]);

  const calendarDays = useMemo(
    () => generateTwoByTwoSchedule(scheduleMonth, firstWorkDay),
    [firstWorkDay, scheduleMonth]
  );

  const scheduleRows = useMemo(
    () =>
      assignments.map((assignment) => {
        const assignedBreak = breakAssignments.find((item) => item.id === assignment.id || item.operator === assignment.user);
        const savedSchedule = breakSchedules.find((item) => item.operator === assignment.user || item.operator === assignment.name);
        const legacyVisible = Boolean(savedSchedule?.visibleToOperator);
        return savedSchedule
          ? {
              ...savedSchedule,
              visibleToOperator: legacyVisible || Boolean(savedSchedule.breakOneVisible || savedSchedule.lunchVisible || savedSchedule.breakTwoVisible),
              breakOneVisible: savedSchedule.breakOneVisible ?? legacyVisible,
              lunchVisible: savedSchedule.lunchVisible ?? legacyVisible,
              breakTwoVisible: savedSchedule.breakTwoVisible ?? legacyVisible
            }
          : defaultBreakSchedule(assignment, assignedBreak?.breakTime);
      }),
    [assignments, breakAssignments, breakSchedules]
  );

  const filteredAssignments = useMemo(() => {
    const normalized = operatorQuery.trim().toLowerCase();
    return assignments.filter((assignment) => [assignment.user, assignment.name, assignment.location].join(" ").toLowerCase().includes(normalized));
  }, [assignments, operatorQuery]);

  const filteredScheduleRows = useMemo(() => {
    const visibleUsers = new Set(filteredAssignments.flatMap((assignment) => [assignment.user, assignment.name]));
    return scheduleRows.filter((schedule) => visibleUsers.has(schedule.operator));
  }, [filteredAssignments, scheduleRows]);

  const selectedBreakRows = useMemo(() => {
    if (!selectedBreakOperators.length) return filteredScheduleRows;
    const selected = new Set(selectedBreakOperators);
    return filteredScheduleRows.filter((schedule) => selected.has(schedule.operator));
  }, [filteredScheduleRows, selectedBreakOperators]);

  const selectedCalendarDay = useMemo(
    () => calendarDays.find((day) => day.date === dailyShiftDate),
    [calendarDays, dailyShiftDate]
  );

  const dayStats = useMemo(() => {
    const publishedAny = scheduleRows.filter((schedule) => schedule.visibleToOperator || schedule.breakOneVisible || schedule.lunchVisible || schedule.breakTwoVisible).length;
    return {
      total: assignments.length,
      scheduled: selectedCalendarDay?.isWorkDay ? assignments.length : 0,
      dayLabel: selectedCalendarDay?.isWorkDay ? "Día programado" : "Día de descanso",
      unpublished: Math.max(0, assignments.length - publishedAny),
      publishedAny,
      missingSchedule: assignments.filter((assignment) => !assignment.workSchedule).length
    };
  }, [assignments, scheduleRows, selectedCalendarDay]);

  const breakGroups = useMemo(() => {
    const buildGroup = (field: "breakOne" | "lunch" | "breakTwo", visibleField: "breakOneVisible" | "lunchVisible" | "breakTwoVisible") => {
      const grouped = new Map<string, { time: string; operators: string[]; published: number }>();
      scheduleRows.forEach((schedule) => {
        const time = schedule[field] || "-";
        const current = grouped.get(time) || { time, operators: [], published: 0 };
        current.operators.push(schedule.operator);
        if (schedule[visibleField]) current.published += 1;
        grouped.set(time, current);
      });
      return Array.from(grouped.values()).sort((a, b) => a.time.localeCompare(b.time));
    };
    return {
      breakOne: buildGroup("breakOne", "breakOneVisible"),
      lunch: buildGroup("lunch", "lunchVisible"),
      breakTwo: buildGroup("breakTwo", "breakTwoVisible")
    };
  }, [scheduleRows]);

  const assignmentImportIndex = useMemo(() => {
    const values = new Map<string, DailyShiftAssignment>();
    assignments.forEach((assignment) => {
      values.set(normalizeOperatorKey(assignment.user), assignment);
      values.set(normalizeOperatorKey(assignment.name), assignment);
    });
    return values;
  }, [assignments]);

  const externalScheduleRows = useMemo(() => {
    return parseExternalScheduleText(externalScheduleText, externalScheduleType).map((row) => {
      const importedKey = normalizeOperatorKey(row.operator);
      const matchedAssignment = assignmentImportIndex.get(importedKey) || assignments.find((assignment) => {
        const userKey = normalizeOperatorKey(assignment.user);
        const nameKey = normalizeOperatorKey(assignment.name);
        return importedKey.length >= 4 && (userKey.includes(importedKey) || importedKey.includes(userKey) || nameKey.includes(importedKey) || importedKey.includes(nameKey));
      });
      return {
        ...row,
        matched: Boolean(matchedAssignment),
        resolvedOperator: matchedAssignment?.user || row.operator
      };
    });
  }, [assignmentImportIndex, assignments, externalScheduleText, externalScheduleType]);

  const externalMatchedCount = externalScheduleRows.filter((row) => row.matched).length;

  const pendingShiftChanges = useMemo(
    () => shiftChangeRequests.filter((request) => request.status === "Pendiente"),
    [shiftChangeRequests]
  );
  const reviewedShiftChanges = useMemo(
    () => shiftChangeRequests.filter((request) => request.status !== "Pendiente").slice(0, 6),
    [shiftChangeRequests]
  );
  const approvedShiftChangesByDate = useMemo(() => {
    const values = new Map<string, ShiftChangeRequest[]>();
    shiftChangeRequests
      .filter((request) => request.status === "Aprobado")
      .forEach((request) => values.set(request.workDate, [...(values.get(request.workDate) || []), request]));
    return values;
  }, [shiftChangeRequests]);

  function persistAssignments(nextAssignments: DailyShiftAssignment[]) {
    setAssignments(nextAssignments);
    writeStoredDailyShiftAssignments(nextAssignments);
  }

  function persistBreakAssignments(nextBreaks: BreakAssignment[]) {
    setBreakAssignments(nextBreaks);
    writeStoredBreakAssignments(nextBreaks);
  }

  function persistBreakSchedules(nextSchedules: BreakSchedule[]) {
    setBreakSchedules(nextSchedules);
    writeStoredBreakSchedules(nextSchedules);
  }

  function updateAssignment(id: string, field: keyof DailyShiftAssignment, value: string) {
    const previousAssignment = assignments.find((assignment) => assignment.id === id);
    const nextAssignments = assignments.map((assignment) =>
      assignment.id === id
        ? {
            ...assignment,
            [field]: value,
            ...(field === "workMode" ? { location: value === "Casa" ? "Homeoffice" : "CL 72 - Coworking" } : {})
          }
        : assignment
    );
    persistAssignments(nextAssignments);

    if (field === "user") {
      persistBreakAssignments(
        breakAssignments.map((assignment) => (assignment.id === id ? { ...assignment, operator: value } : assignment))
      );
    }
    if (field === "workSchedule" && previousAssignment) {
      const nextLoginTime = getScheduleLoginTime(value);
      persistBreakSchedules(
        breakSchedules.map((schedule) =>
          schedule.operator === previousAssignment.user || schedule.operator === previousAssignment.name
            ? { ...schedule, loginTime: nextLoginTime }
            : schedule
        )
      );
    }
  }

  function updateWorkScheduleTime(id: string, part: "start" | "end", value: string) {
    const assignment = assignments.find((item) => item.id === id);
    if (!assignment) return;
    const current = parseScheduleTimeRange(assignment.workSchedule || "07:00 - 19:00");
    const nextStart = part === "start" ? value : current.start;
    const nextEnd = part === "end" ? value : current.end;
    updateAssignment(id, "workSchedule", `${nextStart} - ${nextEnd}`);
  }

  function applyBulkWorkSchedule() {
    const schedule = bulkWorkSchedule.trim();
    if (!schedule) {
      setMessage("Escribe el horario que quieres aplicar.");
      return;
    }
    const filteredIds = new Set(filteredAssignments.map((assignment) => assignment.id));
    const nextAssignments = assignments.map((assignment) =>
      filteredIds.has(assignment.id) ? { ...assignment, workSchedule: schedule } : assignment
    );
    persistAssignments(nextAssignments);
    const nextLoginTime = getScheduleLoginTime(schedule);
    const filteredUsers = new Set(filteredAssignments.flatMap((assignment) => [assignment.user, assignment.name]));
    persistBreakSchedules(
      breakSchedules.map((scheduleRow) =>
        filteredUsers.has(scheduleRow.operator) ? { ...scheduleRow, loginTime: nextLoginTime } : scheduleRow
      )
    );
    setMessage(`Horario ${schedule} aplicado a ${filteredAssignments.length} operadores filtrados.`);
  }

  function updateBreakSchedule(operator: string, field: keyof BreakSchedule, value: string) {
    const assignment = assignments.find((item) => item.user === operator || item.name === operator);
    const baseSchedule =
      scheduleRows.find((row) => row.operator === operator) ||
      (assignment
        ? defaultBreakSchedule(assignment)
        : { operator, loginTime: "07:00", lunch: "12:00", breakOne: "09:15", breakTwo: "15:15", visibleToOperator: false, breakOneVisible: false, lunchVisible: false, breakTwoVisible: false });
    const nextSchedule = { ...baseSchedule, [field]: value };
    const nextSchedules = [nextSchedule, ...breakSchedules.filter((schedule) => schedule.operator !== operator)];
    persistBreakSchedules(nextSchedules);

    if (field === "breakOne") {
      persistBreakAssignments(
        breakAssignments.map((assignment) =>
          assignment.operator === operator ? { ...assignment, breakTime: value } : assignment
        )
      );
    }
  }

  function buildDistributedSchedules(visibleField?: "breakOneVisible" | "lunchVisible" | "breakTwoVisible" | "all") {
    const publishedAt = new Date().toISOString();
    return assignments.map((assignment, index) => {
      const existing = scheduleRows.find((schedule) => schedule.operator === assignment.user || schedule.operator === assignment.name);
      const nextSchedule = {
        ...(existing || defaultBreakSchedule(assignment)),
        operator: assignment.user,
        loginTime: getScheduleLoginTime(assignment.workSchedule || "07:00 - 19:00"),
        breakOne: quickBreakSlots[index % quickBreakSlots.length],
        lunch: quickLunchSlots[index % quickLunchSlots.length],
        breakTwo: quickOptionalBreakSlots[index % quickOptionalBreakSlots.length]
      };
      if (!visibleField) return nextSchedule;
      const nextVisible = {
        ...nextSchedule,
        breakOneVisible: visibleField === "all" || visibleField === "breakOneVisible" ? true : nextSchedule.breakOneVisible,
        lunchVisible: visibleField === "all" || visibleField === "lunchVisible" ? true : nextSchedule.lunchVisible,
        breakTwoVisible: visibleField === "all" || visibleField === "breakTwoVisible" ? true : nextSchedule.breakTwoVisible,
        publishedAt
      };
      return {
        ...nextVisible,
        visibleToOperator: Boolean(nextVisible.breakOneVisible || nextVisible.lunchVisible || nextVisible.breakTwoVisible)
      };
    });
  }

  function prepareDailyOperation() {
    const nextSchedules = buildDistributedSchedules();
    persistBreakSchedules(nextSchedules);
    persistBreakAssignments(nextSchedules.map((schedule, index) => ({ id: assignments[index]?.id || createRecordId(), operator: schedule.operator, breakTime: schedule.breakOne })));
    setSelectedBreakOperators([]);
    setLastPublishedAction("prepared");
    setMessage(`Día preparado: ${assignments.length} operadores organizados por bloques. Revisa excepciones y publica.`);
  }

  async function syncSchedulesToCloud(nextSchedules: BreakSchedule[], targetOperators: string[], label: string) {
    return publishDailyRestSchedules({ workDate: dailyShiftDate, assignments, schedules: nextSchedules, targetOperators, label });
  }

  async function publishQuickItem(visibleField: "breakOneVisible" | "lunchVisible" | "breakTwoVisible", label: string) {
    const nextSchedules = buildDistributedSchedules(visibleField);
    persistBreakSchedules(nextSchedules);
    setLastPublishedAction(`quick-${visibleField}`);
    setMessage(`Publicando ${label.toLowerCase()}...`);
    try {
      const result = await syncSchedulesToCloud(nextSchedules, nextSchedules.map((schedule) => schedule.operator), label);
      setMessage(`${label} publicado para ${result.published} operadores. Ya pueden verlo en su panel.`);
    } catch {
      setMessage(`${label} se guardo localmente, pero no llego a la base central. Intenta publicar otra vez.`);
    }
  }

  async function publishQuickEverything() {
    const nextSchedules = buildDistributedSchedules("all");
    persistBreakSchedules(nextSchedules);
    persistBreakAssignments(nextSchedules.map((schedule, index) => ({ id: assignments[index]?.id || createRecordId(), operator: schedule.operator, breakTime: schedule.breakOne })));
    setLastPublishedAction("quick-all");
    setMessage("Publicando toda la programacion...");
    try {
      const result = await syncSchedulesToCloud(nextSchedules, nextSchedules.map((schedule) => schedule.operator), "Programacion completa");
      setMessage(`Programacion completa publicada para ${result.published} operadores.`);
    } catch {
      setMessage("La programacion se guardo localmente, pero no llego a la base central.");
    }
  }

  async function publishGroup(
    operatorsToPublish: string[],
    timeField: "breakOne" | "lunch" | "breakTwo",
    visibleField: "breakOneVisible" | "lunchVisible" | "breakTwoVisible",
    label: string
  ) {
    const targets = new Set(operatorsToPublish);
    const publishedAt = new Date().toISOString();
    const nextSchedules = scheduleRows.map((schedule) => {
      if (!targets.has(schedule.operator)) return schedule;
      const nextSchedule = {
        ...schedule,
        [visibleField]: true,
        publishedAt
      };
      return {
        ...nextSchedule,
        visibleToOperator: Boolean(nextSchedule.breakOneVisible || nextSchedule.lunchVisible || nextSchedule.breakTwoVisible)
      };
    });
    persistBreakSchedules(nextSchedules);
    if (timeField === "breakOne") {
      persistBreakAssignments(
        breakAssignments.map((assignment) =>
          targets.has(assignment.operator)
            ? { ...assignment, breakTime: nextSchedules.find((schedule) => schedule.operator === assignment.operator)?.breakOne || assignment.breakTime }
            : assignment
        )
      );
    }
    setLastPublishedAction(`group-${timeField}`);
    setMessage(`Publicando ${label}...`);
    try {
      const result = await syncSchedulesToCloud(nextSchedules, operatorsToPublish, label);
      setMessage(`${label} publicado para ${result.published} operadores del bloque.`);
    } catch {
      setMessage(`${label} se guardo localmente, pero no llego a la base central.`);
    }
  }

  function moveOperatorToBlock(operator: string, field: "breakOne" | "lunch" | "breakTwo", time: string) {
    updateBreakSchedule(operator, field, time);
    setDraggedOperator("");
    setMessage(`${operator} movido al bloque de las ${time}.`);
  }

  async function clearPublishedItem(
    visibleField: "breakOneVisible" | "lunchVisible" | "breakTwoVisible" | "all",
    label: string
  ) {
    const actionKey = `clear-${visibleField}`;
    if (clearingSchedule !== actionKey) {
      setClearingSchedule(actionKey);
      setMessage(`Confirma otra vez para quitar ${label.toLowerCase()} a todos los operadores.`);
      return;
    }
    const nextSchedules = scheduleRows.map((schedule) => {
      const next = {
        ...schedule,
        breakOneVisible: visibleField === "all" || visibleField === "breakOneVisible" ? false : schedule.breakOneVisible,
        lunchVisible: visibleField === "all" || visibleField === "lunchVisible" ? false : schedule.lunchVisible,
        breakTwoVisible: visibleField === "all" || visibleField === "breakTwoVisible" ? false : schedule.breakTwoVisible
      };
      return { ...next, visibleToOperator: Boolean(next.breakOneVisible || next.lunchVisible || next.breakTwoVisible) };
    });
    setClearingSchedule("");
    persistBreakSchedules(nextSchedules);
    setLastPublishedAction(actionKey);
    setMessage(`Quitando ${label.toLowerCase()}...`);
    try {
      await syncSchedulesToCloud(nextSchedules, nextSchedules.map((schedule) => schedule.operator), `Quitar ${label}`);
      setMessage(`${label} eliminado para todos. Ya no aparece al operador.`);
    } catch {
      setMessage(`${label} se oculto en esta pagina, pero no se pudo actualizar la base central.`);
    }
  }

  function handleExternalTextFile(file?: File) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setExternalScheduleText(String(reader.result || ""));
      setMessage(`Listado ${file.name} cargado. Revisa coincidencias antes de publicar.`);
    };
    reader.readAsText(file);
  }

  async function publishExternalSchedule() {
    if (!externalScheduleRows.length) {
      setMessage("Pega o sube un listado con usuario y hora antes de publicar.");
      return;
    }
    if (!externalMatchedCount) {
      setMessage("No encontre usuarios coincidentes. Revisa que el listado use el usuario exacto del operador.");
      return;
    }

    const meta = externalScheduleLabels[externalScheduleType];
    const publishedAt = new Date().toISOString();
    const timeByOperator = new Map<string, string>();
    externalScheduleRows.forEach((row) => {
      if (row.matched) timeByOperator.set(normalizeOperatorKey(row.resolvedOperator), row.time);
    });

    const nextSchedules = scheduleRows.map((schedule) => {
      const importedTime = timeByOperator.get(normalizeOperatorKey(schedule.operator));
      if (!importedTime) return schedule;
      const nextSchedule = {
        ...schedule,
        [externalScheduleType]: importedTime,
        [meta.visibleField]: true,
        publishedAt
      };
      return {
        ...nextSchedule,
        visibleToOperator: Boolean(nextSchedule.breakOneVisible || nextSchedule.lunchVisible || nextSchedule.breakTwoVisible)
      };
    });
    persistBreakSchedules(nextSchedules);

    if (externalScheduleType === "breakOne") {
      persistBreakAssignments(
        breakAssignments.map((assignment) => {
          const importedTime = timeByOperator.get(normalizeOperatorKey(assignment.operator));
          return importedTime ? { ...assignment, breakTime: importedTime } : assignment;
        })
      );
    }

    setLastPublishedAction(`external-${externalScheduleType}`);
    setMessage(`${meta.title} importado para ${externalMatchedCount} operadores. Publicando solo horarios necesarios...`);
    try {
      const result = await publishDailyRestSchedules({
        workDate: dailyShiftDate,
        assignments,
        schedules: nextSchedules,
        targetOperators: externalScheduleRows.filter((row) => row.matched).map((row) => row.resolvedOperator),
        label: meta.title
      });
      setMessage(`${meta.title} publicado para ${result.published} operadores. No se subio la imagen a Supabase; el operador vera el aviso al entrar.${externalScheduleImageName ? ` Respaldo usado: ${externalScheduleImageName}.` : ""}`);
    } catch {
      setMessage(`${meta.title} quedo guardado en esta pagina, pero no se pudo enviar a Supabase. Revisa conexion o permisos e intenta de nuevo.`);
    }
  }

  function addOperator() {
    const user = newOperator.user.trim();
    if (!user) {
      setMessage("Escribe el usuario del operador.");
      return;
    }

    const nextAssignment: DailyShiftAssignment = {
      id: createRecordId(),
      user,
      name: user,
      workMode: "Oficina",
      location: "CL 72 - Coworking",
      workSchedule: "07:00 - 19:00"
    };
    persistAssignments([nextAssignment, ...assignments]);
    persistBreakAssignments([{ id: nextAssignment.id, operator: nextAssignment.user, breakTime: "09:15" }, ...breakAssignments]);
    persistBreakSchedules([defaultBreakSchedule(nextAssignment), ...breakSchedules]);
    setNewOperator({ user: "", name: "" });
    setMessage("Operador agregado a turnos y descansos.");
  }

  async function loadAllActiveOperators() {
    try {
      const cloudOperators = await loadScheduleOperators();
      const source = cloudOperators.length
        ? cloudOperators.map((operator) => ({
            id: operator.id,
            user: operator.username,
            name: operator.fullName || operator.username,
            workMode: "Oficina" as const,
            location: "CL 72 - Coworking",
            workSchedule: "07:00 - 19:00"
          }))
        : createDefaultAssignments();
      const existingUsers = new Set(assignments.map((assignment) => assignment.user.toLowerCase()));
      const nextOperators = source.filter((assignment) => !existingUsers.has(assignment.user.toLowerCase()));
      const nextAssignments = [...assignments, ...nextOperators];
      persistAssignments(nextAssignments);
      persistBreakAssignments(createDefaultBreakAssignments(nextAssignments));
      setMessage(`${nextOperators.length} operadores agregados a la programacion.`);
    } catch {
      setMessage("No fue posible cargar todos los operadores activos.");
    }
  }

  function removeOperator(id: string) {
    const target = assignments.find((assignment) => assignment.id === id);
    if (!target) return;

    persistAssignments(assignments.filter((assignment) => assignment.id !== id));
    persistBreakAssignments(breakAssignments.filter((assignment) => assignment.id !== id && assignment.operator !== target.user));
    persistBreakSchedules(breakSchedules.filter((schedule) => schedule.operator !== target.user && schedule.operator !== target.name));
    setMessage(`${target.user} quitado de la programacion.`);
  }

  async function reviewShiftChange(request: ShiftChangeRequest, status: "Aprobado" | "Denegado") {
    setReviewingChangeId(request.id);
    const staffNote =
      status === "Aprobado"
        ? `Aprobado: ${request.replacementUser} queda autorizado para el ${request.workDate}.`
        : `Denegado: no se autoriza el cambio del ${request.workDate}.`;
    const nextRequest: ShiftChangeRequest = {
      ...request,
      status,
      staffNote,
      updatedAt: new Date().toISOString()
    };
    try {
      await reviewShiftChangeRequest(request.id, status, staffNote);
    } catch {
      // Si la tabla central aun no esta aplicada, mantenemos la decision local para no detener al staff.
    }
    const nextRequests = [nextRequest, ...shiftChangeRequests.filter((item) => item.id !== request.id)];
    setShiftChangeRequests(nextRequests);
    writeStoredShiftChangeRequests([nextRequest, ...readStoredShiftChangeRequests().filter((item) => item.id !== request.id)]);
    setReviewingChangeId("");
    setMessage(`${status}: ${request.operatorUsername || request.operator} fue notificado. ${status === "Aprobado" ? "El calendario ya muestra el equipo autorizado." : "El calendario no cambia."}`);
  }

  async function exportShiftExcel() {
    const XLSX = await import("xlsx-js-style");
    const data = [
      ["User", "Name", "Modalidad", "Location", "Work schedule"],
      ...assignments.map((assignment) => [
        assignment.user,
        assignment.name,
        assignment.workMode || "Oficina",
        assignment.location,
        assignment.workSchedule
      ])
    ];
    const worksheet = XLSX.utils.aoa_to_sheet(data);
    worksheet["!cols"] = [{ wch: 14 }, { wch: 34 }, { wch: 16 }, { wch: 24 }, { wch: 28 }];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Turnos");
    XLSX.writeFile(workbook, `turnos-blue-${dailyShiftDate}.xlsx`);
    setMessage("Excel de turnos descargado.");
  }

  function openShiftBrowserView() {
    openTableInBrowser(
      `Turnos Blue - ${dailyShiftDate}`,
      ["Usuario", "Nombre", "Modalidad", "Ubicacion", "Horario"],
      filteredAssignments.map((assignment) => [
        assignment.user,
        assignment.name,
        assignment.workMode || "Oficina",
        assignment.location,
        assignment.workSchedule
      ])
    );
    setMessage("Vista de turnos abierta en Chrome.");
  }

  async function exportBreakExcel() {
    const XLSX = await import("xlsx-js-style");
    const data = [
      ["Operador", "Break", "Estado break", "Almuerzo", "Estado almuerzo", "Break opcional", "Estado break opcional"],
      ...scheduleRows.map((schedule) => [
        schedule.operator,
        schedule.breakOne,
        schedule.breakOneVisible ? "Publicado" : "Oculto",
        schedule.lunch,
        schedule.lunchVisible ? "Publicado" : "Oculto",
        schedule.breakTwo,
        schedule.breakTwoVisible ? "Publicado" : "Oculto"
      ])
    ];
    const worksheet = XLSX.utils.aoa_to_sheet(data);
    worksheet["!cols"] = [{ wch: 28 }, { wch: 14 }, { wch: 18 }, { wch: 14 }, { wch: 18 }, { wch: 16 }, { wch: 22 }];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Breaks y almuerzo");
    XLSX.writeFile(workbook, `breaks-almuerzos-blue-${dailyShiftDate}.xlsx`);
    setMessage("Excel de breaks y almuerzos descargado.");
  }

  function openBreakBrowserView() {
    openTableInBrowser(
      `Breaks y almuerzos Blue - ${dailyShiftDate}`,
      ["Operador", "Break 1", "Estado break", "Almuerzo", "Estado almuerzo", "Break opcional", "Estado opcional"],
      filteredScheduleRows.map((schedule) => [
        schedule.operator,
        schedule.breakOne,
        schedule.breakOneVisible ? "Publicado" : "Oculto",
        schedule.lunch,
        schedule.lunchVisible ? "Publicado" : "Oculto",
        schedule.breakTwo,
        schedule.breakTwoVisible ? "Publicado" : "Oculto"
      ])
    );
    setMessage("Vista de breaks abierta en Chrome.");
  }

  function toggleBreakItemVisibility(operator: string, field: "breakOneVisible" | "lunchVisible" | "breakTwoVisible", visible: boolean) {
    const assignment = assignments.find((item) => item.user === operator || item.name === operator);
    const baseSchedule =
      scheduleRows.find((row) => row.operator === operator) ||
      (assignment ? defaultBreakSchedule(assignment) : { operator, loginTime: "07:00", lunch: "12:00", breakOne: "09:15", breakTwo: "15:15", visibleToOperator: false, breakOneVisible: false, lunchVisible: false, breakTwoVisible: false });
    const nextSchedule = {
      ...baseSchedule,
      [field]: visible,
      visibleToOperator: Boolean(
        (field === "breakOneVisible" ? visible : baseSchedule.breakOneVisible) ||
        (field === "lunchVisible" ? visible : baseSchedule.lunchVisible) ||
        (field === "breakTwoVisible" ? visible : baseSchedule.breakTwoVisible)
      ),
      publishedAt: visible ? new Date().toISOString() : baseSchedule.publishedAt
    };
    persistBreakSchedules([nextSchedule, ...breakSchedules.filter((schedule) => schedule.operator !== operator)]);
    const label = field === "breakOneVisible" ? "Break 1" : field === "lunchVisible" ? "Almuerzo" : "Break opcional";
    if (visible) setLastPublishedAction(`${operator}-${field}`);
    setMessage(visible ? `${label} publicado para ${operator}.` : `${label} oculto para ${operator}.`);
  }

  function publishFilteredBreakItem(
    timeField: "breakOne" | "lunch" | "breakTwo",
    visibleField: "breakOneVisible" | "lunchVisible" | "breakTwoVisible",
    label: string
  ) {
    if (!selectedBreakRows.length) {
      setMessage("No hay operadores filtrados para publicar.");
      return;
    }

    const time = bulkBreakTimes[timeField];
    const publishedAt = new Date().toISOString();
    const targetOperators = new Set(selectedBreakRows.map((schedule) => schedule.operator));
    const nextTargetSchedules = selectedBreakRows.map((schedule) => {
      const nextSchedule = {
        ...schedule,
        [timeField]: time,
        [visibleField]: true,
        publishedAt
      };
      return {
        ...nextSchedule,
        visibleToOperator: Boolean(nextSchedule.breakOneVisible || nextSchedule.lunchVisible || nextSchedule.breakTwoVisible)
      };
    });
    const nextSchedules = [
      ...nextTargetSchedules,
      ...breakSchedules.filter((schedule) => !targetOperators.has(schedule.operator))
    ];
    persistBreakSchedules(nextSchedules);

    if (timeField === "breakOne") {
      persistBreakAssignments(
        breakAssignments.map((assignment) =>
          targetOperators.has(assignment.operator) ? { ...assignment, breakTime: time } : assignment
        )
      );
    }

    setLastPublishedAction(`bulk-${visibleField}`);
    setMessage(`${label} ${time} publicado para ${selectedBreakRows.length} operadores.`);
  }

  function publishAllBreakSchedules() {
    const publishedAt = new Date().toISOString();
    const nextSchedules = scheduleRows.map((schedule) => ({ ...schedule, visibleToOperator: true, breakOneVisible: true, lunchVisible: true, breakTwoVisible: true, publishedAt }));
    persistBreakSchedules(nextSchedules);
    setLastPublishedAction("all");
    setMessage("Breaks y almuerzos publicados para todos los operadores.");
  }

  async function hideAllBreakSchedules() {
    await clearPublishedItem("all", "Toda la programacion");
  }

  async function automateEverything() {
    if (!window.confirm(`Se generarán y publicarán turnos 2x2, breaks y almuerzos para ${assignments.length} operadores durante ${scheduleMonth}. ¿Continuar?`)) return;
    setAutomating(true);
    setMessage("Generando programación automática...");
    try {
      const cloudOperators = await loadScheduleOperators();
      if (!cloudOperators.length) throw new Error("No hay operadores activos");
      const result = await automateMonthlySchedules(cloudOperators, assignments, scheduleMonth, firstWorkDay);
      const breakOneSlots = ["09:15", "09:35", "09:55", "10:15"];
      const lunchSlots = ["12:00", "12:40", "13:20"];
      const breakTwoSlots = ["15:15", "15:35", "15:55", "16:15"];
      const publishedAt = new Date().toISOString();
      const generatedSchedules = assignments.map((assignment, index) => ({
        operator: assignment.user,
        loginTime: getScheduleLoginTime(assignment.workSchedule || "07:00 - 19:00"),
        breakOne: breakOneSlots[index % breakOneSlots.length],
        lunch: lunchSlots[index % lunchSlots.length],
        breakTwo: breakTwoSlots[index % breakTwoSlots.length],
        visibleToOperator: true,
        breakOneVisible: true,
        lunchVisible: true,
        breakTwoVisible: true,
        publishedAt
      }));
      persistBreakSchedules(generatedSchedules);
      const generatedBreaks = generatedSchedules.map((schedule, index) => ({ id: assignments[index].id, operator: schedule.operator, breakTime: schedule.breakOne }));
      persistBreakAssignments(generatedBreaks);
      setMessage(`Programación lista: ${result.operatorCount} operadores, ${result.shiftCount} días y ${result.breakCount} descansos publicados.`);
    } catch {
      setMessage("No fue posible automatizar la programación. Revisa la conexión y vuelve a intentar.");
    } finally {
      setAutomating(false);
    }
  }

  return (
    <AppLayout role="staff" title="Breaks y almuerzos">
      <datalist id="work-schedule-options">
        {workScheduleOptions.map((option) => <option key={option} value={option} />)}
      </datalist>
      <div className="mb-5 flex w-fit gap-1 rounded-md border border-line bg-white p-1 shadow-sm">
        <button
          className={`rounded-md px-4 py-2 text-sm font-black transition ${scheduleView === "rests" ? "bg-brand-600 text-white shadow-sm" : "text-muted hover:bg-soft hover:text-ink"}`}
          onClick={() => setScheduleView("rests")}
        >
          Breaks y almuerzos
        </button>
        <button
          className={`rounded-md px-4 py-2 text-sm font-black transition ${scheduleView === "shifts" ? "bg-brand-600 text-white shadow-sm" : "text-muted hover:bg-soft hover:text-ink"}`}
          onClick={() => setScheduleView("shifts")}
        >
          Turnos editables
        </button>
      </div>
      {scheduleView === "rests" ? <>
      <section className="mb-5 grid gap-3 lg:grid-cols-5">
        <div className="card border-l-4 border-l-brand-600 p-4">
          <p className="text-xs font-black uppercase text-muted">Operadores activos</p>
          <p className="mt-2 text-3xl font-black text-ink">{dayStats.total}</p>
          <p className="text-sm text-muted">Base para programar</p>
        </div>
        <div className={`card border-l-4 p-4 ${selectedCalendarDay?.isWorkDay ? "border-l-emerald-500" : "border-l-slate-300"}`}>
          <p className="text-xs font-black uppercase text-muted">Hoy</p>
          <p className="mt-2 text-xl font-black text-ink">{dayStats.dayLabel}</p>
          <p className="text-sm text-muted">{dailyShiftDate}</p>
        </div>
        <div className="card border-l-4 border-l-amber-400 p-4">
          <p className="text-xs font-black uppercase text-muted">Pendiente publicar</p>
          <p className="mt-2 text-3xl font-black text-amber-700">{dayStats.unpublished}</p>
          <p className="text-sm text-muted">Sin descanso visible</p>
        </div>
        <div className={`card border-l-4 p-4 ${salesWithoutShift.length ? "border-l-red-500" : "border-l-emerald-500"}`}>
          <p className="text-xs font-black uppercase text-muted">Ventas sin jornada</p>
          <p className={`mt-2 text-3xl font-black ${salesWithoutShift.length ? "text-red-700" : "text-emerald-700"}`}>{salesWithoutShift.length}</p>
          <p className="text-sm text-muted">Se guarda venta, Staff revisa</p>
        </div>
        <div className="card border-l-4 border-l-violet-500 p-4">
          <p className="text-xs font-black uppercase text-muted">Cambios pendientes</p>
          <p className="mt-2 text-3xl font-black text-violet-700">{pendingShiftChanges.length}</p>
          <p className="text-sm text-muted">Blue / Green</p>
        </div>
      </section>

      <section className="card mb-5 overflow-hidden border-2 border-emerald-200 bg-emerald-50/40">
        <div className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 place-items-center rounded-md bg-white text-emerald-700 shadow-sm">
              <Upload size={23} />
            </span>
            <div>
              <p className="text-xs font-black uppercase text-emerald-700">Nuevo acceso rapido</p>
              <h2 className="text-xl font-black text-ink">Subir foto o listado de breaks y almuerzos</h2>
              <p className="text-sm text-muted">
                Pega el listado externo, revisa coincidencias y publica solo a los operadores encontrados. La foto queda como referencia local, no se sube a Supabase.
              </p>
            </div>
          </div>
          <button
            className="btn-primary"
            onClick={() => document.getElementById("external-schedule-import")?.scrollIntoView({ behavior: "smooth", block: "start" })}
          >
            <Upload size={16} />
            Abrir importador
          </button>
        </div>
      </section>

      <section className="card mb-5 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-5">
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 place-items-center rounded-md bg-brand-50 text-brand-700">
              <WandSparkles size={24} />
            </span>
            <div>
              <p className="text-xs font-black uppercase text-brand-700">Flujo rapido para supervisor</p>
              <h2 className="text-xl font-black text-ink">Preparar y publicar el dia en menos de 1 minuto</h2>
              <p className="text-sm text-muted">El sistema reparte horarios, breaks y almuerzos; Staff solo corrige excepciones.</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn-secondary" onClick={prepareDailyOperation}>
              <WandSparkles size={16} />
              Preparar dia
            </button>
            <button className="btn-primary" onClick={publishQuickEverything}>
              <CheckCircle2 size={16} />
              Publicar todo
            </button>
          </div>
        </div>
        <div className="grid gap-3 border-b border-line bg-soft/70 p-5 lg:grid-cols-4">
          <button className="rounded-md border border-brand-200 bg-white p-4 text-left transition hover:border-brand-500 hover:shadow-sm" onClick={loadAllActiveOperators}>
            <p className="text-xs font-black uppercase text-brand-700">1. Base activa</p>
            <p className="mt-1 text-lg font-black text-ink">Cargar operadores</p>
            <p className="text-sm text-muted">Trae activos y deja fuera bloqueados.</p>
          </button>
          <button className="rounded-md border border-amber-200 bg-white p-4 text-left transition hover:border-amber-500 hover:shadow-sm" onClick={() => publishQuickItem("breakOneVisible", "Break 1")}>
            <p className="text-xs font-black uppercase text-amber-700">2. Breaks</p>
            <p className="mt-1 text-lg font-black text-ink">Publicar breaks</p>
            <p className="text-sm text-muted">20 min por bloque.</p>
          </button>
          <button className="rounded-md border border-sky-200 bg-white p-4 text-left transition hover:border-sky-500 hover:shadow-sm" onClick={() => publishQuickItem("lunchVisible", "Almuerzos")}>
            <p className="text-xs font-black uppercase text-sky-700">3. Almuerzos</p>
            <p className="mt-1 text-lg font-black text-ink">Publicar almuerzos</p>
            <p className="text-sm text-muted">45 min por bloque.</p>
          </button>
          <button className="rounded-md border border-slate-200 bg-white p-4 text-left transition hover:border-slate-500 hover:shadow-sm" onClick={() => publishQuickItem("breakTwoVisible", "Break opcional")}>
            <p className="text-xs font-black uppercase text-slate-700">4. Opcional</p>
            <p className="mt-1 text-lg font-black text-ink">Publicar segundo break</p>
            <p className="text-sm text-muted">Solo si aplica.</p>
          </button>
        </div>
        {message ? <div className="border-b border-cyan/20 bg-cyan/10 px-5 py-3 text-sm font-black text-brand-800">{message}</div> : null}
        {salesWithoutShift.length ? (
          <div className="border-b border-red-100 bg-red-50 px-5 py-4">
            <div className="flex flex-wrap items-start gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-md bg-white text-red-700">
                <AlertTriangle size={20} />
              </span>
              <div className="flex-1">
                <p className="font-black text-red-800">Operadores con ventas sin jornada iniciada</p>
                <p className="text-sm text-red-700">No se bloquean las ventas, pero Staff debe revisar si fue olvido, falla o mala practica.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {salesWithoutShift.slice(0, 8).map((item) => (
                    <span key={item.operator} className="rounded-full bg-white px-3 py-1 text-sm font-black text-red-700">
                      {item.operator}: {item.count}
                    </span>
                  ))}
                  {salesWithoutShift.length > 8 ? <span className="rounded-full bg-white px-3 py-1 text-sm font-black text-red-700">+{salesWithoutShift.length - 8} mas</span> : null}
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </section>

      <section id="external-schedule-import" className="card mb-5 scroll-mt-4 overflow-hidden border-2 border-emerald-200">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-5">
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 place-items-center rounded-md bg-emerald-50 text-emerald-700">
              <Upload size={22} />
            </span>
            <div>
              <p className="text-xs font-black uppercase text-emerald-700">Horarios hechos afuera</p>
              <h2 className="text-xl font-black text-ink">Subir foto/listado y publicar al operador</h2>
              <p className="text-sm text-muted">Primero elige Break, Almuerzo u Opcional; luego pega usuarios y horas para publicar solo coincidencias.</p>
            </div>
          </div>
          <button className="btn-primary" onClick={publishExternalSchedule}>
            <CheckCircle2 size={16} />
            Publicar coincidencias
          </button>
        </div>

        <div className="grid gap-4 p-5 xl:grid-cols-[360px_1fr]">
          <div className="space-y-3">
            <label className="block text-sm font-black text-ink">
              Que vas a publicar
              <select
                className="mt-2 w-full rounded-md border border-line bg-white px-3 py-3 text-sm font-bold"
                value={externalScheduleType}
                onChange={(event) => setExternalScheduleType(event.target.value as ExternalScheduleType)}
              >
                <option value="breakOne">Break 1</option>
                <option value="lunch">Almuerzo</option>
                <option value="breakTwo">Break opcional</option>
              </select>
            </label>

            <label className="block rounded-md border border-dashed border-emerald-300 bg-emerald-50/60 p-4 text-sm font-bold text-emerald-800">
              <span className="mb-3 flex items-center gap-2">
                <Upload size={16} />
                Foto del horario externo
              </span>
              <span className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-md bg-white px-4 py-2 text-sm font-black text-emerald-800 shadow-sm ring-1 ring-emerald-200 transition hover:bg-emerald-100">
                <Upload size={16} />
                Seleccionar imagen
              </span>
              <input
                className="hidden"
                type="file"
                accept="image/*"
                onChange={(event) => setExternalScheduleImageName(event.currentTarget.files?.[0]?.name || "")}
              />
              <span className="mt-2 block text-xs font-semibold text-emerald-700">
                {externalScheduleImageName || "Opcional: la imagen no se sube a Supabase para ahorrar consumo."}
              </span>
            </label>

            <label className="block rounded-md border border-line bg-soft p-4 text-sm font-bold text-ink">
              Archivo editable CSV/TXT
              <span className="mt-3 inline-flex cursor-pointer items-center justify-center gap-2 rounded-md bg-white px-4 py-2 text-sm font-black text-ink shadow-sm ring-1 ring-line transition hover:bg-slate-50">
                <Upload size={16} />
                Cargar listado
              </span>
              <input
                className="hidden"
                type="file"
                accept=".csv,.txt,text/csv,text/plain"
                onChange={(event) => handleExternalTextFile(event.currentTarget.files?.[0])}
              />
              <span className="mt-2 block text-xs font-semibold text-muted">Tambien puedes copiar desde Excel y pegarlo a la derecha.</span>
            </label>
          </div>

          <div className="grid gap-3 lg:grid-cols-[1fr_320px]">
            <label className="block text-sm font-black text-ink">
              Pega usuario y hora
              <textarea
                className="mt-2 min-h-56 w-full resize-y rounded-md border border-line bg-white p-3 text-sm font-semibold text-ink outline-none focus:border-brand-500"
                placeholder={`Ejemplo:\nB.BLANCO\t09:40\nA.DYLAN\t10:00\nC.ANDREINA\t12:15`}
                value={externalScheduleText}
                onChange={(event) => setExternalScheduleText(event.target.value)}
              />
            </label>

            <div className="rounded-md border border-line bg-white">
              <div className="border-b border-line p-4">
                <p className="text-xs font-black uppercase text-muted">Revision antes de publicar</p>
                <p className="mt-1 text-2xl font-black text-ink">
                  {externalMatchedCount}/{externalScheduleRows.length}
                </p>
                <p className="text-xs font-semibold text-muted">coincidencias encontradas</p>
              </div>
              <div className="max-h-56 divide-y divide-line overflow-auto">
                {externalScheduleRows.length ? externalScheduleRows.slice(0, 10).map((row, index) => (
                  <div key={`${row.operator}-${row.time}-${index}`} className="grid grid-cols-[1fr_auto] gap-2 p-3 text-sm">
                    <div>
                      <p className="font-black text-ink">{row.resolvedOperator}</p>
                      <p className="text-xs font-semibold text-muted">{row.operator}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-black text-ink">{row.time}</p>
                      <span className={`rounded-full px-2 py-1 text-[11px] font-black ${row.matched ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                        {row.matched ? "Listo" : "No existe"}
                      </span>
                    </div>
                  </div>
                )) : (
                  <div className="p-4 text-sm font-semibold text-muted">Pega el listado para ver coincidencias.</div>
                )}
                {externalScheduleRows.length > 10 ? (
                  <div className="p-3 text-xs font-black text-muted">+{externalScheduleRows.length - 10} filas mas en el listado</div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="card mb-4 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <p className="text-xs font-black uppercase text-brand-700">Mesa de programacion</p>
            <h2 className="text-lg font-black text-ink">Selecciona y mueve operadores por bloques</h2>
            <p className="text-sm text-muted">Marca varios operadores o arrastra cada usuario al horario que le corresponde.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn-secondary py-2" onClick={() => setSelectedBreakOperators(filteredScheduleRows.map((schedule) => schedule.operator))}>Seleccionar todos</button>
            <button className="btn-secondary py-2" onClick={() => setSelectedBreakOperators([])}>Limpiar seleccion</button>
            <button
              className={`rounded-md border px-3 py-2 text-sm font-black text-red-700 transition ${clearingSchedule === "clear-all" ? "border-red-600 bg-red-600 text-white" : "border-red-200 bg-red-50 hover:bg-red-100"}`}
              onClick={hideAllBreakSchedules}
            >
              <Trash2 size={15} className="mr-2 inline" />
              {clearingSchedule === "clear-all" ? "Confirmar eliminar todo" : "Eliminar todo publicado"}
            </button>
          </div>
        </div>
        <div className="flex max-h-36 flex-wrap gap-2 overflow-y-auto border-t border-line bg-soft/60 p-4">
          {filteredScheduleRows.map((schedule) => {
            const selected = selectedBreakOperators.includes(schedule.operator);
            return (
              <button
                key={`pool-${schedule.operator}`}
                className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-black transition ${selected ? "border-brand-600 bg-brand-600 text-white" : "border-line bg-white text-ink hover:border-brand-300"}`}
                onClick={() => setSelectedBreakOperators((current) => current.includes(schedule.operator) ? current.filter((operator) => operator !== schedule.operator) : [...current, schedule.operator])}
              >
                <span className={`grid h-4 w-4 place-items-center rounded border text-[10px] ${selected ? "border-white bg-white text-brand-700" : "border-slate-300"}`}>{selected ? "✓" : ""}</span>
                {schedule.operator}
              </button>
            );
          })}
        </div>
      </section>

      <section className="mb-5 grid gap-4 xl:grid-cols-3">
        {[
          { title: "Break 1", subtitle: "20 minutos", groups: breakGroups.breakOne, field: "breakOne" as const, visible: "breakOneVisible" as const, color: "amber" },
          { title: "Almuerzo", subtitle: "45 minutos", groups: breakGroups.lunch, field: "lunch" as const, visible: "lunchVisible" as const, color: "sky" },
          { title: "Break opcional", subtitle: "Si aplica", groups: breakGroups.breakTwo, field: "breakTwo" as const, visible: "breakTwoVisible" as const, color: "slate" }
        ].map((block) => (
          <div key={block.title} className="card overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-line p-4">
              <div>
                <h3 className="font-black text-ink">{block.title}</h3>
                <p className="text-sm text-muted">{block.subtitle}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  className={`rounded-md border px-2 py-1 text-xs font-black transition ${clearingSchedule === `clear-${block.visible}` ? "border-red-600 bg-red-600 text-white" : "border-red-200 text-red-700 hover:bg-red-50"}`}
                  onClick={() => clearPublishedItem(block.visible, block.title)}
                >
                  {clearingSchedule === `clear-${block.visible}` ? "Confirmar" : "Quitar todos"}
                </button>
                <Clock3 className={block.color === "amber" ? "text-amber-600" : block.color === "sky" ? "text-sky-600" : "text-slate-500"} size={20} />
              </div>
            </div>
            <div className="divide-y divide-line">
              {block.groups.length ? block.groups.map((group) => (
                <div
                  key={`${block.title}-${group.time}`}
                  className="grid grid-cols-[1fr_auto] items-start gap-3 p-4 transition hover:bg-soft/50"
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => draggedOperator && moveOperatorToBlock(draggedOperator, block.field, group.time)}
                >
                  <div className="min-w-0">
                    <p className="text-lg font-black text-ink">{group.time}</p>
                    <p className="text-sm text-muted">{group.operators.length} operadores · {group.published} publicados</p>
                    <div className="mt-3 flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
                      {group.operators.map((operator) => {
                        const selected = selectedBreakOperators.includes(operator);
                        return (
                          <button
                            key={`${block.title}-${group.time}-${operator}`}
                            draggable
                            onDragStart={() => setDraggedOperator(operator)}
                            onDragEnd={() => setDraggedOperator("")}
                            onClick={() => setSelectedBreakOperators((current) => current.includes(operator) ? current.filter((item) => item !== operator) : [...current, operator])}
                            className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-black transition ${selected ? "border-brand-600 bg-brand-600 text-white" : "border-line bg-white text-ink hover:border-brand-300"}`}
                          >
                            <GripVertical size={12} />
                            {operator}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <button
                    className="rounded-md bg-brand-600 px-3 py-2 text-sm font-black text-white transition hover:bg-brand-700"
                    onClick={() => publishGroup(group.operators, block.field, block.visible, `${block.title} ${group.time}`)}
                  >
                    Publicar
                  </button>
                </div>
              )) : (
                <div className="p-4 text-sm font-semibold text-muted">Prepara el dia para crear bloques.</div>
              )}
            </div>
          </div>
        ))}
      </section>

      {false ? <section className="card mb-5 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-5">
          <div>
            <p className="text-xs font-black uppercase text-brand-700">Control Staff</p>
            <h2 className="text-lg font-black text-ink">Solicitudes de cambio de turno</h2>
            <p className="mt-1 text-sm text-muted">El operador solicita cubrir su turno con personal Blue o Green. Solo Staff aprueba el cambio.</p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-md bg-amber-50 px-4 py-2"><p className="text-xs font-black text-amber-700">Pendientes</p><p className="text-xl font-black text-amber-800">{pendingShiftChanges.length}</p></div>
            <div className="rounded-md bg-emerald-50 px-4 py-2"><p className="text-xs font-black text-emerald-700">Aprobados</p><p className="text-xl font-black text-emerald-800">{shiftChangeRequests.filter((item) => item.status === "Aprobado").length}</p></div>
            <div className="rounded-md bg-red-50 px-4 py-2"><p className="text-xs font-black text-red-700">Denegados</p><p className="text-xl font-black text-red-800">{shiftChangeRequests.filter((item) => item.status === "Denegado").length}</p></div>
          </div>
        </div>
        <div className="grid gap-3 p-5 lg:grid-cols-2">
          {pendingShiftChanges.length ? pendingShiftChanges.map((request) => (
            <div key={request.id} className="rounded-md border border-amber-200 bg-amber-50/60 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase text-muted">Operador</p>
                  <h3 className="text-lg font-black text-ink">{request.operatorUsername || request.operator}</h3>
                  <p className="text-sm font-semibold text-muted">{new Date(`${request.workDate}T00:00:00`).toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" })}</p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-black ${request.color === "green" ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"}`}>
                  {request.color === "green" ? "Equipo Green" : "Equipo Blue"}
                </span>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <div className="rounded-md bg-white p-3"><p className="text-xs font-bold uppercase text-muted">Reemplazo</p><p className="font-black text-ink">{request.replacementUser}</p></div>
                <div className="rounded-md bg-white p-3"><p className="text-xs font-bold uppercase text-muted">Motivo</p><p className="font-black text-ink">{request.reason}</p></div>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <button className="btn-primary justify-center bg-emerald-600 hover:bg-emerald-700" disabled={reviewingChangeId === request.id} onClick={() => reviewShiftChange(request, "Aprobado")}>
                  <CheckCircle2 size={16} />
                  Aprobar
                </button>
                <button className="btn-secondary justify-center text-red-700" disabled={reviewingChangeId === request.id} onClick={() => reviewShiftChange(request, "Denegado")}>
                  <XCircle size={16} />
                  Denegar
                </button>
              </div>
            </div>
          )) : (
            <div className="rounded-md border border-line bg-soft p-5 text-sm font-semibold text-muted lg:col-span-2">No hay cambios de turno pendientes.</div>
          )}
        </div>
        {reviewedShiftChanges.length ? (
          <div className="border-t border-line bg-soft/60 p-5">
            <p className="text-sm font-black text-ink">Historial reciente</p>
            <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {reviewedShiftChanges.map((request) => (
                <div key={`reviewed-${request.id}`} className="rounded-md border border-line bg-white p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-black text-ink">{request.operatorUsername || request.operator}</span>
                    <span className={`rounded-full px-2 py-1 text-xs font-black ${request.status === "Aprobado" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>{request.status}</span>
                  </div>
                  <p className="mt-1 text-muted">{request.workDate} · {request.color === "green" ? "Green" : "Blue"} · {request.replacementUser} · {request.reason}</p>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </section> : null}
      </> : null}

      {false ? (
      <section className="card overflow-hidden">
        <div className="grid lg:grid-cols-[1fr_auto]">
          <div className="p-5">
            <div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-md bg-brand-50 text-brand-700"><WandSparkles size={22} /></span><div><h2 className="text-lg font-bold text-ink">Programación automática</h2><p className="text-sm text-muted">Un clic crea el turno 2x2 del mes y distribuye breaks y almuerzos por grupos.</p></div></div>
          </div>
          <div className="flex min-w-72 flex-col justify-center border-t border-line bg-soft p-5 lg:border-l lg:border-t-0"><p className="text-xs font-bold uppercase text-muted">Mes a programar</p><p className="mt-1 font-bold text-ink">{new Date(`${scheduleMonth}-01T00:00:00`).toLocaleDateString("es-CO", { month: "long", year: "numeric" })}</p><button className="btn-primary mt-4 justify-center" disabled={automating} onClick={automateEverything}><WandSparkles size={17} />{automating ? "Programando..." : "Automatizar y publicar"}</button></div>
        </div>
      </section>
      ) : null}

      {scheduleView === "shifts" ? (
      <>
      <section className="card p-5">
        <div className="grid gap-3 lg:grid-cols-[180px_1fr_auto_auto]">
          <div><span className="mb-1 block text-sm font-semibold text-ink">Dia de trabajo</span><DayNavigator value={dailyShiftDate} onChange={setDailyShiftDate} /></div>
          <label>
            <span className="mb-1 block text-sm font-semibold text-ink">Usuario</span>
            <input
              className="input-base"
              placeholder="Ej: A.Perez"
              value={newOperator.user}
              onChange={(event) => setNewOperator((current) => ({ ...current, user: event.target.value }))}
            />
          </label>
          <button className="btn-primary self-end justify-center" onClick={addOperator}>
            <Plus size={16} />
            Agregar
          </button>
          <button className="btn-secondary self-end justify-center" onClick={loadAllActiveOperators}>
            Cargar todos
          </button>
        </div>
        {message ? <p className="mt-3 rounded-md bg-cyan/10 p-2 text-sm font-semibold text-brand-700">{message}</p> : null}
      </section>

      <section className="mt-6 card overflow-hidden">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line p-5">
          <div>
            <h2 className="text-lg font-bold text-ink">Programacion editable de turnos</h2>
            <p className="mt-1 text-sm text-muted">Edita modalidad, ubicacion y horario; quita operadores incapacitados o retirados.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <label className="relative min-w-64"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={15} /><input className="input-base pl-9" placeholder="Buscar operador" value={operatorQuery} onChange={(event) => setOperatorQuery(event.target.value)} /></label>
            <input
              className="input-base w-60"
              list="work-schedule-options"
              placeholder="Horario para filtrados"
              value={bulkWorkSchedule}
              onChange={(event) => setBulkWorkSchedule(event.target.value)}
            />
            <button className="btn-secondary" onClick={applyBulkWorkSchedule}>Aplicar horario</button>
            <button className="btn-secondary" onClick={openShiftBrowserView}>Abrir en Chrome</button>
            <button className="btn-primary" onClick={exportShiftExcel}>
              <Download size={16} />
              Descargar Excel
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] border-collapse">
            <thead className="bg-teal-700 text-left text-xs uppercase text-white">
              <tr>
                <th className="border border-teal-900 px-3 py-3">User</th>
                <th className="border border-teal-900 px-3 py-3">Name</th>
                <th className="border border-teal-900 px-3 py-3">Modalidad</th>
                <th className="border border-teal-900 px-3 py-3">Location</th>
                <th className="border border-teal-900 px-3 py-3">Horario</th>
                <th className="border border-teal-900 px-3 py-3">Quitar</th>
              </tr>
            </thead>
            <tbody>
              {filteredAssignments.map((assignment) => (
                <tr key={assignment.id} className="odd:bg-blue-50 even:bg-white">
                  <td className="border border-dotted border-slate-400 px-3 py-2">
                    <input className="w-full bg-transparent font-bold outline-none" value={assignment.user} onChange={(event) => updateAssignment(assignment.id, "user", event.target.value)} />
                  </td>
                  <td className="border border-dotted border-slate-400 px-3 py-2">
                    <input className="w-full bg-transparent text-center outline-none" value={assignment.name} onChange={(event) => updateAssignment(assignment.id, "name", event.target.value)} />
                  </td>
                  <td className="border border-dotted border-slate-400 px-3 py-2">
                    <select className="input-base" value={assignment.workMode || "Oficina"} onChange={(event) => updateAssignment(assignment.id, "workMode", event.target.value)}>
                      <option>Oficina</option>
                      <option>Casa</option>
                    </select>
                  </td>
                  <td className="border border-dotted border-slate-400 px-3 py-2">
                    <select className="input-base" value={assignment.location} onChange={(event) => updateAssignment(assignment.id, "location", event.target.value)}>
                      <option>CL 72 - Coworking</option>
                      <option>Homeoffice</option>
                      <option>Sede Norte</option>
                      <option>Sede Centro</option>
                    </select>
                  </td>
                  <td className="border border-dotted border-slate-400 px-3 py-2">
                    {(() => {
                      const parts = parseScheduleTimeRange(assignment.workSchedule || "07:00 - 19:00");
                      return (
                        <div className="grid min-w-[260px] grid-cols-[1fr_auto_1fr] items-center gap-2">
                          <label className="block">
                            <span className="mb-1 block text-[10px] font-black uppercase text-muted">Entrada</span>
                            <input className="input-base px-2 font-bold text-brand-800" type="time" value={parts.start} onChange={(event) => updateWorkScheduleTime(assignment.id, "start", event.target.value)} />
                          </label>
                          <span className="pt-5 text-center text-xs font-black text-muted">a</span>
                          <label className="block">
                            <span className="mb-1 block text-[10px] font-black uppercase text-muted">Salida</span>
                            <input className="input-base px-2 font-bold text-brand-800" type="time" value={parts.end} onChange={(event) => updateWorkScheduleTime(assignment.id, "end", event.target.value)} />
                          </label>
                        </div>
                      );
                    })()}
                  </td>
                  <td className="border border-dotted border-slate-400 px-3 py-2">
                    <button className="btn-secondary justify-center py-1.5 text-red-700" onClick={() => removeOperator(assignment.id)}>
                      <Trash2 size={16} />
                      Quitar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {false ? <section className="mt-6 card overflow-hidden">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line p-5">
          <div>
            <h2 className="text-lg font-bold text-ink">Breaks y almuerzos</h2>
            <p className="mt-1 text-sm text-muted">Edita un break, almuerzo y un break opcional si aplica. Publica solo cuando el operador pueda verlo.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="self-center text-sm font-semibold text-muted">{filteredScheduleRows.length} operadores</span>
            <button className="btn-secondary" onClick={hideAllBreakSchedules}>Ocultar todos</button>
            <button className="btn-secondary" onClick={openBreakBrowserView}>Abrir en Chrome</button>
            <button className="btn-secondary" onClick={exportBreakExcel}>
              <Download size={16} />
              Descargar Excel
            </button>
          </div>
        </div>
        <div className="border-b border-line bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-black text-ink">Seleccion de operadores</p>
              <p className="text-sm text-muted">
                {selectedBreakOperators.length ? `${selectedBreakOperators.length} seleccionados para el proximo bloque.` : "Sin seleccion: el bloque se publica a todos los operadores filtrados."}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button className="btn-secondary py-2" onClick={() => setSelectedBreakOperators(filteredScheduleRows.map((schedule) => schedule.operator))}>Seleccionar filtrados</button>
              <button className="btn-secondary py-2" onClick={() => setSelectedBreakOperators([])}>Limpiar seleccion</button>
            </div>
          </div>
          <div className="mt-4 flex max-h-40 flex-wrap gap-2 overflow-y-auto rounded-md border border-line bg-soft p-3">
            {filteredScheduleRows.map((schedule) => {
              const selected = selectedBreakOperators.includes(schedule.operator);
              return (
                <button
                  key={schedule.operator}
                  className={`rounded-full border px-3 py-2 text-sm font-black transition ${selected ? "border-brand-600 bg-brand-600 text-white" : "border-line bg-white text-ink hover:border-brand-300"}`}
                  onClick={() =>
                    setSelectedBreakOperators((current) =>
                      current.includes(schedule.operator)
                        ? current.filter((operator) => operator !== schedule.operator)
                        : [...current, schedule.operator]
                    )
                  }
                >
                  {schedule.operator}
                </button>
              );
            })}
          </div>
        </div>
        <div className="grid gap-3 border-b border-line bg-soft/60 p-5 lg:grid-cols-3">
          <div className={`rounded-md border bg-white p-4 ${lastPublishedAction === "bulk-breakOneVisible" ? "border-emerald-400 shadow-sm" : "border-line"}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase text-brand-700">1. Primer break</p>
                <p className="mt-1 text-sm text-muted">Se enviara a {selectedBreakRows.length} operadores.</p>
              </div>
              <span className="rounded-md bg-amber-50 px-2 py-1 text-xs font-black text-amber-700">{bulkBreakTimes.breakOne}</span>
            </div>
            <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
              <input className="input-base" type="time" value={bulkBreakTimes.breakOne} onChange={(event) => setBulkBreakTimes((current) => ({ ...current, breakOne: event.target.value }))} />
              <button className="btn-primary px-4" onClick={() => publishFilteredBreakItem("breakOne", "breakOneVisible", "Break 1")}>Publicar</button>
            </div>
          </div>
          <div className={`rounded-md border bg-white p-4 ${lastPublishedAction === "bulk-lunchVisible" ? "border-emerald-400 shadow-sm" : "border-line"}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase text-brand-700">2. Almuerzo</p>
                <p className="mt-1 text-sm text-muted">Publica solo almuerzo cuando ya este editado.</p>
              </div>
              <span className="rounded-md bg-blue-50 px-2 py-1 text-xs font-black text-brand-700">{bulkBreakTimes.lunch}</span>
            </div>
            <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
              <input className="input-base" type="time" value={bulkBreakTimes.lunch} onChange={(event) => setBulkBreakTimes((current) => ({ ...current, lunch: event.target.value }))} />
              <button className="btn-primary px-4" onClick={() => publishFilteredBreakItem("lunch", "lunchVisible", "Almuerzo")}>Publicar</button>
            </div>
          </div>
          <div className={`rounded-md border bg-white p-4 ${lastPublishedAction === "bulk-breakTwoVisible" ? "border-emerald-400 shadow-sm" : "border-line"}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase text-brand-700">3. Break opcional</p>
                <p className="mt-1 text-sm text-muted">Usalo solo si ese grupo tendra segundo break.</p>
              </div>
              <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-black text-slate-700">{bulkBreakTimes.breakTwo}</span>
            </div>
            <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
              <input className="input-base" type="time" value={bulkBreakTimes.breakTwo} onChange={(event) => setBulkBreakTimes((current) => ({ ...current, breakTwo: event.target.value }))} />
              <button className="btn-primary px-4" onClick={() => publishFilteredBreakItem("breakTwo", "breakTwoVisible", "Break opcional")}>Publicar</button>
            </div>
          </div>
        </div>
        {lastPublishedAction ? (
          <div className="border-b border-emerald-100 bg-emerald-50 px-5 py-3 text-sm font-black text-emerald-800">
            {message || "Programacion publicada correctamente."}
          </div>
        ) : null}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px]">
            <thead className="bg-soft text-left text-xs uppercase text-muted">
              <tr>
                <th className="table-cell">Operador</th>
                <th className="table-cell">Break 1</th>
                <th className="table-cell">Enviar Break 1</th>
                <th className="table-cell">Almuerzo</th>
                <th className="table-cell">Enviar Almuerzo</th>
                <th className="table-cell">Break opcional</th>
                <th className="table-cell">Enviar opcional</th>
              </tr>
            </thead>
            <tbody>
              {filteredScheduleRows.map((schedule) => (
                <tr key={schedule.operator}>
                  <td className="table-cell font-bold">{schedule.operator}</td>
                  <td className="table-cell">
                    <input className="input-base max-w-32" type="time" value={schedule.breakOne} onChange={(event) => updateBreakSchedule(schedule.operator, "breakOne", event.target.value)} />
                  </td>
                  <td className="table-cell">
                    <button className={`min-w-28 rounded-md px-3 py-2 text-sm font-black transition ${schedule.breakOneVisible ? "bg-emerald-600 text-white shadow-sm" : "bg-slate-100 text-slate-600 hover:bg-brand-50 hover:text-brand-700"} ${lastPublishedAction === `${schedule.operator}-breakOneVisible` ? "ring-2 ring-emerald-300" : ""}`} onClick={() => toggleBreakItemVisibility(schedule.operator, "breakOneVisible", !schedule.breakOneVisible)}>
                      {schedule.breakOneVisible ? "Publicado" : "Publicar"}
                    </button>
                  </td>
                  <td className="table-cell">
                    <input className="input-base max-w-32" type="time" value={schedule.lunch} onChange={(event) => updateBreakSchedule(schedule.operator, "lunch", event.target.value)} />
                  </td>
                  <td className="table-cell">
                    <button className={`min-w-28 rounded-md px-3 py-2 text-sm font-black transition ${schedule.lunchVisible ? "bg-emerald-600 text-white shadow-sm" : "bg-slate-100 text-slate-600 hover:bg-brand-50 hover:text-brand-700"} ${lastPublishedAction === `${schedule.operator}-lunchVisible` ? "ring-2 ring-emerald-300" : ""}`} onClick={() => toggleBreakItemVisibility(schedule.operator, "lunchVisible", !schedule.lunchVisible)}>
                      {schedule.lunchVisible ? "Publicado" : "Publicar"}
                    </button>
                  </td>
                  <td className="table-cell">
                    <input className="input-base max-w-32" type="time" value={schedule.breakTwo} onChange={(event) => updateBreakSchedule(schedule.operator, "breakTwo", event.target.value)} />
                  </td>
                  <td className="table-cell">
                    <button className={`min-w-28 rounded-md px-3 py-2 text-sm font-black transition ${schedule.breakTwoVisible ? "bg-emerald-600 text-white shadow-sm" : "bg-slate-100 text-slate-600 hover:bg-brand-50 hover:text-brand-700"} ${lastPublishedAction === `${schedule.operator}-breakTwoVisible` ? "ring-2 ring-emerald-300" : ""}`} onClick={() => toggleBreakItemVisibility(schedule.operator, "breakTwoVisible", !schedule.breakTwoVisible)}>
                      {schedule.breakTwoVisible ? "Publicado" : "Publicar"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section> : null}

      </>
      ) : null}

      {false ? (
      <section className="mt-6 card overflow-hidden">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line p-5">
          <div>
            <h2 className="text-lg font-bold text-ink">Calendario Blue 2x2</h2>
            <p className="mt-1 text-sm text-muted">Configura el mes y primer dia trabajado; el operador lo ve en su jornada.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><span className="mb-1 block text-sm font-semibold">Mes</span><MonthNavigator value={scheduleMonth} onChange={setScheduleMonth} /></div>
            <label>
              <span className="mb-1 block text-sm font-semibold">Primer dia trabajado</span>
              <input className="input-base" type="date" value={firstWorkDay} onChange={(event) => setFirstWorkDay(event.target.value)} />
            </label>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-px bg-line p-px">
          {["Lun", "Mar", "Mie", "Jue", "Vie", "Sab", "Dom"].map((dayName) => (
            <div key={dayName} className="bg-soft p-2 text-center text-xs font-bold uppercase text-muted">{dayName}</div>
          ))}
          {Array.from({ length: (new Date(`${scheduleMonth}-01T00:00:00`).getDay() + 6) % 7 }).map((_, index) => (
            <div key={`empty-${index}`} className="min-h-16 bg-white" />
          ))}
          {calendarDays.map((day) => {
            const changes = approvedShiftChangesByDate.get(day.date) || [];
            return (
            <div key={day.date} className={`min-h-20 p-2 ${changes.length ? "bg-emerald-50 text-emerald-950" : day.isWorkDay ? "bg-brand-600 text-white" : "bg-white text-muted"}`}>
              <div className="flex items-start justify-between gap-2">
                <span className="text-lg font-bold">{day.day}</span>
                <span className="text-xs font-semibold uppercase">{day.weekday}</span>
              </div>
              <p className="mt-2 text-xs font-semibold">{day.isWorkDay ? "Trabajamos" : "Descanso"}</p>
              {changes.slice(0, 2).map((change) => (
                <p key={change.id} className={`mt-1 truncate rounded px-1.5 py-0.5 text-[11px] font-black ${change.color === "green" ? "bg-emerald-600 text-white" : "bg-blue-600 text-white"}`}>
                  {change.color === "green" ? "Green" : "Blue"} · {change.operatorUsername || change.operator}: {change.replacementUser}
                </p>
              ))}
              {changes.length > 2 ? <p className="mt-1 text-[11px] font-black">+{changes.length - 2} cambios</p> : null}
            </div>
          );})}
        </div>
      </section>
      ) : null}
    </AppLayout>
  );
}
