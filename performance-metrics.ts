import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { clearClientCache, readClientCache, writeClientCache } from "@/lib/client-cache";
import { performanceCacheTtlMs } from "@/lib/usage-controls";

export type PerformanceMetric = {
  id?: string;
  metricScope?: "day" | "month";
  operatorId?: string;
  operatorName: string;
  operatorUsername: string;
  metricDate: string;
  totalOrders: number;
  callbacks: number;
  approvedSales: number;
  rejected: number;
  trash: number;
  averageCheck: number;
  listMinutes: number;
  salesPerHour: number;
  processingFile?: string;
  hourlyFile?: string;
  updatedAt?: string;
};

export type PerformanceImportRow = Partial<Omit<PerformanceMetric, "operatorName" | "operatorUsername">> & {
  sourceOperator: string;
};

export type DailyPerformanceSummary = {
  id?: string;
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
  sourceFile?: string;
  updatedAt?: string;
};

export type OperatorProfile = {
  id: string;
  fullName: string;
  username: string;
};

export type PerformanceTargets = {
  minimumSalesPerHour: number;
  minimumAverageCheck: number;
  targetApprovedRate: number;
  minimumApprovedRate: number;
};

const storageKey = "unicall-blue-performance";
const dailyStorageKey = "unicall-blue-daily-performance";
const targetsStorageKey = "unicall-blue-performance-targets";
const embeddedSummaryMarker = "UBGENERALSUMMARY:";
const performanceCachePrefix = "unicall-blue:performance:";

function performanceCacheKey(parts: Array<string | number | undefined>) {
  return `${performanceCachePrefix}${parts.map((part) => String(part || "")).join(":")}`;
}

function readableSupabaseError(error: unknown, fallback: string) {
  if (!error) return fallback;
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null) {
    const item = error as { message?: string; details?: string; hint?: string; code?: string };
    const message = [item.message, item.details, item.hint].filter(Boolean).join(" ");
    if (message) return message;
    if (item.code) return `${fallback} Codigo: ${item.code}`;
  }
  return fallback;
}

export const defaultPerformanceTargets: PerformanceTargets = {
  minimumSalesPerHour: 1,
  minimumAverageCheck: 3.42,
  targetApprovedRate: 21,
  minimumApprovedRate: 19
};

function safeTargetValue(value: unknown, fallback: number, min: number, max: number) {
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : fallback;
}

export function readPerformanceTargets(): PerformanceTargets {
  if (typeof window === "undefined") return defaultPerformanceTargets;
  try {
    const saved = JSON.parse(localStorage.getItem(targetsStorageKey) || "{}") as Partial<PerformanceTargets>;
    return {
      minimumSalesPerHour: safeTargetValue(saved.minimumSalesPerHour, defaultPerformanceTargets.minimumSalesPerHour, 0.1, 10),
      minimumAverageCheck: safeTargetValue(saved.minimumAverageCheck, defaultPerformanceTargets.minimumAverageCheck, 1, 20),
      targetApprovedRate: safeTargetValue(saved.targetApprovedRate, defaultPerformanceTargets.targetApprovedRate, 1, 100),
      minimumApprovedRate: safeTargetValue(saved.minimumApprovedRate, defaultPerformanceTargets.minimumApprovedRate, 1, 100)
    };
  } catch {
    return defaultPerformanceTargets;
  }
}

export function writePerformanceTargets(targets: PerformanceTargets) {
  if (typeof window === "undefined") return;
  localStorage.setItem(targetsStorageKey, JSON.stringify(targets));
}

function readLocalMetrics(): PerformanceMetric[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(storageKey) || "[]") as PerformanceMetric[];
  } catch {
    return [];
  }
}

function writeLocalMetrics(metrics: PerformanceMetric[]) {
  localStorage.setItem(storageKey, JSON.stringify(metrics));
}

function readLocalDailySummaries(): DailyPerformanceSummary[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(dailyStorageKey) || "[]") as DailyPerformanceSummary[];
  } catch {
    return [];
  }
}

function writeLocalDailySummaries(summaries: DailyPerformanceSummary[]) {
  localStorage.setItem(dailyStorageKey, JSON.stringify(summaries));
}

