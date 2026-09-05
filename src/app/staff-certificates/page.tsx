"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, Download, Eye, FileText, Search, Trash2, Upload, UsersRound } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { Modal } from "@/components/Modal";
import {
  getCertificateDocumentUrl,
  loadCertificateRequests,
  notifyStaffAboutOverdueCertificates,
  updateCloudCertificateRequest,
  uploadCloudCertificateDocument
} from "@/lib/cloud-certificates";
import { loadCurrentProfile } from "@/lib/cloud-shifts";
import { compressImageFile, heavyFileMessage, maxOptimizedUploadBytes } from "@/lib/image-compression";
import {
  CertificateRequest,
  expireOldCertificateRequests,
  readStoredCertificateRequests,
  writeStoredCertificateRequests
} from "@/lib/records";

type QueueFilter = "Pendientes" | "Solicitado" | "En proceso" | "Listo" | "Rechazado" | "Todos";

function parseCertificateReason(reason: string) {
  const details = {
    fullName: "",
    documentType: "",
    documentNumber: "",
    reason: reason || ""
  };
  reason.split("\n").forEach((line) => {
    const [rawLabel, ...rawValue] = line.split(":");
    const label = rawLabel.trim().toLowerCase();
    const value = rawValue.join(":").trim();
    if (label === "nombre completo") details.fullName = value;
    if (label === "tipo de documento") details.documentType = value;
    if (label === "numero de documento") details.documentNumber = value;
    if (label === "razon") details.reason = value;
  });
  return details;
}

