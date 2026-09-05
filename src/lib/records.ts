export type CommercialRecordType = "sale" | "rejection";

export type CommercialRecord = {
  id: string;
  operatorId?: string;
  operatorUsername?: string;
  type: CommercialRecordType;
  operator: string;
  campaign: string;
  client: string;
  phone: string;
  observation: string;
  status: string;
  createdAt: string;
  orderNumber?: string;
  recordDate?: string;
  product?: string;
  result?: string;
  treatment?: string;
  paymentMethod?: string;
  followUpNote?: string;
  followUpAt?: string;
  verifiedBy?: string;
  hiddenRejectionStatus?: string;
  communicated?: string;
  thirdCallback?: string;
};

export function isCountedRejection(record: CommercialRecord) {
  return record.type === "rejection" && record.hiddenRejectionStatus !== "Aprobado";
}

export const recordsStorageKey = "unicall-blue-commercial-records";
export const connectionLogsStorageKey = "unicall-blue-connection-logs";
export const breakSchedulesStorageKey = "unicall-blue-break-schedules";
export const dailyShiftAssignmentsStorageKey = "unicall-blue-daily-shift-assignments";
export const shiftCalendarSettingsStorageKey = "unicall-blue-shift-calendar-settings";
export const breakAssignmentsStorageKey = "unicall-blue-break-assignments";
export const shiftRecordsStorageKey = "unicall-blue-shift-records";
export const failureRecordsStorageKey = "unicall-blue-failure-records";
export const certificateRequestsStorageKey = "unicall-blue-certificate-requests";
export const shiftChangeRequestsStorageKey = "unicall-blue-shift-change-requests";
export const trainingGalleryStorageKey = "unicall-blue-training-gallery";

export type ConnectionRecord = {
  id: string;
  operator: string;
  event: string;
  date: string;
  time: string;
  detail: string;
};

export type BreakSchedule = {
  operator: string;
  loginTime: string;
  lunch: string;
  breakOne: string;
  breakTwo: string;
  visibleToOperator?: boolean;
  breakOneVisible?: boolean;
  lunchVisible?: boolean;
  breakTwoVisible?: boolean;
  publishedAt?: string;
};

export type DailyShiftAssignment = {
  id: string;
  user: string;
  name: string;
  workMode?: "Oficina" | "Casa";
  location: string;
  workSchedule: string;
};

export type ShiftCalendarSettings = {
  scheduleMonth: string;
  firstWorkDay: string;
};

export type ShiftChangeColor = "green" | "blue";

export type ShiftChangeRequestStatus = "Pendiente" | "Aprobado" | "Denegado";

export type ShiftChangeRequest = {
  id: string;
  operatorId?: string;
  operator: string;
  operatorUsername?: string;
  workDate: string;
  returnDate?: string;
  color: ShiftChangeColor;
  replacementUser: string;
  reason: string;
  status: ShiftChangeRequestStatus;
  staffNote?: string;
  reviewedBy?: string;
  createdAt: string;
  updatedAt?: string;
};

export type BreakAssignment = {
  id: string;
  operator: string;
  breakTime: string;
};

export type ShiftRecord = {
  id: string;
  operator: string;
  date: string;
  startTime: string;
  endTime: string;
  startedAtIso?: string;
  endedAtIso?: string;
  workedHours: number;
  shiftType: "Turno normal" | "Extras";
  workMode?: "Oficina" | "Casa";
  location?: string;
  workSchedule?: string;
  hasMouse: boolean;
  hasKeyboard: boolean;
  hasDeskReady: boolean;
  photoName: string;
  photoDataUrl: string;
  breakEvents?: ShiftBreakEvent[];
  pauseEvents?: ShiftPauseEvent[];
  failureMinutes?: number;
  finalScreenshotName?: string;
  finalScreenshotDataUrl?: string;
  status: "Abierta" | "Finalizada" | "Falla reportada";
};

export type ShiftBreakEventType = "Break 1" | "Almuerzo" | "Break 2";

export type ShiftBreakEvent = {
  id: string;
  type: ShiftBreakEventType;
  startTime: string;
  endTime: string;
  startedAtIso?: string;
  endedAtIso?: string;
  durationMinutes: number;
  status: "Activa" | "Finalizada";
};