function dailyFromCloud(row: Record<string, unknown>): DailyPerformanceSummary {
  return {
    id: String(row.id || ""),
    summaryScope: row.summary_scope === "month" ? "month" : "day",
    metricDate: String(row.metric_date || ""),
    totalOrders: Number(row.total_orders || 0),
    callbacks: Number(row.callbacks || 0),
    noAnswer: Number(row.no_answer || 0),
    approvedSales: Number(row.approved_sales || 0),
    approvedRate: Number(row.approved_rate || 0),
    rejected: Number(row.rejected || 0),
    trash: Number(row.trash || 0),
    averageCheck: Number(row.average_check || 0),
    sourceFile: String(row.source_file || ""),
    updatedAt: String(row.updated_at || "")
  };
}

function encodeEmbeddedSummary(summary: DailyPerformanceSummary) {
  return encodeURIComponent(JSON.stringify(summary));
}

function splitEmbeddedSummary(value: unknown) {
  const text = String(value || "");
  const markerIndex = text.lastIndexOf(embeddedSummaryMarker);
  if (markerIndex < 0) return { filename: text, summary: null as DailyPerformanceSummary | null };
  const filename = text.slice(0, markerIndex).replace(/\|$/, "");
  try {
    return {
      filename,
      summary: JSON.parse(decodeURIComponent(text.slice(markerIndex + embeddedSummaryMarker.length))) as DailyPerformanceSummary
    };
  } catch {
    return { filename, summary: null as DailyPerformanceSummary | null };
  }
}

function withEmbeddedSummary(filename: unknown, summary: DailyPerformanceSummary) {
  const cleanFilename = splitEmbeddedSummary(filename).filename;
  return `${cleanFilename}${cleanFilename ? "|" : ""}${embeddedSummaryMarker}${encodeEmbeddedSummary(summary)}`;
}

function dailySummaryTableUnavailable(error: unknown) {
  const message = readableSupabaseError(error, "").toLowerCase();
  return message.includes("performance_daily_summary")
    || message.includes("schema cache")
    || (message.includes("relation") && message.includes("does not exist"));
}

async function loadEmbeddedDailySummary(
  supabase: NonNullable<ReturnType<typeof getSupabaseBrowserClient>>,
  metricDate: string,
  summaryScope: "day" | "month"
) {
  const { data, error } = await supabase
    .from("operator_performance")
    .select("hourly_file")
    .eq("metric_date", metricDate)
    .eq("metric_scope", summaryScope)
    .like("hourly_file", `%${embeddedSummaryMarker}%`)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(readableSupabaseError(error, "No fue posible cargar el cierre general."));
  return splitEmbeddedSummary((data as { hourly_file?: string } | null)?.hourly_file).summary;
}

async function loadLatestEmbeddedDailySummary(
  supabase: NonNullable<ReturnType<typeof getSupabaseBrowserClient>>,
  summaryScope: "day" | "month"
) {
  const { data, error } = await supabase
    .from("operator_performance")
    .select("hourly_file")
    .eq("metric_scope", summaryScope)
    .like("hourly_file", `%${embeddedSummaryMarker}%`)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(readableSupabaseError(error, "No fue posible cargar el ultimo cierre general."));
  return splitEmbeddedSummary((data as { hourly_file?: string } | null)?.hourly_file).summary;
}

function newestDailySummary(
  primary: DailyPerformanceSummary | null,
  secondary: DailyPerformanceSummary | null
) {
  if (!primary) return secondary;
  if (!secondary) return primary;
  const primaryTime = new Date(primary.updatedAt || 0).getTime();
  const secondaryTime = new Date(secondary.updatedAt || 0).getTime();
  return secondaryTime > primaryTime ? secondary : primary;
}

