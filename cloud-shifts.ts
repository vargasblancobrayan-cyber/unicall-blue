import { FailureRecord, ShiftRecord, readStoredFailureRecords, readStoredShiftRecords, writeStoredFailureRecords, writeStoredShiftRecords } from "@/lib/records";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";

export type CurrentProfile = {
  id: string;
  fullName: string;
  username: string;
  email?: string;
  role: "operator" | "staff";
  status?: "active" | "blocked";
};

let profileCache: { userId: string; value: CurrentProfile; expiresAt: number } | null = null;
let profileRequest: Promise<CurrentProfile | null> | null = null;

type ShiftRow = {
  id: string;
  operator_id: string;
  work_date: string;
  started_at: string;
  ended_at: string | null;
  worked_minutes: number;
  shift_type: ShiftRecord["shiftType"];
  work_mode: ShiftRecord["workMode"] | null;
  operator_name: string | null;
  has_mouse: boolean | null;
  has_keyboard: boolean | null;
  has_desk_ready: boolean | null;
  photo_name: string | null;
  location: string | null;
  work_schedule: string | null;
  break_events: ShiftRecord["breakEvents"] | null;
  pause_events: ShiftRecord["pauseEvents"] | null;
  failure_minutes: number | null;
  final_screenshot_name: string | null;
  started_at_iso: string | null;
  ended_at_iso: string | null;
  connection_photo_path: string | null;
  status: ShiftRecord["status"];
};

export type ShiftLoadOptions = {
  from?: string;
  to?: string;
  limit?: number;
};

type FailureRow = {
  id: string;
  operator_id: string;
  shift_record_id: string | null;
  started_at: string;
  ended_at: string | null;
  duration_minutes: number;
  explanation: string;
  evidence_path: string | null;
  status: FailureRecord["status"];
};

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function datePart(value: string) {
  return new Date(value).toISOString().slice(0, 10);
}

function timePart(value: string) {
  return new Date(value).toTimeString().slice(0, 5);
}

function startedAt(record: ShiftRecord | FailureRecord) {
  if ("startedAtIso" in record && record.startedAtIso) return record.startedAtIso;
  return new Date(`${record.date}T${record.startTime}`).toISOString();
}

function endedAt(record: ShiftRecord | FailureRecord) {
  if ("endedAtIso" in record && record.endedAtIso) return record.endedAtIso;
  return record.endTime ? new Date(`${record.date}T${record.endTime}`).toISOString() : null;
}

export async function loadCurrentProfile(force = false): Promise<CurrentProfile | null> {
  const supabase = getSupabaseBrowserClient();
  if (!isSupabaseConfigured || !supabase) return null;

  const { data: authData } = await supabase.auth.getSession();
  const userId = authData.session?.user.id;
  if (!userId) return null;
  const cachedProfile = profileCache;
  if (!force && cachedProfile && cachedProfile.userId === userId && cachedProfile.expiresAt > Date.now()) {
    return cachedProfile.value;
  }
  if (!force && profileRequest) return profileRequest;

  const request = (async () => {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, username, email, role, status")
      .eq("id", userId)
      .single();
    if (error || !data) return null;
    const value: CurrentProfile = {
      id: data.id,
      fullName: data.full_name,
      username: data.username,
      email: data.email,
      role: data.role,
      status: data.status
    };
    profileCache = { userId, value, expiresAt: Date.now() + 60000 };
    return value;
  })();
  profileRequest = request;
  try {
    return await request;
  } finally {
    profileRequest = null;
  }
}

export async function loadCloudShiftRecords(profile: CurrentProfile | null, options: ShiftLoadOptions = {}): Promise<ShiftRecord[]> {
  const localRecords = readStoredShiftRecords();
  const supabase = getSupabaseBrowserClient();
  if (!isSupabaseConfigured || !supabase || !profile) return localRecords;

  let query = supabase
    .from("shift_records")
    .select(`
      id, operator_id, work_date, started_at, ended_at, worked_minutes, shift_type, work_mode,
      operator_name:equipment->>operatorName,
      has_mouse:equipment->hasMouse,
      has_keyboard:equipment->hasKeyboard,
      has_desk_ready:equipment->hasDeskReady,
      photo_name:equipment->>photoName,
      location:equipment->>location,
      work_schedule:equipment->>workSchedule,
      break_events:equipment->breakEvents,
      pause_events:equipment->pauseEvents,
      failure_minutes:equipment->failureMinutes,
      final_screenshot_name:equipment->>finalScreenshotName,
      started_at_iso:equipment->>startedAtIso,
      ended_at_iso:equipment->>endedAtIso,
      connection_photo_path, status
    `)
    .order("started_at", { ascending: false })
    .limit(Math.min(400, Math.max(1, options.limit || 120)));

  if (profile.role === "operator") {
    query = query.eq("operator_id", profile.id);
  }
  if (options.from) query = query.gte("work_date", options.from);
  if (options.to) query = query.lte("work_date", options.to);

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data || []) as ShiftRow[];
  const localById = new Map(localRecords.map((record) => [record.id, record]));
  const records = rows.map((row) => {
    const localRecord = localById.get(row.id);
    return {
      id: row.id,
      operator: profile.role === "operator" ? profile.fullName : row.operator_name || "Operador",
      date: row.work_date || datePart(row.started_at),
      startTime: timePart(row.started_at),
      endTime: row.ended_at ? timePart(row.ended_at) : "",
      startedAtIso: row.started_at_iso || row.started_at,
      endedAtIso: row.ended_at_iso || row.ended_at || undefined,
      workedHours: Number(((row.worked_minutes || 0) / 60).toFixed(2)),
      shiftType: row.shift_type,
      workMode: row.work_mode || undefined,
      location: row.location || undefined,
      workSchedule: row.work_schedule || undefined,
      hasMouse: Boolean(row.has_mouse),
      hasKeyboard: Boolean(row.has_keyboard),
      hasDeskReady: Boolean(row.has_desk_ready),
      photoName: row.photo_name || row.connection_photo_path || "",
      photoDataUrl: localRecord?.photoDataUrl || "",
      breakEvents: Array.isArray(row.break_events) ? row.break_events : [],
      pauseEvents: Array.isArray(row.pause_events) ? row.pause_events : [],
      failureMinutes: Number(row.failure_minutes || 0),
      finalScreenshotName: row.final_screenshot_name || "",
      finalScreenshotDataUrl: localRecord?.finalScreenshotDataUrl || "",
      status: row.status
    };
  });

  writeStoredShiftRecords(records);
  return records;
}

