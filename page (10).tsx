"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarDays, CheckCircle2, Clock, Coffee, Gauge, Image as ImageIcon, Play, Plus, ShieldCheck, Square, Timer, TrendingUp, WifiOff } from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { AppLayout } from "@/components/AppLayout";
import { Modal } from "@/components/Modal";
import { DayNavigator, MonthNavigator } from "@/components/PeriodNavigator";
import { commercialMonthRange, commercialOrderExists, loadCommercialRecords, saveCommercialRecord } from "@/lib/cloud-records";
import { loadOperatorDaySchedule, OperatorDaySchedule } from "@/lib/cloud-schedules";
import {
  CurrentProfile,
  closeCloudOpenFailureRecords,
  loadCloudFailureRecords,
  loadCloudShiftRecords,
  loadCurrentProfile,
  saveCloudFailureRecord,
  saveCloudShiftRecord
} from "@/lib/cloud-shifts";
import { generateTwoByTwoSchedule, toDateInputValue } from "@/lib/schedule";
import {
  DailyPerformanceSummary,
  loadDailyPerformanceSummary,
  loadLatestDailyPerformanceSummary,
  loadLatestMyPerformance,
  loadMyPerformance,
  PerformanceMetric
} from "@/lib/performance-metrics";
import { isPageVisible, shouldRefreshNow } from "@/lib/client-cache";
import { focusRefreshThrottleMs, notificationPollMs } from "@/lib/usage-controls";
import { fileToOptimizedDataUrl, heavyFileMessage, maxOptimizedUploadBytes } from "@/lib/image-compression";
import {
  CommercialRecord,
  FailureRecord,
  ShiftBreakEvent,
  ShiftBreakEventType,
  ShiftPauseEvent,
  ShiftRecord,
  createRecordId,
  getRecordTypeLabel,
  readStoredBreakAssignments,
  readStoredBreakSchedules,
  readStoredDailyShiftAssignments,
  readStoredFailureRecords,
  readStoredShiftRecords,
  readStoredRecords,
  writeStoredFailureRecords,
  writeStoredShiftRecords,
  writeStoredRecords
} from "@/lib/records";

const operatorName = "Operador Demo";
type OperatorCommercialModal = "sale" | "hidden-rejection";
const maxShiftMilliseconds = 12 * 60 * 60 * 1000;