async function saveEmbeddedDailySummary(
  supabase: NonNullable<ReturnType<typeof getSupabaseBrowserClient>>,
  summary: DailyPerformanceSummary,
  updatedBy: string | null
) {
  const scope = summary.summaryScope || "day";
  const [{ data: profileRows, error: profilesError }, { data: existingRows, error: existingError }] = await Promise.all([
    supabase.from("profiles").select("id").eq("role", "operator").eq("status", "active"),
    supabase
      .from("operator_performance")
      .select("operator_id,hourly_file")
      .eq("metric_date", summary.metricDate)
      .eq("metric_scope", scope)
  ]);
  if (profilesError) throw new Error(readableSupabaseError(profilesError, "No fue posible identificar los operadores activos."));
  if (existingError) throw new Error(readableSupabaseError(existingError, "No fue posible preparar el cierre general."));

  const existingByOperator = new Map(
    ((existingRows || []) as Array<{ operator_id: string; hourly_file?: string }>).map((row) => [row.operator_id, row.hourly_file || ""])
  );
  const updatedAt = summary.updatedAt || new Date().toISOString();
  const payload = ((profileRows || []) as Array<{ id: string }>).map((profile) => ({
    operator_id: profile.id,
    metric_date: summary.metricDate,
    metric_scope: scope,
    hourly_file: withEmbeddedSummary(existingByOperator.get(profile.id), summary),
    updated_by: updatedBy,
    updated_at: updatedAt
  }));
  if (!payload.length) throw new Error("No hay operadores activos para publicar el cierre general.");
  const { error } = await supabase
    .from("operator_performance")
    .upsert(payload, { onConflict: "operator_id,metric_date,metric_scope" });
  if (error) throw new Error(readableSupabaseError(error, "No fue posible publicar el cierre general a los operadores."));
}

function fromCloud(row: Record<string, unknown>): PerformanceMetric {
  const profile = row.profiles as { full_name?: string; username?: string } | null;
  return {
    id: String(row.id || ""),
    operatorId: String(row.operator_id || ""),
    metricScope: row.metric_scope === "month" ? "month" : "day",
    operatorName: profile?.full_name || "Operador",
    operatorUsername: profile?.username || "",
    metricDate: String(row.metric_date || ""),
    totalOrders: Number(row.total_orders || 0),
    callbacks: Number(row.callbacks || 0),
    approvedSales: Number(row.approved_sales || 0),
    rejected: Number(row.rejected || 0),
    trash: Number(row.trash || 0),
    averageCheck: Number(row.average_check || 0),
    listMinutes: Number(row.list_minutes || 0),
    salesPerHour: Number(row.sales_per_hour || 0),
    processingFile: String(row.processing_file || ""),
    hourlyFile: String(row.hourly_file || ""),
    updatedAt: String(row.updated_at || "")
  };
}

export function normalizeOperatorKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export async function loadOperatorProfiles(): Promise<OperatorProfile[]> {
  const supabase = getSupabaseBrowserClient();
  if (!isSupabaseConfigured || !supabase) return [];
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, username")
    .eq("role", "operator")
    .eq("status", "active")
    .order("full_name");
  if (error) throw error;
  return ((data || []) as Array<{ id: string; full_name: string; username: string }>).map((profile) => ({
    id: profile.id,
    fullName: profile.full_name,
    username: profile.username
  }));
}

function missingMetricScopeMessage(error: unknown) {
  return readableSupabaseError(error, "").toLowerCase().includes("metric_scope");
}

export async function loadStaffPerformance(metricDate: string, metricScope: "day" | "month" = "day"): Promise<PerformanceMetric[]> {
  const cacheKey = performanceCacheKey(["staff", metricDate, metricScope]);
  const cached = readClientCache<PerformanceMetric[]>(cacheKey);
  if (cached) return cached;
  const supabase = getSupabaseBrowserClient();
  if (!isSupabaseConfigured || !supabase) {
    return readLocalMetrics().filter((metric) => metric.metricDate === metricDate && (metric.metricScope || "day") === metricScope);
  }
  const { data, error } = await supabase
    .from("operator_performance")
    .select("*, profiles!operator_performance_operator_id_fkey(full_name, username)")
    .eq("metric_date", metricDate)
    .eq("metric_scope", metricScope)
    .order("updated_at", { ascending: false });
  if (error) {
    if (metricScope === "day" && missingMetricScopeMessage(error)) {
      const { data: legacyData, error: legacyError } = await supabase
        .from("operator_performance")
        .select("*, profiles!operator_performance_operator_id_fkey(full_name, username)")
        .eq("metric_date", metricDate)
        .order("updated_at", { ascending: false });
      if (legacyError) throw legacyError;
      const legacyItems = ((legacyData || []) as Array<Record<string, unknown>>).map((row) => fromCloud(row));
      writeClientCache(cacheKey, legacyItems, performanceCacheTtlMs());
      return legacyItems;
    }
    throw error;
  }
  const items = ((data || []) as Array<Record<string, unknown>>).map((row) => fromCloud(row));
  writeClientCache(cacheKey, items, performanceCacheTtlMs());
  return items;
}

