"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, Coffee, ExternalLink, Send, X } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { MonthNavigator } from "@/components/PeriodNavigator";
import { CurrentProfile, loadCloudFailureRecords, loadCloudShiftRecords, loadCurrentProfile } from "@/lib/cloud-shifts";
import { createShiftChangeRequest, loadOperatorMonthSchedules, loadOperatorShiftChangeRequests, OperatorDaySchedule } from "@/lib/cloud-schedules";
import {
  FailureRecord,
  ShiftChangeRequest,
  ShiftRecord,
  createRecordId,
  readStoredBreakAssignments,
  readStoredBreakSchedules,
  readStoredFailureRecords,
  readStoredShiftChangeRequests,
  readStoredShiftRecords,
  writeStoredShiftChangeRequests
} from "@/lib/records";
import { generateTwoByTwoSchedule, toDateInputValue } from "@/lib/schedule";
import { isPageVisible, shouldRefreshNow } from "@/lib/client-cache";
import { focusRefreshThrottleMs, notificationPollMs } from "@/lib/usage-controls";

const maxShiftMilliseconds = 12 * 60 * 60 * 1000;

function hoursForRecord(record: ShiftRecord, now: Date) {
  if (record.status !== "Abierta") return record.workedHours || 0;
  const start = record.startedAtIso ? new Date(record.startedAtIso) : new Date(`${record.date}T${record.startTime}`);
  const rawMinutes = Math.max(0, Math.min((now.getTime() - start.getTime()) / 60000, maxShiftMilliseconds / 60000));
  const restMinutes = breakMinutesForRecord(record, now) + lunchMinutesForRecord(record, now);
  const failureMinutes = record.failureMinutes || 0;
  return Math.max(0, (rawMinutes - restMinutes - failureMinutes) / 60);
}

function minutesForEvent(record: ShiftRecord, now: Date, type: "break" | "lunch") {
  return (record.breakEvents || [])
    .filter((event) => type === "lunch" ? event.type === "Almuerzo" : event.type !== "Almuerzo")
    .reduce((total, event) => {
      if (event.status !== "Activa") return total + (event.durationMinutes || 0);
      const start = event.startedAtIso ? new Date(event.startedAtIso) : new Date(`${record.date}T${event.startTime}`);
      return total + Math.max(0, (now.getTime() - start.getTime()) / 60000);
    }, 0);
}

function breakMinutesForRecord(record: ShiftRecord, now: Date) {
  return minutesForEvent(record, now, "break");
}

function lunchMinutesForRecord(record: ShiftRecord, now: Date) {
  return minutesForEvent(record, now, "lunch");
}