export type ShiftPauseReason = "Pausa";

export type ShiftPauseEvent = {
  id: string;
  reason: ShiftPauseReason;
  detail?: string;
  startTime: string;
  endTime: string;
  startedAtIso?: string;
  endedAtIso?: string;
  durationMinutes: number;
  status: "Activa" | "Finalizada";
};

export type FailureRecord = {
  id: string;
  shiftRecordId?: string;
  operator: string;
  date: string;
  startTime: string;
  endTime: string;
  startedAtIso?: string;
  endedAtIso?: string;
  durationMinutes: number;
  explanation: string;
  evidenceName: string;
  evidenceDataUrl: string;
  status: "Abierta" | "Solucionada";
};

export type CertificateRequest = {
  id: string;
  operatorId?: string;
  operator: string;
  certificateType: string;
  reason: string;
  createdAt: string;
  status: "Solicitado" | "En proceso" | "Listo" | "Rechazado";
  staffNote: string;
  documentName?: string;
  documentDataUrl?: string;
  documentPath?: string;
  hiddenFromStaff?: boolean;
  updatedAt?: string;
};

export type TrainingGalleryCategory =
  | "Ventas exitosas"
  | "Rechazos con buen manejo de objeciones"
  | "Manejo de pago con tarjeta"
  | "Venta exitosa"
  | "Rechazo con buen manejo de objeciones"
  | "Manejo de pago tarde"
  | "Cliente dificil"
  | "Retencion"
  | "Seguimiento ejemplar";

export type TrainingGalleryItem = {
  id: string;
  title: string;
  category: TrainingGalleryCategory;
  audioUrl: string;
  description: string;
  strategies: string;
  objections: string;
  result: string;
  createdBy?: string;
  createdAt: string;
};

export const expiredCertificateRequestNote =
  "Fue rechazada la solicitud por superar 30 dias sin entrega. Por favor vuelve a solicitarlo o dirigete con tu supervisor.";

export function expireOldCertificateRequests(records: CertificateRequest[], now = new Date()) {
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

  return records.map((record) => {
    const createdAt = new Date(record.createdAt);
    const isExpired = now.getTime() - createdAt.getTime() >= thirtyDaysMs;
    const isOpen = record.status === "Solicitado" || record.status === "En proceso";

    if (!isExpired || !isOpen) {
      return record;
    }

    return {
      ...record,
      status: "Rechazado" as CertificateRequest["status"],
      staffNote: expiredCertificateRequestNote
    };
  });
}

export function getRecordTypeLabel(type: CommercialRecordType) {
  if (type === "sale") return "Venta";
  return "Rechazo";
}

export function createRecordId() {
  return `REG-${Date.now().toString(36).toUpperCase()}`;
}

export function readStoredRecords(): CommercialRecord[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(recordsStorageKey);
    return raw ? (JSON.parse(raw) as CommercialRecord[]) : [];
  } catch {
    return [];
  }
}

export function writeStoredRecords(records: CommercialRecord[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(recordsStorageKey, JSON.stringify(records));
}

export function recordsToCsv(records: CommercialRecord[]) {
  const headers = [
    "ID",
    "Tipo",
    "Operador",
    "Pedido No",
    "Fecha",
    "Producto",
    "Estado de entrega",
    "Tratamiento",
    "Forma de pago",
    "Campana",
    "Cliente",
    "Telefono",
    "Observacion"
  ];

  const rows = records.map((record) => [
    record.id,
    getRecordTypeLabel(record.type),
    record.operator,
    record.orderNumber || "",
    record.recordDate || new Date(record.createdAt).toLocaleDateString("es-CO"),
    record.product || "",
    record.result || record.status,
    record.treatment || "",
    record.paymentMethod || "",
    record.campaign,
    record.client,
    record.phone,
    record.observation
  ]);

  return [headers, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))
    .join("\n");
}

export function readStoredConnectionLogs(): ConnectionRecord[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(connectionLogsStorageKey);
    return raw ? (JSON.parse(raw) as ConnectionRecord[]) : [];
  } catch {
    return [];
  }
}

