import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { expensesApi } from '../../services/api'
import { Expense, ExpenseCategory } from '../../types'
import { formatCurrency, formatDate } from '../../utils/format'
import { Plus, Trash2, Search } from 'lucide-react'
import toast from 'react-hot-toast'
import Modal from '../../components/ui/Modal'
import SpecialCodeModal from '../../components/SpecialCodeModal'
import { useAuthStore } from '../../store/authStore'

export default function Expenses() {
  const qc = useQueryClient()
  const { hasRole } = useAuthStore()
  const isAdmin = hasRole('Administrador')
  const [showCreate, setShowCreate] = useState(false)
  const [search, setSearch] = useState('')
  const [form, setForm] = useState({ category_id: '', description: '', amount: '', payment_method: 'cash', notes: '' })
  const [pendingCriticalAction, setPendingCriticalAction] = useState<null | { action: string; run: () => Promise<void> | void }>(null)

  const runWithSpecialCode = (action: string, run: () => Promise<void> | void) =>
    setPendingCriticalAction({ action, run })

  const { data: expenses = [] } = useQuery<Expense[]>({
    queryKey: ['expenses'],
    queryFn: () => expensesApi.list().then(r => r.data),
  })

  const { data: categories = [] } = useQuery<ExpenseCategory[]>({
    queryKey: ['expense-categories'],
    queryFn: () => expensesApi.categories().then(r => r.data),
  })

  const filtered = expenses.filter(e => e.description.toLowerCase().includes(search.toLowerCase()))
  const total = filtered.reduce((s, e) => s + Number(e.amount), 0)

  const handleCreate = (ev: React.FormEvent) => {
    ev.preventDefault()
    runWithSpecialCode('create_expense', async () => {
      try {
        await expensesApi.create({
          category_id: parseInt(form.category_id),
          description: form.description,
          amount: parseFloat(form.amount),
          payment_method: form.payment_method,
          notes: form.notes,
        })
        qc.invalidateQueries({ queryKey: ['expenses'] })
        setShowCreate(false)
        setForm({ category_id: '', description: '', amount: '', payment_method: 'cash', notes: '' })
        toast.success('Gasto registrado')
      } catch { toast.error('Error al registrar gasto') }
    })
  }

  const handleDelete = (id: number) => {
    if (!isAdmin) { toast.error('Solo el administrador puede eliminar gastos'); return }
    if (!confirm('¿Eliminar este gasto?')) return
    runWithSpecialCode('delete_expense', async () => {
      try {
        await expensesApi.delete(id)
        qc.invalidateQueries({ queryKey: ['expenses'] })
        toast.success('Gasto eliminado')
      } catch { toast.error('Error') }
    })
  }

  // Group by category
  const byCategory: Record<string, number> = {}
  filtered.forEach(e => {
    const cat = e.category?.name || 'Sin categoría'
    byCategory[cat] = (byCategory[cat] || 0) + Number(e.amount)
  })

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Gastos</h1>
          <p className="text-gray-500 text-sm">Gastos operativos del negocio</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2">
          <Plus size={16} /> Registrar gasto
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card col-span-2">
          <p className="text-gray-400 text-sm">Total gastos (filtro actual)</p>
          <p className="text-red-400 font-bold text-2xl">{formatCurrency(total)}</p>
        </div>
        {Object.entries(byCategory).slice(0, 2).map(([cat, amt]) => (
          <div key={cat} className="card">
            <p className="text-gray-400 text-xs truncate">{cat}</p>
            <p className="text-white font-semibold">{formatCurrency(amt)}</p>
          </div>
        ))}
      </div>

      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
        <input className="input pl-9" placeholder="Buscar gasto..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="card overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead className="border-b border-dark-600">
            <tr className="text-gray-400 text-xs uppercase tracking-wider">
              <th className="text-left px-4 py-3">Fecha</th>
              <th className="text-left px-4 py-3">Descripción</th>
              <th className="text-left px-4 py-3">Categoría</th>
              <th className="text-left px-4 py-3">Método</th>
              <th className="text-right px-4 py-3">Monto</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-dark-600">
            {filtered.map(exp => (
              <tr key={exp.id} className="hover:bg-dark-700 transition-colors">
                <td className="px-4 py-3 text-gray-400 text-xs">{formatDate(exp.expense_date)}</td>
                <td className="px-4 py-3 text-white">{exp.description}</td>
                <td className="px-4 py-3">
                  <span className="bg-dark-600 text-gray-300 text-xs px-2 py-0.5 rounded-full">{exp.category?.name || '-'}</span>
                </td>
                <td className="px-4 py-3 text-gray-400 text-xs capitalize">{exp.payment_method}</td>
                <td className="px-4 py-3 text-right text-red-400 font-semibold">{formatCurrency(exp.amount)}</td>
                <td className="px-4 py-3">
                  <button onClick={() => handleDelete(exp.id)} className="p-1.5 hover:bg-dark-600 rounded-lg text-gray-500 hover:text-red-400 transition-colors">
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <p className="text-gray-500 text-center py-8">No hay gastos registrados</p>}
      </div>

      {pendingCriticalAction && (
        <SpecialCodeModal
          title="Autorización requerida"
          description="Ingresar o eliminar gastos afecta los registros contables. Ingresa el Código de Acceso Especial."
          actionContext={pendingCriticalAction.action}
          onClose={() => setPendingCriticalAction(null)}
          onConfirm={() => {
            const run = pendingCriticalAction.run
            setPendingCriticalAction(null)
            void run()
          }}
        />
      )}

      {showCreate && (
        <Modal title="Registrar gasto" onClose={() => setShowCreate(false)}>
          <form onSubmit={handleCreate} className="space-y-3">
            <div>
              <label className="label">Categoría</label>
              <select className="input" value={form.category_id} onChange={e => setForm({...form, category_id: e.target.value})} required>
                <option value="">Seleccionar...</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div><label className="label">Descripción</label><input className="input" value={form.description} onChange={e => setForm({...form, description: e.target.value})} required /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Monto ($)</label><input type="number" className="input" value={form.amount} onChange={e => setForm({...form, amount: e.target.value})} required /></div>
              <div>
                <label className="label">Método de pago</label>
                <select className="input" value={form.payment_method} onChange={e => setForm({...form, payment_method: e.target.value})}>
                  <option value="cash">Efectivo</option>
                  <option value="card">Tarjeta</option>
                  <option value="transfer">Transferencia</option>
                  <option value="other">Otro</option>
                </select>
              </div>
            </div>
            <div><label className="label">Notas (opcional)</label><textarea className="input" rows={2} value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} /></div>
            <button type="submit" className="btn-primary w-full">Guardar gasto</button>
          </form>
        </Modal>
      )}
    </div>
  )
}
