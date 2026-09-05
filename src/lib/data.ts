export type Role = "operator" | "staff";

export const credentials = {
  operator: { email: "operador@unicallblue.co", password: "ops123" },
  staff: { email: "staff@unicallblue.co", password: "staff123" }
};

export const operators = [
  {
    id: "OP-001",
    name: "Camila Rojas",
    email: "camila.rojas@unicallblue.co",
    campaign: "Usablue",
    shift: "08:00 - 16:00",
    supervisor: "Laura Mendez",
    status: "Activo",
    sales: 34,
    rejections: 7,
    hours: 146
  },
  {
    id: "OP-002",
    name: "Andres Diaz",
    email: "andres.diaz@unicallblue.co",
    campaign: "Movil Premium",
    shift: "10:00 - 18:00",
    supervisor: "Carlos Pena",
    status: "Activo",
    sales: 28,
    rejections: 9,
    hours: 138
  },
  {
    id: "OP-003",
    name: "Valentina Ruiz",
    email: "valentina.ruiz@unicallblue.co",
    campaign: "Retencion",
    shift: "13:00 - 21:00",
    supervisor: "Laura Mendez",
    status: "Suspendido",
    sales: 19,
    rejections: 12,
    hours: 112
  },
  {
    id: "OP-004",
    name: "Mateo Garcia",
    email: "mateo.garcia@unicallblue.co",
    campaign: "Usablue",
    shift: "07:00 - 15:00",
    supervisor: "Nicolas Torres",
    status: "Inactivo",
    sales: 11,
    rejections: 4,
    hours: 86
  }
];

export const notifications = [
  "Solicitud de certificado recibida",
  "Pedido pendiente de seguimiento"
];

export const salesByDay = [
  { day: "Lun", ventas: 42, rechazos: 9 },
  { day: "Mar", ventas: 51, rechazos: 12 },
  { day: "Mie", ventas: 46, rechazos: 8 },
  { day: "Jue", ventas: 58, rechazos: 13 },
  { day: "Vie", ventas: 63, rechazos: 10 },
  { day: "Sab", ventas: 29, rechazos: 7 }
];

export const connectionLogs = [
  { operator: "Camila Rojas", event: "Login", date: "2026-06-08", time: "08:01", detail: "Inicio normal" },
  { operator: "Camila Rojas", event: "Desconexion", date: "2026-06-08", time: "11:42", detail: "Fallo tecnico reportado" },
  { operator: "Camila Rojas", event: "Reconexion", date: "2026-06-08", time: "11:55", detail: "Conexion restablecida" },
  { operator: "Andres Diaz", event: "Logout", date: "2026-06-08", time: "18:03", detail: "Fin de turno" }
];