export default function StaffCertificatesPage() {
  const [requests, setRequests] = useState<CertificateRequest[]>([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<QueueFilter>("Pendientes");
  const [typeFilter, setTypeFilter] = useState("Todos");
  const [sortOrder, setSortOrder] = useState<"Antiguos" | "Recientes">("Antiguos");
  const [page, setPage] = useState(1);
  const [message, setMessage] = useState("");
  const [busyId, setBusyId] = useState("");
  const [downloadingId, setDownloadingId] = useState("");
  const [selectedRequest, setSelectedRequest] = useState<CertificateRequest | null>(null);
  const [modalMode, setModalMode] = useState<"request" | "delivery">("request");
  const [deleteTarget, setDeleteTarget] = useState<CertificateRequest | null>(null);

  useEffect(() => {
    loadCurrentProfile()
      .then((profile) => loadCertificateRequests(profile))
      .then(async (storedRequests) => {
        const nextRequests = expireOldCertificateRequests(storedRequests);
        setRequests(nextRequests);
        writeStoredCertificateRequests(nextRequests);
        const expired = nextRequests.filter((request) => {
          const previous = storedRequests.find((item) => item.id === request.id);
          return previous && previous.status !== request.status;
        });
        await Promise.all(expired.map((request) => updateCloudCertificateRequest(request.id, { status: request.status, staffNote: request.staffNote })));
        notifyStaffAboutOverdueCertificates(nextRequests).catch(() => undefined);
      })
      .catch(() => {
        setRequests(expireOldCertificateRequests(readStoredCertificateRequests()));
        setMessage("No se pudo actualizar la base central. Se muestra el respaldo local.");
      });
  }, []);

  const visibleRequests = useMemo(() => requests.filter((request) => !request.hiddenFromStaff), [requests]);
  const types = useMemo(() => Array.from(new Set(visibleRequests.map((request) => request.certificateType))).sort(), [visibleRequests]);

  const totals = useMemo(() => ({
    pending: visibleRequests.filter((request) => request.status === "Solicitado" || request.status === "En proceso").length,
    requested: visibleRequests.filter((request) => request.status === "Solicitado").length,
    inProcess: visibleRequests.filter((request) => request.status === "En proceso").length,
    ready: visibleRequests.filter((request) => request.status === "Listo").length,
    urgent: visibleRequests.filter((request) => ["Solicitado", "En proceso"].includes(request.status) && Date.now() - new Date(request.createdAt).getTime() >= 3 * 86400000).length,
    operators: new Set(visibleRequests.filter((request) => ["Solicitado", "En proceso"].includes(request.status)).map((request) => request.operatorId || request.operator)).size
  }), [visibleRequests]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return visibleRequests
      .filter((request) => statusFilter === "Todos" || (statusFilter === "Pendientes" ? ["Solicitado", "En proceso"].includes(request.status) : request.status === statusFilter))
      .filter((request) => typeFilter === "Todos" || request.certificateType === typeFilter)
      .filter((request) => {
        const details = parseCertificateReason(request.reason);
        return [request.operator, request.certificateType, request.reason, request.staffNote, details.fullName, details.documentNumber]
          .join(" ").toLowerCase().includes(normalized);
      })
      .sort((a, b) => {
        const difference = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        return sortOrder === "Antiguos" ? difference : -difference;
      });
  }, [query, sortOrder, statusFilter, typeFilter, visibleRequests]);

  const pageSize = 20;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageRequests = filtered.slice((page - 1) * pageSize, page * pageSize);
  const deliveryHistory = useMemo(() =>
    visibleRequests
      .filter((request) => request.status === "Listo" || request.documentDataUrl || request.documentPath)
      .sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime())
      .slice(0, 12),
    [visibleRequests]
  );

  useEffect(() => setPage(1), [query, sortOrder, statusFilter, typeFilter]);

  function ageLabel(createdAt: string) {
    const hours = Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 3600000));
    if (hours < 1) return "Hace menos de 1 h";
    if (hours < 24) return `Hace ${hours} h`;
    const days = Math.floor(hours / 24);
    return `Hace ${days} ${days === 1 ? "día" : "días"}`;
  }

  function updateLocal(id: string, field: keyof CertificateRequest, value: string | boolean) {
    setRequests((current) => {
      const next = current.map((request) => request.id === id ? { ...request, [field]: value } : request);
      writeStoredCertificateRequests(next);
      return next;
    });
  }

  async function persistUpdate(id: string, changes: Partial<Pick<CertificateRequest, "status" | "staffNote">>) {
    setBusyId(id);
    try {
      await updateCloudCertificateRequest(id, changes);
      setMessage("Cambio guardado y operador notificado.");
    } catch {
      setMessage("Cambio guardado localmente; falta sincronizar con la base central.");
    } finally {
      setBusyId("");
    }
  }

  async function uploadDocument(request: CertificateRequest, event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusyId(request.id);
    try {
      const optimizedFile = await compressImageFile(file, { maxWidth: 1200, maxHeight: 1200, quality: 0.66 });
      if (optimizedFile.size > maxOptimizedUploadBytes) {
        setMessage(heavyFileMessage);
        return;
      }
      await uploadCloudCertificateDocument(request, optimizedFile);
      updateLocal(request.id, "documentName", optimizedFile.name);
      updateLocal(request.id, "status", "Listo");
      const refreshed = await loadCertificateRequests(await loadCurrentProfile());
      setRequests(refreshed);
      writeStoredCertificateRequests(refreshed);
      setSelectedRequest(null);
      setMessage(`Documento enviado a ${request.operator}. El operador ya fue notificado y puede descargarlo.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo subir el documento. Revisa la conexión e intenta nuevamente.");
    } finally {
      setBusyId("");
      event.target.value = "";
    }
  }

  async function downloadDocument(request: CertificateRequest) {
    setDownloadingId(request.id);
    try {
      const url = await getCertificateDocumentUrl(request);
      if (!url) {
        setMessage("El documento aun no esta disponible.");
        return;
      }
      const link = document.createElement("a");
      link.href = url;
      link.download = request.documentName || "certificado";
      link.rel = "noopener";
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch {
      setMessage("No fue posible abrir el documento. Intenta nuevamente.");
    } finally {
      setDownloadingId("");
    }
  }

  async function removeRequest(request: CertificateRequest) {
    setBusyId(request.id);
    try {
      await updateCloudCertificateRequest(request.id, { hiddenFromStaff: true });
      const next = requests.map((item) => item.id === request.id ? { ...item, hiddenFromStaff: true } : item);
      setRequests(next);
      writeStoredCertificateRequests(next);
      setSelectedRequest(null);
      setDeleteTarget(null);
      setMessage("Solicitud archivada para Staff. El operador conserva su documento.");
    } catch {
      setMessage("No se pudo completar la acción. Intenta nuevamente.");
    } finally {
      setBusyId("");
    }
  }

  return (
    <AppLayout role="staff" title="Certificados">
      <section className="card grid grid-cols-2 overflow-hidden xl:grid-cols-4">
        <button className={`border-b border-r border-line p-4 text-left transition hover:bg-amber-50 xl:border-b-0 ${statusFilter === "Pendientes" ? "bg-amber-50" : ""}`} onClick={() => setStatusFilter("Pendientes")}>
          <p className="text-xs font-bold uppercase text-muted">Por gestionar</p><p className="mt-1 text-2xl font-bold text-amber-700">{totals.pending}</p><p className="text-xs text-muted">Solicitudes abiertas</p>
        </button>
        <button className={`border-b border-line p-4 text-left transition hover:bg-red-50 xl:border-b-0 xl:border-r ${sortOrder === "Antiguos" && totals.urgent > 0 ? "bg-red-50" : ""}`} onClick={() => { setStatusFilter("Pendientes"); setSortOrder("Antiguos"); }}>
          <p className="text-xs font-bold uppercase text-muted">Más de 3 días</p><p className="mt-1 text-2xl font-bold text-red-700">{totals.urgent}</p><p className="text-xs text-muted">Atender primero</p>
        </button>
        <button className={`border-r border-line p-4 text-left transition hover:bg-blue-50 ${statusFilter === "En proceso" ? "bg-blue-50" : ""}`} onClick={() => setStatusFilter("En proceso")}>
          <p className="text-xs font-bold uppercase text-muted">En proceso</p><p className="mt-1 text-2xl font-bold text-brand-700">{totals.inProcess}</p><p className="text-xs text-muted">Ya están siendo atendidas</p>
        </button>
        <button className={`p-4 text-left transition hover:bg-emerald-50 ${statusFilter === "Listo" ? "bg-emerald-50" : ""}`} onClick={() => setStatusFilter("Listo")}>
          <p className="text-xs font-bold uppercase text-muted">Documentos listos</p><p className="mt-1 text-2xl font-bold text-emerald-700">{totals.ready}</p><p className="text-xs text-muted">Entregados al operador</p>
        </button>
      </section>

      {totals.urgent > 0 ? (
        <section className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50 p-4">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-md bg-red-100 text-red-700"><AlertTriangle size={20} /></span>
            <div>
              <h2 className="font-bold text-red-800">Seguimiento pendiente: certificados con mas de 3 dias</h2>
              <p className="text-sm text-red-700">Estas solicitudes ya fueron pedidas por el operador y necesitan cierre de Staff para que no se olviden.</p>
            </div>
          </div>
          <button className="btn-secondary bg-white" onClick={() => { setStatusFilter("Pendientes"); setSortOrder("Antiguos"); }}>
            Ver y terminar proceso
          </button>
        </section>
      ) : null}

      <section className="mt-4 card overflow-hidden">
        <div className="border-b border-line p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-md bg-brand-50 text-brand-700"><FileText size={20} /></span><div><h2 className="font-bold text-ink">Bandeja documental</h2><p className="text-sm text-muted">Ordenada por antigüedad para que ninguna solicitud se pierda.</p></div></div>
            <div className="flex items-center gap-2 rounded-md bg-soft px-3 py-2 text-xs font-bold text-muted"><UsersRound size={16} /> {totals.operators} operadores esperando</div>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(280px,1fr)_190px_180px_170px]">
            <label className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={16} /><input className="input-base pl-9" placeholder="Buscar operador, certificado o motivo" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
            <select className="input-base" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as QueueFilter)} aria-label="Estado de solicitudes"><option>Pendientes</option><option>Solicitado</option><option>En proceso</option><option>Listo</option><option>Rechazado</option><option>Todos</option></select>
            <select className="input-base" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} aria-label="Tipo de certificado"><option value="Todos">Todos los tipos</option>{types.map((type) => <option key={type}>{type}</option>)}</select>
            <select className="input-base" value={sortOrder} onChange={(event) => setSortOrder(event.target.value as typeof sortOrder)} aria-label="Orden de solicitudes"><option value="Antiguos">Más antiguos</option><option value="Recientes">Más recientes</option></select>
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-muted"><p><strong className="text-ink">{filtered.length}</strong> solicitudes encontradas</p>{(query || statusFilter !== "Pendientes" || typeFilter !== "Todos") ? <button className="font-bold text-brand-700 hover:underline" onClick={() => { setQuery(""); setStatusFilter("Pendientes"); setTypeFilter("Todos"); }}>Limpiar filtros</button> : null}</div>
          {message ? <p className="mt-3 rounded-md bg-cyan/10 p-2 text-sm font-semibold text-brand-700">{message}</p> : null}
        </div>

        <div className="divide-y divide-line">
          {pageRequests.length ? pageRequests.map((request) => {
            const urgent = ["Solicitado", "En proceso"].includes(request.status) && Date.now() - new Date(request.createdAt).getTime() >= 3 * 86400000;
            const details = parseCertificateReason(request.reason);
            const requestSummary = details.fullName || details.reason || request.reason || "Sin detalle registrado";
            if (!details.fullName) details.fullName = requestSummary;
            const statusTone = request.status === "Listo" ? "bg-emerald-100 text-emerald-700" : request.status === "Rechazado" ? "bg-red-100 text-red-700" : request.status === "En proceso" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700";
            return (
              <div key={request.id} className={`grid gap-3 p-4 xl:grid-cols-[180px_minmax(260px,1fr)_160px_360px] xl:items-center ${urgent ? "bg-red-50/40" : "bg-white"}`}>
                <div className={`flex items-center gap-2 text-xs font-bold ${urgent ? "text-red-700" : "text-muted"}`}>
                  {urgent ? <AlertTriangle size={15} /> : <Clock3 size={15} />}
                  <span>{ageLabel(request.createdAt)}</span>
                  <span className="font-semibold text-muted">{new Date(request.createdAt).toLocaleDateString("es-CO")}</span>
                </div>
                <div>
                  <p className="font-bold text-ink">{request.operator}</p>
                  <p className="mt-1 text-sm text-muted"><strong className="text-ink">{request.certificateType}</strong> · {details.fullName || "Nombre no indicado"} · ID {request.id.slice(0, 8)}</p>
                </div>
                <span className={`w-fit rounded-full px-3 py-1 text-xs font-bold ${statusTone}`}>{request.status}</span>
                <div className="grid gap-2 sm:grid-cols-3">
                  <button className="btn-secondary justify-center py-2" onClick={() => { setSelectedRequest(request); setModalMode("request"); }}><Eye size={15} /> Solicitud</button>
                  <button className="btn-primary justify-center py-2" onClick={() => { setSelectedRequest(request); setModalMode("delivery"); }}><Upload size={15} /> Entrega</button>
                  <button className="btn-secondary justify-center py-2 text-amber-700" disabled={busyId === request.id} onClick={() => setDeleteTarget(request)}><Trash2 size={15} /> Archivar</button>
                </div>
              </div>
            );
          }) : (
            <div className="py-12 text-center text-muted">
              <CheckCircle2 className="mx-auto mb-2 text-emerald-500" size={28} />
              <strong className="block text-ink">Bandeja al dia</strong>
              <span>No hay solicitudes con estos filtros.</span>
            </div>
          )}
        </div>
        <div className="flex items-center justify-between border-t border-line px-4 py-3 text-sm"><span className="text-muted">Mostrando {pageRequests.length} de {filtered.length}</span><div className="flex items-center gap-2"><button className="btn-secondary py-2" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Anterior</button><span className="rounded-md bg-soft px-3 py-2 text-xs font-bold">Página {page} de {pageCount}</span><button className="btn-secondary py-2" disabled={page >= pageCount} onClick={() => setPage((value) => value + 1)}>Siguiente</button></div></div>
      </section>

      {deliveryHistory.length ? (
      <section className="mt-4 card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-4">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-md bg-emerald-50 text-emerald-700"><CheckCircle2 size={20} /></span>
            <div>
              <h2 className="font-bold text-ink">Historial de entregas</h2>
              <p className="text-sm text-muted">Certificados entregados, con nota y documento para consulta rapida.</p>
            </div>
          </div>
          <span className="rounded-md bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700">{deliveryHistory.length} recientes</span>
        </div>
        <div className="divide-y divide-line">
          {deliveryHistory.map((request) => {
            const details = parseCertificateReason(request.reason);
            const summary = details.fullName || details.reason || request.reason || "Sin detalle";
            return (
              <div key={request.id} className="grid gap-3 p-4 lg:grid-cols-[minmax(220px,1fr)_minmax(260px,1fr)_170px] lg:items-center">
                <div>
                  <p className="font-bold text-ink">{request.operator}</p>
                  <p className="text-sm text-muted">{request.certificateType} - {summary}</p>
                </div>
                <div className="text-sm text-muted">
                  <p><strong className="text-ink">Entregado:</strong> {new Date(request.updatedAt || request.createdAt).toLocaleString("es-CO")}</p>
                  <p><strong className="text-ink">Nota:</strong> {request.staffNote || "Sin nota"}</p>
                </div>
                {request.documentPath || request.documentDataUrl ? (
                  <button className="btn-secondary justify-center py-2" onClick={() => downloadDocument(request)} disabled={downloadingId === request.id}>
                    <Download size={15} /> {downloadingId === request.id ? "Preparando..." : "Descargar"}
                  </button>
                ) : (
                  <button className="btn-secondary justify-center py-2" onClick={() => { setSelectedRequest(request); setModalMode("delivery"); }}>
                    <Eye size={15} /> Ver entrega
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </section>
      ) : null}

      <Modal title={modalMode === "request" ? "Detalle de solicitud" : "Gestionar entrega"} open={Boolean(selectedRequest)} onClose={() => setSelectedRequest(null)}>
        {selectedRequest ? (() => {
          const details = parseCertificateReason(selectedRequest.reason);
          return modalMode === "request" ? (
            <div className="space-y-4">
              <div className="rounded-md bg-soft p-4">
                <p className="text-xs font-bold uppercase text-muted">Operador</p>
                <p className="mt-1 text-lg font-bold text-ink">{selectedRequest.operator}</p>
                <p className="text-sm text-muted">{selectedRequest.certificateType} - {new Date(selectedRequest.createdAt).toLocaleString("es-CO")}</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-md border border-line p-3">
                  <span className="text-xs font-bold uppercase text-muted">Nombre completo</span>
                  <strong className="mt-1 block text-ink">{details.fullName || "No indicado"}</strong>
                </div>
                <div className="rounded-md border border-line p-3">
                  <span className="text-xs font-bold uppercase text-muted">Documento</span>
                  <strong className="mt-1 block text-ink">{details.documentNumber || "-"}</strong>
                  <span className="text-sm text-muted">{details.documentType || "Sin tipo"}</span>
                </div>
              </div>
              <div className="rounded-md border border-line p-4">
                <p className="text-xs font-bold uppercase text-muted">Razon de la solicitud</p>
                <p className="mt-2 text-sm text-ink">{details.reason || selectedRequest.reason}</p>
              </div>
              <button className="btn-primary w-full justify-center" onClick={() => setModalMode("delivery")}>
                <Upload size={16} /> Gestionar entrega
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-md bg-soft p-4">
                <p className="text-xs font-bold uppercase text-muted">Solicitud</p>
                <p className="mt-1 text-lg font-bold text-ink">{selectedRequest.certificateType}</p>
                <p className="text-sm text-muted">{selectedRequest.operator} - {details.fullName || "Nombre no indicado"}</p>
              </div>
              <label className="block">
                <span className="mb-1 block text-sm font-semibold text-ink">Estado</span>
                <select
                  className="input-base"
                  value={selectedRequest.status}
                  disabled={busyId === selectedRequest.id || selectedRequest.status === "Listo"}
                  onChange={(event) => {
                    const status = event.target.value as CertificateRequest["status"];
                    updateLocal(selectedRequest.id, "status", status);
                    setSelectedRequest({ ...selectedRequest, status });
                    persistUpdate(selectedRequest.id, { status });
                  }}
                >
                  <option>Solicitado</option>
                  <option>En proceso</option>
                  <option>Rechazado</option>
                  {selectedRequest.status === "Listo" ? <option>Listo</option> : null}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-semibold text-ink">Nota para operador</span>
                <textarea
                  className="input-base min-h-24 resize-none"
                  placeholder="Respuesta breve para el operador"
                  value={selectedRequest.staffNote}
                  onChange={(event) => {
                    updateLocal(selectedRequest.id, "staffNote", event.target.value);
                    setSelectedRequest({ ...selectedRequest, staffNote: event.target.value });
                  }}
                  onBlur={() => persistUpdate(selectedRequest.id, { staffNote: selectedRequest.staffNote })}
                />
              </label>
              {selectedRequest.documentPath || selectedRequest.documentDataUrl ? (
                <button className="btn-secondary w-full justify-center" onClick={() => downloadDocument(selectedRequest)} disabled={downloadingId === selectedRequest.id}>
                  <Download size={16} /> {downloadingId === selectedRequest.id ? "Preparando..." : "Ver documento entregado"}
                </button>
              ) : (
                <label className={`btn-primary w-full cursor-pointer justify-center ${busyId === selectedRequest.id ? "pointer-events-none opacity-60" : ""}`}>
                  <Upload size={16} /> {busyId === selectedRequest.id ? "Subiendo..." : "Subir documento y entregar"}
                  <input className="hidden" type="file" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg" onChange={(event) => uploadDocument(selectedRequest, event)} />
                </label>
              )}
            </div>
          );
        })() : null}
      </Modal>

      <Modal title="Eliminar solicitud" open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)}>
        {deleteTarget ? (
          <div className="space-y-4">
            <div className="rounded-md border border-amber-200 bg-amber-50 p-4">
              <p className="font-bold text-amber-900">Archivar en Staff</p>
              <p className="mt-1 text-sm text-amber-800">
                Se quitara de la bandeja de Staff para no saturar el trabajo. El operador conserva su solicitud y el documento si ya fue enviado.
              </p>
            </div>
            <div className="rounded-md bg-soft p-4">
              <p className="text-sm font-bold text-ink">{deleteTarget.operator}</p>
              <p className="text-sm text-muted">{deleteTarget.certificateType} - {parseCertificateReason(deleteTarget.reason).reason || deleteTarget.reason || deleteTarget.id.slice(0, 8)}</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <button className="btn-secondary justify-center" onClick={() => setDeleteTarget(null)}>Cancelar</button>
              <button className="btn-primary justify-center bg-amber-600 hover:bg-amber-700" disabled={busyId === deleteTarget.id} onClick={() => removeRequest(deleteTarget)}>
                <Trash2 size={16} /> {busyId === deleteTarget.id ? "Archivando..." : "Archivar para Staff"}
              </button>
            </div>
          </div>
        ) : null}
      </Modal>
    </AppLayout>
  );
}