function bogotaDateKey(reference = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(reference);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export default function OperatorDashboard() {
  const [operatorProfile, setOperatorProfile] = useState<CurrentProfile | null>(null);
  const [cloudTodaySchedule, setCloudTodaySchedule] = useState<OperatorDaySchedule | null>(null);
  const [activeModal, setActiveModal] = useState<OperatorCommercialModal | null>(null);
  const [activeShift, setActiveShift] = useState<ShiftRecord | null>(null);
  const [shiftRecords, setShiftRecords] = useState<ShiftRecord[]>([]);
  const [activeFailure, setActiveFailure] = useState<FailureRecord | null>(null);
  const [failureModalOpen, setFailureModalOpen] = useState(false);
  const [failureError, setFailureError] = useState("");
  const [finishError, setFinishError] = useState("");
  const [finishConfirmOpen, setFinishConfirmOpen] = useState(false);
  const [finishingShift, setFinishingShift] = useState(false);
  const [startConfirmOpen, setStartConfirmOpen] = useState(false);
  const [startError, setStartError] = useState("");
  const [now, setNow] = useState(new Date());
  const [shiftMessage, setShiftMessage] = useState("");
  const [shiftForm, setShiftForm] = useState({
    shiftType: "Turno normal" as ShiftRecord["shiftType"],
    hasMouse: false,
    hasKeyboard: false,
    hasDeskReady: false,
    photoName: "",
    photoDataUrl: ""
  });
  const [failureForm, setFailureForm] = useState({
    explanation: "",
    evidenceName: "",
    evidenceDataUrl: ""
  });
  const [finishEvidence, setFinishEvidence] = useState({
    name: "",
    dataUrl: ""
  });
  const [form, setForm] = useState({
    client: "",
    phone: "",
    campaign: "Usablue",
    observation: "",
    orderNumber: "",
    recordDate: toDateInputValue(new Date()),
    product: "DEFENOX",
    result: "PENDIENTE",
    treatment: "2+1",
    paymentMethod: "MONEY ORDEN",
    communicated: "No",
    thirdCallback: "No"
  });
  const [savedMessage, setSavedMessage] = useState("");
  const [commercialRecords, setCommercialRecords] = useState<CommercialRecord[]>([]);
  const [savingRecord, setSavingRecord] = useState(false);
  const [saveComplete, setSaveComplete] = useState(false);
  const [performance, setPerformance] = useState<PerformanceMetric | null>(null);
  const [monthlyProcessingPerformance, setMonthlyProcessingPerformance] = useState<PerformanceMetric | null>(null);
  const [dailySummary, setDailySummary] = useState<DailyPerformanceSummary | null>(null);
  const [processingScope, setProcessingScope] = useState<"day" | "month">("day");
  const [metricPeriod, setMetricPeriod] = useState<"day" | "month">("day");
  const [metricDate, setMetricDate] = useState(toDateInputValue(new Date()));
  const [dismissedBreakNoticeKey, setDismissedBreakNoticeKey] = useState("");
  const currentOperatorName = operatorProfile?.fullName || operatorName;
  const currentOperatorUsername = operatorProfile?.username || "O.Demo";

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    async function loadOperationalState() {
      const profile = await loadCurrentProfile().catch(() => null);
      setOperatorProfile(profile);
      if (profile) {
        const publishedSchedule = await loadOperatorDaySchedule(profile.id, toDateInputValue(new Date())).catch(() => null);
        setCloudTodaySchedule(publishedSchedule);
      }
      const fallbackName = profile?.fullName || operatorName;
      const [loadedShifts, loadedFailures] = await Promise.all([
        loadCloudShiftRecords(profile).catch(() => readStoredShiftRecords()),
        loadCloudFailureRecords(profile).catch(() => readStoredFailureRecords())
      ]);
      const ownShifts = loadedShifts.filter((record) => record.operator.trim().toLowerCase() === fallbackName.trim().toLowerCase());
      const normalizedShifts = ownShifts.map((record) => {
        if (shouldAutoCloseShift(record)) return closeShiftAtLimit(record);
        if (record.status !== "Abierta") return record;
        const startedAt = record.startedAtIso ? new Date(record.startedAtIso) : new Date(`${record.date}T${record.startTime}`);
        const elapsedMinutes = Math.max(0, (Date.now() - startedAt.getTime()) / 60000);
        return (record.failureMinutes || 0) > elapsedMinutes
          ? { ...record, failureMinutes: 0 }
          : record;
      });
      const autoClosed = normalizedShifts.filter((record, index) => ownShifts[index]?.status === "Abierta" && record.status !== "Abierta");
      if (autoClosed.length) {
        writeStoredShiftRecords([
          ...autoClosed,
          ...readStoredShiftRecords().filter((record) => !autoClosed.some((closed) => closed.id === record.id))
        ]);
        autoClosed.forEach((record) => saveCloudShiftRecord(record).catch(() => undefined));
      }
      setShiftRecords(normalizedShifts);
      const openShift = normalizedShifts.find((record) => record.status === "Abierta");
      const normalizedFailures = loadedFailures.map((record) => {
        if (record.status !== "Abierta") return record;
        const linkedShift = normalizedShifts.find((shift) => shift.id === record.shiftRecordId);
        const failureStart = record.startedAtIso ? new Date(record.startedAtIso) : new Date(`${record.date}T${record.startTime}`);
        const shiftStart = linkedShift ? (linkedShift.startedAtIso ? new Date(linkedShift.startedAtIso) : new Date(`${linkedShift.date}T${linkedShift.startTime}`)) : null;
        const shiftLimit = shiftStart ? new Date(shiftStart.getTime() + maxShiftMilliseconds) : null;
        const belongsToOpenShift = Boolean(
          linkedShift &&
          linkedShift.status === "Abierta" &&
          shiftStart &&
          failureStart.getTime() >= shiftStart.getTime() &&
          shiftLimit &&
          failureStart.getTime() < shiftLimit.getTime() &&
          Date.now() < shiftLimit.getTime()
        );
        if (belongsToOpenShift) return record;

        const recordedEnd = linkedShift?.endedAtIso ? new Date(linkedShift.endedAtIso) : shiftLimit;
        const safeEnd = new Date(Math.max(
          failureStart.getTime(),
          Math.min(Date.now(), recordedEnd?.getTime() || failureStart.getTime() + maxShiftMilliseconds)
        ));
        return {
          ...record,
          endTime: safeEnd.toTimeString().slice(0, 5),
          endedAtIso: safeEnd.toISOString(),
          durationMinutes: Number(((safeEnd.getTime() - failureStart.getTime()) / 60000).toFixed(2)),
          status: "Solucionada" as const
        };
      });
      const repairedFailures = normalizedFailures.filter((record, index) => loadedFailures[index]?.status === "Abierta" && record.status === "Solucionada");
      if (repairedFailures.length) {
        writeStoredFailureRecords(normalizedFailures);
        repairedFailures.forEach((record) => {
          saveCloudFailureRecord(record, record.shiftRecordId).catch(() => undefined);
          closeCloudOpenFailureRecords(record).catch(() => undefined);
        });
      }
      const openFailure = openShift
        ? normalizedFailures.find((record) => {
            if (record.status !== "Abierta" || record.operator.trim().toLowerCase() !== fallbackName.trim().toLowerCase()) return false;
            return Boolean(record.shiftRecordId) && record.shiftRecordId === openShift.id;
          })
        : null;
      if (openShift) {
        setActiveShift(openShift);
        setShiftForm((current) => ({
          ...current,
          shiftType: openShift.shiftType,
          hasMouse: openShift.hasMouse,
          hasKeyboard: openShift.hasKeyboard,
          hasDeskReady: openShift.hasDeskReady,
          photoName: openShift.photoName,
          photoDataUrl: openShift.photoDataUrl
        }));
      }
      if (openFailure) {
        setActiveFailure(openFailure);
        setFailureForm({
          explanation: openFailure.explanation,
          evidenceName: openFailure.evidenceName,
          evidenceDataUrl: openFailure.evidenceDataUrl
        });
      }
    }
    loadOperationalState();
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const month = metricDate.slice(0, 7);
    loadCommercialRecords({ ...commercialMonthRange(month), recordTypes: ["sale", "hidden_rejection"], limit: 400 })
      .then(setCommercialRecords)
      .catch(() => setCommercialRecords(readStoredRecords()));
  }, [metricDate]);

  const currentPerformanceDate = bogotaDateKey(now);

  useEffect(() => {
    const loadPerformance = () => {
      Promise.all([
        loadMyPerformance(currentPerformanceDate, "day").catch(() => null),
        loadLatestMyPerformance("day").catch(() => null),
        loadMyPerformance(`${currentPerformanceDate.slice(0, 7)}-01`, "month").catch(() => null),
        loadLatestMyPerformance("month").catch(() => null),
        loadDailyPerformanceSummary(currentPerformanceDate, "day").catch(() => null),
        loadLatestDailyPerformanceSummary("day").catch(() => null)
      ])
        .then(([dayMetric, latestDayMetric, monthMetric, latestMonthMetric, todaySummary, latestSummary]) => {
          const visibleDayMetric = dayMetric?.processingFile || dayMetric?.hourlyFile ? dayMetric : latestDayMetric;
          const visibleMonthMetric = monthMetric?.processingFile ? monthMetric : latestMonthMetric?.processingFile ? latestMonthMetric : null;
          setPerformance(visibleDayMetric || null);
          setMonthlyProcessingPerformance(visibleMonthMetric);
          setDailySummary(todaySummary || latestSummary || null);
        })
        .catch(() => {
          setPerformance(null);
          setMonthlyProcessingPerformance(null);
          setDailySummary(null);
        });
    };
    loadPerformance();
    const refresh = window.setInterval(() => {
      if (isPageVisible()) loadPerformance();
    }, notificationPollMs());
    const onFocus = () => {
      if (isPageVisible() && shouldRefreshNow("unicall-blue:operator-performance-focus", focusRefreshThrottleMs())) loadPerformance();
    };
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(refresh);
      window.removeEventListener("focus", onFocus);
    };
  }, [currentPerformanceDate]);

  useEffect(() => {
    if (activeShift && startConfirmOpen) {
      setStartConfirmOpen(false);
    }
  }, [activeShift, startConfirmOpen]);

  useEffect(() => {
    if (!activeShift || !shouldAutoCloseShift(activeShift)) return;
    const limitDate = shiftLimitDate(activeShift);
    const failureAtLimit = activeFailure ? {
      ...activeFailure,
      endTime: formatTimeFromDate(limitDate),
      endedAtIso: limitDate.toISOString(),
      durationMinutes: Math.max(0, Number(((limitDate.getTime() - (activeFailure.startedAtIso ? new Date(activeFailure.startedAtIso) : buildTimerDate(activeFailure.date, activeFailure.startTime)).getTime()) / 60000).toFixed(2))),
      status: "Solucionada" as const
    } : null;
    const shiftAtLimit = failureAtLimit ? {
      ...activeShift,
      failureMinutes: (activeShift.failureMinutes || 0) + failureAtLimit.durationMinutes
    } : activeShift;
    const closedRecord = closeShiftAtLimit(shiftAtLimit);
    if (failureAtLimit) saveFailure(failureAtLimit);
    setActiveShift(null);
    setActiveFailure(null);
    setFinishConfirmOpen(false);
    setShiftMessage("Jornada cerrada automaticamente al cumplir el maximo diario de 12 horas.");
    saveShift(closedRecord);
  }, [activeFailure, activeShift, now]);

  const buildTimerDate = useCallback((date: string, time: string) => {
    const parsed = new Date(`${date}T${time}`);
    if (parsed.getTime() - now.getTime() > 60000) {
      return new Date(`${toDateInputValue(now)}T${time}`);
    }
    return parsed;
  }, [now]);

  const shiftStartDate = useCallback((record: ShiftRecord) => {
    return record.startedAtIso ? new Date(record.startedAtIso) : buildTimerDate(record.date, record.startTime);
  }, [buildTimerDate]);

  const eventStartDate = useCallback((record: ShiftRecord, event: ShiftBreakEvent) => {
    return event.startedAtIso ? new Date(event.startedAtIso) : buildTimerDate(record.date, event.startTime);
  }, [buildTimerDate]);

  const pauseStartDate = useCallback((record: ShiftRecord, event: ShiftPauseEvent) => {
    return event.startedAtIso ? new Date(event.startedAtIso) : buildTimerDate(record.date, event.startTime);
  }, [buildTimerDate]);

  const activeBreakEvent = useMemo(
    () => activeShift?.breakEvents?.find((event) => event.status === "Activa") || null,
    [activeShift]
  );

  const activePauseEvent = useMemo(
    () => activeShift?.pauseEvents?.find((event) => event.status === "Activa") || null,
    [activeShift]
  );

  const breakEventSeconds = useCallback((event: ShiftBreakEvent) => {
    if (!activeShift) return 0;
    const start = eventStartDate(activeShift, event);
    return Math.max(0, Math.floor((now.getTime() - start.getTime()) / 1000));
  }, [activeShift, eventStartDate, now]);

  const pauseEventSeconds = useCallback((event: ShiftPauseEvent) => {
    if (!activeShift) return 0;
    const start = pauseStartDate(activeShift, event);
    return Math.max(0, Math.floor((now.getTime() - start.getTime()) / 1000));
  }, [activeShift, now, pauseStartDate]);

  const elapsedTime = useMemo(() => {
    if (!activeShift) return "00:00:00";
    const start = shiftStartDate(activeShift);
    const rawSeconds = Math.max(0, Math.min(Math.floor((now.getTime() - start.getTime()) / 1000), maxShiftMilliseconds / 1000));
    const breakSeconds = (activeShift.breakEvents || []).reduce((total, event) => (
      total + (event.status === "Activa" ? breakEventSeconds(event) : Math.round((event.durationMinutes || 0) * 60))
    ), 0);
    const pauseSeconds = (activeShift.pauseEvents || []).reduce((total, event) => (
      total + (event.status === "Activa" ? pauseEventSeconds(event) : Math.round((event.durationMinutes || 0) * 60))
    ), 0);
    const activeFailureSeconds = activeFailure ? (() => {
      const failureStart = activeFailure.startedAtIso ? new Date(activeFailure.startedAtIso) : buildTimerDate(activeFailure.date, activeFailure.startTime);
      return Math.max(0, Math.floor((now.getTime() - failureStart.getTime()) / 1000));
    })() : 0;
    const diffSeconds = Math.max(0, rawSeconds - breakSeconds - pauseSeconds - Math.round((activeShift.failureMinutes || 0) * 60) - activeFailureSeconds);
    const hours = Math.floor(diffSeconds / 3600);
    const minutes = Math.floor((diffSeconds % 3600) / 60);
    const seconds = diffSeconds % 60;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }, [activeFailure, activeShift, breakEventSeconds, buildTimerDate, now, pauseEventSeconds, shiftStartDate]);

  const failureElapsedTime = useMemo(() => {
    if (!activeFailure) return "00:00";
    const start = activeFailure.startedAtIso ? new Date(activeFailure.startedAtIso) : buildTimerDate(activeFailure.date, activeFailure.startTime);
    const diffSeconds = Math.max(0, Math.floor((now.getTime() - start.getTime()) / 1000));
    const minutes = Math.floor(diffSeconds / 60);
    const seconds = diffSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }, [activeFailure, buildTimerDate, now]);

  const breakElapsedTime = useMemo(() => {
    if (!activeBreakEvent) return "00:00";
    const totalSeconds = breakEventSeconds(activeBreakEvent);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }, [activeBreakEvent, breakEventSeconds]);

  const pauseElapsedTime = useMemo(() => {
    if (!activePauseEvent) return "00:00";
    const totalSeconds = pauseEventSeconds(activePauseEvent);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }, [activePauseEvent, pauseEventSeconds]);

  function formatMinutes(totalMinutes: number) {
    const safeMinutes = Math.max(0, totalMinutes);
    if (safeMinutes > 0 && safeMinutes < 1) {
      return `${Math.max(1, Math.round(safeMinutes * 60))}s`;
    }
    const roundedMinutes = Math.round(safeMinutes);
    const hours = Math.floor(roundedMinutes / 60);
    const minutes = roundedMinutes % 60;
    return hours ? `${hours}h ${minutes}m` : `${minutes}m`;
  }

  function formatPublicationTime(updatedAt?: string) {
    if (!updatedAt) return "Hora no disponible";
    const value = new Date(updatedAt);
    if (Number.isNaN(value.getTime())) return "Hora no disponible";
    return value.toLocaleString("es-CO", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  }

  const activeFailureMinutes = useMemo(() => {
    if (!activeFailure) return 0;
    const start = activeFailure.startedAtIso ? new Date(activeFailure.startedAtIso) : buildTimerDate(activeFailure.date, activeFailure.startTime);
    return Math.max(0, (now.getTime() - start.getTime()) / 60000);
  }, [activeFailure, buildTimerDate, now]);

  const restSummary = useMemo(() => {
    const events = activeShift?.breakEvents || [];
    const pauseMinutes = (activeShift?.pauseEvents || []).reduce((total, event) => {
      const duration = event.status === "Activa" ? pauseEventSeconds(event) / 60 : event.durationMinutes;
      return total + duration;
    }, 0);
    return events.reduce(
      (totals, event) => {
        const duration = event.status === "Activa" ? breakEventSeconds(event) / 60 : event.durationMinutes;
        if (event.type === "Almuerzo") {
          totals.lunch += duration;
        } else {
          totals.breaks += duration;
        }
        return totals;
      },
      { breaks: 0, lunch: 0, pauses: pauseMinutes, failures: (activeShift?.failureMinutes || 0) + activeFailureMinutes }
    );
  }, [activeFailureMinutes, activeShift, breakEventSeconds, pauseEventSeconds]);

  const currentMonth = toDateInputValue(now).slice(0, 7);

  const operatorCalendar = useMemo(
    () => generateTwoByTwoSchedule(currentMonth, "2026-06-03"),
    [currentMonth]
  );

  const currentDate = toDateInputValue(now);

  const todaySchedule = useMemo(
    () => cloudTodaySchedule ? { date: cloudTodaySchedule.date, isWorkDay: cloudTodaySchedule.isWorkDay } : operatorCalendar.find((day) => day.date === currentDate),
    [cloudTodaySchedule, currentDate, operatorCalendar]
  );

  const automaticShiftType: ShiftRecord["shiftType"] = todaySchedule?.isWorkDay ? "Turno normal" : "Extras";

  const operatorProgram = useMemo(() => {
    if (cloudTodaySchedule) {
      return {
        user: currentOperatorUsername,
        workMode: cloudTodaySchedule.workMode,
        location: cloudTodaySchedule.location,
        workSchedule: cloudTodaySchedule.workSchedule
      };
    }
    const assignments = readStoredDailyShiftAssignments();
    const normalizedOperator = currentOperatorName.toLowerCase();
    const assignment = assignments.find((item) =>
      [item.name, item.user].some((value) => value.toLowerCase() === normalizedOperator)
    );
    const workMode: "Oficina" | "Casa" = assignment?.workMode || (assignment?.location === "Homeoffice" ? "Casa" : "Oficina");

    return {
      user: assignment?.user || "O.Demo",
      workMode,
      location: assignment?.location || "CL 72 - Coworking",
      workSchedule: assignment?.workSchedule || "07:00 - 19:00"
    };
  }, [cloudTodaySchedule, currentOperatorName, currentOperatorUsername]);

  const operatorBreaks = useMemo(() => {
    if (cloudTodaySchedule?.published) {
      return {
        isPublished: true,
        lunch: cloudTodaySchedule.lunch,
        breakOne: cloudTodaySchedule.breakOne,
        breakTwo: cloudTodaySchedule.breakTwo,
        publishedAt: cloudTodaySchedule.date
      };
    }
    const schedules = readStoredBreakSchedules();
    const assignments = readStoredBreakAssignments();
    const normalizedOperator = currentOperatorName.toLowerCase();
    const normalizedUser = operatorProgram.user.toLowerCase();
    const schedule = schedules.find((item) =>
      [normalizedOperator, normalizedUser].includes(item.operator.toLowerCase())
    );
    const assignedBreak = assignments.find((item) =>
      [normalizedOperator, normalizedUser].includes(item.operator.toLowerCase())
    );
    const legacyPublished = Boolean(schedule?.visibleToOperator);
    const breakOneVisible = schedule?.breakOneVisible ?? legacyPublished;
    const lunchVisible = schedule?.lunchVisible ?? legacyPublished;
    const breakTwoVisible = schedule?.breakTwoVisible ?? legacyPublished;
    const isPublished = Boolean(breakOneVisible || lunchVisible || breakTwoVisible);

    return {
      isPublished,
      lunch: lunchVisible ? schedule?.lunch || "12:00" : "Pendiente",
      breakOne: breakOneVisible ? schedule?.breakOne || assignedBreak?.breakTime || "09:15" : "Pendiente",
      breakTwo: breakTwoVisible ? schedule?.breakTwo || "15:15" : "Pendiente",
      publishedAt: schedule?.publishedAt || ""
    };
  }, [cloudTodaySchedule, currentOperatorName, operatorProgram.user]);

  const breakNoticeKey = operatorBreaks.publishedAt || `${operatorProgram.user}-${operatorBreaks.breakOne}-${operatorBreaks.lunch}-${operatorBreaks.breakTwo}`;
  const showBreakNotice = operatorBreaks.isPublished && dismissedBreakNoticeKey !== breakNoticeKey;

  useEffect(() => {
    const key = window.localStorage.getItem(`unicall-blue-break-notice-${currentOperatorUsername}`) || "";
    setDismissedBreakNoticeKey(key);
  }, [currentOperatorUsername]);

  function dismissBreakNotice() {
    window.localStorage.setItem(`unicall-blue-break-notice-${currentOperatorUsername}`, breakNoticeKey);
    setDismissedBreakNoticeKey(breakNoticeKey);
  }

  const shiftRecordByDate = useMemo(() => {
    const recordsByDate = new Map<string, ShiftRecord>();
    shiftRecords
      .filter((record) => record.date.slice(0, 7) === currentMonth)
      .forEach((record) => {
        if (!recordsByDate.has(record.date)) {
          recordsByDate.set(record.date, record);
        }
      });
    return recordsByDate;
  }, [currentMonth, shiftRecords]);

  const todayShiftRecord = useMemo(
    () => shiftRecords.find((record) => record.date === currentDate),
    [currentDate, shiftRecords]
  );

  const monthJourneySummary = useMemo(() => {
    const workedRecords = Array.from(shiftRecordByDate.values()).filter((record) => record.status !== "Abierta");
    const extraDays = workedRecords.filter((record) => {
      const scheduledDay = operatorCalendar.find((day) => day.date === record.date);
      return record.shiftType === "Extras" || !scheduledDay?.isWorkDay;
    });

    return {
      workedDays: workedRecords.length,
      extraDays: extraDays.length,
      restedDays: operatorCalendar.filter((day) => !day.isWorkDay && !shiftRecordByDate.has(day.date)).length,
      hours: workedRecords.reduce((total, record) => total + record.workedHours, 0)
    };
  }, [operatorCalendar, shiftRecordByDate]);

  const selectedCommercialSummary = useMemo(() => {
    const selectedValue = metricPeriod === "day" ? metricDate : metricDate.slice(0, 7);
    const matchesPeriod = (record: CommercialRecord) => {
      const value = record.recordDate || record.createdAt || "";
      return metricPeriod === "day" ? value.slice(0, 10) === selectedValue : value.slice(0, 7) === selectedValue;
    };
    return {
      sales: commercialRecords.filter((record) => record.type === "sale" && matchesPeriod(record)).length,
      hiddenRejections: commercialRecords.filter((record) => record.status === "Rechazo oculto" && matchesPeriod(record)).length
    };
  }, [commercialRecords, metricDate, metricPeriod]);

  const visiblePerformanceDate = dailySummary?.metricDate || performance?.metricDate || monthlyProcessingPerformance?.metricDate || currentPerformanceDate;
  const performanceUpdatedAtMs = useMemo(() => {
    const timestamps = [performance?.updatedAt, monthlyProcessingPerformance?.updatedAt, dailySummary?.updatedAt]
      .map((value) => value ? new Date(value).getTime() : 0)
      .filter((value) => Number.isFinite(value) && value > 0);
    return timestamps.length ? Math.max(...timestamps) : 0;
  }, [dailySummary, monthlyProcessingPerformance, performance]);

  const hasCurrentPerformanceData = useMemo(() => {
    const hasOperatorMetric = Boolean(performance?.processingFile || performance?.hourlyFile || monthlyProcessingPerformance?.processingFile);
    const hasDailyMetric = Boolean(dailySummary);
    return hasOperatorMetric || hasDailyMetric;
  }, [dailySummary, monthlyProcessingPerformance, performance]);

  const showPerformancePanel = hasCurrentPerformanceData;

  const activeProcessingMetric = processingScope === "month" ? monthlyProcessingPerformance : performance;
  const activeSummary = dailySummary;
  const approvedRate = useMemo(() => {
    if (!activeSummary) return 0;
    return activeSummary.approvedRate || (activeSummary.totalOrders > 0 ? (activeSummary.approvedSales / activeSummary.totalOrders) * 100 : 0);
  }, [activeSummary]);
  const approvedGoalRate = 21;
  const approvedMinimumRate = 19;
  const approvedGoalOk = approvedRate >= approvedGoalRate;
  const approvedMinimumOk = approvedRate >= approvedMinimumRate;
  const approvedStatusLabel = approvedGoalOk
    ? `Llegamos al aprobado ${approvedGoalRate}%`
    : approvedMinimumOk
      ? `Sobre el minimo ${approvedMinimumRate}%`
      : "Bajo minimo";
  const processingCaseTotal = Math.max(
    (activeProcessingMetric?.approvedSales || 0) +
      (activeProcessingMetric?.rejected || 0) +
      (activeProcessingMetric?.trash || 0),
    0
  );
  const processingApprovalRate = processingCaseTotal > 0
    ? ((activeProcessingMetric?.approvedSales || 0) / processingCaseTotal) * 100
    : 0;
  const hourlyGoalProgress = Math.min(100, Math.max(0, ((performance?.salesPerHour || 0) / 1) * 100));
  const hourlyDifference = (performance?.salesPerHour || 0) - 1;
  const processingChartData = [
    { name: "Aprobado", value: activeProcessingMetric?.approvedSales || 0, color: "#10b981" },
    { name: "Rechazado", value: activeProcessingMetric?.rejected || 0, color: "#ef4444" },
    { name: "Basura", value: activeProcessingMetric?.trash || 0, color: "#f59e0b" }
  ];

  const performanceStatus = useMemo(() => {
    if (!performanceUpdatedAtMs) {
      return {
        label: "Esperando archivo de Staff",
        helper: "Cuando Staff suba archivos veras aqui la ultima publicacion disponible.",
        tone: "border-slate-200 bg-slate-50 text-slate-700",
        stale: false
      };
    }
    const updatedDate = new Date(performanceUpdatedAtMs);
    const minutesSinceUpdate = Math.max(0, Math.floor((now.getTime() - updatedDate.getTime()) / 60000));
    const stale = minutesSinceUpdate > 12 * 60;
    return {
      label: stale ? "Datos por actualizar" : "Datos actualizados",
      helper: stale
        ? `Ultima carga hace ${Math.floor(minutesSinceUpdate / 60)}h ${minutesSinceUpdate % 60}m. Espera la proxima publicacion de Staff.`
        : `Ultima carga ${updatedDate.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}. Se reemplaza con cada archivo nuevo.`,
      tone: stale ? "border-amber-200 bg-amber-50 text-amber-800" : "border-emerald-200 bg-emerald-50 text-emerald-800",
      stale
    };
  }, [now, performanceUpdatedAtMs]);

  const performanceAdvice = useMemo(() => {
    const processingMetric = activeProcessingMetric;
    if (!performance && !processingMetric) return [];
    const advice: string[] = [];
    if (performance?.salesPerHour && performance.salesPerHour > 0 && performance.salesPerHour < 1) advice.push("Venta/hora baja: refuerza llamadas efectivas.");
    if (processingMetric?.averageCheck && processingMetric.averageCheck > 0 && processingMetric.averageCheck < 3.6) advice.push("Cheque bajo: intenta mejorar tratamiento promedio.");
    if (processingMetric && processingMetric.rejected > processingMetric.approvedSales) advice.push("Rechazado alto: revisa calidad antes de cerrar ventas.");
    if (processingMetric?.trash && processingMetric.trash > 0) advice.push("Basura registrada: cuida la gestion para no perder rendimiento.");
    if (!advice.length) advice.push("Vas estable con los indicadores publicados.");
    return advice;
  }, [activeProcessingMetric, performance]);

  function getDayShiftLabel(date: string, isWorkDay: boolean) {
    const record = shiftRecordByDate.get(date);

    if (record?.status === "Abierta") {
      return "En curso";
    }

    if (record) {
      const wasExtra = record.shiftType === "Extras" || !isWorkDay;
      return wasExtra ? `Extra ${record.workedHours}h` : `Trabajo ${record.workedHours}h`;
    }

    return isWorkDay ? "Programado" : "Descanso";
  }

  function getDayShiftClass(date: string, isWorkDay: boolean) {
    const record = shiftRecordByDate.get(date);

    if (record?.status === "Abierta") return "border-amber-300 bg-amber-50";
    if (record?.shiftType === "Extras" || (record && !isWorkDay)) return "border-violet-300 bg-violet-50";
    if (record) return "border-emerald-300 bg-emerald-50";
    if (isWorkDay) return "border-cyan/40 bg-cyan/10";
    return "border-line bg-soft";
  }

  function updateForm(field: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function openModal(type: OperatorCommercialModal) {
    setActiveModal(type);
    setSavedMessage("");
    setSaveComplete(false);
    setSavingRecord(false);
  }

  function closeModal() {
    setActiveModal(null);
    setSavedMessage("");
  }

  async function saveRecord() {
    if (!activeModal) {
      return;
    }

    if (activeModal === "sale" && !form.orderNumber.trim()) {
      setSavedMessage("Completa el numero de pedido para guardar.");
      return;
    }

    const isHiddenRejection = activeModal === "hidden-rejection";
    const recordType: CommercialRecord["type"] = isHiddenRejection ? "rejection" : "sale";
    const normalizedOrder = form.orderNumber.trim().toLowerCase();
    if (normalizedOrder) {
      const existsInCloud = await commercialOrderExists(form.orderNumber);
      if (existsInCloud) {
        setSavedMessage("Ese pedido ya existe en la base central. No se guardo duplicado.");
        return;
      }
      const existingRecords = [...commercialRecords, ...readStoredRecords()];
      const duplicated = existingRecords.find((record) => record.orderNumber?.trim().toLowerCase() === normalizedOrder);
      if (duplicated) {
        setSavedMessage(`Ese pedido ya esta guardado como ${getRecordTypeLabel(duplicated.type)}. No se duplico.`);
        return;
      }
    }

    setSavingRecord(true);
    const records = readStoredRecords();
    const newRecord = {
        id: createRecordId(),
        operatorId: operatorProfile?.id,
        operatorUsername: currentOperatorUsername,
        type: recordType,
        operator: currentOperatorName,
        campaign: form.campaign,
        client: form.client.trim(),
        phone: form.phone.trim(),
        observation: form.observation.trim(),
        status: activeModal === "sale" ? "Pendiente de validar" : isHiddenRejection ? "Rechazo oculto" : "Pendiente",
        createdAt: new Date().toISOString(),
        orderNumber: form.orderNumber.trim(),
        recordDate: form.recordDate,
        product: form.product,
        result: form.result,
      treatment: activeModal === "sale" ? form.treatment : "",
      paymentMethod: activeModal === "sale" ? form.paymentMethod : "",
      communicated: form.communicated,
      thirdCallback: form.thirdCallback,
      hiddenRejectionStatus: isHiddenRejection ? "Pendiente" : undefined
      };
    const nextRecords = [newRecord, ...records];
    writeStoredRecords(nextRecords);
    setCommercialRecords(nextRecords);
    let syncWarning = "";
    try {
      await saveCommercialRecord(newRecord);
    } catch {
      syncWarning = "Guardado en este equipo. Se sincronizara cuando la base central este disponible.";
    }

    setForm({
      client: "",
      phone: "",
      campaign: "Usablue",
      observation: "",
      orderNumber: "",
      recordDate: toDateInputValue(new Date()),
      product: "DEFENOX",
      result: "PENDIENTE",
      treatment: "2+1",
      paymentMethod: "MONEY ORDEN",
      communicated: "No",
      thirdCallback: "No"
    });
    setSavingRecord(false);
    setSaveComplete(true);
    setSavedMessage(syncWarning || `${isHiddenRejection ? "Rechazo oculto" : getRecordTypeLabel(recordType)} guardado correctamente.`);
    window.setTimeout(() => closeModal(), 1600);
  }

  function currentDateValue() {
    return toDateInputValue(new Date());
  }

  function currentTimeValue() {
    return new Date().toTimeString().slice(0, 5);
  }

  function formatTimeFromDate(date: Date) {
    return date.toTimeString().slice(0, 5);
  }

  function shiftLimitDate(record: ShiftRecord) {
    return new Date(shiftStartDate(record).getTime() + maxShiftMilliseconds);
  }

  function shouldAutoCloseShift(record: ShiftRecord) {
    return record.status === "Abierta" && new Date().getTime() >= shiftLimitDate(record).getTime();
  }

  function closeShiftAtLimit(record: ShiftRecord) {
    const limitDate = shiftLimitDate(record);
    const endTime = formatTimeFromDate(limitDate);
    const endedAtIso = limitDate.toISOString();
    const closedRecord: ShiftRecord = {
      ...record,
      endTime,
      endedAtIso,
      breakEvents: (record.breakEvents || []).map((event) => {
        if (event.status !== "Activa") return event;
        const eventStart = eventStartDate(record, event);
        return {
          ...event,
          endTime,
          endedAtIso,
          durationMinutes: Math.max(0, Number(((limitDate.getTime() - eventStart.getTime()) / 60000).toFixed(2))),
          status: "Finalizada" as const
        };
      }),
      pauseEvents: (record.pauseEvents || []).map((event) => {
        if (event.status !== "Activa") return event;
        const eventStart = pauseStartDate(record, event);
        return {
          ...event,
          endTime,
          endedAtIso,
          durationMinutes: Math.max(0, Number(((limitDate.getTime() - eventStart.getTime()) / 60000).toFixed(2))),
          status: "Finalizada" as const
        };
      }),
      status: "Finalizada"
    };

    return {
      ...closedRecord,
      workedHours: calculateWorkedHours(closedRecord, endTime)
    };
  }

  function calculateWorkedHours(record: ShiftRecord, endTime: string) {
    const start = shiftStartDate(record);
    const end = record.endedAtIso ? new Date(record.endedAtIso) : new Date(`${record.date}T${endTime}`);
    const breakMinutes = (record.breakEvents || []).reduce((total, event) => total + (event.durationMinutes || 0), 0);
    const pauseMinutes = (record.pauseEvents || []).reduce((total, event) => total + (event.durationMinutes || 0), 0);
    const rawHours = Math.min(maxShiftMilliseconds / 3600000, Math.max(0, (end.getTime() - start.getTime()) / 3600000));
    const diffHours = Math.max(0, rawHours - breakMinutes / 60 - pauseMinutes / 60 - (record.failureMinutes || 0) / 60);
    return Number(diffHours.toFixed(2));
  }

  function saveShift(nextRecord: ShiftRecord) {
    const records = readStoredShiftRecords();
    const nextRecords = [nextRecord, ...records.filter((record) => record.id !== nextRecord.id)];
    try {
      writeStoredShiftRecords(nextRecords);
    } catch {
      const compactRecords = nextRecords.map((record) => ({
        ...record,
        photoDataUrl: "",
        finalScreenshotDataUrl: ""
      }));
      writeStoredShiftRecords(compactRecords);
    }
    setShiftRecords(nextRecords.filter((record) => record.operator === currentOperatorName));
    saveCloudShiftRecord(nextRecord).catch(() => {
      setShiftMessage("Guardado localmente. La base central se sincronizara cuando este disponible.");
    });
  }

  function startShift() {
    if (activeShift) {
      setStartConfirmOpen(false);
      setShiftMessage("Ya tienes una jornada activa. Continúa desde el panel.");
      return;
    }

    if (todayShiftRecord) {
      setStartConfirmOpen(false);
      setShiftMessage(`Ya registraste entrada hoy a las ${todayShiftRecord.startTime}. No se permite marcar otra entrada el mismo dia.`);
      return;
    }

    if (!shiftForm.hasMouse || !shiftForm.hasKeyboard || !shiftForm.hasDeskReady || !shiftForm.photoName) {
      setStartError("Confirma el equipo y sube el pantallazo inicial de los indicadores diarios.");
      return;
    }

    const record: ShiftRecord = {
      id: crypto.randomUUID(),
      operator: currentOperatorName,
      date: currentDateValue(),
      startTime: currentTimeValue(),
      endTime: "",
      startedAtIso: new Date().toISOString(),
      workedHours: 0,
      shiftType: automaticShiftType,
      workMode: operatorProgram.workMode,
      location: operatorProgram.location,
      workSchedule: operatorProgram.workSchedule,
      hasMouse: true,
      hasKeyboard: true,
      hasDeskReady: true,
      photoName: shiftForm.photoName,
      photoDataUrl: shiftForm.photoDataUrl,
      breakEvents: [],
      pauseEvents: [],
      failureMinutes: 0,
      status: "Abierta"
    };

    setActiveShift(record);
    saveShift(record);
    setStartError("");
    setStartConfirmOpen(false);
    setShiftMessage(`Jornada iniciada a las ${record.startTime}.`);
  }

  function resumeTodayShift() {
    if (!todayShiftRecord) {
      setShiftMessage("No hay una jornada registrada hoy para reanudar.");
      return;
    }

    const resumedRecord: ShiftRecord = {
      ...todayShiftRecord,
      endTime: "",
      endedAtIso: undefined,
      status: "Abierta"
    };

    setActiveShift(resumedRecord);
    setShiftForm((current) => ({
      ...current,
      shiftType: resumedRecord.shiftType,
      hasMouse: resumedRecord.hasMouse,
      hasKeyboard: resumedRecord.hasKeyboard,
      hasDeskReady: resumedRecord.hasDeskReady,
      photoName: resumedRecord.photoName,
      photoDataUrl: resumedRecord.photoDataUrl
    }));
    saveShift(resumedRecord);
    setShiftMessage(`Jornada reanudada. Se conserva la entrada de las ${resumedRecord.startTime}.`);
  }

  function finishShift(
    status: ShiftRecord["status"] = "Finalizada",
    finalEvidence = finishEvidence
  ) {
    if (!activeShift) {
      setShiftMessage("No hay una jornada abierta.");
      return false;
    }

    if (activeFailure || activePauseEvent) {
      setShiftMessage(activeFailure ? "Primero marca la falla como solucionada para poder finalizar la jornada." : "Primero regresa de la pausa para poder finalizar la jornada.");
      return false;
    }

    const requestedEnd = new Date();
    const limitEnd = shiftLimitDate(activeShift);
    const effectiveEnd = requestedEnd.getTime() > limitEnd.getTime() ? limitEnd : requestedEnd;
    const endTime = formatTimeFromDate(effectiveEnd);
    const endedAtIso = effectiveEnd.toISOString();
    const shiftToClose: ShiftRecord = activeBreakEvent
      ? {
          ...activeShift,
          breakEvents: (activeShift.breakEvents || []).map((event) =>
            event.id === activeBreakEvent.id
              ? {
                  ...event,
                  endTime,
                  endedAtIso,
                  durationMinutes: Number(((new Date(endedAtIso).getTime() - eventStartDate(activeShift, event).getTime()) / 60000).toFixed(2)),
                  status: "Finalizada" as const
                }
              : event
          )
        }
      : activeShift;
    const nextRecord: ShiftRecord = {
      ...shiftToClose,
      endTime,
      endedAtIso,
      workedHours: calculateWorkedHours(shiftToClose, endTime),
      finalScreenshotName: finalEvidence.name,
      finalScreenshotDataUrl: finalEvidence.dataUrl,
      status
    };

    setActiveShift(null);
    setActiveFailure(null);
    setFinishConfirmOpen(false);
    setFinishEvidence({ name: "", dataUrl: "" });
    setFinishError("");
    setShiftForm({ shiftType: "Turno normal", hasMouse: false, hasKeyboard: false, hasDeskReady: false, photoName: "", photoDataUrl: "" });
    setShiftMessage(`${status === "Falla reportada" ? "Falla registrada" : "Jornada finalizada"} con ${nextRecord.workedHours} horas.`);
    saveShift(nextRecord);
    return true;
  }

  function confirmFinishShift(event?: React.FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (finishingShift) return;
    if (!finishEvidence.name) {
      setFinishError("Sube el pantallazo final de los indicadores diarios antes de cerrar la jornada.");
      return;
    }
    setFinishingShift(true);
    try {
      const finished = finishShift("Finalizada");
      if (!finished) {
        setFinishingShift(false);
        return;
      }
    } catch {
      setActiveShift(null);
      setActiveFailure(null);
      setFinishConfirmOpen(false);
      setShiftMessage("Jornada finalizada en pantalla. Revisa el historial para confirmar sincronizacion.");
    } finally {
      setFinishingShift(false);
    }
  }

  function updateShiftForm(field: keyof typeof shiftForm, value: string | boolean) {
    setShiftForm((current) => ({ ...current, [field]: value }));
  }

  async function uploadEvidence(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const optimized = await fileToOptimizedDataUrl(file, { maxWidth: 1200, maxHeight: 1200, quality: 0.66 });
      if (optimized.file.size > maxOptimizedUploadBytes) {
        setStartError(heavyFileMessage);
        return;
      }
      setStartError("");
      setShiftForm((current) => ({
        ...current,
        photoName: optimized.name,
        photoDataUrl: optimized.dataUrl
      }));
    } catch {
      setStartError("No fue posible procesar la imagen. Intenta con otro pantallazo.");
    } finally {
      event.target.value = "";
    }
  }

  async function uploadFailureEvidence(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const optimized = await fileToOptimizedDataUrl(file, { maxWidth: 1200, maxHeight: 1200, quality: 0.66 });
      if (optimized.file.size > maxOptimizedUploadBytes) {
        setShiftMessage(heavyFileMessage);
        return;
      }
      setFailureForm((current) => ({
        ...current,
        evidenceName: optimized.name,
        evidenceDataUrl: optimized.dataUrl
      }));
    } catch {
      setShiftMessage("No fue posible procesar el pantallazo de falla. Intenta con otra imagen.");
    } finally {
      event.target.value = "";
    }
  }

  async function uploadFinishEvidence(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const optimized = await fileToOptimizedDataUrl(file, { maxWidth: 1200, maxHeight: 1200, quality: 0.66 });
      if (optimized.file.size > maxOptimizedUploadBytes) {
        setFinishError(heavyFileMessage);
        return;
      }
      const evidence = {
        name: optimized.name,
        dataUrl: optimized.dataUrl
      };
      setFinishError("");
      setFinishEvidence(evidence);
      setFinishingShift(true);
      const finished = finishShift("Finalizada", evidence);
      setFinishingShift(false);
      if (finished) {
        setShiftMessage("Pantallazo final guardado. La jornada quedo finalizada automaticamente.");
      }
    } catch {
      setFinishError("No fue posible procesar el pantallazo final. Intenta con otra imagen.");
    } finally {
      event.target.value = "";
    }
  }

  function saveFailure(nextRecord: FailureRecord) {
    const records = readStoredFailureRecords();
    const nextRecords = [
      nextRecord,
      ...records
        .filter((record) => record.id !== nextRecord.id)
        .map((record) =>
          nextRecord.status === "Solucionada" &&
          record.operator === nextRecord.operator &&
          record.status === "Abierta"
            ? {
                ...record,
                endTime: nextRecord.endTime,
                endedAtIso: nextRecord.endedAtIso,
                durationMinutes: nextRecord.durationMinutes,
                status: "Solucionada" as const
              }
            : record
        )
    ];
    try {
      writeStoredFailureRecords(nextRecords);
    } catch {
      writeStoredFailureRecords(nextRecords.map((record) => ({ ...record, evidenceDataUrl: "" })));
    }
    const savePromise = saveCloudFailureRecord(nextRecord, nextRecord.shiftRecordId || activeShift?.id).catch(() => {
      setShiftMessage("Falla guardada localmente. La base central se sincronizara cuando este disponible.");
    });
    if (nextRecord.status === "Solucionada") {
      return Promise.all([savePromise, closeCloudOpenFailureRecords(nextRecord).catch(() => {
        setShiftMessage("Falla cerrada en pantalla. Si la base tarda, se mantiene guardada localmente.");
      })]);
    }
    return savePromise;
  }

  function startRest(type: ShiftBreakEventType) {
    if (!activeShift) {
      setShiftMessage("Debes iniciar jornada antes de salir a descanso.");
      return;
    }

    if (activeFailure || activePauseEvent) {
      setShiftMessage(activeFailure ? "No puedes iniciar descanso mientras tienes una falla activa." : "Primero regresa de la pausa para iniciar un descanso.");
      return;
    }

    if (activeFailure) {
      setShiftMessage("No puedes iniciar descanso mientras tienes una falla activa.");
      return;
    }

    if (activeBreakEvent) {
      setShiftMessage(`Ya tienes ${activeBreakEvent.type.toLowerCase()} activo.`);
      return;
    }

    const nextEvent: ShiftBreakEvent = {
      id: crypto.randomUUID(),
      type,
      startTime: currentTimeValue(),
      endTime: "",
      startedAtIso: new Date().toISOString(),
      durationMinutes: 0,
      status: "Activa"
    };
    const nextShift = {
      ...activeShift,
      breakEvents: [...(activeShift.breakEvents || []), nextEvent]
    };
    setActiveShift(nextShift);
    saveShift(nextShift);
    setShiftMessage(`${type} iniciado a las ${nextEvent.startTime}.`);
  }

  function finishRest() {
    if (!activeShift || !activeBreakEvent) {
      setShiftMessage("No hay descanso activo.");
      return;
    }

    const endTime = currentTimeValue();
    const endedAtIso = new Date().toISOString();
    const durationMinutes = Number(((new Date(endedAtIso).getTime() - eventStartDate(activeShift, activeBreakEvent).getTime()) / 60000).toFixed(2));
    const nextShift = {
      ...activeShift,
      breakEvents: (activeShift.breakEvents || []).map((event) =>
        event.id === activeBreakEvent.id
          ? { ...event, endTime, endedAtIso, durationMinutes, status: "Finalizada" as const }
          : event
      )
    };

    setActiveShift(nextShift);
    saveShift(nextShift);
    setShiftMessage(`${activeBreakEvent.type} finalizado. Duracion: ${formatMinutes(durationMinutes)}.`);
  }

  function startPause() {
    if (!activeShift) {
      setShiftMessage("Debes iniciar jornada antes de pausar.");
      return;
    }
    if (activeFailure || activeBreakEvent) {
      setShiftMessage(activeFailure ? "Primero soluciona la falla activa." : "Primero regresa del descanso activo.");
      return;
    }
    if (activePauseEvent) {
      setShiftMessage("Ya tienes una pausa activa.");
      return;
    }

    const nextEvent: ShiftPauseEvent = {
      id: crypto.randomUUID(),
      reason: "Pausa",
      startTime: currentTimeValue(),
      endTime: "",
      startedAtIso: new Date().toISOString(),
      durationMinutes: 0,
      status: "Activa"
    };
    const nextShift = {
      ...activeShift,
      pauseEvents: [...(activeShift.pauseEvents || []), nextEvent]
    };
    setActiveShift(nextShift);
    saveShift(nextShift);
    setShiftMessage(`Pausa iniciada a las ${nextEvent.startTime}. El contador de trabajo se reanudara al regresar.`);
  }

  function finishPause() {
    if (!activeShift || !activePauseEvent) {
      setShiftMessage("No hay pausa activa.");
      return;
    }

    const endTime = currentTimeValue();
    const endedAtIso = new Date().toISOString();
    const durationMinutes = Number(((new Date(endedAtIso).getTime() - pauseStartDate(activeShift, activePauseEvent).getTime()) / 60000).toFixed(2));
    const nextShift = {
      ...activeShift,
      pauseEvents: (activeShift.pauseEvents || []).map((event) =>
        event.id === activePauseEvent.id
          ? { ...event, endTime, endedAtIso, durationMinutes, status: "Finalizada" as const }
          : event
      )
    };

    setActiveShift(nextShift);
    saveShift(nextShift);
    setShiftMessage(`Pausa finalizada. Duracion: ${formatMinutes(durationMinutes)}.`);
  }

  function startFailure() {
    if (!activeShift) {
      setShiftMessage("Debes iniciar jornada antes de reportar una falla.");
      return;
    }

    if (activeBreakEvent || activePauseEvent) {
      setFailureError(activeBreakEvent ? "Primero regresa del descanso activo." : "Primero regresa de la pausa activa.");
      return;
    }

    if (!failureForm.explanation.trim()) {
      setFailureError("Describe brevemente qué sucede.");
      return;
    }

    const record: FailureRecord = {
      id: crypto.randomUUID(),
      shiftRecordId: activeShift.id,
      operator: currentOperatorName,
      date: currentDateValue(),
      startTime: currentTimeValue(),
      endTime: "",
      startedAtIso: new Date().toISOString(),
      durationMinutes: 0,
      explanation: failureForm.explanation.trim(),
      evidenceName: failureForm.evidenceName,
      evidenceDataUrl: failureForm.evidenceDataUrl,
      status: "Abierta"
    };

    setActiveFailure(record);
    saveFailure(record);
    setFailureError("");
    setShiftMessage(`Falla iniciada a las ${record.startTime}.`);
  }

  async function finishFailure() {
    if (!activeFailure) {
      setShiftMessage("No hay falla abierta.");
      return;
    }

    const end = new Date();
    const endTime = currentTimeValue();
    const start = activeFailure.startedAtIso ? new Date(activeFailure.startedAtIso) : buildTimerDate(activeFailure.date, activeFailure.startTime);
    const durationMinutes = Math.max(0, Number(((end.getTime() - start.getTime()) / 60000).toFixed(2)));
    const nextRecord: FailureRecord = {
      ...activeFailure,
      endTime,
      endedAtIso: end.toISOString(),
      durationMinutes,
      status: "Solucionada"
    };

    const nextShift = activeShift
      ? {
          ...activeShift,
          failureMinutes: (activeShift.failureMinutes || 0) + durationMinutes
        }
      : null;

    setActiveFailure(null);
    setFailureForm({ explanation: "", evidenceName: "", evidenceDataUrl: "" });
    setFailureModalOpen(false);
    setShiftMessage(`Falla solucionada y guardada. Duracion: ${formatMinutes(durationMinutes)}.`);

    if (nextShift) {
      setActiveShift(nextShift);
      saveShift(nextShift);
    }
    await saveFailure(nextRecord);
  }

  return (
    <AppLayout role="operator" title="Panel de operador">
      <section className="dashboard-enter card mb-3 flex flex-wrap items-center justify-between gap-3 p-3">
        <div className="flex rounded-md bg-soft p-1">
          <button className={`rounded px-4 py-2 text-sm font-bold ${metricPeriod === "day" ? "bg-white text-brand-700 shadow-sm" : "text-muted"}`} onClick={() => setMetricPeriod("day")}>Día</button>
          <button className={`rounded px-4 py-2 text-sm font-bold ${metricPeriod === "month" ? "bg-white text-brand-700 shadow-sm" : "text-muted"}`} onClick={() => setMetricPeriod("month")}>Mes</button>
        </div>
        {metricPeriod === "day" ? <DayNavigator value={metricDate} onChange={setMetricDate} /> : <MonthNavigator value={metricDate.slice(0, 7)} onChange={(value) => setMetricDate(`${value}-01`)} />}
      </section>

      {showBreakNotice ? (
        <section className="schedule-notice mb-3 overflow-hidden rounded-md border border-cyan/40 bg-cyan/10">
          <div className="flex flex-wrap items-center justify-between gap-3 p-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="schedule-notice-icon grid h-10 w-10 shrink-0 place-items-center rounded-md bg-white text-brand-700">
                <Coffee size={20} />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-black text-ink">Staff publico tus descansos de hoy</p>
                <p className="truncate text-sm font-semibold text-brand-800">
                  {[["Break", operatorBreaks.breakOne], ["Almuerzo", operatorBreaks.lunch], ["Break opcional", operatorBreaks.breakTwo]]
                    .filter(([, value]) => value !== "Pendiente")
                    .map(([label, value]) => `${label} ${value}`)
                    .join(" · ")}
                </p>
              </div>
            </div>
            <button className="btn-secondary py-2" onClick={dismissBreakNotice}>
              Entendido
            </button>
          </div>
          <div className="h-1 animate-pulse bg-cyan" />
        </section>
      ) : null}

      <section className="dashboard-card-grid grid gap-3 sm:grid-cols-3">
        <div className="dashboard-card relative overflow-hidden rounded-md border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-4 shadow-sm">
          <span className="dashboard-sheen" />
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-wide text-emerald-700">Ventas del {metricPeriod === "day" ? "dia" : "mes"}</p>
              <p className="mt-2 text-4xl font-black text-emerald-700">{selectedCommercialSummary.sales}</p>
            </div>
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-md bg-emerald-100 text-emerald-700">
              <TrendingUp size={22} />
            </span>
          </div>
          <div className="mt-3 flex items-center justify-between gap-2 rounded-md bg-white/75 px-3 py-2 text-xs font-bold text-emerald-800">
            <span>{metricPeriod === "day" ? "Fecha seleccionada" : "Mes seleccionado"}</span>
            <span className="rounded-full bg-emerald-100 px-2 py-1">Activo</span>
          </div>
        </div>
        <div className="dashboard-card relative overflow-hidden rounded-md border border-red-200 bg-gradient-to-br from-red-50 to-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-wide text-red-700">Rechazos ocultos del {metricPeriod === "day" ? "dia" : "mes"}</p>
              <p className="mt-2 text-4xl font-black text-red-700">{selectedCommercialSummary.hiddenRejections}</p>
            </div>
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-md bg-red-100 text-red-700">
              <AlertTriangle size={22} />
            </span>
          </div>
          <div className="mt-3 flex items-center justify-between gap-2 rounded-md bg-white/75 px-3 py-2 text-xs font-bold text-red-800">
            <span>{selectedCommercialSummary.hiddenRejections ? "Requiere revision" : "Sin casos reportados"}</span>
            <span className="rounded-full bg-red-100 px-2 py-1">Control</span>
          </div>
        </div>
        <div className={`dashboard-card relative overflow-hidden rounded-md border p-4 shadow-sm ${activeShift ? "dashboard-live" : ""} ${
          activeFailure
            ? "border-red-200 bg-gradient-to-br from-red-50 to-white"
            : activePauseEvent
              ? "border-amber-200 bg-gradient-to-br from-amber-50 to-white"
              : activeShift
                ? "border-sky-200 bg-gradient-to-br from-sky-50 to-white"
                : "border-slate-200 bg-gradient-to-br from-slate-50 to-white"
        }`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className={`text-xs font-black uppercase tracking-wide ${activeFailure ? "text-red-700" : activePauseEvent ? "text-amber-700" : activeShift ? "text-sky-700" : "text-slate-600"}`}>Jornada</p>
              <p className="mt-2 text-4xl font-black text-ink">{elapsedTime.slice(0, 5)}</p>
            </div>
            <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-md ${
              activeFailure
                ? "bg-red-100 text-red-700"
                : activePauseEvent
                  ? "bg-amber-100 text-amber-700"
                  : activeShift
                    ? "bg-sky-100 text-sky-700"
                    : "bg-slate-100 text-slate-600"
            }`}>
              <Timer size={22} />
            </span>
          </div>
          <div className="mt-3 flex items-center justify-between gap-2 rounded-md bg-white/75 px-3 py-2 text-xs font-bold text-slate-700">
            <span>{activeFailure ? "Falla activa" : activePauseEvent ? "Pausa activa" : activeShift ? activeShift.shiftType : "Sin iniciar"}</span>
            <span className="rounded-full bg-slate-100 px-2 py-1">{activeShift ? "En curso" : "Pendiente"}</span>
          </div>
        </div>
      </section>

      <section id="ventas" className="mt-5 card p-4">
        <div className="grid gap-3 md:grid-cols-2">
          <button className="btn-primary justify-center" onClick={() => openModal("sale")}>
            <Plus size={16} />
            Subir venta
          </button>
          <button
            className="inline-flex items-center justify-center gap-2 rounded-md bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700"
            onClick={() => openModal("hidden-rejection")}
          >
            Rechazo oculto
          </button>
        </div>
      </section>

      {showPerformancePanel ? (
      <section className="dashboard-enter mt-5 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
        <div className="flex flex-col gap-4 border-b border-line px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-2">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-brand-50 text-brand-700"><Gauge size={20} /></span>
            <div>
              <p className="text-[11px] font-black uppercase text-brand-700">Control del turno</p>
              <h2 className="text-lg font-black text-ink">Mi rendimiento de hoy</h2>
              <p className="text-xs text-muted">Tres lecturas independientes para saber que mantener y que corregir.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <div className="flex items-center gap-1 rounded-md bg-soft p-1">
              <span className="px-2 text-[11px] font-black uppercase text-muted">Procesando</span>
              <button className={`rounded px-3 py-1 text-xs font-black ${processingScope === "day" ? "bg-white text-brand-700 shadow-sm" : "text-muted"}`} onClick={() => setProcessingScope("day")}>
                Dia
              </button>
              <button className={`rounded px-3 py-1 text-xs font-black ${processingScope === "month" ? "bg-white text-brand-700 shadow-sm" : "text-muted"}`} onClick={() => setProcessingScope("month")}>
                Mes
              </button>
            </div>
            <span className="rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-black text-brand-700">
              Publicacion {visiblePerformanceDate}
            </span>
            <span className={`rounded-full border px-3 py-1 text-xs font-bold ${performanceStatus.tone}`}>{performanceStatus.label}</span>
          </div>
        </div>
        <div className={`flex items-center gap-2 border-b border-line px-5 py-2.5 text-sm font-semibold ${performanceStatus.tone}`}>
          <span className={`h-2 w-2 shrink-0 rounded-full ${performanceStatus.stale ? "bg-amber-500" : "bg-emerald-500"}`} />
          {performanceStatus.helper}
        </div>
        <div className="dashboard-card-grid grid gap-4 bg-slate-50/70 p-4 xl:grid-cols-3">
          <article className={`dashboard-card flex min-h-[380px] flex-col overflow-hidden rounded-lg border bg-white shadow-sm ${activeProcessingMetric?.processingFile ? "border-emerald-200" : "border-slate-200"}`}>
            <div className="flex items-start justify-between gap-3 border-b border-line p-4">
              <div className="flex items-start gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-md bg-brand-50 text-brand-700">
                  <CheckCircle2 size={22} />
                </span>
                <div>
                  <p className="text-xs font-black uppercase text-brand-700">1. Procesando</p>
                  <h3 className="mt-1 text-lg font-black text-ink">Ventas y calidad {processingScope === "month" ? "del mes" : "del dia"}</h3>
                  {activeProcessingMetric?.processingFile ? <p className="mt-1 text-xs font-semibold text-muted">Publicado {formatPublicationTime(activeProcessingMetric.updatedAt)}</p> : null}
                </div>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${activeProcessingMetric?.processingFile ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
                {activeProcessingMetric?.processingFile ? "Cargado" : "Pendiente"}
              </span>
            </div>
            {activeProcessingMetric?.processingFile ? (
              <div className="flex-1 p-4">
                <div className="grid items-center gap-3 sm:grid-cols-[180px_1fr]">
                  <div className="relative h-44">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={processingChartData} dataKey="value" nameKey="name" innerRadius={49} outerRadius={76} paddingAngle={2} stroke="none" animationDuration={900}>
                          {processingChartData.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
                        </Pie>
                        <Tooltip formatter={(value, name) => [Number(value), String(name)]} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
                      <div><p className="text-3xl font-black text-ink">{processingCaseTotal}</p><p className="text-[10px] font-black uppercase text-muted">Casos</p></div>
                    </div>
                  </div>
                  <div className="grid gap-2">
                    {processingChartData.map((item) => (
                      <div key={item.name} className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2">
                        <span className="flex items-center gap-2 text-xs font-black text-muted"><i className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />{item.name}</span>
                        <strong className="text-lg text-ink">{item.value}</strong>
                      </div>
                    ))}
                    <div className="flex items-center justify-between rounded-md bg-brand-50 px-3 py-2"><span className="text-xs font-black uppercase text-brand-700">Cheque</span><strong className="text-xl text-brand-700">{activeProcessingMetric.averageCheck.toFixed(2)}</strong></div>
                  </div>
                </div>
                <p className="mt-2 text-center text-xs font-bold text-muted">{processingApprovalRate.toFixed(0)}% aprobado · distribucion real del archivo</p>
                <p className={`mt-3 rounded-md px-3 py-2 text-xs font-semibold ${activeProcessingMetric.averageCheck >= 3.6 ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>
                  {activeProcessingMetric.averageCheck >= 3.6 ? "Cheque dentro de la meta." : "Atencion: cheque por debajo de 3.60."}
                </p>
              </div>
            ) : (
              <p className="m-4 rounded-md bg-slate-50 p-4 text-sm text-muted">Falta que Staff suba el archivo Procesando {processingScope === "month" ? "del mes" : "del dia"}.</p>
            )}
          </article>

          <article className={`dashboard-card flex min-h-[380px] flex-col overflow-hidden rounded-lg border bg-white shadow-sm ${performance?.hourlyFile ? "border-emerald-200" : "border-slate-200"}`}>
            <div className="flex items-start justify-between gap-3 border-b border-line p-4">
              <div className="flex items-start gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-md bg-sky-50 text-sky-700">
                  <TrendingUp size={22} />
                </span>
                <div>
                  <p className="text-xs font-black uppercase text-brand-700">2. Venta por hora</p>
                  <h3 className="mt-1 text-lg font-black text-ink">Ventas por hora</h3>
                  {performance?.hourlyFile ? <p className="mt-1 text-xs font-semibold text-muted">Publicado {formatPublicationTime(performance.updatedAt)}</p> : null}
                </div>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${performance?.hourlyFile ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
                {performance?.hourlyFile ? "Cargado" : "Pendiente"}
              </span>
            </div>
            {performance?.hourlyFile ? (
              <div className="flex-1 p-4">
                <div className={`rounded-md border p-4 ${hourlyDifference >= 0 ? "border-emerald-200 bg-emerald-50/70" : "border-red-200 bg-red-50/70"}`}>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-black uppercase text-muted">Tu promedio actual</p>
                      <p className={`mt-1 text-5xl font-black ${hourlyDifference >= 0 ? "text-emerald-700" : "text-red-700"}`}>{performance.salesPerHour.toFixed(2)}</p>
                      <p className="text-sm font-bold text-ink">ventas por hora</p>
                    </div>
                    <span className={`rounded-full px-3 py-1.5 text-xs font-black ${hourlyDifference >= 0 ? "bg-emerald-600 text-white" : "bg-red-600 text-white"}`}>
                      {hourlyDifference >= 0 ? "Meta cumplida" : "Bajo la meta"}
                    </span>
                  </div>
                  <div className="mt-5">
                    <div className="flex items-center justify-between text-xs font-black"><span className="text-muted">0</span><span className="text-brand-700">META 1.00</span></div>
                    <div className="mt-2 h-3 overflow-hidden rounded-full bg-white"><div className={`h-full rounded-full transition-all duration-700 ${hourlyDifference >= 0 ? "bg-emerald-500" : "bg-red-500"}`} style={{ width: `${hourlyGoalProgress}%` }} /></div>
                  </div>
                  <p className={`mt-4 rounded-md bg-white px-3 py-2 text-sm font-bold ${hourlyDifference >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                    {hourlyDifference >= 0 ? `Vas ${hourlyDifference.toFixed(2)} por encima de la meta.` : `Te faltan ${Math.abs(hourlyDifference).toFixed(2)} ventas por hora para cumplir.`}
                  </p>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div className="rounded-md bg-slate-50 p-3"><p className="text-xs font-bold uppercase text-muted">Tiempo lista</p><p className="font-black text-ink">{formatMinutes(performance.listMinutes)}</p></div>
                  <div className="rounded-md bg-slate-50 p-3"><p className="text-xs font-bold uppercase text-muted">Total</p><p className="font-black text-ink">{performance.totalOrders}</p></div>
                </div>
              </div>
            ) : (
              <p className="m-4 rounded-md bg-slate-50 p-4 text-sm text-muted">Falta que Staff suba Venta por hora.</p>
            )}
          </article>

          <article className={`dashboard-card flex min-h-[380px] flex-col overflow-hidden rounded-lg border bg-white shadow-sm ${activeSummary ? (approvedGoalOk ? "border-emerald-200" : approvedMinimumOk ? "border-amber-200" : "border-red-200") : "border-slate-200"}`}>
            <div className="flex items-start justify-between gap-3 border-b border-line p-4">
              <div className="flex items-start gap-3">
                <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-md ${activeSummary ? (approvedGoalOk ? "bg-emerald-50 text-emerald-700" : approvedMinimumOk ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700") : "bg-slate-100 text-slate-600"}`}>
                  <Gauge size={22} />
                </span>
                <div>
                  <p className="text-xs font-black uppercase text-brand-700">3. Aprobado general</p>
                  <h3 className="mt-1 text-lg font-black text-ink">Resultado general del turno</h3>
                  {activeSummary ? (
                    <p className="mt-1 text-xs font-semibold text-muted">
                      Datos del {new Date(`${activeSummary.metricDate}T12:00:00`).toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" })} · Publicado {formatPublicationTime(activeSummary.updatedAt)}
                    </p>
                  ) : null}
                </div>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${activeSummary ? (approvedGoalOk ? "bg-emerald-100 text-emerald-700" : approvedMinimumOk ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700") : "bg-slate-100 text-slate-600"}`}>
                {activeSummary ? approvedStatusLabel : "Pendiente"}
              </span>
            </div>
            {activeSummary ? (
              <div className="flex-1 p-4">
                <div className={`rounded-md border p-4 ${approvedGoalOk ? "border-emerald-200 bg-emerald-50/70" : approvedMinimumOk ? "border-amber-200 bg-amber-50/70" : "border-red-200 bg-red-50/70"}`}>
                  <p className="text-xs font-black uppercase text-muted">Aprobado de toda la operacion</p>
                  <div className="mt-2 flex items-end justify-between gap-3">
                    <p className={`text-5xl font-black ${approvedGoalOk ? "text-emerald-700" : approvedMinimumOk ? "text-amber-700" : "text-red-700"}`}>{approvedRate.toFixed(1)}%</p>
                    <span className={`rounded-full px-3 py-1.5 text-xs font-black ${approvedGoalOk ? "bg-emerald-600 text-white" : approvedMinimumOk ? "bg-amber-500 text-amber-950" : "bg-red-600 text-white"}`}>{approvedStatusLabel}</span>
                  </div>
                  <div className="mt-5">
                    <div className="relative h-4 overflow-hidden rounded-full bg-white">
                      <div className={`h-full rounded-full transition-all duration-700 ${approvedGoalOk ? "bg-emerald-500" : approvedMinimumOk ? "bg-amber-400" : "bg-red-500"}`} style={{ width: `${Math.min(100, (approvedRate / approvedGoalRate) * 100)}%` }} />
                    </div>
                    <div className="mt-2 flex justify-between text-[11px] font-black"><span className="text-muted">0%</span><span className="text-amber-700">MINIMO 19%</span><span className="text-emerald-700">META 21%</span></div>
                  </div>
                  <p className={`mt-4 rounded-md bg-white px-3 py-2 text-sm font-bold ${approvedGoalOk ? "text-emerald-700" : approvedMinimumOk ? "text-amber-700" : "text-red-700"}`}>
                    {approvedGoalOk ? `Superamos la meta por ${(approvedRate - approvedGoalRate).toFixed(1)} puntos.` : approvedMinimumOk ? `Cumplimos el minimo. Faltan ${(approvedGoalRate - approvedRate).toFixed(1)} puntos para la meta.` : `Faltan ${(approvedMinimumRate - approvedRate).toFixed(1)} puntos para alcanzar el minimo.`}
                  </p>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <div className="rounded-md bg-slate-50 p-3"><p className="text-xs font-bold uppercase text-muted">Total</p><p className="text-xl font-black text-ink">{activeSummary.totalOrders}</p></div>
                  <div className="rounded-md bg-emerald-50 p-3"><p className="text-xs font-bold uppercase text-emerald-700">Aprobado</p><p className="text-xl font-black text-emerald-700">{activeSummary.approvedSales}</p></div>
                  <div className="rounded-md bg-red-50 p-3"><p className="text-xs font-bold uppercase text-red-700">Rechazo</p><p className="text-xl font-black text-red-700">{activeSummary.rejected}</p></div>
                </div>
              </div>
            ) : (
              <div className="m-4 grid flex-1 place-items-center rounded-md border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
                <div>
                  <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-white text-slate-400 shadow-sm"><Gauge size={22} /></span>
                  <p className="mt-3 font-bold text-slate-700">Sin cierre general publicado</p>
                  <p className="mt-1 max-w-[270px] text-sm text-muted">Este panel permanece vacio desde las 6:00 a. m. hasta que Staff publique el cierre general del turno.</p>
                </div>
              </div>
            )}
          </article>
        </div>
        {(performance || activeSummary) ? (
          <div className="border-t border-line bg-white px-4 py-3">
            <p className="text-xs font-bold uppercase text-muted">Que hacer ahora</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {performanceAdvice.map((item) => (
                <span key={item} className="rounded-full bg-soft px-3 py-1.5 text-xs font-semibold text-ink">{item}</span>
              ))}
              {activeSummary && approvedRate < approvedMinimumRate ? (
                <span className="rounded-full bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700">Operacion bajo {approvedMinimumRate}%: cuida calidad y aprobacion.</span>
              ) : null}
            </div>
          </div>
        ) : null}
      </section>
      ) : null}

      <section id="jornada" className="dashboard-enter mt-6">
        <div className="overflow-hidden rounded-lg border border-line bg-white shadow-sm">
          <div className="grid gap-3 p-4 xl:grid-cols-[1.15fr_1fr]">
            <div className="space-y-3">
              <div className={`dashboard-card relative overflow-hidden rounded-lg border p-4 ${activeShift ? "dashboard-live" : ""} ${activeFailure ? "border-red-200 bg-gradient-to-br from-red-50 to-white" : activePauseEvent ? "border-amber-200 bg-gradient-to-br from-amber-50 to-white" : activeShift ? "border-emerald-200 bg-gradient-to-br from-emerald-50 to-white" : "border-brand-100 bg-gradient-to-br from-brand-50 to-white"}`}>
                <div className={`absolute inset-x-0 top-0 h-1 ${activeFailure ? "bg-red-500" : activePauseEvent ? "bg-amber-500" : activeShift ? "bg-emerald-500" : "bg-brand-500"}`} />
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`h-2.5 w-2.5 rounded-full ${activeFailure ? "animate-pulse bg-red-500" : activePauseEvent ? "animate-pulse bg-amber-500" : activeShift ? "animate-pulse bg-emerald-500" : "bg-slate-400"}`} />
                      <p className="text-xs font-black uppercase tracking-wide text-muted">Estado: {activeFailure ? "Falla activa" : activePauseEvent ? "Pausa activa" : activeShift ? "Jornada activa" : todayShiftRecord ? "Entrada registrada hoy" : "Jornada sin iniciar"}</p>
                    </div>
                    <div className="mt-2 flex flex-wrap items-end gap-x-4 gap-y-1">
                      <h2 className="font-mono text-4xl font-black leading-none tabular-nums text-ink sm:text-5xl">{elapsedTime}</h2>
                      <div className="pb-1">
                        <p className="text-sm font-black uppercase text-ink">Tiempo transcurrido</p>
                        <p className="mt-0.5 text-xs font-semibold text-muted">
                          {activeShift ? `Ingreso: ${activeShift.date} ${activeShift.startTime}` : todayShiftRecord ? `Ingreso registrado: ${todayShiftRecord.date} ${todayShiftRecord.startTime}` : "Sin jornada abierta"}
                        </p>
                      </div>
                    </div>
                  </div>
                  <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-full bg-white shadow-sm ${activeFailure ? "text-red-600" : activePauseEvent ? "text-amber-700" : activeShift ? "text-emerald-600" : "text-brand-600"}`}>
                    {activeFailure ? <WifiOff size={24} /> : activePauseEvent ? <Coffee size={24} /> : activeShift ? <ShieldCheck size={26} /> : <Clock size={26} />}
                  </span>
                </div>
              </div>

              <div className="overflow-hidden rounded-lg border border-line">
                <div className="border-b border-line bg-slate-50 px-4 py-2">
                  <p className="text-xs font-black uppercase tracking-wide text-muted">Resumen del turno</p>
                </div>
                <div className="grid sm:grid-cols-3">
                  <div className="border-b border-line p-4 sm:border-b-0 sm:border-r">
                    <p className="text-xs font-bold uppercase text-muted">Hoy</p>
                    <p className="mt-1 text-xl font-black text-ink">{todaySchedule?.isWorkDay ? "Dia programado" : "Dia de descanso"}</p>
                  </div>
                  <div className="border-b border-line p-4 sm:border-b-0 sm:border-r">
                    <p className="text-xs font-bold uppercase text-muted">Registro</p>
                    <p className="mt-1 text-xl font-black text-ink">{automaticShiftType}</p>
                  </div>
                  <div className="p-4">
                    <p className="text-xs font-bold uppercase text-muted">Modalidad</p>
                    <p className="mt-1 text-xl font-black text-ink">{operatorProgram.workMode} · {operatorProgram.workSchedule}</p>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200">
                      <div className="h-full w-2/3 rounded-full bg-gradient-to-r from-emerald-500 via-cyan to-brand-600" />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              {activeShift ? (
                <div className="dashboard-card-grid grid gap-3 sm:grid-cols-2">
                  <div className="dashboard-card relative overflow-hidden rounded-lg border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-100 p-4">
                    <Coffee className="absolute right-4 top-4 text-amber-800/70" size={32} />
                    <p className="text-xs font-black uppercase text-amber-900">Break tomado</p>
                    <p className="mt-2 font-mono text-3xl font-black text-ink">{formatMinutes(restSummary.breaks)}</p>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/70">
                      <div className="dashboard-progress h-full rounded-full bg-amber-600" style={{ width: `${Math.min(100, (restSummary.breaks / 20) * 100)}%` }} />
                    </div>
                    <p className="mt-2 text-xs font-semibold text-amber-900">Tiempo guia: 20 min por break</p>
                  </div>
                  <div className="dashboard-card relative overflow-hidden rounded-lg border border-cyan/40 bg-gradient-to-br from-cyan/10 to-sky-100 p-4">
                    <CalendarDays className="absolute right-4 top-4 text-brand-700/70" size={32} />
                    <p className="text-xs font-black uppercase text-brand-700">Almuerzo tomado</p>
                    <p className="mt-2 font-mono text-3xl font-black text-ink">{formatMinutes(restSummary.lunch)}</p>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/80">
                      <div className="dashboard-progress h-full rounded-full bg-cyan" style={{ width: `${Math.min(100, (restSummary.lunch / 45) * 100)}%` }} />
                    </div>
                    <p className="mt-2 text-xs font-semibold text-brand-700">Tiempo guia: 45 min</p>
                  </div>
                  <div className="dashboard-card relative overflow-hidden rounded-lg border border-teal-200 bg-gradient-to-br from-teal-50 to-cyan/10 p-4">
                    <Timer className="absolute right-4 top-4 text-teal-700/70" size={32} />
                    <p className="text-xs font-black uppercase text-teal-800">Pausas adicionales</p>
                    <p className="mt-2 font-mono text-3xl font-black text-ink">{formatMinutes(restSummary.pauses)}</p>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/80">
                      <div className="dashboard-progress h-full rounded-full bg-teal-600" style={{ width: `${Math.min(100, (restSummary.pauses / 30) * 100)}%` }} />
                    </div>
                    <p className="mt-2 text-xs font-semibold text-teal-800">Cafe, bano u otro motivo</p>
                  </div>
                  <div className="dashboard-card relative overflow-hidden rounded-lg border border-red-200 bg-gradient-to-br from-red-50 to-rose-100 p-4">
                    <AlertTriangle className="absolute right-4 top-4 text-red-700/70" size={32} />
                    <p className="text-xs font-black uppercase text-red-700">Fallas reportadas</p>
                    <p className="mt-2 font-mono text-3xl font-black text-red-700">{formatMinutes(restSummary.failures)}</p>
                    <p className="mt-7 text-xs font-semibold text-red-700">Se guarda dentro del turno</p>
                  </div>
                </div>
              ) : (
                <div className="grid h-full min-h-40 place-items-center rounded-lg border border-dashed border-line bg-slate-50 p-6 text-center">
                  <div>
                    <Clock className="mx-auto text-brand-600" size={32} />
                    <p className="mt-2 text-sm font-black text-ink">Aun no hay jornada activa</p>
                    <p className="mt-1 text-xs text-muted">Inicia o reanuda para ver descansos, pausas y fallas.</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {activeFailure ? (
            <div className="mx-4 mb-3 overflow-hidden rounded-md border border-red-200 bg-red-50">
              <div className="h-1 animate-pulse bg-red-500" />
              <div className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <p className="text-xs font-bold uppercase text-red-700">Falla en curso</p>
                  <p className="mt-1 text-sm text-red-700">No finalices jornada hasta marcarla como solucionada.</p>
                </div>
                <div className="text-right">
                  <p className="text-3xl font-black tabular-nums text-red-700">{failureElapsedTime}</p>
                  <p className="text-xs font-semibold text-red-700">tiempo acumulando</p>
                </div>
              </div>
            </div>
          ) : activePauseEvent ? (
            <div className="mx-4 mb-3 overflow-hidden rounded-md border border-amber-200 bg-amber-50">
              <div className="h-1 animate-pulse bg-amber-500" />
              <div className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <p className="text-xs font-bold uppercase text-amber-800">Pausa en curso</p>
                  <p className="mt-1 text-sm text-muted">{activePauseEvent.reason}{activePauseEvent.detail ? ` - ${activePauseEvent.detail}` : ""}</p>
                </div>
                <div className="text-right">
                  <p className="text-3xl font-black tabular-nums text-ink">{pauseElapsedTime}</p>
                  <p className="text-xs font-semibold text-muted">contador en vivo</p>
                </div>
              </div>
            </div>
          ) : activeBreakEvent ? (
            <div className={`mx-4 mb-3 overflow-hidden rounded-md border ${activeBreakEvent.type === "Almuerzo" ? "border-cyan/50 bg-cyan/10" : "border-amber-200 bg-amber-50"}`}>
              <div className={`h-1 animate-pulse ${activeBreakEvent.type === "Almuerzo" ? "bg-cyan" : "bg-amber-500"}`} />
              <div className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <p className={`text-xs font-bold uppercase ${activeBreakEvent.type === "Almuerzo" ? "text-brand-700" : "text-amber-800"}`}>{activeBreakEvent.type} activo</p>
                  <p className="mt-1 text-sm text-muted">{activeBreakEvent.type === "Almuerzo" ? "Tiempo guia: 45 minutos." : "Tiempo guia: 20 minutos."}</p>
                </div>
                <div className="text-right">
                  <p className="text-3xl font-black tabular-nums text-ink">{breakElapsedTime}</p>
                  <p className="text-xs font-semibold text-muted">contador en vivo</p>
                </div>
              </div>
            </div>
          ) : null}

          {shiftMessage ? (
            <p className="mx-4 mb-3 rounded-md bg-cyan/10 p-2 text-sm font-semibold text-brand-700">{shiftMessage}</p>
          ) : null}

          <div className="flex flex-wrap gap-2 border-t border-line bg-slate-50 p-4">
            {!activeShift ? (
              <button
                className={`inline-flex min-w-52 items-center justify-center gap-2 rounded-md px-5 py-3 text-sm font-bold text-white shadow-sm ${todayShiftRecord ? "bg-brand-600 hover:bg-brand-700" : "bg-emerald-600 hover:bg-emerald-700"}`}
                onClick={() => {
                  if (todayShiftRecord) {
                    resumeTodayShift();
                    return;
                  }
                  setStartConfirmOpen(true);
                }}
              >
                <Play size={18} fill="currentColor" /> {todayShiftRecord ? "Reanudar jornada registrada" : "Iniciar jornada"}
              </button>
            ) : (
              <button className="inline-flex min-w-52 items-center justify-center gap-2 rounded-md bg-red-600 px-5 py-3 text-sm font-bold text-white shadow-sm hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-red-200 disabled:text-red-600" onClick={() => setFinishConfirmOpen(true)} disabled={Boolean(activeFailure || activeBreakEvent || activePauseEvent)}>
                <Square size={17} fill="currentColor" /> Finalizar jornada
              </button>
            )}
            {activeShift && activePauseEvent ? (
              <button className="inline-flex items-center justify-center gap-2 rounded-md bg-emerald-600 px-5 py-3 text-sm font-bold text-white shadow-sm hover:bg-emerald-700" onClick={finishPause}>
                <Coffee className="animate-pulse" size={16} />
                Regresar de pausa {pauseElapsedTime}
              </button>
            ) : activeShift && activeBreakEvent ? (
              <button className="inline-flex items-center justify-center gap-2 rounded-md bg-emerald-600 px-5 py-3 text-sm font-bold text-white shadow-sm hover:bg-emerald-700" onClick={finishRest}>
                <Coffee className="animate-pulse" size={16} />
                Regresar de {activeBreakEvent.type} {breakElapsedTime}
              </button>
            ) : activeShift ? (
              <>
                <button className="inline-flex items-center justify-center gap-2 rounded-md bg-gradient-to-r from-amber-400 to-orange-400 px-5 py-3 text-sm font-bold text-amber-950 shadow-sm hover:from-amber-500 hover:to-orange-500 disabled:cursor-not-allowed disabled:opacity-40" onClick={() => startRest("Break 1")} disabled={Boolean(activeFailure)}>
                  <Coffee size={16} /> Break 20 min
                </button>
                <button className="inline-flex items-center justify-center gap-2 rounded-md bg-gradient-to-r from-cyan to-brand-600 px-5 py-3 text-sm font-bold text-white shadow-sm hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40" onClick={() => startRest("Almuerzo")} disabled={Boolean(activeFailure)}>
                  <Coffee size={16} /> Almuerzo 45 min
                </button>
                <button className="inline-flex items-center justify-center gap-2 rounded-md bg-teal-600 px-5 py-3 text-sm font-bold text-white shadow-sm hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-40" onClick={startPause} disabled={Boolean(activeFailure)}>
                  <Clock size={16} /> Pausa
                </button>
              </>
            ) : null}
            <button className="inline-flex items-center justify-center gap-2 rounded-md bg-amber-100 px-5 py-3 text-sm font-bold text-amber-900 shadow-sm hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-40" onClick={() => setFailureModalOpen(true)} disabled={!activeShift}>
              <WifiOff className={activeFailure ? "animate-pulse text-red-700" : ""} size={16} />
              {activeFailure ? `Falla ${failureElapsedTime}` : "Reportar falla"}
            </button>
          </div>
        </div>
      </section>

      <Modal
        title={
          activeModal === "sale" ? "Subir venta" : "Registrar rechazo oculto"
        }
        open={activeModal !== null}
        onClose={closeModal}
      >
        {saveComplete ? (
          <div className="flex min-h-72 flex-col items-center justify-center text-center">
            <span className="grid h-20 w-20 animate-bounce place-items-center rounded-full bg-emerald-100 text-emerald-700">
              <CheckCircle2 size={46} strokeWidth={2.5} />
            </span>
            <h3 className="mt-5 text-xl font-bold text-ink">Guardado correctamente</h3>
            <p className="mt-2 text-sm text-muted">El registro fue agregado una sola vez y ya aparece en tus pedidos.</p>
          </div>
        ) : <div className="space-y-3">
          {activeModal === "sale" ? (
            <>
              <input
                className="input-base"
                placeholder="Pedido No"
                value={form.orderNumber}
                onChange={(event) => updateForm("orderNumber", event.target.value)}
              />
              <input
                className="input-base"
                type="date"
                value={form.recordDate}
                onChange={(event) => updateForm("recordDate", event.target.value)}
              />
              <select
                className="input-base"
                value={form.product}
                onChange={(event) => updateForm("product", event.target.value)}
              >
                <option>DEFENOX</option>
                <option>OMNILAR</option>
                <option>TALORIX BOLD</option>
                <option>TOXICOFF</option>
                <option>UP VIZOL</option>
                <option>CONGELUM</option>
                <option>MOTION ENERGY</option>
                <option>VENISELLE</option>
                <option>NIAPEPT</option>
                <option>LAVA BLAZE</option>
                <option>FOOT TROOPER</option>
                <option>MATCHA SURI</option>
                <option>BERZEO</option>
                <option>YENKI DERM</option>
                <option>BLUESTONE</option>
                <option>SCRIPT SIMPLA 360</option>
                <option>MAGICOA</option>
                <option>VERDEXEDIL</option>
              </select>
              <select
                className="input-base"
                value={form.treatment}
                onChange={(event) => updateForm("treatment", event.target.value)}
              >
                <option>2+1</option>
                <option>3+2</option>
                <option>4+3</option>
                <option>5+4</option>
                <option>6+5</option>
              </select>
              <select
                className="input-base"
                value={form.paymentMethod}
                onChange={(event) => updateForm("paymentMethod", event.target.value)}
              >
                <option>TARJETA</option>
                <option>MONEY ORDEN</option>
              </select>
            </>
          ) : (
            <>
              <input
                className="input-base"
                placeholder="Pedido No"
                value={form.orderNumber}
                onChange={(event) => updateForm("orderNumber", event.target.value)}
              />
              <input
                className="input-base"
                type="date"
                value={form.recordDate}
                onChange={(event) => updateForm("recordDate", event.target.value)}
              />
              <select
                className="input-base"
                value={form.product}
                onChange={(event) => updateForm("product", event.target.value)}
                aria-label="Producto del rechazo"
              >
                <option>DEFENOX</option><option>OMNILAR</option><option>TALORIX BOLD</option><option>TOXICOFF</option><option>UP VIZOL</option><option>CONGELUM</option><option>MOTION ENERGY</option><option>VENISELLE</option><option>NIAPEPT</option><option>LAVA BLAZE</option><option>FOOT TROOPER</option><option>MATCHA SURI</option><option>BERZEO</option><option>YENKI DERM</option><option>BLUESTONE</option><option>SCRIPT SIMPLA 360</option><option>MAGICOA</option><option>VERDEXEDIL</option>
              </select>
              {activeModal === "hidden-rejection" ? (
                <>
                  <label className="block">
                    <span className="mb-1 block text-sm font-semibold text-ink">Ya fue comunicado?</span>
                    <select
                      className="input-base"
                      value={form.communicated}
                      onChange={(event) => updateForm("communicated", event.target.value)}
                    >
                      <option>No</option>
                      <option>Si</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-sm font-semibold text-ink">3ra rellamada?</span>
                    <select
                      className="input-base"
                      value={form.thirdCallback}
                      onChange={(event) => updateForm("thirdCallback", event.target.value)}
                    >
                      <option>No</option>
                      <option>Si</option>
                    </select>
                  </label>
                </>
              ) : null}
              <textarea
                className="input-base min-h-24"
                placeholder="Comentario"
                value={form.observation}
                onChange={(event) => updateForm("observation", event.target.value)}
              />
            </>
          )}
          {savedMessage ? (
            <p className="rounded-md bg-cyan/10 p-2 text-sm font-semibold text-brand-700">{savedMessage}</p>
          ) : null}
          <button className="btn-primary w-full justify-center" onClick={saveRecord} disabled={savingRecord}>
            {savingRecord ? "Guardando..." : "Guardar registro"}
          </button>
        </div>}
      </Modal>

      <Modal title="Confirmar inicio de jornada" open={startConfirmOpen} onClose={() => setStartConfirmOpen(false)}>
        <div className="space-y-4">
          <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4">
            <p className="font-bold text-emerald-800">Verificación rápida</p>
            <p className="mt-1 text-sm text-emerald-700">Se registrará como {automaticShiftType.toLowerCase()} en modalidad {operatorProgram.workMode.toLowerCase()}.</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            {[
              ["hasMouse", "Mouse listo"],
              ["hasKeyboard", "Teclado listo"],
              ["hasDeskReady", "Escritorio listo"]
            ].map(([field, label]) => (
              <label key={field} className={`flex cursor-pointer items-center gap-2 rounded-md border p-3 text-sm font-bold ${shiftForm[field as keyof typeof shiftForm] ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-line bg-white text-ink"}`}>
                <input
                  type="checkbox"
                  checked={Boolean(shiftForm[field as keyof typeof shiftForm])}
                  onChange={(event) => {
                    setStartError("");
                    updateShiftForm(field as keyof typeof shiftForm, event.target.checked);
                  }}
                />
                {label}
              </label>
            ))}
          </div>
          <label className={`flex min-h-14 cursor-pointer items-center justify-center gap-2 rounded-md border px-4 py-3 text-sm font-bold ${shiftForm.photoName ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-dashed border-brand-300 bg-brand-50 text-brand-700"}`}>
            <ImageIcon size={18} />
            {shiftForm.photoName || "Subir pantallazo inicial de indicadores diarios"}
            <input className="hidden" type="file" accept="image/*" onChange={uploadEvidence} />
          </label>
          <p className="text-sm text-muted">Este pantallazo deja constancia de tus indicadores antes de comenzar.</p>
          {startError ? <p className="rounded-md bg-red-50 p-2 text-sm font-semibold text-red-700">{startError}</p> : null}
          <button className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-emerald-600 px-5 py-3 text-sm font-bold text-white hover:bg-emerald-700" onClick={startShift}>
            <Play size={18} fill="currentColor" /> Confirmar e iniciar contador
          </button>
        </div>
      </Modal>

      <Modal title={activeFailure ? "Falla en curso" : "Reportar falla"} open={failureModalOpen} onClose={() => setFailureModalOpen(false)}>
        {activeFailure ? (
          <div className="space-y-4">
            <div className="overflow-hidden rounded-md border border-red-200 bg-red-50 text-center">
              <div className="h-1 animate-pulse bg-red-500" />
              <div className="p-5">
              <WifiOff className="mx-auto animate-pulse text-red-600" size={28} />
              <p className="mt-2 text-sm font-semibold text-red-700">Falla en curso</p>
              <p className="mt-1 text-4xl font-black tabular-nums text-red-700">{failureElapsedTime}</p>
              <p className="mt-2 text-sm text-ink">{activeFailure.explanation}</p>
              </div>
            </div>
            <button className="btn-primary w-full justify-center" onClick={finishFailure}>Marcar como solucionada</button>
          </div>
        ) : (
          <div className="space-y-3">
            <textarea
              className="input-base min-h-28 resize-none"
              placeholder="Describe brevemente la falla"
              value={failureForm.explanation}
              onChange={(event) => {
                setFailureError("");
                setFailureForm((current) => ({ ...current, explanation: event.target.value }));
              }}
            />
            <label className="btn-secondary min-h-11 cursor-pointer justify-center">
              <ImageIcon size={16} />
              {failureForm.evidenceName || "Adjuntar pantallazo"}
              <input className="hidden" type="file" accept="image/*" onChange={uploadFailureEvidence} />
            </label>
            {failureError ? <p className="rounded-md bg-red-50 p-2 text-sm font-semibold text-red-700">{failureError}</p> : null}
            <button className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700" onClick={startFailure}>
              <WifiOff size={16} /> Confirmar e iniciar falla
            </button>
          </div>
        )}
      </Modal>

      <Modal title="Confirmar finalizacion" open={finishConfirmOpen} onClose={() => setFinishConfirmOpen(false)}>
        <form className="space-y-4" onSubmit={confirmFinishShift}>
          <div className="rounded-md border border-red-200 bg-red-50 p-4">
            <p className="font-bold text-red-800">Vas a finalizar tu jornada.</p>
            <p className="mt-1 text-sm text-red-700">Tiempo registrado: {elapsedTime}. Sube el pantallazo final para comparar tus indicadores diarios antes de cerrar.</p>
          </div>
          <label className={`flex min-h-14 cursor-pointer items-center justify-center gap-2 rounded-md border px-4 py-3 text-sm font-bold ${finishEvidence.name ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-dashed border-red-300 bg-white text-red-700"}`}>
            <ImageIcon size={18} />
            {finishEvidence.name || "Subir pantallazo final de indicadores diarios"}
            <input className="hidden" type="file" accept="image/*" onChange={uploadFinishEvidence} />
          </label>
          {finishError ? <p className="rounded-md bg-red-50 p-2 text-sm font-semibold text-red-700">{finishError}</p> : null}
          <div className="grid grid-cols-2 gap-3">
            <button type="button" className="btn-secondary justify-center" onClick={() => setFinishConfirmOpen(false)}>Continuar trabajando</button>
            <button
              type="submit"
              className="inline-flex items-center justify-center gap-2 rounded-md bg-red-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-60"
              disabled={finishingShift}
            >
              <Square size={16} fill="currentColor" /> {finishingShift ? "Finalizando..." : "Sí, finalizar"}
            </button>
          </div>
        </form>
      </Modal>
    </AppLayout>
  );
}