export async function loadMyPerformance(metricDate: string, metricScope: "day" | "month" = "day"): Promise<PerformanceMetric | null> {
  const cacheKey = performanceCacheKey(["mine", metricDate, metricScope]);
  const cached = readClientCache<PerformanceMetric | null>(cacheKey);
  if (cached !== null) return cached;
  const supabase = getSupabaseBrowserClient();
  if (!isSupabaseConfigured || !supabase) {
    return readLocalMetrics().find((metric) => metric.metricDate === metricDate && (metric.metricScope || "day") === metricScope) || null;
  }
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return null;
  const { data, error } = await supabase
    .from("operator_performance")
    .select("*, profiles!operator_performance_operator_id_fkey(full_name, username)")
    .eq("operator_id", authData.user.id)
    .eq("metric_date", metricDate)
    .eq("metric_scope", metricScope)
    .maybeSingle();
  if (error) {
    if (metricScope === "day" && missingMetricScopeMessage(error)) {
      const { data: legacyData, error: legacyError } = await supabase
        .from("operator_performance")
        .select("*, profiles!operator_performance_operator_id_fkey(full_name, username)")
        .eq("operator_id", authData.user.id)
        .eq("metric_date", metricDate)
        .maybeSingle();
      if (legacyError) throw legacyError;
      const legacyMetric = legacyData ? fromCloud(legacyData as Record<string, unknown>) : null;
      writeClientCache(cacheKey, legacyMetric, performanceCacheTtlMs());
      return legacyMetric;
    }
    throw error;
  }
  const metric = data ? fromCloud(data as Record<string, unknown>) : null;
  writeClientCache(cacheKey, metric, performanceCacheTtlMs());
  return metric;
}

export async function loadLatestMyPerformance(metricScope: "day" | "month" = "day"): Promise<PerformanceMetric | null> {
  const cacheKey = performanceCacheKey(["latest-mine", metricScope]);
  const cached = readClientCache<PerformanceMetric | null>(cacheKey);
  if (cached !== null) return cached;
  const supabase = getSupabaseBrowserClient();
  if (!isSupabaseConfigured || !supabase) {
    return [...readLocalMetrics()]
      .filter((metric) => (metric.metricScope || "day") === metricScope)
      .sort((a, b) => (b.metricDate || "").localeCompare(a.metricDate || "") || (b.updatedAt || "").localeCompare(a.updatedAt || ""))
      .at(0) || null;
  }
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return null;
  const { data, error } = await supabase
    .from("operator_performance")
    .select("*, profiles!operator_performance_operator_id_fkey(full_name, username)")
    .eq("operator_id", authData.user.id)
    .eq("metric_scope", metricScope)
    .order("metric_date", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    if (metricScope === "day" && missingMetricScopeMessage(error)) {
      const { data: legacyData, error: legacyError } = await supabase
        .from("operator_performance")
        .select("*, profiles!operator_performance_operator_id_fkey(full_name, username)")
        .eq("operator_id", authData.user.id)
        .order("metric_date", { ascending: false })
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (legacyError) throw legacyError;
      const legacyMetric = legacyData ? fromCloud(legacyData as Record<string, unknown>) : null;
      writeClientCache(cacheKey, legacyMetric, performanceCacheTtlMs());
      return legacyMetric;
    }
    throw error;
  }
  const metric = data ? fromCloud(data as Record<string, unknown>) : null;
  writeClientCache(cacheKey, metric, performanceCacheTtlMs());
  return metric;
}

function missingSummaryScopeMessage(error: unknown) {
  return readableSupabaseError(error, "").toLowerCase().includes("summary_scope");
}

