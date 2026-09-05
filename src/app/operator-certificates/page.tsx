"use client";

import { useEffect, useState } from "react";
import { Download, Eye, FileText, Trash2 } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { EmptyState } from "@/components/EmptyState";
import { Modal } from "@/components/Modal";
import {
  CertificateRequest,
  expireOldCertificateRequests,
  readStoredCertificateRequests,
  writeStoredCertificateRequests
} from "@/lib/records";
import { createCertificateRequest, deleteCloudCertificateRequest, getCertificateDocumentUrl, loadCertificateRequests } from "@/lib/cloud-certificates";
import { CurrentProfile, loadCurrentProfile } from "@/lib/cloud-shifts";

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

export default function OperatorCertificatesPage() {
  const [requests, setRequests] = useState<CertificateRequest[]>([]);
  const [profile, setProfile] = useState<CurrentProfile | null>(null);
  const [form, setForm] = useState({
    certificateType: "Certificado laboral",
    fullName: "",
    documentType: "Cedula de ciudadania",
    documentNumber: "",
    reason: ""
  });
  const [message, setMessage] = useState("");
  const [selectedRequest, setSelectedRequest] = useState<CertificateRequest | null>(null);
  const [modalMode, setModalMode] = useState<"request" | "delivery">("request");
  const [deleteTarget, setDeleteTarget] = useState<CertificateRequest | null>(null);
  const [downloadingId, setDownloadingId] = useState("");

  useEffect(() => {
    loadCurrentProfile().then((currentProfile) => {
      setProfile(currentProfile);
      return loadCertificateRequests(currentProfile);
    }).then((storedRequests) => {
      const nextRequests = expireOldCertificateRequests(storedRequests);
      setRequests(nextRequests);
    }).catch(() => {
      const storedRequests = readStoredCertificateRequests();
      setRequests(expireOldCertificateRequests(storedRequests));
      setMessage("No se pudo conectar con la base central. Intenta nuevamente.");
    });
  }, []);

  async function submitRequest() {
    if (!form.fullName.trim()) {
      setMessage("Escribe tu nombre completo.");
      return;
    }
    if (!form.documentNumber.trim()) {
      setMessage("Escribe tu numero de documento.");
      return;
    }
    if (!form.reason.trim()) {
      setMessage("Escribe para que necesitas el certificado.");
      return;
    }

    if (!profile) {
      setMessage("No se pudo identificar tu usuario. Vuelve a iniciar sesión.");
      return;
    }
    try {
      const requestReason = [
        `Nombre completo: ${form.fullName.trim()}`,
        `Tipo de documento: ${form.documentType}`,
        `Numero de documento: ${form.documentNumber.trim()}`,
        `Razon: ${form.reason.trim()}`
      ].join("\n");
      const nextRequest = await createCertificateRequest(profile, form.certificateType, requestReason);
      const nextRequests = [nextRequest, ...requests];
      writeStoredCertificateRequests(nextRequests);
      setRequests(nextRequests);
      setForm({ certificateType: "Certificado laboral", fullName: "", documentType: "Cedula de ciudadania", documentNumber: "", reason: "" });
      setMessage("Solicitud de certificado enviada a Staff.");
      return;
    } catch {
      setMessage("No fue posible enviar la solicitud. Revisa la conexión e intenta otra vez.");
    }
  }

  async function removeRequest(request: CertificateRequest) {
    try {
      await deleteCloudCertificateRequest(request.id);
      const nextRequests = requests.filter((item) => item.id !== request.id);
      setRequests(nextRequests);
      writeStoredCertificateRequests(nextRequests);
      setSelectedRequest(null);
      setDeleteTarget(null);
      setMessage("Solicitud eliminada.");
    } catch {
      setMessage("No fue posible eliminar la solicitud. Intenta nuevamente.");
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

  return (
    <AppLayout role="operator" title="Solicitud de certificado">
      <section className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
        <div className="card p-5">
          <div className="mb-4 flex items-center gap-2">
            <FileText className="text-brand-600" size={20} />
            <h2 className="text-lg font-bold text-ink">Nueva solicitud</h2>
          </div>
          <div className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-ink">Nombre completo</span>
              <input
                className="input-base"
                placeholder="Como aparece en tu documento"
                value={form.fullName}
                onChange={(event) => setForm((current) => ({ ...current, fullName: event.target.value }))}
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-[0.9fr_1.1fr]">
              <label className="block">
                <span className="mb-1 block text-sm font-semibold text-ink">Tipo de documento</span>
                <select
                  className="input-base"
                  value={form.documentType}
                  onChange={(event) => setForm((current) => ({ ...current, documentType: event.target.value }))}
                >
                  <option>Cedula de ciudadania</option>
                  <option>Cedula de extranjeria</option>
                  <option>Pasaporte</option>
                  <option>Permiso por proteccion temporal</option>
                  <option>Otro</option>
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-semibold text-ink">Numero de documento</span>
                <input
                  className="input-base"
                  placeholder="Ejemplo: 1012345678"
                  value={form.documentNumber}
                  onChange={(event) => setForm((current) => ({ ...current, documentNumber: event.target.value }))}
                />
              </label>
            </div>
            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-ink">Tipo de certificado</span>
              <select
                className="input-base"
                value={form.certificateType}
                onChange={(event) => setForm((current) => ({ ...current, certificateType: event.target.value }))}
              >
                <option>Certificado laboral</option>
                <option>Certificado de ingresos</option>
                <option>Certificado de turnos</option>
                <option>Certificado de funciones</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-ink">Razon para solicitarlo</span>
              <textarea
                className="input-base min-h-28 resize-none"
                placeholder="Ejemplo: tramite bancario, arriendo, estudio, visa..."
                value={form.reason}
                onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))}
              />
            </label>
            {message ? (
              <p className="rounded-md bg-cyan/10 p-2 text-sm font-semibold text-brand-700">{message}</p>
            ) : null}
            <button className="btn-primary w-full justify-center" onClick={submitRequest}>
              Solicitar certificado
            </button>
          </div>
        </div>

        <div className="card overflow-hidden">
          <div className="border-b border-line p-5">
            <h2 className="text-lg font-bold text-ink">Mis solicitudes</h2>
          </div>
          <div className="divide-y divide-line">
            {requests.length ? requests.map((request) => {
              const details = parseCertificateReason(request.reason);
              const statusTone = request.status === "Listo" ? "bg-emerald-100 text-emerald-700" : request.status === "Rechazado" ? "bg-red-100 text-red-700" : request.status === "En proceso" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700";
              return (
                <div key={request.id} className="grid gap-3 p-4 lg:grid-cols-[minmax(220px,1fr)_110px_360px] lg:items-center">
                  <div>
                    <p className="font-bold text-ink">{request.certificateType}</p>
                    <p className="text-sm text-muted">{new Date(request.createdAt).toLocaleString("es-CO")} - {details.reason || "Sin motivo"}</p>
                  </div>
                  <span className={`w-fit rounded-full px-3 py-1 text-xs font-bold ${statusTone}`}>{request.status}</span>
                  <div className="grid gap-2 sm:grid-cols-3">
                    <button className="btn-secondary justify-center py-2" onClick={() => { setSelectedRequest(request); setModalMode("request"); }}><Eye size={15} /> Solicitud</button>
                    <button className="btn-primary justify-center py-2" onClick={() => { setSelectedRequest(request); setModalMode("delivery"); }}><Download size={15} /> Entrega</button>
                    <button className="btn-secondary justify-center py-2 text-red-700" onClick={() => setDeleteTarget(request)}><Trash2 size={15} /> Eliminar</button>
                  </div>
                </div>
              );
            }) : (
              <EmptyState title="Aun no tienes solicitudes" description="Cuando solicites un certificado aparecera aqui." />
            )}
          </div>
        </div>
      </section>

      <Modal title={modalMode === "request" ? "Detalle de solicitud" : "Entrega de certificado"} open={Boolean(selectedRequest)} onClose={() => setSelectedRequest(null)}>
        {selectedRequest ? (() => {
          const details = parseCertificateReason(selectedRequest.reason);
          return modalMode === "request" ? (
            <div className="space-y-4">
              <div className="rounded-md bg-soft p-4">
                <p className="text-xs font-bold uppercase text-muted">Solicitud</p>
                <p className="mt-1 text-lg font-bold text-ink">{selectedRequest.certificateType}</p>
                <p className="text-sm text-muted">{new Date(selectedRequest.createdAt).toLocaleString("es-CO")}</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-md border border-line p-3"><span className="text-xs font-bold uppercase text-muted">Nombre</span><strong className="mt-1 block text-ink">{details.fullName || "No indicado"}</strong></div>
                <div className="rounded-md border border-line p-3"><span className="text-xs font-bold uppercase text-muted">Documento</span><strong className="mt-1 block text-ink">{details.documentNumber || "-"}</strong><span className="text-sm text-muted">{details.documentType || "Sin tipo"}</span></div>
              </div>
              <div className="rounded-md border border-line p-4">
                <p className="text-xs font-bold uppercase text-muted">Razon</p>
                <p className="mt-2 text-sm text-ink">{details.reason || selectedRequest.reason}</p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-md bg-soft p-4">
                <p className="text-xs font-bold uppercase text-muted">Estado</p>
                <p className="mt-1 text-lg font-bold text-ink">{selectedRequest.status}</p>
                <p className="text-sm text-muted">{selectedRequest.certificateType}</p>
              </div>
              <div className="rounded-md border border-line p-4">
                <p className="text-xs font-bold uppercase text-muted">Nota Staff</p>
                <p className="mt-2 text-sm text-ink">{selectedRequest.staffNote || "Sin nota de Staff."}</p>
              </div>
              {selectedRequest.documentPath || selectedRequest.documentDataUrl ? (
                <button className="btn-primary w-full justify-center" onClick={() => downloadDocument(selectedRequest)} disabled={downloadingId === selectedRequest.id}>
                  <Download size={16} /> {downloadingId === selectedRequest.id ? "Preparando..." : "Descargar documento"}
                </button>
              ) : (
                <p className="rounded-md bg-soft p-3 text-sm font-semibold text-muted">Documento pendiente por Staff.</p>
              )}
            </div>
          );
        })() : null}
      </Modal>

      <Modal title="Eliminar solicitud" open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)}>
        {deleteTarget ? (
          <div className="space-y-4">
            <div className="rounded-md border border-red-200 bg-red-50 p-4">
              <p className="font-bold text-red-800">Eliminar solicitud</p>
              <p className="mt-1 text-sm text-red-700">Esta solicitud se quitara de tu historial y de la bandeja de Staff.</p>
            </div>
            <div className="rounded-md bg-soft p-4">
              <p className="font-bold text-ink">{deleteTarget.certificateType}</p>
              <p className="text-sm text-muted">{parseCertificateReason(deleteTarget.reason).reason || deleteTarget.reason || deleteTarget.id.slice(0, 8)}</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <button className="btn-secondary justify-center" onClick={() => setDeleteTarget(null)}>Cancelar</button>
              <button className="btn-primary justify-center bg-red-600 hover:bg-red-700" onClick={() => removeRequest(deleteTarget)}>
                <Trash2 size={16} /> Eliminar
              </button>
            </div>
          </div>
        ) : null}
      </Modal>
    </AppLayout>
  );
}