export function writeStoredConnectionLogs(records: ConnectionRecord[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(connectionLogsStorageKey, JSON.stringify(records));
}

export function connectionLogsToCsv(records: ConnectionRecord[]) {
  const headers = ["ID", "Operador", "Evento", "Fecha", "Hora", "Detalle"];
  const rows = records.map((record) => [
    record.id,
    record.operator,
    record.event,
    record.date,
    record.time,
    record.detail
  ]);

  return [headers, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))
    .join("\n");
}

export function readStoredBreakSchedules(): BreakSchedule[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(breakSchedulesStorageKey);
    return raw ? (JSON.parse(raw) as BreakSchedule[]) : [];
  } catch {
    return [];
  }
}

export function writeStoredBreakSchedules(records: BreakSchedule[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(breakSchedulesStorageKey, JSON.stringify(records));
}

export function readStoredDailyShiftAssignments(): DailyShiftAssignment[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(dailyShiftAssignmentsStorageKey);
    return raw ? (JSON.parse(raw) as DailyShiftAssignment[]) : [];
  } catch {
    return [];
  }
}

export function writeStoredDailyShiftAssignments(records: DailyShiftAssignment[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(dailyShiftAssignmentsStorageKey, JSON.stringify(records));
}

export function readStoredShiftCalendarSettings(): ShiftCalendarSettings {
  if (typeof window === "undefined") {
    return { scheduleMonth: "2026-06", firstWorkDay: "2026-06-03" };
  }

  try {
    const raw = window.localStorage.getItem(shiftCalendarSettingsStorageKey);
    return raw ? (JSON.parse(raw) as ShiftCalendarSettings) : { scheduleMonth: "2026-06", firstWorkDay: "2026-06-03" };
  } catch {
    return { scheduleMonth: "2026-06", firstWorkDay: "2026-06-03" };
  }
}

export function writeStoredShiftCalendarSettings(settings: ShiftCalendarSettings) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(shiftCalendarSettingsStorageKey, JSON.stringify(settings));
}

export function readStoredBreakAssignments(): BreakAssignment[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(breakAssignmentsStorageKey);
    return raw ? (JSON.parse(raw) as BreakAssignment[]) : [];
  } catch {
    return [];
  }
}

export function writeStoredBreakAssignments(records: BreakAssignment[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(breakAssignmentsStorageKey, JSON.stringify(records));
}

export function readStoredShiftRecords(): ShiftRecord[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(shiftRecordsStorageKey);
    return raw ? (JSON.parse(raw) as ShiftRecord[]) : [];
  } catch {
    return [];
  }
}

export function writeStoredShiftRecords(records: ShiftRecord[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(shiftRecordsStorageKey, JSON.stringify(records));
}

export function readStoredFailureRecords(): FailureRecord[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(failureRecordsStorageKey);
    return raw ? (JSON.parse(raw) as FailureRecord[]) : [];
  } catch {
    return [];
  }
}

export function writeStoredFailureRecords(records: FailureRecord[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(failureRecordsStorageKey, JSON.stringify(records));
}

export function readStoredCertificateRequests(): CertificateRequest[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(certificateRequestsStorageKey);
    return raw ? (JSON.parse(raw) as CertificateRequest[]) : [];
  } catch {
    return [];
  }
}

export function writeStoredCertificateRequests(records: CertificateRequest[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(certificateRequestsStorageKey, JSON.stringify(records));
}

export function readStoredShiftChangeRequests(): ShiftChangeRequest[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(shiftChangeRequestsStorageKey);
    return raw ? (JSON.parse(raw) as ShiftChangeRequest[]) : [];
  } catch {
    return [];
  }
}

export function writeStoredShiftChangeRequests(records: ShiftChangeRequest[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(shiftChangeRequestsStorageKey, JSON.stringify(records));
}

export function readStoredTrainingGalleryItems(): TrainingGalleryItem[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(trainingGalleryStorageKey);
    return raw ? (JSON.parse(raw) as TrainingGalleryItem[]) : [];
  } catch {
    return [];
  }
}

export function writeStoredTrainingGalleryItems(records: TrainingGalleryItem[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(trainingGalleryStorageKey, JSON.stringify(records));
}