export async function loadDailyPerformanceSummary(metricDate: string, summaryScope: "day" | "month" = "day"): Promise<DailyPerformanceSummary | null> {
  const cacheKey = performanceCacheKey(["daily-summary", metricDate, summaryScope]);
  const cached = readClientCache<DailyPerformanceSummary | null>(cacheKey);
  if (cached !== null) return cached;
  const supabase = getSupabaseBrowserClient();
  if (!isSupabaseConfigured || !supabase) {
    return readLocalDailySummaries().find((summary) => summary.metricDate === metricDate && (summary.summaryScope || "day") === summaryScope) || null;
  }
  const { data, error } = await supabase
    .from("performance_daily_summary")
    .select("*")
    .eq("metric_date", metricDate)
    .eq("summary_scope", summaryScope)
    .maybeSingle();
  if (error) {
    if (dailySummaryTableUnavailable(error)) {
      const embeddedSummary = await loadEmbeddedDailySummary(supabase, metricDate, summaryScope).catch(() => null);
      writeClientCache(cacheKey, embeddedSummary, performanceCacheTtlMs());
      return embeddedSummary;
    }
    if (summaryScope === "day" && missingSummaryScopeMessage(error)) {
      const { data: legacyData, error: legacyError } = await supabase
        .from("performance_daily_summary")
        .select("*")
        .eq("metric_date", metricDate)
        .maybeSingle();
      if (legacyError) throw new Error(readableSupabaseError(legacyError, "No fue posible cargar el resumen general diario."));
      const embeddedSummary = await loadEmbeddedDailySummary(supabase, metricDate, summaryScope).catch(() => null);
      const summary = newestDailySummary(legacyData ? dailyFromCloud(legacyData as Record<string, unknown>) : null, embeddedSummary);
      writeClientCache(cacheKey, summary, performanceCacheTtlMs());
      return summary;
    }
    throw new Error(readableSupabaseError(error, "No fue posible cargar el resumen general diario."));
  }
  if (data) {
    const summary = dailyFromCloud(data as Record<string, unknown>);
    writeClientCache(cacheKey, summary, performanceCacheTtlMs());
    return summary;
  }
  const embeddedSummary = await loadEmbeddedDailySummary(supabase, metricDate, summaryScope).catch(() => null);
  writeClientCache(cacheKey, embeddedSummary, performanceCacheTtlMs());
  return embeddedSummary;
}

export async function loadLatestDailyPerformanceSummary(summaryScope: "day" | "month" = "day"): Promise<DailyPerformanceSummary | null> {
  const cacheKey = performanceCacheKey(["latest-daily-summary", summaryScope]);
  const cached = readClientCache<DailyPerformanceSummary | null>(cacheKey);
  if (cached !== null) return cached;
  const supabase = getSupabaseBrowserClient();
  if (!isSupabaseConfigured || !supabase) {
    return [...readLocalDailySummaries()]
      .filter((summary) => (summary.summaryScope || "day") === summaryScope)
      .sort((a, b) => (b.metricDate || "").localeCompare(a.metricDate || "") || (b.updatedAt || "").localeCompare(a.updatedAt || ""))
      .at(0) || null;
  }
  const { data, error } = await supabase
    .from("performance_daily_summary")
    .select("*")
    .eq("summary_scope", summaryScope)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    if (dailySummaryTableUnavailable(error)) {
      const embeddedSummary = await loadLatestEmbeddedDailySummary(supabase, summaryScope).catch(() => null);
      writeClientCache(cacheKey, embeddedSummary, performanceCacheTtlMs());
      return embeddedSummary;
    }
    if (summaryScope === "day" && missingSummaryScopeMessage(error)) {
      const { data: legacyData, error: legacyError } = await supabase
        .from("performance_daily_summary")
        .select("*")
        .order("metric_date", { ascending: false })
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (legacyError) throw new Error(readableSupabaseError(legacyError, "No fue posible cargar el ultimo resumen general diario."));
      const embeddedSummary = await loadLatestEmbeddedDailySummary(supabase, summaryScope).catch(() => null);
      const summary = newestDailySummary(legacyData ? dailyFromCloud(legacyData as Record<string, unknown>) : null, embeddedSummary);
      writeClientCache(cacheKey, summary, performanceCacheTtlMs());
      return summary;
    }
    throw new Error(readableSupabaseError(error, "No fue posible cargar el ultimo resumen general diario."));
  }
  if (data) {
    const summary = dailyFromCloud(data as Record<string, unknown>);
    writeClientCache(cacheKey, summary, performanceCacheTtlMs());
    return summary;
  }

  // Records created before summary_scope existed can still be the latest
  // publication. Keep them visible in the daily operator view.
  if (summaryScope === "day") {
    const { data: compatibleData, error: compatibleError } = await supabase
      .from("performance_daily_summary")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (compatibleError) throw new Error(readableSupabaseError(compatibleError, "No fue posible cargar el ultimo resumen general diario."));
    const embeddedSummary = await loadLatestEmbeddedDailySummary(supabase, summaryScope).catch(() => null);
    const summary = newestDailySummary(compatibleData ? dailyFromCloud(compatibleData as Record<string, unknown>) : null, embeddedSummary);
    writeClientCache(cacheKey, summary, performanceCacheTtlMs());
    return summary;
  }
  const embeddedSummary = await loadLatestEmbeddedDailySummary(supabase, summaryScope).catch(() => null);
  writeClientCache(cacheKey, embeddedSummary, performanceCacheTtlMs());
  return embeddedSummary;
}

