import { BreakSchedule, DailyShiftAssignment, ShiftChangeRequest, ShiftChangeRequestStatus } from "@/lib/records";
import { generateTwoByTwoSchedule } from "@/lib/schedule";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";

export type ScheduleOperator = {
  id: string;
  fullName: string;
  username: string;
};

type ScheduleProfileRow = {
  id: string;
  full_name: string | null;
  username: string | null;
};

export type OperatorDaySchedule = {
  date: string;
  isWorkDay: boolean;
  workMode: "Oficina" | "Casa";
  location: string;
  workSchedule: string;
  breakOne: string;
  lunch: string;
  breakTwo: string;
  published: boolean;
};

type ShiftAssignmentRow = {
  work_date: string;
  work_mode: "Oficina" | "Casa";
  location: string;
  work_schedule: string;
  is_work_day: boolean;
  published: boolean;
};

type BreakScheduleRow = {
  work_date: string;
  break_one: string | null;
  lunch: string | null;
  break_two: string | null;
  published: boolean;
};

type ShiftChangeRequestRow = {
  id: string;
  operator_id: string;
  work_date: string;
  color: "green" | "blue";
  replacement_user: string;
  reason: string;
  status: ShiftChangeRequestStatus;
  staff_note: string | null;
  reviewed_by: string | null;
  created_at: string;
  updated_at: string | null;
  profiles?: { full_name?: string; username?: string } | null;
};

function returnDateFromStaffNote(note: string | null | undefined) {
  return note?.match(/Devuelve:\s*(\d{4}-\d{2}-\d{2})/i)?.[1] || "";
}

function cleanShiftChangeStaffNote(note: string | null | undefined) {
  return (note || "").replace(/^Devuelve:\s*\d{4}-\d{2}-\d{2}\s*/i, "").trim();
}

function composeShiftChangeStaffNote(returnDate: string | undefined, note: string) {
  const cleanNote = cleanShiftChangeStaffNote(note);
  return `${returnDate ? `Devuelve: ${returnDate}\n` : ""}${cleanNote}`.trim();
}

function timeValue(value: string | null | undefined, fallback: string) {
  return value ? value.slice(0, 5) : fallback;
}

