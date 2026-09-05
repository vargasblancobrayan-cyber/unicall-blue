export type NotificationCategory =
  | "Certificado"
  | "Rechazo oculto"
  | "Cambio de turno"
  | "Pagos"
  | "Productividad"
  | "Pendiente vencido";

export const usefulNotificationTitleFilter = [
  "title.ilike.%certificado%",
  "title.ilike.%rechazo oculto%",
  "title.ilike.%cambio de turno%",
  "title.ilike.%pago%",
  "title.ilike.%novedad de pago%",
  "title.ilike.%productividad%",
  "title.ilike.%venta por hora%",
  "title.ilike.%cheque bajo%",
  "title.ilike.%pendiente vencido%"
].join(",");

export function notificationCategory(title: string, message: string): NotificationCategory | null {
  const value = `${title} ${message}`.toLowerCase();

  if (value.includes("rechazo oculto")) return "Rechazo oculto";
  if (value.includes("certificado")) return "Certificado";
  if (value.includes("cambio de turno")) return "Cambio de turno";
  if (value.includes("pago") || value.includes("novedad de pago")) return "Pagos";
  if (
    value.includes("productividad") ||
    value.includes("venta por hora") ||
    value.includes("cheque bajo")
  ) return "Productividad";
  if (
    value.includes("pendiente vencido") ||
    value.includes("pendiente mas de") ||
    value.includes("mas de 3 dias")
  ) return "Pendiente vencido";

  return null;
}

export function isUsefulNotification(title: string, message: string) {
  return notificationCategory(title, message) !== null;
}