export async function saveDailyPerformanceSummary(summary: DailyPerformanceSummary) {
  clearClientCache(performanceCachePrefix);
  const supabase = getSupabaseBrowserClient();
  const updatedAt = new Date().toISOString();
  const nextSummary = { ...summary, updatedAt };
  if (!isSupabaseConfigured || !supabase) {
    const existing = readLocalDailySummaries().filter((item) => !(item.metricDate === summary.metricDate && (item.summaryScope || "day") === (summary.summaryScope || "day")));
    writeLocalDailySummaries([nextSummary, ...existing]);
    return nextSummary;
  }
  const { data: authData } = await supabase.auth.getUser();
  const payload = {
    summary_scope: summary.summaryScope || "day",
    metric_date: summary.metricDate,
    total_orders: summary.totalOrders,
    callbacks: summary.callbacks,
    no_answer: summary.noAnswer,
    approved_sales: summary.approvedSales,
    approved_rate: summary.approvedRate,
    rejected: summary.rejected,
    trash: summary.trash,
    average_check: summary.averageCheck,
    source_file: summary.sourceFile || "",
    updated_by: authData.user?.id || null,
    updated_at: updatedAt
  };
  const { error } = await supabase
    .from("performance_daily_summary")
    .upsert(payload, { onConflict: "metric_date,summary_scope" });
  if (error) {
    const message = readableSupabaseError(error, "No fue posible guardar el resumen general diario.");
    if (message.toLowerCase().includes("summary_scope")) {
      if ((summary.summaryScope || "day") === "month") {
        throw new Error("Falta ejecutar la migracion 012 para guardar el resumen mensual separado del resumen diario.");
      }
      const { summary_scope, ...legacyPayload } = payload;
      void summary_scope;
      const { error: legacyError } = await supabase
        .from("performance_daily_summary")
        .upsert(legacyPayload, { onConflict: "metric_date" });
      if (!legacyError) {
        await saveEmbeddedDailySummary(supabase, nextSummary, authData.user?.id || null);
        clearClientCache(performanceCachePrefix);
        return nextSummary;
      }
    }
    if (message.toLowerCase().includes("approved_rate")) {
      const { approved_rate, ...legacyPayload } = payload;
      void approved_rate;
      const { error: legacyError } = await supabase
        .from("performance_daily_summary")
        .upsert(legacyPayload, { onConflict: "metric_date" });
      if (!legacyError) {
        await saveEmbeddedDailySummary(supabase, nextSummary, authData.user?.id || null);
        clearClientCache(performanceCachePrefix);
        return nextSummary;
      }
    }
    if (dailySummaryTableUnavailable(error)) {
      await saveEmbeddedDailySummary(supabase, nextSummary, authData.user?.id || null);
      const existing = readLocalDailySummaries().filter((item) => !(item.metricDate === summary.metricDate && (item.summaryScope || "day") === (summary.summaryScope || "day")));
      writeLocalDailySummaries([nextSummary, ...existing]);
      clearClientCache(performanceCachePrefix);
      return nextSummary;
    }
    throw new Error(message);
  }
  // Publish the same small summary in each operator row. This guarantees that
  // operators can read it even when the shared summary table has partial RLS
  // policies or a delayed schema migration.
  await saveEmbeddedDailySummary(supabase, nextSummary, authData.user?.id || null);
  const existing = readLocalDailySummaries().filter((item) => !(item.metricDate === summary.metricDate && (item.summaryScope || "day") === (summary.summaryScope || "day")));
  writeLocalDailySummaries([nextSummary, ...existing]);
  clearClientCache(performanceCachePrefix);
  return nextSummary;
}