function normalizeScheduleKey(value?: string | null) {
  return (value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function fromShiftChangeRow(row: ShiftChangeRequestRow): ShiftChangeRequest {
  return {
    id: row.id,
    operatorId: row.operator_id,
    operator: row.profiles?.full_name || row.profiles?.username || "Operador",
    operatorUsername: row.profiles?.username,
    workDate: row.work_date,
    returnDate: returnDateFromStaffNote(row.staff_note),
    color: row.color,
    replacementUser: row.replacement_user,
    reason: row.reason,
    status: row.status,
    staffNote: cleanShiftChangeStaffNote(row.staff_note),
    reviewedBy: row.reviewed_by || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at || undefined
  };
}

async function upsertChunks(table: "shift_assignments" | "break_schedules", rows: Record<string, unknown>[]) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return;
  for (let index = 0; index < rows.length; index += 500) {
    const { error } = await supabase.from(table).upsert(rows.slice(index, index + 500), { onConflict: "operator_id,work_date" });
    if (error) throw error;
  }
}

export async function loadScheduleOperators(): Promise<ScheduleOperator[]> {
  const supabase = getSupabaseBrowserClient();
  if (!isSupabaseConfigured || !supabase) return [];
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, username")
    .eq("role", "operator")
    .eq("status", "active")
    .order("username");
  if (error) throw error;
  return ((data || []) as Array<{ id: string; full_name: string; username: string }>).map((profile) => ({
    id: profile.id,
    fullName: profile.full_name,
    username: profile.username
  }));
}

export async function automateMonthlySchedules(
  operators: ScheduleOperator[],
  assignments: DailyShiftAssignment[],
  month: string,
  firstWorkDay: string
) {
  const days = generateTwoByTwoSchedule(month, firstWorkDay);
  const breakOneSlots = ["09:15", "09:35", "09:55", "10:15"];
  const lunchSlots = ["12:00", "12:40", "13:20"];
  const breakTwoSlots = ["15:15", "15:35", "15:55", "16:15"];

  const shifts: Record<string, unknown>[] = [];
  const breaks: Record<string, unknown>[] = [];
  operators.forEach((operator, index) => {
    const local = assignments.find((item) => item.id === operator.id || item.user.toLowerCase() === operator.username.toLowerCase());
    const workMode = local?.workMode || "Oficina";
    const location = local?.location || (workMode === "Casa" ? "Homeoffice" : "CL 72 - Coworking");
    const workSchedule = local?.workSchedule || "07:00 - 19:00";
    days.forEach((day) => {
      shifts.push({
        operator_id: operator.id,
        work_date: day.date,
        work_mode: workMode,
        location,
        work_schedule: workSchedule,
        is_work_day: day.isWorkDay,
        published: true
      });
      if (day.isWorkDay) {
        breaks.push({
          operator_id: operator.id,
          work_date: day.date,
          break_one: breakOneSlots[index % breakOneSlots.length],
          lunch: lunchSlots[index % lunchSlots.length],
          break_two: breakTwoSlots[index % breakTwoSlots.length],
          published: true
        });
      }
    });
  });
  await upsertChunks("shift_assignments", shifts);
  await upsertChunks("break_schedules", breaks);
  return { operatorCount: operators.length, shiftCount: shifts.length, breakCount: breaks.length };
}

export async function publishDailyRestSchedules(input: {
  workDate: string;
  assignments: DailyShiftAssignment[];
  schedules: BreakSchedule[];
  targetOperators: string[];
  label: string;
}) {
  const supabase = getSupabaseBrowserClient();
  if (!isSupabaseConfigured || !supabase) return { published: 0 };

  const { data: profileRows, error: profileError } = await supabase
    .from("profiles")
    .select("id, full_name, username")
    .eq("role", "operator")
    .eq("status", "active");
  if (profileError) throw profileError;

  const profilesByKey = new Map<string, ScheduleProfileRow>();
  ((profileRows || []) as ScheduleProfileRow[]).forEach((profile) => {
    profilesByKey.set(normalizeScheduleKey(profile.username), profile);
    profilesByKey.set(normalizeScheduleKey(profile.full_name), profile);
  });

  const targetKeys = new Set(input.targetOperators.map(normalizeScheduleKey));
  const targetSchedules = input.schedules.filter((schedule) => targetKeys.has(normalizeScheduleKey(schedule.operator)));
  const shifts: Record<string, unknown>[] = [];
  const breaks: Record<string, unknown>[] = [];

  targetSchedules.forEach((schedule) => {
    const assignment = input.assignments.find((item) =>
      normalizeScheduleKey(item.user) === normalizeScheduleKey(schedule.operator) ||
      normalizeScheduleKey(item.name) === normalizeScheduleKey(schedule.operator)
    );
    const profile = profilesByKey.get(normalizeScheduleKey(schedule.operator)) ||
      profilesByKey.get(normalizeScheduleKey(assignment?.user)) ||
      profilesByKey.get(normalizeScheduleKey(assignment?.name));
    if (!profile) return;

    shifts.push({
      operator_id: profile.id,
      work_date: input.workDate,
      work_mode: assignment?.workMode || "Oficina",
      location: assignment?.location || "CL 72 - Coworking",
      work_schedule: assignment?.workSchedule || "07:00 - 19:00",
      is_work_day: true,
      published: true
    });
    breaks.push({
      operator_id: profile.id,
      work_date: input.workDate,
      break_one: schedule.breakOneVisible ? schedule.breakOne || null : null,
      lunch: schedule.lunchVisible ? schedule.lunch || null : null,
      break_two: schedule.breakTwoVisible ? schedule.breakTwo || null : null,
      published: Boolean(schedule.visibleToOperator || schedule.breakOneVisible || schedule.lunchVisible || schedule.breakTwoVisible)
    });
  });

  if (!breaks.length) return { published: 0 };
  await upsertChunks("shift_assignments", shifts);
  await upsertChunks("break_schedules", breaks);
  return { published: breaks.length };
}

export async function loadOperatorDaySchedule(operatorId: string, date: string): Promise<OperatorDaySchedule | null> {
  const supabase = getSupabaseBrowserClient();
  if (!isSupabaseConfigured || !supabase || !operatorId) return null;
  const [{ data: shift, error: shiftError }, { data: breaks, error: breakError }] = await Promise.all([
    supabase.from("shift_assignments").select("work_date, work_mode, location, work_schedule, is_work_day, published").eq("operator_id", operatorId).eq("work_date", date).maybeSingle(),
    supabase.from("break_schedules").select("break_one, lunch, break_two, published").eq("operator_id", operatorId).eq("work_date", date).maybeSingle()
  ]);
  if (shiftError || breakError || !shift || !shift.published) return null;
  return {
    date: shift.work_date,
    isWorkDay: Boolean(shift.is_work_day),
    workMode: shift.work_mode,
    location: shift.location,
    workSchedule: shift.work_schedule,
    breakOne: breaks?.break_one ? timeValue(breaks.break_one, "09:15") : "",
    lunch: breaks?.lunch ? timeValue(breaks.lunch, "12:00") : "",
    breakTwo: breaks?.break_two ? timeValue(breaks.break_two, "15:15") : "",
    published: Boolean(breaks?.published)
  };
}

export async function loadOperatorMonthSchedules(operatorId: string, month: string): Promise<OperatorDaySchedule[]> {
  const supabase = getSupabaseBrowserClient();
  if (!isSupabaseConfigured || !supabase || !operatorId) return [];
  const start = `${month}-01`;
  const [year, monthNumber] = month.split("-").map(Number);
  const end = `${month}-${String(new Date(year, monthNumber, 0).getDate()).padStart(2, "0")}`;
  const [{ data: shifts, error: shiftError }, { data: breaks, error: breakError }] = await Promise.all([
    supabase.from("shift_assignments").select("work_date, work_mode, location, work_schedule, is_work_day, published").eq("operator_id", operatorId).gte("work_date", start).lte("work_date", end).order("work_date"),
    supabase.from("break_schedules").select("work_date, break_one, lunch, break_two, published").eq("operator_id", operatorId).gte("work_date", start).lte("work_date", end)
  ]);
  if (shiftError || breakError) throw shiftError || breakError;
  const breakRows = (breaks || []) as BreakScheduleRow[];
  const shiftRows = (shifts || []) as ShiftAssignmentRow[];
  const breaksByDate = new Map<string, BreakScheduleRow>(breakRows.map((item) => [item.work_date, item]));
  return shiftRows.filter((shift) => shift.published).map((shift) => {
    const rest = breaksByDate.get(shift.work_date);
    return {
      date: shift.work_date,
      isWorkDay: Boolean(shift.is_work_day),
      workMode: shift.work_mode,
      location: shift.location,
      workSchedule: shift.work_schedule,
      breakOne: timeValue(rest?.break_one, "09:15"),
      lunch: timeValue(rest?.lunch, "12:00"),
      breakTwo: timeValue(rest?.break_two, "15:15"),
      published: Boolean(rest?.published)
    };
  });
}

export async function createShiftChangeRequest(input: {
  operatorId: string;
  operator: string;
  operatorUsername?: string;
  workDate: string;
  returnDate?: string;
  color: "green" | "blue";
  replacementUser: string;
  reason: string;
}): Promise<ShiftChangeRequest | null> {
  const supabase = getSupabaseBrowserClient();
  if (!isSupabaseConfigured || !supabase || !input.operatorId) return null;
  const payload = {
    operator_id: input.operatorId,
    work_date: input.workDate,
    color: input.color,
    replacement_user: input.replacementUser.trim().slice(0, 15),
    reason: input.reason.trim().slice(0, 15),
    status: "Pendiente",
    staff_note: composeShiftChangeStaffNote(input.returnDate, "")
  };
  const { data, error } = await supabase
    .from("shift_change_requests")
    .insert(payload)
    .select("id, operator_id, work_date, color, replacement_user, reason, status, staff_note, reviewed_by, created_at, updated_at")
    .single();
  if (error) throw error;
  return {
    id: data.id,
    operatorId: data.operator_id,
    operator: input.operator,
    operatorUsername: input.operatorUsername,
    workDate: data.work_date,
    returnDate: returnDateFromStaffNote(data.staff_note),
    color: data.color,
    replacementUser: data.replacement_user,
    reason: data.reason,
    status: data.status,
    staffNote: cleanShiftChangeStaffNote(data.staff_note),
    reviewedBy: data.reviewed_by || "",
    createdAt: data.created_at,
    updatedAt: data.updated_at || undefined
  };
}

export async function loadOperatorShiftChangeRequests(operatorId: string, month: string): Promise<ShiftChangeRequest[]> {
  const supabase = getSupabaseBrowserClient();
  if (!isSupabaseConfigured || !supabase || !operatorId) return [];
  const start = `${month}-01`;
  const [year, monthNumber] = month.split("-").map(Number);
  const end = `${month}-${String(new Date(year, monthNumber, 0).getDate()).padStart(2, "0")}`;
  const { data, error } = await supabase
    .from("shift_change_requests")
    .select("id, operator_id, work_date, color, replacement_user, reason, status, staff_note, reviewed_by, created_at, updated_at")
    .eq("operator_id", operatorId)
    .gte("work_date", start)
    .lte("work_date", end)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data || []) as ShiftChangeRequestRow[]).map((row) => ({
    ...fromShiftChangeRow(row),
    operator: "",
    operatorUsername: ""
  }));
}

export async function loadStaffShiftChangeRequests(month: string): Promise<ShiftChangeRequest[]> {
  const supabase = getSupabaseBrowserClient();
  if (!isSupabaseConfigured || !supabase) return [];
  const start = `${month}-01`;
  const [year, monthNumber] = month.split("-").map(Number);
  const end = `${month}-${String(new Date(year, monthNumber, 0).getDate()).padStart(2, "0")}`;
  const { data, error } = await supabase
    .from("shift_change_requests")
    .select("id, operator_id, work_date, color, replacement_user, reason, status, staff_note, reviewed_by, created_at, updated_at, profiles!shift_change_requests_operator_id_fkey(full_name, username)")
    .gte("work_date", start)
    .lte("work_date", end)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data || []) as ShiftChangeRequestRow[]).map(fromShiftChangeRow);
}

export async function reviewShiftChangeRequest(id: string, status: "Aprobado" | "Denegado", staffNote: string, reviewedBy?: string) {
  const supabase = getSupabaseBrowserClient();
  if (!isSupabaseConfigured || !supabase) return;
  const { error } = await supabase
    .from("shift_change_requests")
    .update({ status, staff_note: staffNote, reviewed_by: reviewedBy || null, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}