function formatHours(hours: number) {
  const totalMinutes = Math.round(hours * 60);
  const hourValue = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hourValue}h ${String(minutes).padStart(2, "0")}m`;
}

function formatTime(value: string) {
  return value || "-";
}

function monthEndDate(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(year, monthNumber, 0).getDate();
  return `${month}-${String(lastDay).padStart(2, "0")}`;
}

function moveMonth(month: string, amount: number) {
  const [year, monthNumber] = month.split("-").map(Number);
  const target = new Date(year, monthNumber - 1 + amount, 1);
  return `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, "0")}`;
}

export default function OperatorWorkdayPage() {
  const [records, setRecords] = useState<ShiftRecord[]>([]);
  const [failureRecords, setFailureRecords] = useState<FailureRecord[]>([]);
  const [now, setNow] = useState(new Date());
  const [month, setMonth] = useState(toDateInputValue(new Date()).slice(0, 7));
  const [workdayView, setWorkdayView] = useState<"calendar" | "history" | "failures">("calendar");
  const [selectedDate, setSelectedDate] = useState(toDateInputValue(new Date()));
  const [operatorProfile, setOperatorProfile] = useState<CurrentProfile | null>(null);
  const [cloudSchedules, setCloudSchedules] = useState<OperatorDaySchedule[]>([]);
  const [shiftChangeRequests, setShiftChangeRequests] = useState<ShiftChangeRequest[]>([]);
  const [changeFormOpen, setChangeFormOpen] = useState(false);
  const [changeForm, setChangeForm] = useState({ color: "green" as "green" | "blue", replacementUser: "", returnDate: toDateInputValue(new Date()), reason: "" });
  const [changeMessage, setChangeMessage] = useState("");
  const [dismissedBreakNoticeKey, setDismissedBreakNoticeKey] = useState("");

  useEffect(() => {
    const refresh = async () => {
      if (!isPageVisible()) return;
      setNow(new Date());
      setRecords(readStoredShiftRecords());
      setFailureRecords(readStoredFailureRecords());
      const profile = await loadCurrentProfile().catch(() => null);
      setOperatorProfile(profile);
      if (profile) {
        setCloudSchedules(await loadOperatorMonthSchedules(profile.id, month).catch(() => []));
        const localChanges = readStoredShiftChangeRequests().filter((request) => request.workDate.slice(0, 7) === month);
        const cloudChanges = await loadOperatorShiftChangeRequests(profile.id, month).catch(() => localChanges);
        setShiftChangeRequests(cloudChanges.length ? cloudChanges : localChanges);
      }
      const [nextRecords, nextFailures] = await Promise.all([
        loadCloudShiftRecords(profile, { from: `${month}-01`, to: monthEndDate(month), limit: 80 }).catch(() => readStoredShiftRecords()),
        loadCloudFailureRecords(profile, { from: `${month}-01`, to: monthEndDate(month), limit: 80 }).catch(() => readStoredFailureRecords())
      ]);
      setRecords(nextRecords);
      setFailureRecords(nextFailures);
    };
    refresh();
    const timer = window.setInterval(refresh, notificationPollMs());
    const onFocus = () => {
      if (shouldRefreshNow("unicall-blue:workday-focus", focusRefreshThrottleMs())) refresh();
    };
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [month]);

  useEffect(() => {
    const username = operatorProfile?.username || "operator";
    setDismissedBreakNoticeKey(window.localStorage.getItem(`unicall-blue-break-notice-${username}`) || "");
  }, [operatorProfile?.username]);

  const today = toDateInputValue(now);
  const monthRecords = useMemo(
    () => records.filter((record) => record.date.slice(0, 7) === month).sort((a, b) => b.date.localeCompare(a.date) || b.startTime.localeCompare(a.startTime)),
    [month, records]
  );
  const todayRecords = monthRecords.filter((record) => record.date === today);
  const activeRecord = records.find((record) => record.status === "Abierta") || null;
  const todayHours = todayRecords.reduce((total, record) => total + hoursForRecord(record, now), 0);
  const monthHours = monthRecords.reduce((total, record) => total + hoursForRecord(record, now), 0);
  const regularHours = monthRecords.filter((record) => record.shiftType === "Turno normal").reduce((total, record) => total + hoursForRecord(record, now), 0);
  const extraHours = monthRecords.filter((record) => record.shiftType === "Extras").reduce((total, record) => total + hoursForRecord(record, now), 0);
  const workedDays = new Set(monthRecords.map((record) => record.date)).size;
  const monthFailureRecords = failureRecords.filter((record) => record.date.slice(0, 7) === month && record.status === "Solucionada");
  const failureMinutes = monthFailureRecords.reduce((total, record) => total + (record.durationMinutes || 0), 0);
  const calendarDays = useMemo(() => cloudSchedules.length ? cloudSchedules.map((schedule) => ({
    date: schedule.date,
    day: Number(schedule.date.slice(8, 10)),
    weekday: new Date(`${schedule.date}T00:00:00`).toLocaleDateString("es-CO", { weekday: "short" }),
    isWorkDay: schedule.isWorkDay
  })) : generateTwoByTwoSchedule(month, "2026-06-03"), [cloudSchedules, month]);
  const scheduledDays = calendarDays.filter((day) => day.isWorkDay).length;
  const expectedHours = scheduledDays * 10;
  const remainingHours = Math.max(0, expectedHours - monthHours);
  const surplusHours = Math.max(0, monthHours - expectedHours);
  const completion = expectedHours ? Math.min(100, Math.round((monthHours / expectedHours) * 100)) : 0;
  const selectedDayRecords = useMemo(
    () => monthRecords.filter((record) => record.date === selectedDate),
    [monthRecords, selectedDate]
  );
  const selectedDayFailures = useMemo(
    () => failureRecords.filter((record) => record.date === selectedDate && record.status === "Solucionada"),
    [failureRecords, selectedDate]
  );
  const selectedCalendarDay = useMemo(
    () => calendarDays.find((day) => day.date === selectedDate) || null,
    [calendarDays, selectedDate]
  );
  const selectedDaySummary = useMemo(() => {
    const workedHours = selectedDayRecords.reduce((total, record) => total + hoursForRecord(record, now), 0);
    const breakMinutes = selectedDayRecords.reduce((total, record) => total + breakMinutesForRecord(record, now), 0);
    const lunchMinutes = selectedDayRecords.reduce((total, record) => total + lunchMinutesForRecord(record, now), 0);
    const failureMinutes =
      selectedDayRecords.reduce((total, record) => total + (record.failureMinutes || 0), 0) +
      selectedDayFailures.reduce((total, record) => total + (record.durationMinutes || 0), 0);
    const open = selectedDayRecords.some((record) => record.status === "Abierta");
    const extra = selectedDayRecords.some((record) => record.shiftType === "Extras") || (selectedDayRecords.length > 0 && !selectedCalendarDay?.isWorkDay);

    return {
      workedHours,
      breakMinutes,
      lunchMinutes,
      failureMinutes,
      open,
      extra,
      worked: selectedDayRecords.length > 0
    };
  }, [now, selectedCalendarDay?.isWorkDay, selectedDayFailures, selectedDayRecords]);
  const approvedCoverageByDate = useMemo(() => {
    const values = new Map<string, ShiftChangeRequest>();
    shiftChangeRequests
      .filter((request) => request.status === "Aprobado")
      .forEach((request) => values.set(request.workDate, request));
    return values;
  }, [shiftChangeRequests]);
  const approvedReturnByDate = useMemo(() => {
    const values = new Map<string, ShiftChangeRequest>();
    shiftChangeRequests
      .filter((request) => request.status === "Aprobado" && request.returnDate)
      .forEach((request) => values.set(request.returnDate || "", request));
    return values;
  }, [shiftChangeRequests]);
  const pendingCoverageByDate = useMemo(() => {
    const values = new Map<string, ShiftChangeRequest>();
    shiftChangeRequests
      .filter((request) => request.status === "Pendiente")
      .forEach((request) => values.set(request.workDate, request));
    return values;
  }, [shiftChangeRequests]);
  const pendingReturnByDate = useMemo(() => {
    const values = new Map<string, ShiftChangeRequest>();
    shiftChangeRequests
      .filter((request) => request.status === "Pendiente" && request.returnDate)
      .forEach((request) => values.set(request.returnDate || "", request));
    return values;
  }, [shiftChangeRequests]);
  const selectedChangeRequest = useMemo(
    () => shiftChangeRequests.find((request) => request.workDate === selectedDate || request.returnDate === selectedDate) || null,
    [selectedDate, shiftChangeRequests]
  );
  const changeReturnOptions = useMemo(
    () =>
      calendarDays
        .filter((day) => day.date !== selectedDate && day.date >= today)
        .map((day) => ({
          date: day.date,
          label: `${new Date(`${day.date}T00:00:00`).toLocaleDateString("es-CO", { weekday: "short", day: "numeric", month: "short" })} - ${day.isWorkDay ? "programado" : "descanso"}`
        })),
    [calendarDays, selectedDate, today]
  );
  const selectedChangeBlockReason = useMemo(() => {
    if (!selectedCalendarDay?.isWorkDay) return "Solo puedes solicitar intercambio en un dia programado.";
    if (selectedDate < today) return "No puedes solicitar cambios sobre dias pasados.";
    if (selectedChangeRequest?.status === "Pendiente") return "Este dia ya tiene un intercambio pendiente.";
    if (selectedChangeRequest?.status === "Aprobado") return "Este dia ya tiene un intercambio aprobado.";
    return "";
  }, [selectedCalendarDay?.isWorkDay, selectedChangeRequest?.status, selectedDate, today]);
  const canRequestSelectedChange = !selectedChangeBlockReason;
  const recordsByDate = useMemo(() => {
    const nextRecords = new Map<string, ShiftRecord[]>();
    monthRecords.forEach((record) => {
      nextRecords.set(record.date, [...(nextRecords.get(record.date) || []), record]);
    });
    return nextRecords;
  }, [monthRecords]);

  const breaks = useMemo(() => {
    const todayCloudSchedule = cloudSchedules.find((schedule) => schedule.date === toDateInputValue(new Date()) && schedule.published);
    if (todayCloudSchedule) {
      return {
        breakOne: todayCloudSchedule.breakOne,
        lunch: todayCloudSchedule.lunch,
        breakTwo: todayCloudSchedule.breakTwo,
        publishedAt: todayCloudSchedule.date
      };
    }
    const username = operatorProfile?.username?.toLowerCase() || "";
    const fullName = operatorProfile?.fullName?.toLowerCase() || "";
    const published = readStoredBreakSchedules().find((schedule) => {
      const operator = schedule.operator.toLowerCase();
      const anyVisible = Boolean(schedule.visibleToOperator || schedule.breakOneVisible || schedule.lunchVisible || schedule.breakTwoVisible);
      return anyVisible && (operator === username || operator === fullName);
    }) || readStoredBreakSchedules().find((schedule) => Boolean(schedule.visibleToOperator || schedule.breakOneVisible || schedule.lunchVisible || schedule.breakTwoVisible) && !operatorProfile);
    const assigned = readStoredBreakAssignments().find((assignment) => {
      const operator = assignment.operator.toLowerCase();
      return operator === username || operator === fullName;
    }) || readStoredBreakAssignments()[0];
    if (!published) return null;
    const legacyPublished = Boolean(published.visibleToOperator);
    const breakOneVisible = published.breakOneVisible ?? legacyPublished;
    const lunchVisible = published.lunchVisible ?? legacyPublished;
    const breakTwoVisible = published.breakTwoVisible ?? legacyPublished;
    return {
      breakOne: breakOneVisible ? published.breakOne || assigned?.breakTime || "-" : "Pendiente",
      lunch: lunchVisible ? published.lunch || "-" : "Pendiente",
      breakTwo: breakTwoVisible ? published.breakTwo || "-" : "Pendiente",
      publishedAt: published.publishedAt || ""
    };
  }, [cloudSchedules, operatorProfile]);

  const breakNoticeKey = breaks ? breaks.publishedAt || `${breaks.breakOne}-${breaks.lunch}-${breaks.breakTwo}` : "";
  const showBreakNotice = Boolean(breaks && dismissedBreakNoticeKey !== breakNoticeKey);

  function dismissBreakNotice() {
    const username = operatorProfile?.username || "operator";
    window.localStorage.setItem(`unicall-blue-break-notice-${username}`, breakNoticeKey);
    setDismissedBreakNoticeKey(breakNoticeKey);
  }

  async function submitShiftChangeRequest() {
    if (!canRequestSelectedChange) {
      setChangeMessage(selectedChangeBlockReason);
      return;
    }
    const replacementUser = changeForm.replacementUser.trim().toUpperCase().slice(0, 15);
    const returnDate = changeForm.returnDate;
    const reason = changeForm.reason.trim().slice(0, 15);
    if (!replacementUser || !returnDate || !reason) {
      setChangeMessage("Completa reemplazo, dia que devuelves y motivo corto.");
      return;
    }
    if (returnDate === selectedDate) {
      setChangeMessage("El dia que devuelves debe ser diferente al dia que no puedes trabajar.");
      return;
    }
    const existingPending = shiftChangeRequests.find(
      (request) => request.workDate === selectedDate && request.status === "Pendiente"
    );
    if (existingPending) {
      setChangeMessage("Ya tienes una solicitud pendiente para este dia.");
      return;
    }

    const fallbackRequest: ShiftChangeRequest = {
      id: createRecordId(),
      operatorId: operatorProfile?.id,
      operator: operatorProfile?.fullName || "Operador",
      operatorUsername: operatorProfile?.username,
      workDate: selectedDate,
      returnDate,
      color: changeForm.color,
      replacementUser,
      reason,
      status: "Pendiente",
      createdAt: new Date().toISOString()
    };

    try {
      const cloudRequest = operatorProfile
        ? await createShiftChangeRequest({
            operatorId: operatorProfile.id,
            operator: operatorProfile.fullName,
            operatorUsername: operatorProfile.username,
            workDate: selectedDate,
            returnDate,
            color: changeForm.color,
            replacementUser,
            reason
          })
        : null;
      const nextRequest = cloudRequest || fallbackRequest;
      const nextRequests = [nextRequest, ...shiftChangeRequests.filter((request) => request.id !== nextRequest.id)];
      setShiftChangeRequests(nextRequests);
      writeStoredShiftChangeRequests([nextRequest, ...readStoredShiftChangeRequests()]);
      setChangeMessage("Intercambio enviado a Staff. El calendario solo cambia cuando sea aprobado.");
      setChangeFormOpen(false);
      setChangeForm({ color: "green", replacementUser: "", returnDate: selectedDate, reason: "" });
    } catch {
      const nextRequests = [fallbackRequest, ...shiftChangeRequests];
      setShiftChangeRequests(nextRequests);
      writeStoredShiftChangeRequests([fallbackRequest, ...readStoredShiftChangeRequests()]);
      setChangeMessage("Solicitud guardada localmente. Cuando la base este lista, Staff la vera en central.");
      setChangeFormOpen(false);
    }
  }

  return (
    <AppLayout role="operator" title="Mi jornada">
      {showBreakNotice && breaks ? (
        <section className="schedule-notice mb-5 overflow-hidden rounded-md border border-cyan/40 bg-cyan/10">
          <div className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="flex min-w-0 items-center gap-3">
              <span className="schedule-notice-icon grid h-10 w-10 shrink-0 place-items-center rounded-md bg-white text-brand-700">
                <Coffee size={20} />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-black text-ink">Staff publico tus descansos</p>
                <p className="truncate text-sm font-semibold text-brand-800">
                  Break {breaks.breakOne} - Almuerzo {breaks.lunch} - Break opcional {breaks.breakTwo}
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

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-[0_12px_32px_rgba(15,23,42,0.07)]">
        <div className="flex flex-col gap-4 border-b border-line px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[11px] font-black uppercase text-brand-700">Control personal</p>
            <h2 className="text-xl font-black text-ink">Resumen de mi jornada</h2>
            <p className="mt-1 text-sm text-muted">Horas, cumplimiento y descansos en una sola vista.</p>
          </div>
          <div className="flex w-full flex-wrap gap-2 lg:w-auto">
            <MonthNavigator value={month} onChange={setMonth} className="flex-1 lg:flex-none" />
            <Link className="btn-primary flex-1 justify-center lg:flex-none" href="/operator-dashboard#jornada"><ExternalLink size={16} /> Marcar jornada</Link>
          </div>
        </div>

        <div className="grid gap-3 bg-slate-50/70 p-4 lg:grid-cols-[1.25fr_1fr_1fr]">
          <article className={`rounded-lg border p-5 ${activeRecord ? "border-emerald-200 bg-emerald-50/70" : "border-slate-200 bg-white"}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-xs font-black uppercase text-muted"><span className={`h-2.5 w-2.5 rounded-full ${activeRecord ? "animate-pulse bg-emerald-500" : "bg-slate-300"}`} />{activeRecord ? "Jornada activa" : "Jornada de hoy"}</div>
                <p className="mt-3 text-4xl font-black text-ink">{formatHours(activeRecord ? hoursForRecord(activeRecord, now) : todayHours)}</p>
                <p className="mt-1 text-sm font-semibold text-muted">{activeRecord ? `Ingreso ${activeRecord.startTime} - ${activeRecord.shiftType}` : "Aun no has iniciado"}</p>
              </div>
              <span className={`grid h-11 w-11 place-items-center rounded-full ${activeRecord ? "bg-white text-emerald-700" : "bg-soft text-muted"}`}><Clock3 size={21} /></span>
            </div>
          </article>

          <article className={`rounded-lg border p-5 ${remainingHours > 0 ? "border-blue-200 bg-white" : "border-emerald-200 bg-emerald-50/50"}`}>
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-black uppercase text-muted">Meta mensual</p>
              <span className={`rounded-full px-2.5 py-1 text-xs font-black ${remainingHours > 0 ? "bg-blue-50 text-blue-700" : "bg-emerald-100 text-emerald-700"}`}>{remainingHours > 0 ? "En progreso" : "Meta cumplida"}</span>
            </div>
            <div className="mt-3 flex items-center gap-4">
              <div className="relative grid h-20 w-20 shrink-0 place-items-center rounded-full" style={{ background: `conic-gradient(#2563eb ${completion * 3.6}deg, #e2e8f0 0deg)` }}>
                <div className="grid h-14 w-14 place-items-center rounded-full bg-white text-lg font-black text-ink">{completion}%</div>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-black uppercase text-muted">{remainingHours > 0 ? "Todavia te faltan" : "Horas a favor"}</p>
                <p className={`mt-1 text-3xl font-black ${remainingHours > 0 ? "text-blue-700" : "text-emerald-700"}`}>{formatHours(remainingHours > 0 ? remainingHours : surplusHours)}</p>
                <p className="mt-1 text-xs font-semibold text-muted">{scheduledDays} dias programados - 10 h por dia</p>
              </div>
            </div>
            <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${completion}%` }} /></div>
            <div className="mt-2 flex items-center justify-between text-xs font-bold"><span className="text-emerald-700">Cumplidas {formatHours(monthHours)}</span><span className="text-slate-600">Meta {formatHours(expectedHours)}</span></div>
          </article>

          <article className="rounded-lg border border-slate-200 bg-white p-5">
            <p className="text-xs font-black uppercase text-muted">Detalle del mes</p>
            <div className="mt-3 grid gap-2">
              <div className="flex items-center justify-between rounded-md bg-sky-50 px-3 py-2"><span className="text-sm font-bold text-sky-800">Normales</span><span className="font-black text-ink">{formatHours(regularHours)}</span></div>
              <div className="flex items-center justify-between rounded-md bg-violet-50 px-3 py-2"><span className="text-sm font-bold text-violet-800">Extras</span><span className="font-black text-ink">{formatHours(extraHours)}</span></div>
              <button className="flex items-center justify-between rounded-md bg-red-50 px-3 py-2 text-left" onClick={() => setWorkdayView("failures")}><span className="text-sm font-bold text-red-700">Fallas</span><span className="font-black text-red-700">{formatHours(failureMinutes / 60)}</span></button>
            </div>
          </article>
        </div>

      </section>

      <section className="hidden card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line p-4 sm:p-5">
          <div>
            <p className="text-sm font-semibold text-muted">Control personal</p>
            <h2 className="text-xl font-bold text-ink">Tiempo trabajado</h2>
            <p className="mt-1 text-sm text-muted">Consulta tus horas normales, extras y jornadas anteriores.</p>
          </div>
          <div className="flex w-full flex-wrap gap-3 sm:w-auto">
            <MonthNavigator value={month} onChange={setMonth} />
            <Link className="btn-primary justify-center" href="/operator-dashboard#jornada"><ExternalLink size={16} /> Marcar jornada</Link>
          </div>
        </div>

        <div className="grid grid-cols-2 divide-x divide-y divide-line md:grid-cols-5 md:divide-y-0">
          <div className="p-4"><p className="text-xs font-bold uppercase text-muted">Hoy</p><p className="mt-1 text-2xl font-bold text-brand-700">{formatHours(todayHours)}</p></div>
          <div className="p-4"><p className="text-xs font-bold uppercase text-muted">Mes</p><p className="mt-1 text-2xl font-bold text-ink">{formatHours(monthHours)}</p></div>
          <div className="p-4"><p className="text-xs font-bold uppercase text-muted">Normales</p><p className="mt-1 text-2xl font-bold text-ink">{formatHours(regularHours)}</p></div>
          <div className="p-4"><p className="text-xs font-bold uppercase text-muted">Extras</p><p className="mt-1 text-2xl font-bold text-violet-700">{formatHours(extraHours)}</p></div>
          <div className="p-4"><p className="text-xs font-bold uppercase text-muted">Dias trabajados</p><p className="mt-1 text-2xl font-bold text-ink">{workedDays}</p></div>
        </div>
      </section>

      <section className="hidden mt-5 card border-l-4 border-l-red-500 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase text-muted">Fallas del mes</p>
            <p className="mt-2 text-2xl font-bold text-red-700">{formatHours(failureMinutes / 60)}</p>
            <p className="mt-1 text-xs text-muted">{monthFailureRecords.length ? `${monthFailureRecords.length} fallas registradas en el mes` : "No has tenido ninguna falla registrada en este mes"}</p>
          </div>
          <button className="btn-secondary justify-center" onClick={() => setWorkdayView("failures")}>
            Ver dias con fallas
          </button>
        </div>
      </section>

      <section className="hidden mt-5 grid gap-5 lg:grid-cols-[1.35fr_1fr]">
        <div className="card p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div><p className="text-sm font-semibold text-muted">Estado actual</p><h2 className="text-lg font-bold text-ink">{activeRecord ? "Jornada en curso" : "Sin jornada abierta"}</h2></div>
            <Clock3 className={activeRecord ? "text-emerald-600" : "text-muted"} size={25} />
          </div>
          {activeRecord ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-md bg-soft p-3"><p className="text-xs font-semibold text-muted">Ingreso</p><p className="mt-1 font-bold text-ink">{activeRecord.startTime}</p></div>
              <div className="rounded-md bg-soft p-3"><p className="text-xs font-semibold text-muted">Tipo</p><p className="mt-1 font-bold text-ink">{activeRecord.shiftType}</p></div>
              <div className="rounded-md bg-emerald-50 p-3"><p className="text-xs font-semibold text-emerald-700">Tiempo activo</p><p className="mt-1 font-bold text-emerald-700">{formatHours(hoursForRecord(activeRecord, now))}</p></div>
            </div>
          ) : <p className="mt-4 rounded-md bg-soft p-4 text-sm text-muted">Cuando inicies desde â€œMarcar jornadaâ€, el tiempo aparecerÃ¡ aquÃ­ automÃ¡ticamente.</p>}

          <div className="mt-5">
            <div className="flex items-center justify-between text-sm"><span className="font-semibold text-ink">Cumplimiento mensual</span><span className="text-muted">{formatHours(monthHours)} de {formatHours(expectedHours)}</span></div>
            <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-soft"><div className="h-full rounded-full bg-brand-600" style={{ width: `${completion}%` }} /></div>
            <p className="mt-2 text-xs text-muted">Referencia calculada sobre 10 horas por cada dÃ­a trabajado.</p>
          </div>
        </div>

        <div className="card p-4 sm:p-5">
          <div className="flex items-start justify-between"><div><p className="text-sm font-semibold text-muted">ProgramaciÃ³n publicada</p><h2 className="text-lg font-bold text-ink">Breaks y almuerzo</h2></div><Coffee className="text-brand-600" size={24} /></div>
          {breaks ? <div className="mt-4 grid grid-cols-3 gap-2 text-center">{[["Break 1", breaks.breakOne], ["Almuerzo", breaks.lunch], ["Break 2", breaks.breakTwo]].map(([label, value]) => <div className="rounded-md bg-soft p-3" key={label}><p className="text-xs font-semibold text-muted">{label}</p><p className="mt-1 font-bold text-ink">{value}</p></div>)}</div> : <p className="mt-4 rounded-md bg-soft p-4 text-sm text-muted">Staff aÃºn no ha publicado tus descansos.</p>}
        </div>
      </section>

      <section className={`mt-5 card overflow-hidden ${workdayView === "calendar" ? "" : "hidden"}`}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-4 sm:p-5">
          <div className="flex items-center gap-2">
            <CalendarDays className="text-brand-600" size={19} />
            <div>
              <h2 className="text-lg font-black text-ink">Mi calendario de trabajo</h2>
              <p className="text-sm text-muted">Programacion, jornadas e intercambios en una sola vista.</p>
            </div>
          </div>
          <div className="flex rounded-md bg-soft p-1">
            <button className="rounded bg-white px-4 py-2 text-sm font-bold text-brand-700 shadow-sm" onClick={() => setWorkdayView("calendar")}>Calendario</button>
            <button className="rounded px-4 py-2 text-sm font-bold text-muted" onClick={() => setWorkdayView("history")}>Historial</button>
            <button className="rounded px-4 py-2 text-sm font-bold text-muted" onClick={() => setWorkdayView("failures")}>Fallas</button>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-slate-50 px-4 py-3">
          <div className="flex flex-wrap gap-2">
            {[
              ["Programado", "bg-blue-600", "border-blue-200 bg-blue-50 text-blue-800"],
              ["Trabajado", "bg-emerald-600", "border-emerald-200 bg-emerald-50 text-emerald-800"],
              ["Extra", "bg-violet-600", "border-violet-200 bg-violet-50 text-violet-800"],
              ["Descanso", "bg-slate-300", "border-slate-200 bg-white text-slate-600"],
              ["Falla", "bg-red-600", "border-red-200 bg-red-50 text-red-700"]
            ].map(([label, dot, tone]) => (
              <div key={label} className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold shadow-sm ${tone}`}>
                <span className={`h-2.5 w-2.5 rounded-full ${dot}`} />
                {label}
              </div>
            ))}
          </div>
          <div className="hidden">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-bold uppercase text-muted">Dia seleccionado</p>
              <button type="button" className="text-xs font-black text-brand-700" onClick={() => setSelectedDate(toDateInputValue(new Date()))}>Ir a hoy</button>
            </div>
            <p className="mt-1 text-lg font-black text-ink">
              {new Date(`${selectedDate}T00:00:00`).toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" })}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {[
                ["Trabajado", formatHours(selectedDaySummary.workedHours), "bg-slate-50 text-ink"],
                ["Break", formatHours(selectedDaySummary.breakMinutes / 60), "bg-amber-50 text-amber-800"],
                ["Almuerzo", formatHours(selectedDaySummary.lunchMinutes / 60), "bg-sky-50 text-sky-800"],
                ["Fallas", formatHours(selectedDaySummary.failureMinutes / 60), "bg-red-50 text-red-700"]
              ].map(([label, value, tone]) => (
                <div key={label} className={`rounded-md p-2.5 ${tone}`}>
                  <p className="text-[10px] font-black uppercase">{label}</p>
                  <p className="mt-1 text-base font-black">{value}</p>
                </div>
              ))}
            </div>
            <p className="mt-2 inline-flex rounded-full bg-soft px-3 py-1 text-sm font-bold text-muted">
                {selectedDaySummary.open
                ? "Jornada abierta"
                : selectedDaySummary.extra
                  ? "Dia extra"
                  : selectedDaySummary.worked
                    ? "Trabajado"
                    : selectedCalendarDay?.isWorkDay
                      ? "Programado"
                      : "Descanso"}
            </p>
            {selectedChangeRequest ? (
              <p className={`mt-2 rounded px-2 py-1 text-xs font-black ${selectedChangeRequest.status === "Aprobado" ? "bg-emerald-100 text-emerald-700" : selectedChangeRequest.status === "Denegado" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-800"}`}>
                {selectedChangeRequest.workDate === selectedDate
                  ? `Lo cubre ${selectedChangeRequest.replacementUser}`
                  : `Cubres a ${selectedChangeRequest.replacementUser}`} - {selectedChangeRequest.status}
              </p>
            ) : null}
            <button
              className="btn-primary mt-3 w-full justify-center py-2"
              disabled={!canRequestSelectedChange}
              onClick={() => {
                if (!canRequestSelectedChange) {
                  setChangeMessage(selectedChangeBlockReason);
                  return;
                }
                setChangeForm((current) => ({ ...current, returnDate: current.returnDate && current.returnDate !== selectedDate ? current.returnDate : changeReturnOptions[0]?.date || "" }));
                setChangeFormOpen(true);
              }}
            >
              <Send size={15} />
              Solicitar intercambio
            </button>
            {!canRequestSelectedChange ? <p className="mt-2 rounded-md bg-soft p-2 text-xs font-bold text-muted">{selectedChangeBlockReason}</p> : null}
          </div>
          <div className="flex items-center gap-1 rounded-md border border-line bg-white p-1 shadow-sm">
            <button type="button" className="grid h-8 w-8 place-items-center rounded text-muted transition hover:bg-soft hover:text-brand-700" onClick={() => setMonth(moveMonth(month, -1))} title="Mes anterior"><ChevronLeft size={17} /></button>
            <span className="min-w-32 px-2 text-center text-xs font-black capitalize text-ink">{new Date(`${month}-01T00:00:00`).toLocaleDateString("es-CO", { month: "long", year: "numeric" })}</span>
            <button type="button" className="grid h-8 w-8 place-items-center rounded text-muted transition hover:bg-soft hover:text-brand-700" onClick={() => setMonth(moveMonth(month, 1))} title="Mes siguiente"><ChevronRight size={17} /></button>
          </div>
        </div>
        {changeMessage ? <div className="border-b border-line bg-cyan/10 px-4 py-3 text-sm font-bold text-brand-700">{changeMessage}</div> : null}
        <div className="grid gap-4 bg-slate-50 p-4 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="grid grid-cols-7 gap-px overflow-hidden rounded-md border border-line bg-line">
          {["Lun", "Mar", "Mie", "Jue", "Vie", "Sab", "Dom"].map((dayName) => (
            <div key={dayName} className="bg-soft p-1 text-center text-[10px] font-bold uppercase text-muted sm:p-2 sm:text-xs">{dayName}</div>
          ))}
          {Array.from({ length: (new Date(`${month}-01T00:00:00`).getDay() + 6) % 7 }).map((_, index) => (
            <div key={`empty-${index}`} className="min-h-14 bg-white sm:min-h-24" />
          ))}
          {calendarDays.map((day) => {
            const dayRecords = recordsByDate.get(day.date) || [];
            const approvedCoverage = approvedCoverageByDate.get(day.date);
            const approvedReturn = approvedReturnByDate.get(day.date);
            const pendingCoverage = pendingCoverageByDate.get(day.date);
            const pendingReturn = pendingReturnByDate.get(day.date);
            const approvedChange = approvedCoverage || approvedReturn;
            const pendingChange = pendingCoverage || pendingReturn;
            const worked = dayRecords.length > 0;
            const open = dayRecords.some((record) => record.status === "Abierta");
            const extra = dayRecords.some((record) => record.shiftType === "Extras") || (worked && !day.isWorkDay);
            const dayHours = dayRecords.reduce((total, record) => total + hoursForRecord(record, now), 0);
            const dayBreak = dayRecords.reduce((total, record) => total + breakMinutesForRecord(record, now), 0);
            const dayLunch = dayRecords.reduce((total, record) => total + lunchMinutesForRecord(record, now), 0);
            const dayFailure = dayRecords.reduce((total, record) => total + (record.failureMinutes || 0), 0);
            const hasFailure =
              dayRecords.some((record) => (record.failureMinutes || 0) > 0) ||
              failureRecords.some((record) => record.date === day.date && record.status === "Solucionada");
            const selected = selectedDate === day.date;
            const colorClass = open
              ? "border-emerald-800 bg-emerald-700 text-white shadow-inner"
              : approvedCoverage?.color === "green"
                ? "border-emerald-700 bg-emerald-600 text-white"
                : approvedCoverage?.color === "blue"
                  ? "border-blue-700 bg-blue-600 text-white"
                  : approvedReturn
                    ? "border-violet-700 bg-violet-600 text-white"
              : extra
                ? "border-violet-700 bg-violet-600 text-white"
                : worked
                  ? "border-emerald-700 bg-emerald-600 text-white"
                  : day.isWorkDay
                    ? "border-blue-700 bg-blue-600 text-white"
                    : "border-slate-200 bg-slate-100 text-slate-500";

            return (
              <button
                type="button"
                key={day.date}
                onClick={() => setSelectedDate(day.date)}
                className={`min-h-14 border p-1 text-left transition hover:relative hover:z-10 hover:brightness-105 hover:shadow-lg sm:min-h-24 sm:p-2.5 ${colorClass} ${selected ? "relative z-10 ring-4 ring-inset ring-cyan-300" : ""}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-base font-black sm:text-lg">{day.day}</span>
                  <span className="hidden text-[11px] font-bold uppercase sm:block">{day.weekday}</span>
                </div>
                <p className="mt-1 hidden truncate text-xs font-bold sm:block">{open ? "Abierta" : extra ? "Extra" : worked ? "Trabajado" : day.isWorkDay ? "Programado" : "Descanso"}</p>
                {approvedChange ? (
                  <p className="mt-0.5 hidden truncate rounded bg-white/20 px-1.5 py-0.5 text-[11px] font-black text-white sm:mt-1 sm:block">
                    {approvedCoverage
                      ? `Lo cubre ${approvedCoverage.replacementUser}`
                      : `Cubres a ${approvedReturn?.replacementUser}`}
                  </p>
                ) : pendingChange ? (
                  <p className="mt-0.5 hidden truncate rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-black text-amber-800 sm:mt-1 sm:block">
                    {pendingCoverage ? "Intercambio pendiente" : "Devolucion pendiente"}
                  </p>
                ) : null}
                {worked ? (
                  <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px] font-bold sm:mt-1">
                    <p>{formatHours(dayHours)}</p>
                    {hasFailure ? <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-red-700">Falla</span> : null}
                    {false ? (
                      <p className="text-muted">B {formatHours(dayBreak / 60)} - A {formatHours(dayLunch / 60)} - F {formatHours(dayFailure / 60)}</p>
                    ) : null}
                  </div>
                ) : null}
              </button>
            );
          })}
        </div>
        <aside className="h-fit rounded-md border border-brand-100 bg-white p-4 shadow-sm xl:sticky xl:top-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-black uppercase text-brand-700">Detalle del dia</p>
            <button type="button" className="text-xs font-black text-brand-700" onClick={() => setSelectedDate(toDateInputValue(new Date()))}>Ir a hoy</button>
          </div>
          <p className="mt-2 text-xl font-black capitalize text-ink">
            {new Date(`${selectedDate}T00:00:00`).toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" })}
          </p>
          <span className="mt-2 inline-flex rounded-full bg-soft px-3 py-1 text-xs font-black text-muted">
            {selectedDaySummary.open ? "Jornada abierta" : selectedDaySummary.extra ? "Dia extra" : selectedDaySummary.worked ? "Trabajado" : selectedCalendarDay?.isWorkDay ? "Programado" : "Descanso"}
          </span>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {[
              ["Trabajado", formatHours(selectedDaySummary.workedHours), "bg-slate-50 text-ink"],
              ["Break", formatHours(selectedDaySummary.breakMinutes / 60), "bg-amber-50 text-amber-800"],
              ["Almuerzo", formatHours(selectedDaySummary.lunchMinutes / 60), "bg-sky-50 text-sky-800"],
              ["Fallas", formatHours(selectedDaySummary.failureMinutes / 60), "bg-red-50 text-red-700"]
            ].map(([label, value, tone]) => (
              <div key={label} className={`rounded-md p-3 ${tone}`}>
                <p className="text-[10px] font-black uppercase">{label}</p>
                <p className="mt-1 text-lg font-black">{value}</p>
              </div>
            ))}
          </div>
          {selectedChangeRequest ? (
            <div className={`mt-3 rounded-md p-3 text-xs font-black ${selectedChangeRequest.status === "Aprobado" ? "bg-emerald-50 text-emerald-700" : selectedChangeRequest.status === "Denegado" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-800"}`}>
              {selectedChangeRequest.workDate === selectedDate ? `Lo cubre ${selectedChangeRequest.replacementUser}` : `Cubres a ${selectedChangeRequest.replacementUser}`} - {selectedChangeRequest.status}
            </div>
          ) : null}
          <button
            className="btn-primary mt-4 w-full justify-center py-2.5"
            disabled={!canRequestSelectedChange}
            onClick={() => {
              if (!canRequestSelectedChange) {
                setChangeMessage(selectedChangeBlockReason);
                return;
              }
              setChangeForm((current) => ({ ...current, returnDate: current.returnDate && current.returnDate !== selectedDate ? current.returnDate : changeReturnOptions[0]?.date || "" }));
              setChangeFormOpen(true);
            }}
          >
            <Send size={15} />
            Solicitar intercambio
          </button>
          {!canRequestSelectedChange ? <p className="mt-2 rounded-md bg-soft p-2 text-xs font-bold text-muted">{selectedChangeBlockReason}</p> : null}
        </aside>
        </div>
        <div className="hidden grid gap-3 border-t border-line p-4 sm:grid-cols-4">
          <div className="rounded-md bg-soft p-3">
            <p className="text-xs font-bold uppercase text-muted">Trabajado</p>
            <p className="mt-1 text-xl font-black text-ink">{formatHours(selectedDaySummary.workedHours)}</p>
          </div>
          <div className="rounded-md bg-amber-50 p-3">
            <p className="text-xs font-bold uppercase text-amber-700">Break</p>
            <p className="mt-1 text-xl font-black text-amber-800">{formatHours(selectedDaySummary.breakMinutes / 60)}</p>
          </div>
          <div className="rounded-md bg-cyan/10 p-3">
            <p className="text-xs font-bold uppercase text-brand-700">Almuerzo</p>
            <p className="mt-1 text-xl font-black text-brand-700">{formatHours(selectedDaySummary.lunchMinutes / 60)}</p>
          </div>
          <div className="rounded-md bg-red-50 p-3">
            <p className="text-xs font-bold uppercase text-red-700">Fallas</p>
            <p className="mt-1 text-xl font-black text-red-700">{formatHours(selectedDaySummary.failureMinutes / 60)}</p>
          </div>
        </div>
        <div className="border-t border-line p-4">
          {selectedDayRecords.length ? (
            <div className="grid gap-2">
              {selectedDayRecords.map((record) => (
                <div key={record.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line bg-white p-3">
                  <div>
                    <p className="font-bold text-ink">{record.shiftType} - {record.workMode || "Sin modalidad"}</p>
                    <p className="text-sm text-muted">Ingreso {record.startTime} - Salida {record.endTime || "abierta"}</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${record.status === "Abierta" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-700"}`}>{record.status}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-md bg-soft p-4 text-sm font-semibold text-muted">
              {selectedCalendarDay?.isWorkDay ? "Este dia estaba programado, pero no hay jornada registrada." : "Este dia aparece como descanso y no tiene jornada registrada."}
            </p>
          )}
        </div>
      </section>

      <section className={`mt-5 card overflow-hidden ${workdayView === "history" ? "" : "hidden"}`}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-4 sm:p-5">
          <div className="flex items-center gap-2">
            <CalendarDays className="text-brand-600" size={19} />
            <div>
              <h2 className="font-bold text-ink">Calendario e historial</h2>
              <p className="text-sm text-muted">Elige como quieres revisar tus dias trabajados.</p>
            </div>
          </div>
          <div className="flex rounded-md bg-soft p-1">
            <button className="rounded px-4 py-2 text-sm font-bold text-muted" onClick={() => setWorkdayView("calendar")}>Calendario</button>
            <button className="rounded bg-white px-4 py-2 text-sm font-bold text-brand-700 shadow-sm" onClick={() => setWorkdayView("history")}>Historial</button>
            <button className="rounded px-4 py-2 text-sm font-bold text-muted" onClick={() => setWorkdayView("failures")}>Fallas</button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px]">
            <thead className="bg-soft text-left text-xs uppercase text-muted"><tr><th className="table-cell">Fecha</th><th className="table-cell">Ingreso</th><th className="table-cell">Salida</th><th className="table-cell">Tiempo</th><th className="table-cell">Break</th><th className="table-cell">Almuerzo</th><th className="table-cell">Falla</th><th className="table-cell">Tipo</th><th className="table-cell">Modalidad</th><th className="table-cell">Estado</th></tr></thead>
            <tbody>
              {monthRecords.length ? monthRecords.map((record) => {
                const recordBreakMinutes = breakMinutesForRecord(record, now);
                const recordLunchMinutes = lunchMinutesForRecord(record, now);
                return <tr key={record.id}><td className="table-cell font-semibold">{new Date(`${record.date}T00:00:00`).toLocaleDateString("es-CO")}</td><td className="table-cell">{formatTime(record.startTime)}</td><td className="table-cell">{formatTime(record.endTime)}</td><td className="table-cell font-bold">{formatHours(hoursForRecord(record, now))}</td><td className="table-cell">{formatHours(recordBreakMinutes / 60)}</td><td className="table-cell">{formatHours(recordLunchMinutes / 60)}</td><td className="table-cell">{formatHours((record.failureMinutes || 0) / 60)}</td><td className="table-cell">{record.shiftType}</td><td className="table-cell">{record.workMode || "-"}</td><td className="table-cell"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${record.status === "Abierta" ? "bg-emerald-100 text-emerald-700" : record.status === "Falla reportada" ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-700"}`}>{record.status}</span></td></tr>;
              }) : <tr><td className="table-cell py-8 text-center text-muted" colSpan={10}>No hay jornadas registradas en este mes.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className={`mt-5 card overflow-hidden ${workdayView === "failures" ? "" : "hidden"}`}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-4 sm:p-5">
          <div className="flex items-center gap-2">
            <CalendarDays className="text-brand-600" size={19} />
            <div>
              <h2 className="font-bold text-ink">Calendario e historial</h2>
              <p className="text-sm text-muted">Dias del mes donde reportaste fallas y cuanto duraron.</p>
            </div>
          </div>
          <div className="flex rounded-md bg-soft p-1">
            <button className="rounded px-4 py-2 text-sm font-bold text-muted" onClick={() => setWorkdayView("calendar")}>Calendario</button>
            <button className="rounded px-4 py-2 text-sm font-bold text-muted" onClick={() => setWorkdayView("history")}>Historial</button>
            <button className="rounded bg-white px-4 py-2 text-sm font-bold text-brand-700 shadow-sm" onClick={() => setWorkdayView("failures")}>Fallas</button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px]">
            <thead className="bg-soft text-left text-xs uppercase text-muted">
              <tr><th className="table-cell">Fecha</th><th className="table-cell">Ingreso</th><th className="table-cell">Tiempo en falla</th><th className="table-cell">Detalle</th><th className="table-cell">Estado</th></tr>
            </thead>
            <tbody>
              {monthFailureRecords.length ? monthFailureRecords.map((record) => (
                <tr key={`failure-${record.id}`}>
                  <td className="table-cell font-semibold">{new Date(`${record.date}T00:00:00`).toLocaleDateString("es-CO")}</td>
                  <td className="table-cell">{formatTime(record.startTime)}</td>
                  <td className="table-cell font-bold text-red-700">{formatHours((record.durationMinutes || 0) / 60)}</td>
                  <td className="table-cell">{record.explanation || "-"}</td>
                  <td className="table-cell"><span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-bold text-red-700">Falla registrada</span></td>
                </tr>
              )) : <tr><td className="table-cell py-8 text-center text-muted" colSpan={5}>No has tenido ninguna falla registrada en este mes.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {changeFormOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-4">
          <div className="w-full max-w-md overflow-hidden rounded-lg bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <div>
                <h2 className="font-black text-ink">Solicitar intercambio</h2>
                <p className="text-sm text-muted">Staff debe aprobar antes de cambiar el calendario.</p>
              </div>
              <button className="rounded-md p-2 text-muted hover:bg-soft" onClick={() => setChangeFormOpen(false)}><X size={18} /></button>
            </div>
            <div className="space-y-4 p-5">
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="rounded-md border border-red-100 bg-red-50 p-3">
                  <p className="text-xs font-black uppercase text-red-700">No puedo trabajar</p>
                  <p className="mt-1 font-black text-ink">{new Date(`${selectedDate}T00:00:00`).toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" })}</p>
                </div>
                <label className="block rounded-md border border-violet-100 bg-violet-50 p-3">
                  <span className="text-xs font-black uppercase text-violet-700">Yo devuelvo</span>
                  <select
                    className="input-base mt-1 bg-white"
                    value={changeForm.returnDate}
                    onChange={(event) => setChangeForm((current) => ({ ...current, returnDate: event.target.value }))}
                  >
                    <option value="">Selecciona dia</option>
                    {changeReturnOptions.map((option) => (
                      <option key={option.date} value={option.date}>{option.label}</option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="block">
                <span className="mb-1 block text-sm font-bold text-ink">Equipo que cubre mi turno</span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    className={`rounded-md border px-3 py-3 text-sm font-black ${changeForm.color === "green" ? "border-emerald-600 bg-emerald-50 text-emerald-700" : "border-line text-muted"}`}
                    onClick={() => setChangeForm((current) => ({ ...current, color: "green" }))}
                  >
                    Equipo Green
                  </button>
                  <button
                    className={`rounded-md border px-3 py-3 text-sm font-black ${changeForm.color === "blue" ? "border-blue-600 bg-blue-50 text-blue-700" : "border-line text-muted"}`}
                    onClick={() => setChangeForm((current) => ({ ...current, color: "blue" }))}
                  >
                    Equipo Blue
                  </button>
                </div>
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-bold text-ink">Usuario del reemplazo</span>
                <input
                  className="input-base uppercase"
                  maxLength={15}
                  placeholder="Ej: A.PEREZ"
                  value={changeForm.replacementUser}
                  onChange={(event) => setChangeForm((current) => ({ ...current, replacementUser: event.target.value.toUpperCase().slice(0, 15) }))}
                />
                <p className="mt-1 text-xs text-muted">{changeForm.replacementUser.length}/15 caracteres</p>
              </label>
              <div className="rounded-md border border-brand-100 bg-brand-50 p-3 text-sm font-semibold text-ink">
                <p><b>Resumen:</b> {operatorProfile?.username || "Tu usuario"} no trabaja el {new Date(`${selectedDate}T00:00:00`).toLocaleDateString("es-CO", { day: "numeric", month: "long" })}.</p>
                <p className="mt-1">Lo cubre <b>{changeForm.replacementUser || "usuario"}</b> y devuelves el <b>{changeForm.returnDate ? new Date(`${changeForm.returnDate}T00:00:00`).toLocaleDateString("es-CO", { day: "numeric", month: "long" }) : "dia seleccionado"}</b>.</p>
              </div>
              <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-900">
                El calendario solo cambia cuando Staff aprueba. Si se aprueba, el dia cubierto queda marcado con el equipo Blue o Green y se guarda historial.
              </div>
              <label className="block">
                <span className="mb-1 block text-sm font-bold text-ink">Motivo corto</span>
                <input
                  className="input-base"
                  maxLength={15}
                  placeholder="Ej: cambio turno"
                  value={changeForm.reason}
                  onChange={(event) => setChangeForm((current) => ({ ...current, reason: event.target.value.slice(0, 15) }))}
                />
                <p className="mt-1 text-xs text-muted">{changeForm.reason.length}/15 caracteres</p>
              </label>
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-900">
                Staff debe aprobar antes de cambiar el calendario. Si aprueban y no cumples el turno acordado, pueden aplicar deduccion o novedad operativa.
              </div>
              <button className="btn-primary w-full justify-center" onClick={submitShiftChangeRequest}>
                <Send size={16} />
                Enviar intercambio
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </AppLayout>
  );
}