export async function savePerformanceImport(
  rows: PerformanceImportRow[],
  profiles: OperatorProfile[],
  metricDate: string,
  targets: PerformanceTargets = defaultPerformanceTargets,
  metricScope: "day" | "month" = "day"
) {
  clearClientCache(performanceCachePrefix);
  const isProcessingImport = rows.some((row) => Boolean(row.processingFile));
  const profileMap = new Map<string, OperatorProfile>();
  profiles.forEach((profile) => {
    profileMap.set(normalizeOperatorKey(profile.username), profile);
    profileMap.set(normalizeOperatorKey(profile.fullName), profile);
  });

  const matched: PerformanceMetric[] = [];
  const unmatched: string[] = [];
  rows.forEach((row) => {
    const profile = profileMap.get(normalizeOperatorKey(row.sourceOperator));
    if (!profile) {
      unmatched.push(row.sourceOperator);
      return;
    }
    matched.push({
      operatorId: profile.id,
      operatorName: profile.fullName,
      operatorUsername: profile.username,
      metricScope,
      metricDate,
      totalOrders: Number(row.totalOrders || 0),
      callbacks: Number(row.callbacks || 0),
      approvedSales: Number(row.approvedSales || 0),
      rejected: Number(row.rejected || 0),
      trash: Number(row.trash || 0),
      averageCheck: Number(row.averageCheck || 0),
      listMinutes: Number(row.listMinutes || 0),
      salesPerHour: Number(row.salesPerHour || 0),
      processingFile: row.processingFile,
      hourlyFile: row.hourlyFile,
      updatedAt: new Date().toISOString()
    });
  });

  const supabase = getSupabaseBrowserClient();
  if (!isSupabaseConfigured || !supabase) {
    const existing = readLocalMetrics();
    existing.forEach((metric) => {
      if (metric.metricDate !== metricDate || (metric.metricScope || "day") !== metricScope) return;
      if (isProcessingImport) {
        metric.totalOrders = 0;
        metric.callbacks = 0;
        metric.approvedSales = 0;
        metric.rejected = 0;
        metric.trash = 0;
        metric.averageCheck = 0;
      } else {
        metric.listMinutes = 0;
        metric.salesPerHour = 0;
      }
    });
    matched.forEach((metric) => {
      const index = existing.findIndex(
        (item) => item.operatorUsername === metric.operatorUsername && item.metricDate === metricDate
          && (item.metricScope || "day") === metricScope
      );
      if (index >= 0) {
        existing[index] = metric.processingFile
          ? { ...existing[index], totalOrders: metric.totalOrders, callbacks: metric.callbacks, approvedSales: metric.approvedSales, rejected: metric.rejected, trash: metric.trash, averageCheck: metric.averageCheck, processingFile: metric.processingFile, updatedAt: metric.updatedAt }
          : { ...existing[index], listMinutes: metric.listMinutes, salesPerHour: metric.salesPerHour, hourlyFile: metric.hourlyFile, updatedAt: metric.updatedAt };
      }
      else existing.push(metric);
    });
    writeLocalMetrics(existing);
    clearClientCache(performanceCachePrefix);
    return { matched, unmatched, alerts: [] as string[] };
  }

  const resetValues = isProcessingImport
    ? { total_orders: 0, callbacks: 0, approved_sales: 0, rejected: 0, trash: 0, average_check: 0 }
    : { list_minutes: 0, sales_per_hour: 0 };
  const { error: resetError } = await supabase
    .from("operator_performance")
    .update(resetValues)
    .eq("metric_date", metricDate)
    .eq("metric_scope", metricScope);
  if (resetError) {
    if (metricScope === "month" && missingMetricScopeMessage(resetError)) {
      throw new Error("Falta ejecutar la migracion 013 para guardar Procesando separado por dia y mes.");
    }
    const legacyResetValues = isProcessingImport
      ? { approved_sales: 0, rejected: 0, trash: 0, average_check: 0 }
      : { list_minutes: 0, sales_per_hour: 0 };
    const { error: legacyResetError } = await supabase
      .from("operator_performance")
      .update(legacyResetValues)
      .eq("metric_date", metricDate);
    if (legacyResetError) throw legacyResetError;
  }

  const { data: authData } = await supabase.auth.getUser();

  const existingHourlyFiles = new Map<string, string>();
  if (!isProcessingImport) {
    const { data: existingHourlyRows } = await supabase
      .from("operator_performance")
      .select("operator_id,hourly_file")
      .eq("metric_date", metricDate)
      .eq("metric_scope", metricScope);
    ((existingHourlyRows || []) as Array<{ operator_id: string; hourly_file?: string }>).forEach((row) => {
      existingHourlyFiles.set(row.operator_id, row.hourly_file || "");
    });
  }

  const payload = matched.map((metric) => {
    const source = rows.find((row) => {
      const profile = profileMap.get(normalizeOperatorKey(row.sourceOperator));
      return profile?.id === metric.operatorId;
    });
    const values: Record<string, unknown> = {
      operator_id: metric.operatorId,
      metric_date: metricDate,
      metric_scope: metricScope,
      updated_by: authData.user?.id || null,
      updated_at: new Date().toISOString()
    };
    if (source?.processingFile) {
      values.total_orders = metric.totalOrders;
      values.callbacks = metric.callbacks;
      values.approved_sales = metric.approvedSales;
      values.rejected = metric.rejected;
      values.trash = metric.trash;
      values.average_check = metric.averageCheck;
      values.processing_file = source.processingFile;
    }
    if (source?.hourlyFile) {
      values.list_minutes = metric.listMinutes;
      values.sales_per_hour = metric.salesPerHour;
      const previousSummary = splitEmbeddedSummary(existingHourlyFiles.get(metric.operatorId || "")).summary;
      values.hourly_file = previousSummary
        ? withEmbeddedSummary(source.hourlyFile, previousSummary)
        : source.hourlyFile;
    }
    return values;
  });

  const { error } = await supabase
    .from("operator_performance")
    .upsert(payload, { onConflict: "operator_id,metric_date,metric_scope" });
  if (error) {
    if (metricScope === "month" && missingMetricScopeMessage(error)) {
      throw new Error("Falta ejecutar la migracion 013 para guardar Procesando separado por dia y mes.");
    }
    const legacyPayload = payload.map((row) => {
      const { total_orders, callbacks, metric_scope, ...legacyRow } = row;
      void total_orders;
      void callbacks;
      void metric_scope;
      return legacyRow;
    });
    const { error: legacyError } = await supabase
      .from("operator_performance")
      .upsert(legacyPayload, { onConflict: "operator_id,metric_date" });
    if (legacyError) throw legacyError;
  }
  const alerts = await notifyPerformanceAlerts(matched, isProcessingImport, metricDate, targets);
  clearClientCache(performanceCachePrefix);
  return { matched, unmatched, alerts };
}

