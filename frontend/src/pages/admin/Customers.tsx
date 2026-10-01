import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { customersApi } from '../../services/api'
import { Customer } from '../../types'
import { Plus, Search, User } from 'lucide-react'
import toast from 'react-hot-toast'
import Modal from '../../components/ui/Modal'

export default function Customers() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ name: '', phone: '', email: '', address: '', notes: '' })

  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ['customers', search],
    queryFn: () => customersApi.list(search).then(r => r.data),
  })

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await customersApi.create(form)
      qc.invalidateQueries({ queryKey: ['customers'] })
      setShowCreate(false)
      setForm({ name: '', phone: '', email: '', address: '', notes: '' })
      toast.success('Cliente creado')
    } catch { toast.error('Error') }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Clientes</h1>
          <p className="text-gray-500 text-sm">{customers.length} clientes registrados</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2">
          <Plus size={16} /> Nuevo cliente
        </button>
      </div>

      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
        <input className="input pl-9" placeholder="Buscar por nombre o teléfono..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {customers.map(c => (
          <div key={c.id} className="card hover:border-brand-700 border-dark-600 border-2 transition-all">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-brand-900/50 rounded-full flex items-center justify-center flex-shrink-0">
                <User size={18} className="text-brand-400" />
              </div>
              <div>
                <p className="text-white font-semibold">{c.name}</p>
                {c.phone && <p className="text-gray-400 text-xs">{c.phone}</p>}
                {c.email && <p className="text-gray-500 text-xs">{c.email}</p>}
              </div>
            </div>
            {c.address && <p className="text-gray-500 text-xs mt-2">📍 {c.address}</p>}
            {c.notes && <p className="text-gray-500 text-xs mt-1">📝 {c.notes}</p>}
          </div>
        ))}
      </div>
      {customers.length === 0 && <p className="text-gray-500 text-center py-8">No se encontraron clientes</p>}

      {showCreate && (
        <Modal title="Nuevo cliente" onClose={() => setShowCreate(false)}>
          <form onSubmit={handleCreate} className="space-y-3">
            <div><label className="label">Nombre *</label><input className="input" value={form.name} onChange={e => setForm({...form, name: e.target.value})} required /></div>
            <div><label className="label">Teléfono</label><input className="input" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} /></div>
            <div><label className="label">Email</label><input type="email" className="input" value={form.email} onChange={e => setForm({...form, email: e.target.value})} /></div>
            <div><label className="label">Dirección</label><input className="input" value={form.address} onChange={e => setForm({...form, address: e.target.value})} /></div>
            <div><label className="label">Notas</label><textarea className="input" rows={2} value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} /></div>
            <button type="submit" className="btn-primary w-full">Guardar cliente</button>
          </form>
        </Modal>
      )}
    </div>
  )
}