export async function saveCloudShiftRecord(record: ShiftRecord) {
  const supabase = getSupabaseBrowserClient();
  if (!isSupabaseConfigured || !supabase || !isUuid(record.id)) return;

  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return;

  const { error } = await supabase.from("shift_records").upsert(
    {
      id: record.id,
      operator_id: authData.user.id,
      work_date: record.date,
      started_at: startedAt(record),
      ended_at: endedAt(record),
      worked_minutes: Math.round((record.workedHours || 0) * 60),
      shift_type: record.shiftType,
      work_mode: record.workMode || null,
      equipment: {
        operatorName: record.operator,
        hasMouse: record.hasMouse,
        hasKeyboard: record.hasKeyboard,
        hasDeskReady: record.hasDeskReady,
        photoName: record.photoName,
        location: record.location,
        workSchedule: record.workSchedule,
        breakEvents: record.breakEvents || [],
        pauseEvents: record.pauseEvents || [],
        failureMinutes: record.failureMinutes || 0,
        finalScreenshotName: record.finalScreenshotName || null,
        startedAtIso: record.startedAtIso || null,
        endedAtIso: record.endedAtIso || null
      },
      connection_photo_path: record.photoName || null,
      status: record.status
    },
    { onConflict: "id" }
  );
  if (error) throw error;
}

export async function loadCloudFailureRecords(profile: CurrentProfile | null, options: ShiftLoadOptions = {}): Promise<FailureRecord[]> {
  const localRecords = readStoredFailureRecords();
  const supabase = getSupabaseBrowserClient();
  if (!isSupabaseConfigured || !supabase || !profile) return localRecords;

  let query = supabase
    .from("failure_records")
    .select("id, operator_id, shift_record_id, started_at, ended_at, duration_minutes, explanation, evidence_path, status")
    .order("started_at", { ascending: false })
    .limit(Math.min(400, Math.max(1, options.limit || 120)));

  if (profile.role === "operator") {
    query = query.eq("operator_id", profile.id);
  }
  if (options.from) query = query.gte("started_at", `${options.from}T00:00:00`);
  if (options.to) query = query.lte("started_at", `${options.to}T23:59:59.999`);

  const { data, error } = await query;
  if (error) throw error;

  const cloudRecords = ((data || []) as FailureRow[]).map((row) => ({
    id: row.id,
    shiftRecordId: row.shift_record_id || undefined,
    operator: profile.role === "operator" ? profile.fullName : "Operador",
    date: datePart(row.started_at),
    startTime: timePart(row.started_at),
    endTime: row.ended_at ? timePart(row.ended_at) : "",
    startedAtIso: row.started_at,
    endedAtIso: row.ended_at || undefined,
    durationMinutes: row.duration_minutes || 0,
    explanation: row.explanation,
    evidenceName: row.evidence_path || "",
    evidenceDataUrl: "",
    status: row.status
  }));

  const records = cloudRecords.map((record) => {
    const localSolvedRecord = localRecords.find((localRecord) =>
      localRecord.id === record.id && localRecord.status === "Solucionada"
    );
    return localSolvedRecord || record;
  });

  writeStoredFailureRecords(records);
  return records;
}

export async function saveCloudFailureRecord(record: FailureRecord, shiftRecordId?: string) {
  const supabase = getSupabaseBrowserClient();
  if (!isSupabaseConfigured || !supabase || !isUuid(record.id)) return;

  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return;

  const { error } = await supabase.from("failure_records").upsert(
    {
      id: record.id,
      operator_id: authData.user.id,
      shift_record_id: shiftRecordId && isUuid(shiftRecordId) ? shiftRecordId : null,
      started_at: startedAt(record),
      ended_at: endedAt(record),
      duration_minutes: record.durationMinutes,
      explanation: record.explanation,
      evidence_path: record.evidenceName || null,
      status: record.status
    },
    { onConflict: "id" }
  );
  if (error) throw error;
}

export async function closeCloudOpenFailureRecords(record: FailureRecord) {
  const supabase = getSupabaseBrowserClient();
  if (!isSupabaseConfigured || !supabase || record.status !== "Solucionada") return;

  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return;

  const { error } = await supabase
    .from("failure_records")
    .update({
      ended_at: endedAt(record),
      duration_minutes: record.durationMinutes,
      status: "Solucionada"
    })
    .eq("operator_id", authData.user.id)
    .eq("id", record.id)
    .eq("status", "Abierta");
  if (error) throw error;
}
