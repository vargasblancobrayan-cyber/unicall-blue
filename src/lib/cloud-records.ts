import { CommercialRecord, readStoredRecords, writeStoredRecords } from "@/lib/records";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { listLimit } from "@/lib/usage-controls";

type CloudRecord = {
  local_id: string;
  operator_id: string;
  record_type: "sale" | "rejection" | "hidden_rejection";
  order_number: string | null;
  record_date: string;
  product: string | null;
  delivery_status: string;
  treatment: string | null;
  payment_method: string | null;
  campaign: string | null;
  client_name: string | null;
  phone: string | null;
  observation: string | null;
  follow_up_note: string | null;
  follow_up_at: string | null;
  hidden_rejection_status: string | null;
  created_at: string;
};

export type CommercialRecordLoadOptions = {
  from?: string;
  to?: string;
  recordTypes?: CloudRecord["record_type"][];
  limit?: number;
};

export function commercialMonthRange(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(year, monthNumber, 0).getDate();
  return { from: `${month}-01`, to: `${month}-${String(lastDay).padStart(2, "0")}` };
}

function matchesOptions(record: CommercialRecord, options: CommercialRecordLoadOptions) {
  const date = (record.recordDate || record.createdAt || "").slice(0, 10);
  const type = cloudType(record);
  if (options.from && date < options.from) return false;
  if (options.to && date > options.to) return false;
  if (options.recordTypes?.length && !options.recordTypes.includes(type)) return false;
  return true;
}

function cloudType(record: CommercialRecord): CloudRecord["record_type"] {
  if (record.status === "Rechazo oculto" || record.hiddenRejectionStatus) return "hidden_rejection";
  return record.type;
}

function fromCloud(row: CloudRecord, operatorName: string, operatorUsername: string): CommercialRecord {
  const hidden = row.record_type === "hidden_rejection";
  return {
    id: row.local_id,
    operatorId: row.operator_id,
    operatorUsername,
    type: row.record_type === "sale" ? "sale" : "rejection",
    operator: operatorName,
    campaign: row.campaign === "Fibra Hogar" ? "Usablue" : row.campaign || "Usablue",
    client: row.client_name || "",
    phone: row.phone || "",
    observation: row.observation || "",
    status: hidden ? "Rechazo oculto" : row.delivery_status,
    createdAt: row.created_at,
    orderNumber: row.order_number || undefined,
    recordDate: row.record_date,
    product: row.product || undefined,
    result: row.delivery_status,
    treatment: row.treatment || undefined,
    paymentMethod: row.payment_method || undefined,
    followUpNote: row.follow_up_note || undefined,
    followUpAt: row.follow_up_at || undefined,
    hiddenRejectionStatus: row.hidden_rejection_status || undefined
  };
}

export async function loadCommercialRecords(options: CommercialRecordLoadOptions = {}) {
  const localRecords = readStoredRecords();
  const supabase = getSupabaseBrowserClient();
  const localResult = localRecords.filter((record) => matchesOptions(record, options));
  if (!isSupabaseConfigured || !supabase) return localResult;

  const { data: authData } = await supabase.auth.getSession();
  if (!authData.session?.user) return localResult;

  let query = supabase
    .from("commercial_records")
    .select("local_id, operator_id, record_type, order_number, record_date, product, delivery_status, treatment, payment_method, campaign, client_name, phone, observation, follow_up_note, follow_up_at, hidden_rejection_status, created_at")
    .neq("delivery_status", "ELIMINADO");

  if (options.from) query = query.gte("record_date", options.from);
  if (options.to) query = query.lte("record_date", options.to);
  if (options.recordTypes?.length) query = query.in("record_type", options.recordTypes);
  query = query.order("created_at", { ascending: false }).limit(listLimit(options.limit || 160, 220));

  const { data, error } = await query;

  if (error) throw error;
  const rows = (data || []) as CloudRecord[];
  const operatorIds = Array.from(new Set(rows.map((row) => row.operator_id)));
  const profilesById = new Map<string, { fullName: string; username: string }>();

  if (operatorIds.length) {
    const { data: profiles } = await supabase.from("profiles").select("id, full_name, username").in("id", operatorIds);
    ((profiles || []) as Array<{ id: string; full_name: string; username: string }>).forEach((profile) =>
      profilesById.set(profile.id, { fullName: profile.full_name, username: profile.username })
    );
  }

  const records = rows.map((row) => {
    const profile = profilesById.get(row.operator_id);
    return fromCloud(row, profile?.fullName || "Operador", profile?.username || "Operador");
  });
  const fetchedIds = new Set(records.map((record) => record.id));
  writeStoredRecords([...records, ...localRecords.filter((record) => !fetchedIds.has(record.id))]);
  return records;
}

export async function saveCommercialRecord(record: CommercialRecord) {
  const supabase = getSupabaseBrowserClient();
  if (!isSupabaseConfigured || !supabase) return;

  const { data: authData } = await supabase.auth.getUser();
  const operatorId = record.operatorId || authData.user?.id;
  if (!operatorId) return;

  const { error } = await supabase.from("commercial_records").upsert(
    {
      local_id: record.id,
      operator_id: operatorId,
      record_type: cloudType(record),
      order_number: record.orderNumber || null,
      record_date: record.recordDate || record.createdAt.slice(0, 10),
      product: record.product || null,
      delivery_status: record.result || record.status || "PENDIENTE",
      treatment: record.treatment || null,
      payment_method: record.paymentMethod || null,
      campaign: record.campaign || null,
      client_name: record.client || null,
      phone: record.phone || null,
      observation: record.observation || null,
      follow_up_note: record.followUpNote || null,
      follow_up_at: record.followUpAt || null,
      hidden_rejection_status: record.hiddenRejectionStatus || null,
      reviewed_by:
        record.hiddenRejectionStatus && !["Pendiente", "En revision"].includes(record.hiddenRejectionStatus)
          ? authData.user?.id || null
          : null,
      updated_at: new Date().toISOString()
    },
    { onConflict: "local_id" }
  );

  if (error) throw error;
}

export async function commercialOrderExists(orderNumber: string) {
  const supabase = getSupabaseBrowserClient();
  if (!isSupabaseConfigured || !supabase || !orderNumber.trim()) return false;
  const { data, error } = await supabase.rpc("commercial_order_exists", { order_value: orderNumber.trim() });
  if (error) return false;
  return Boolean(data);
}

export async function deleteCommercialRecord(localId: string) {
  const supabase = getSupabaseBrowserClient();
  if (!isSupabaseConfigured || !supabase) return;
  const { error } = await supabase
    .from("commercial_records")
    .update({ delivery_status: "ELIMINADO", updated_at: new Date().toISOString() })
    .eq("local_id", localId);
  if (error) throw error;
}

export function saveCommercialRecordsLocally(records: CommercialRecord[]) {
  writeStoredRecords(records);
}