async function notifyPerformanceAlerts(
  metrics: PerformanceMetric[],
  isProcessingImport: boolean,
  metricDate: string,
  targets: PerformanceTargets
) {
  const supabase = getSupabaseBrowserClient();
  if (!isSupabaseConfigured || !supabase) return [];

  const riskyMetrics = metrics.flatMap((metric) => {
    const alerts: Array<{ key: string; message: string }> = [];
    if (!isProcessingImport && metric.salesPerHour < targets.minimumSalesPerHour) {
      alerts.push({
        key: "venta por hora",
        message: `${metric.operatorUsername} esta bajo en venta por hora el ${metricDate}: ${metric.salesPerHour.toFixed(2)} / meta ${targets.minimumSalesPerHour.toFixed(2)}.`
      });
    }
    if (isProcessingImport && metric.averageCheck > 0 && metric.averageCheck < targets.minimumAverageCheck) {
      alerts.push({
        key: "cheque bajo",
        message: `${metric.operatorUsername} tiene cheque bajo el ${metricDate}: ${metric.averageCheck.toFixed(2)} / meta ${targets.minimumAverageCheck.toFixed(2)}.`
      });
    }
    return alerts.map((alert) => ({ ...alert, metric }));
  });

  if (!riskyMetrics.length) return [];

  const { data: staffRows, error: staffError } = await supabase
    .from("profiles")
    .select("id")
    .eq("role", "staff")
    .eq("status", "active");
  if (staffError) throw staffError;
  const staffIds = ((staffRows || []) as Array<{ id: string }>).map((row) => row.id);
  if (!staffIds.length) return [];

  const created: string[] = [];
  for (const alert of riskyMetrics) {
    const { data: existing, error: existingError } = await supabase
      .from("notifications")
      .select("id")
      .eq("title", "Alerta de productividad")
      .ilike("message", `%${alert.metric.operatorUsername}%${metricDate}%${alert.key}%`)
      .limit(1);
    if (existingError) throw existingError;
    if (existing?.length) continue;

    const { error: insertError } = await supabase.from("notifications").insert(
      staffIds.map((recipientId) => ({
        recipient_id: recipientId,
        title: "Alerta de productividad",
        message: alert.message
      }))
    );
    if (insertError) throw insertError;
    created.push(alert.message);
  }
  return created;
}

