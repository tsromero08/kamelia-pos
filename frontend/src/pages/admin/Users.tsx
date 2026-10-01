import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { usersApi, authApi } from '../../services/api'
import { User } from '../../types'
import { Plus, Shield, KeyRound } from 'lucide-react'
import toast from 'react-hot-toast'
import Modal from '../../components/ui/Modal'

export default function Users() {
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [showChangeCode, setShowChangeCode] = useState(false)
  const [codeForm, setCodeForm] = useState({ current: '', next: '', confirm: '' })
  const [savingCode, setSavingCode] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', password: '', role_id: '', phone: '' })

  const handleChangeCode = async (e: React.FormEvent) => {
    e.preventDefault()
    if (codeForm.next.length < 4) { toast.error('El nuevo código debe tener al menos 4 caracteres'); return }
    if (codeForm.next !== codeForm.confirm) { toast.error('La confirmación no coincide'); return }
    setSavingCode(true)
    try {
      await authApi.changeSpecialCode(codeForm.current, codeForm.next)
      toast.success('Código de Acceso Especial actualizado')
      setShowChangeCode(false)
      setCodeForm({ current: '', next: '', confirm: '' })
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast.error(msg || 'Error al cambiar el código')
    } finally {
      setSavingCode(false)
    }
  }

  const { data: users = [] } = useQuery<User[]>({
    queryKey: ['users'],
    queryFn: () => usersApi.list().then(r => r.data),
  })
  const { data: roles = [] } = useQuery({
    queryKey: ['roles'],
    queryFn: () => usersApi.roles().then(r => r.data),
  })

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await usersApi.create({ ...form, role_id: parseInt(form.role_id) })
      qc.invalidateQueries({ queryKey: ['users'] })
      setShowCreate(false)
      setForm({ name: '', email: '', password: '', role_id: '', phone: '' })
      toast.success('Usuario creado')
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Error'
      toast.error(msg)
    }
  }

  const toggleActive = async (u: User) => {
    await usersApi.update(u.id, { is_active: !u.is_active })
    qc.invalidateQueries({ queryKey: ['users'] })
    toast.success(u.is_active ? 'Usuario desactivado' : 'Usuario activado')
  }

  const roleColors: Record<string, string> = {
    'Administrador': 'bg-red-900/30 text-red-400 border-red-700',
    'Cajero': 'bg-blue-900/30 text-blue-400 border-blue-700',
    'Cocina': 'bg-green-900/30 text-green-400 border-green-700',
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Usuarios</h1>
          <p className="text-gray-500 text-sm">Gestión de accesos y roles</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowChangeCode(true)} className="btn-secondary flex items-center gap-2">
            <KeyRound size={16} /> Cambiar código de acceso
          </button>
          <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2">
            <Plus size={16} /> Nuevo usuario
          </button>
        </div>
      </div>

      <div className="card overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead className="border-b border-dark-600">
            <tr className="text-gray-400 text-xs uppercase tracking-wider">
              <th className="text-left px-4 py-3">Usuario</th>
              <th className="text-left px-4 py-3">Email</th>
              <th className="text-left px-4 py-3">Rol</th>
              <th className="text-left px-4 py-3">Estado</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-dark-600">
            {users.map(user => (
              <tr key={user.id} className="hover:bg-dark-700 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-brand-900/50 rounded-full flex items-center justify-center">
                      <span className="text-brand-400 text-xs font-bold">{user.name[0].toUpperCase()}</span>
                    </div>
                    <span className="text-white font-medium">{user.name}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-400">{user.email}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${roleColors[user.role?.name || ''] || 'bg-dark-600 text-gray-400'}`}>
                    {user.role?.name}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs border ${user.is_active ? 'bg-green-900/30 text-green-400 border-green-700' : 'bg-gray-900/30 text-gray-500 border-gray-700'}`}>
                    {user.is_active ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <button onClick={() => toggleActive(user)} className="text-xs text-gray-400 hover:text-white px-2 py-1 hover:bg-dark-600 rounded-lg transition-colors">
                    {user.is_active ? 'Desactivar' : 'Activar'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showCreate && (
        <Modal title="Nuevo usuario" onClose={() => setShowCreate(false)}>
          <form onSubmit={handleCreate} className="space-y-3">
            <div><label className="label">Nombre completo</label><input className="input" value={form.name} onChange={e => setForm({...form, name: e.target.value})} required /></div>
            <div><label className="label">Email</label><input type="email" className="input" value={form.email} onChange={e => setForm({...form, email: e.target.value})} required /></div>
            <div><label className="label">Contraseña</label><input type="password" className="input" value={form.password} onChange={e => setForm({...form, password: e.target.value})} required /></div>
            <div><label className="label">Teléfono</label><input className="input" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} /></div>
            <div>
              <label className="label">Rol</label>
              <select className="input" value={form.role_id} onChange={e => setForm({...form, role_id: e.target.value})} required>
                <option value="">Seleccionar...</option>
                {roles.map((r: { id: number; name: string }) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
            <button type="submit" className="btn-primary w-full">Crear usuario</button>
          </form>
        </Modal>
      )}

      {showChangeCode && (
        <Modal title="Cambiar Código de Acceso Especial" onClose={() => setShowChangeCode(false)} size="sm">
          <form onSubmit={handleChangeCode} className="space-y-3">
            <div className="bg-yellow-900/20 border border-yellow-700 rounded-lg p-3 text-xs text-yellow-300">
              <Shield size={14} className="inline mr-1" />
              El código actual seguirá vigente hasta que confirmes el cambio. Compártelo solo con personas autorizadas.
            </div>
            <div>
              <label className="label">Código actual</label>
              <input
                type="password"
                className="input font-mono tracking-widest text-center"
                value={codeForm.current}
                onChange={e => setCodeForm({ ...codeForm, current: e.target.value })}
                required
                autoFocus
              />
            </div>
            <div>
              <label className="label">Nuevo código (4-50 caracteres)</label>
              <input
                type="password"
                className="input font-mono tracking-widest text-center"
                value={codeForm.next}
                onChange={e => setCodeForm({ ...codeForm, next: e.target.value })}
                minLength={4}
                maxLength={50}
                required
              />
            </div>
            <div>
              <label className="label">Confirmar nuevo código</label>
              <input
                type="password"
                className="input font-mono tracking-widest text-center"
                value={codeForm.confirm}
                onChange={e => setCodeForm({ ...codeForm, confirm: e.target.value })}
                minLength={4}
                maxLength={50}
                required
              />
            </div>
            <button type="submit" disabled={savingCode} className="btn-primary w-full">
              {savingCode ? 'Guardando...' : 'Cambiar código'}
            </button>
          </form>
        </Modal>
      )}
    </div>
  )
}
