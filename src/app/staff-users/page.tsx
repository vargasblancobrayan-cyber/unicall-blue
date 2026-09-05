"use client";

import { useEffect, useMemo, useState } from "react";
import { Clipboard, Edit3, KeyRound, Lock, Mail, Search, ShieldCheck, Trash2, Unlock, UserCog, UserPlus } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { Modal } from "@/components/Modal";
import { loadCurrentProfile } from "@/lib/cloud-shifts";
import { isPrimaryStaffIdentity } from "@/lib/primary-staff";
import { createStaffUser, loadStaffUsers, removeStaffUser, resetStaffPassword, setStaffUserStatus, StaffUser, updateStaffUser } from "@/lib/staff-users";

const emptyForm = { fullName: "", email: "", username: "", password: "" };
const pageSize = 25;

export default function StaffUsersPage() {
  const [users, setUsers] = useState<StaffUser[]>([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("Todos");
  const [page, setPage] = useState(1);
  const [message, setMessage] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<StaffUser | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [accessUser, setAccessUser] = useState<StaffUser | null>(null);
  const [tempPassword, setTempPassword] = useState("");
  const [accessSaving, setAccessSaving] = useState(false);

  async function reload() {
    const staffUsers = await loadStaffUsers();
    setUsers(staffUsers);
  }

  useEffect(() => {
    loadCurrentProfile()
      .then((profile) => {
        const allowed = profile?.role === "staff" && isPrimaryStaffIdentity(profile);
        setAuthorized(Boolean(allowed));
        if (!allowed) return;
        reload().catch((error) => {
          setMessage(error instanceof Error ? error.message : "No se pudo cargar el staff.");
        });
      })
      .catch(() => setAuthorized(false));
  }, []);

  const filteredUsers = useMemo(
    () =>
      users.filter((user) =>
        [user.username, user.fullName, user.email].join(" ").toLowerCase().includes(query.toLowerCase()) &&
        (statusFilter === "Todos" || user.status === statusFilter)
      ),
    [query, statusFilter, users]
  );

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pagedUsers = filteredUsers.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const activeUsers = users.filter((user) => user.status === "Activo").length;
  const blockedUsers = users.filter((user) => user.status === "Bloqueado").length;

  function updateForm(field: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function openCreate() {
    setEditingUser(null);
    setForm(emptyForm);
    setMessage("");
    setModalOpen(true);
  }

  function openEdit(user: StaffUser) {
    setEditingUser(user);
    setForm({ fullName: user.fullName, email: user.email, username: user.username, password: "" });
    setMessage("");
    setModalOpen(true);
  }

  function generateTempPassword(user: StaffUser) {
    const base = user.username.replace(/[^a-z0-9]/gi, "").slice(0, 6) || "Staff";
    const suffix = Math.floor(1000 + Math.random() * 9000);
    return `${base}${suffix}.`;
  }

  function openAccessHelp(user: StaffUser) {
    setAccessUser(user);
    setTempPassword(generateTempPassword(user));
    setMessage("");
  }

  async function saveStaff() {
    if (!form.fullName.trim() || !form.email.trim() || !form.username.trim() || (!editingUser && form.password.length < 8)) {
      setMessage(editingUser ? "Completa nombre, correo y usuario." : "Completa nombre, correo, usuario y una contrasena de minimo 8 caracteres.");
      return;
    }

    setSaving(true);
    setMessage("");
    try {
      if (editingUser) {
        await updateStaffUser(editingUser, {
          fullName: form.fullName.trim(),
          email: form.email.trim(),
          username: form.username.trim()
        });
      } else {
        await createStaffUser({
          fullName: form.fullName.trim(),
          email: form.email.trim(),
          username: form.username.trim(),
          password: form.password
        });
      }
      await reload();
      setModalOpen(false);
      setMessage(editingUser ? `${form.username.trim()} actualizado.` : `${form.username.trim()} fue creado como staff y ya puede ingresar.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No fue posible guardar el staff.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus(user: StaffUser) {
    const nextStatus = user.status === "Bloqueado" ? "Activo" : "Bloqueado";
    const confirmed = window.confirm(`${nextStatus === "Bloqueado" ? "Bloquear" : "Activar"} a ${user.username}?`);
    if (!confirmed) return;
    try {
      await setStaffUserStatus(user, nextStatus);
      await reload();
      setMessage(`${user.username} ${nextStatus === "Bloqueado" ? "bloqueado" : "activado"}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No fue posible cambiar el estado.");
    }
  }

  async function deleteUser(user: StaffUser) {
    const confirmed = window.confirm(`Eliminar totalmente a ${user.username}? Esta accion quita su acceso de Staff.`);
    if (!confirmed) return;
    try {
      await removeStaffUser(user);
      await reload();
      setMessage(`${user.username} fue eliminado totalmente.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No fue posible eliminar el staff.");
    }
  }

  async function copyTempPassword() {
    await navigator.clipboard.writeText(tempPassword);
    setMessage("Contrasena temporal copiada.");
  }

  async function applyTempPassword() {
    if (!accessUser) return;
    if (tempPassword.length < 8) {
      setMessage("La contrasena temporal debe tener minimo 8 caracteres.");
      return;
    }

    setAccessSaving(true);
    setMessage("");
    try {
      await resetStaffPassword(accessUser, tempPassword);
      setMessage(`Contrasena temporal lista para ${accessUser.username}. Copiala y compartela con ese Staff.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No fue posible cambiar la contrasena del staff.");
    } finally {
      setAccessSaving(false);
    }
  }

  async function sendResetEmail(user: StaffUser) {
    const supabase = (await import("@/lib/supabase/client")).getSupabaseBrowserClient();
    if (!supabase) {
      setMessage("La recuperacion requiere la base central.");
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
      redirectTo: `${window.location.origin}/reset-password`
    });
    setMessage(error ? "No se pudo enviar el enlace de recuperacion." : `Recuperacion enviada a ${user.email}.`);
  }

  return (
    <AppLayout role="staff" title="Administracion de staff">
      {authorized === false ? (
        <section className="rounded-md border border-amber-200 bg-amber-50 p-6">
          <p className="text-xs font-bold uppercase text-amber-800">Acceso restringido</p>
          <h2 className="mt-2 text-xl font-black text-ink">Solo el usuario principal puede crear staff</h2>
          <p className="mt-2 text-sm font-semibold text-muted">
            Tu usuario puede gestionar la operacion, pero la administracion de coordinadores queda protegida para el usuario principal.
          </p>
        </section>
      ) : null}
      {authorized === null ? (
        <section className="rounded-md border border-line bg-white p-6 text-sm font-semibold text-muted">
          Validando permisos...
        </section>
      ) : null}
      {authorized ? (
      <>
      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-md border border-line bg-white p-4 shadow-sm">
          <p className="text-xs font-bold uppercase text-muted">Staff creados</p>
          <p className="mt-2 text-3xl font-black text-ink">{users.length}</p>
          <p className="mt-1 text-xs font-semibold text-muted">Coordinadores y supervisores</p>
        </div>
        <div className="rounded-md border border-line bg-white p-4 shadow-sm">
          <p className="text-xs font-bold uppercase text-muted">Activos</p>
          <p className="mt-2 text-3xl font-black text-emerald-700">{activeUsers}</p>
          <p className="mt-1 text-xs font-semibold text-muted">Pueden ingresar</p>
        </div>
        <div className="rounded-md border border-line bg-white p-4 shadow-sm">
          <p className="text-xs font-bold uppercase text-muted">Bloqueados</p>
          <p className="mt-2 text-3xl font-black text-red-700">{blockedUsers}</p>
          <p className="mt-1 text-xs font-semibold text-muted">Acceso detenido</p>
        </div>
      </div>

      <section className="mt-6 overflow-hidden rounded-md border border-line bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-line p-5 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-bold uppercase text-brand-700">Administracion interna</p>
            <h2 className="mt-1 text-xl font-black text-ink">Usuarios de staff</h2>
            <p className="mt-1 text-sm text-muted">Crea accesos para coordinadores o supervisores. Staff puede entrar desde varios dispositivos.</p>
          </div>
          <button className="btn-primary" onClick={openCreate}>
            <UserPlus size={16} />
            Crear staff
          </button>
        </div>

        <div className="grid gap-3 border-b border-line bg-soft/60 p-5 lg:grid-cols-[1fr_180px_auto] lg:items-center">
          <label className="relative block">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={16} />
            <input
              className="input-base pl-9"
              placeholder="Buscar por usuario, nombre o correo"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
            />
          </label>
          <select
            className="input-base"
            value={statusFilter}
            onChange={(event) => {
              setStatusFilter(event.target.value);
              setPage(1);
            }}
          >
            <option>Todos</option>
            <option>Activo</option>
            <option>Bloqueado</option>
          </select>
          <p className="text-sm font-semibold text-muted">{filteredUsers.length} usuarios</p>
          {message ? <p className="rounded-md bg-cyan/10 p-2 text-sm font-semibold text-brand-700 lg:col-span-3">{message}</p> : null}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <thead className="bg-slate-100 text-left text-xs uppercase text-muted">
              <tr>
                <th className="border-b border-line px-4 py-3">Staff</th>
                <th className="border-b border-line px-4 py-3">Correo</th>
                <th className="border-b border-line px-4 py-3">Estado</th>
                <th className="border-b border-line px-4 py-3">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {pagedUsers.length ? (
                pagedUsers.map((user) => (
                  <tr key={user.id} className={`hover:bg-brand-50/40 ${user.status === "Bloqueado" ? "bg-red-50" : ""}`}>
                    <td className="border-b border-line px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className={`grid h-10 w-10 place-items-center rounded-md ${user.status === "Bloqueado" ? "bg-red-100 text-red-700" : "bg-brand-100 text-brand-700"}`}>
                          <UserCog size={18} />
                        </span>
                        <div>
                          <p className="font-black text-ink">{user.username}</p>
                          <p className="text-sm font-semibold text-muted">{user.fullName}</p>
                        </div>
                      </div>
                    </td>
                    <td className="border-b border-line px-4 py-3 text-sm text-muted">{user.email}</td>
                    <td className="border-b border-line px-4 py-3">
                      <span className={`rounded-full px-2 py-1 text-xs font-bold ${user.status === "Bloqueado" ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"}`}>
                        {user.status}
                      </span>
                    </td>
                    <td className="border-b border-line px-4 py-3">
                      <div className="flex gap-2">
                        <button className="grid h-9 w-9 place-items-center rounded-md border border-line text-ink hover:bg-soft" title="Editar staff" onClick={() => openEdit(user)}>
                          <Edit3 size={15} />
                        </button>
                        <button className="grid h-9 w-9 place-items-center rounded-md border border-line text-brand-700 hover:bg-soft" title="Ayudar con acceso" onClick={() => openAccessHelp(user)}>
                          <KeyRound size={15} />
                        </button>
                        <button className={`grid h-9 w-9 place-items-center rounded-md border border-line hover:bg-soft ${user.status === "Bloqueado" ? "text-emerald-700" : "text-amber-700"}`} title={user.status === "Bloqueado" ? "Activar" : "Bloquear"} onClick={() => toggleStatus(user)}>
                          {user.status === "Bloqueado" ? <Unlock size={15} /> : <Lock size={15} />}
                        </button>
                        <button className="grid h-9 w-9 place-items-center rounded-md border border-line text-red-700 hover:bg-red-50" title="Eliminar" onClick={() => deleteUser(user)}>
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="px-4 py-8 text-center text-sm text-muted" colSpan={4}>
                    No hay staff con ese criterio.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line p-4">
          <p className="text-sm text-muted">Pagina {currentPage} de {totalPages}</p>
          <div className="flex gap-2">
            <button className="btn-secondary py-2" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={currentPage === 1}>
              Anterior
            </button>
            <button className="btn-secondary py-2" onClick={() => setPage((value) => Math.min(totalPages, value + 1))} disabled={currentPage === totalPages}>
              Siguiente
            </button>
          </div>
        </div>
      </section>

      <Modal title={editingUser ? "Editar usuario staff" : "Crear usuario staff"} open={modalOpen} onClose={() => setModalOpen(false)}>
        <div className="grid gap-3">
          <input className="input-base" placeholder="Nombre completo" value={form.fullName} onChange={(event) => updateForm("fullName", event.target.value)} />
          <input className="input-base" placeholder="Correo" value={form.email} onChange={(event) => updateForm("email", event.target.value)} />
          <input className="input-base" placeholder="Usuario" value={form.username} onChange={(event) => updateForm("username", event.target.value)} />
          {!editingUser ? (
            <>
              <input className="input-base" placeholder="Contrasena temporal" type="password" value={form.password} onChange={(event) => updateForm("password", event.target.value)} />
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-900">
                Entrega esta contrasena al staff y recomiendale cambiarla desde recuperar contrasena si la pierde.
              </div>
            </>
          ) : null}
          <button className="btn-primary justify-center" onClick={saveStaff} disabled={saving}>
            <ShieldCheck size={16} />
            {saving ? "Guardando..." : editingUser ? "Guardar cambios" : "Crear staff"}
          </button>
        </div>
      </Modal>

      <Modal title="Ayudar con acceso Staff" open={Boolean(accessUser)} onClose={() => setAccessUser(null)}>
        {accessUser ? (
          <div className="space-y-4">
            <div className="rounded-md bg-soft p-4">
              <p className="text-xs font-bold uppercase text-muted">Staff</p>
              <p className="mt-1 text-lg font-black text-ink">{accessUser.fullName}</p>
              <p className="text-sm font-semibold text-brand-700">{accessUser.username} - {accessUser.email}</p>
            </div>
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              Usa esto cuando un coordinador o supervisor olvide su contrasena. Solo usuarios principales pueden asignar esta clave temporal.
            </div>
            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-ink">Contrasena temporal</span>
              <input className="input-base" value={tempPassword} onChange={(event) => setTempPassword(event.target.value)} />
            </label>
            <div className="grid gap-2 sm:grid-cols-2">
              <button className="btn-secondary justify-center" onClick={() => setTempPassword(generateTempPassword(accessUser))}>
                Generar otra
              </button>
              <button className="btn-secondary justify-center" onClick={copyTempPassword}>
                <Clipboard size={16} />
                Copiar clave
              </button>
            </div>
            <button className="btn-primary w-full justify-center" onClick={applyTempPassword} disabled={accessSaving || accessUser.status === "Bloqueado"}>
              <KeyRound size={16} />
              {accessSaving ? "Guardando..." : "Guardar clave temporal"}
            </button>
            <button className="btn-secondary w-full justify-center" onClick={() => sendResetEmail(accessUser)}>
              <Mail size={16} />
              Enviar enlace por correo
            </button>
            {accessUser.status === "Bloqueado" ? (
              <p className="rounded-md bg-red-50 p-2 text-sm font-semibold text-red-700">Este Staff esta bloqueado. Primero activalo para poder asignar una nueva clave.</p>
            ) : (
              <p className="text-xs text-muted">Despues de guardar, dile que ingrese con su correo o usuario y esta contrasena temporal.</p>
            )}
          </div>
        ) : null}
      </Modal>
      </>
      ) : null}
    </AppLayout>
  );
}
