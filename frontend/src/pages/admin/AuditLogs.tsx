import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { auditApi, usersApi } from '../../services/api'
import { parseServerDate } from '../../utils/format'
import { Shield, User as UserIcon, Filter, ChevronDown, ChevronUp } from 'lucide-react'

interface AuditLog {
  id: number
  user_id?: number
  user_name?: string
  action: string
  entity_type?: string
  entity_id?: number
  old_value?: Record<string, unknown> | unknown[] | null
  new_value?: Record<string, unknown> | unknown[] | null
  ip_address?: string
  notes?: string
  created_at?: string
}

const ACTION_COLORS: Record<string, string> = {
  create_order:           'bg-blue-900/40 text-blue-300 border-blue-700',
  process_payment:        'bg-green-900/40 text-green-300 border-green-700',
  modify_after_payment:   'bg-yellow-900/40 text-yellow-300 border-yellow-700',
  edit_order:             'bg-purple-900/40 text-purple-300 border-purple-700',
  cash_session_open:      'bg-green-900/40 text-green-300 border-green-700',
  cash_session_close:     'bg-orange-900/40 text-orange-300 border-orange-700',
  courtesy_with_managed_delivery: 'bg-pink-900/40 text-pink-300 border-pink-700',
}

const actionLabel = (a: string): string => ({
  create_order: 'Creó pedido',
  process_payment: 'Procesó pago',
  modify_after_payment: 'Modificación post-pago',
  edit_order: 'Editó pedido',
  cash_session_open: 'Abrió caja',
  cash_session_close: 'Cerró caja',
  delete_purchase: 'Eliminó compra',
  update_purchase: 'Editó compra',
  create_purchase: 'Creó compra',
  courtesy_with_managed_delivery: 'Cortesía con envío',
}[a] || a)

const fmtDT = (s?: string) => s
  ? parseServerDate(s).toLocaleString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  : '—'

export default function AuditLogs() {
  const [filters, setFilters] = useState({
    user_id: '',
    action: '',
    entity_type: '',
    days: 7,
  })
  const [expanded, setExpanded] = useState<number | null>(null)

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => usersApi.list().then(r => r.data),
    staleTime: 60000,
  })

  const { data: logs = [], isLoading } = useQuery<AuditLog[]>({
    queryKey: ['audit-logs', filters],
    queryFn: () => auditApi.list({
      user_id: filters.user_id ? parseInt(filters.user_id) : undefined,
      action: filters.action || undefined,
      entity_type: filters.entity_type || undefined,
      days: filters.days,
      limit: 300,
    }).then(r => r.data),
    refetchInterval: 30000,
  })

  // Acciones únicas para dropdown
  const uniqueActions = Array.from(new Set(logs.map(l => l.action))).sort()
  const uniqueEntities = Array.from(new Set(logs.map(l => l.entity_type).filter(Boolean))).sort()

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Shield size={22} className="text-brand-400" />
          Auditoría
        </h1>
        <p className="text-gray-500 text-sm">Bitácora completa de acciones · solo administrador</p>
      </div>

      {/* Filtros */}
      <div className="card grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div>
          <label className="label flex items-center gap-1 text-xs"><UserIcon size={11} /> Usuario</label>
          <select className="input text-sm" value={filters.user_id} onChange={e => setFilters(f => ({ ...f, user_id: e.target.value }))}>
            <option value="">Todos</option>
            {users.map((u: { id: number; name: string }) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label text-xs">Acción</label>
          <select className="input text-sm" value={filters.action} onChange={e => setFilters(f => ({ ...f, action: e.target.value }))}>
            <option value="">Todas</option>
            {uniqueActions.map(a => <option key={a} value={a}>{actionLabel(a)}</option>)}
          </select>
        </div>
        <div>
          <label className="label text-xs">Entidad</label>
          <select className="input text-sm" value={filters.entity_type} onChange={e => setFilters(f => ({ ...f, entity_type: e.target.value }))}>
            <option value="">Todas</option>
            {uniqueEntities.map(t => <option key={t} value={t!}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="label text-xs">Últimos N días</label>
          <select className="input text-sm" value={filters.days} onChange={e => setFilters(f => ({ ...f, days: parseInt(e.target.value) }))}>
            <option value={1}>1 día</option>
            <option value={7}>7 días</option>
            <option value={30}>30 días</option>
            <option value={90}>90 días</option>
            <option value={365}>1 año</option>
          </select>
        </div>
      </div>

      {/* Tabla */}
      <div className="card p-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-dark-700 flex items-center gap-2">
          <Filter size={14} className="text-gray-400" />
          <h2 className="font-semibold text-white text-sm">{logs.length} evento(s)</h2>
          {isLoading && <span className="text-xs text-gray-500">cargando...</span>}
        </div>
        <div className="overflow-x-auto max-h-[70vh]">
          <table className="w-full text-sm">
            <thead className="bg-dark-700 text-gray-400 text-xs uppercase tracking-wider sticky top-0">
              <tr>
                <th className="px-3 py-2 text-left w-36">Fecha</th>
                <th className="px-3 py-2 text-left">Usuario</th>
                <th className="px-3 py-2 text-left">Acción</th>
                <th className="px-3 py-2 text-left">Entidad</th>
                <th className="px-3 py-2 text-left">Notas</th>
                <th className="px-3 py-2 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 && !isLoading && (
                <tr><td colSpan={6} className="text-center text-gray-500 py-8">Sin eventos en este filtro</td></tr>
              )}
              {logs.map(l => {
                const open = expanded === l.id
                const color = ACTION_COLORS[l.action] || 'bg-dark-700 text-gray-300 border-dark-500'
                return (
                  <>
                    <tr key={l.id} className="border-t border-dark-700 hover:bg-dark-700/40 cursor-pointer"
                        onClick={() => setExpanded(open ? null : l.id)}>
                      <td className="px-3 py-2 text-gray-400 text-xs whitespace-nowrap">{fmtDT(l.created_at)}</td>
                      <td className="px-3 py-2 text-white">{l.user_name || `#${l.user_id}` || 'Sistema'}</td>
                      <td className="px-3 py-2">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase border ${color}`}>
                          {actionLabel(l.action)}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-gray-300 text-xs">
                        {l.entity_type ? `${l.entity_type}${l.entity_id ? ` #${l.entity_id}` : ''}` : '—'}
                      </td>
                      <td className="px-3 py-2 text-gray-400 text-xs truncate max-w-xs">{l.notes || '—'}</td>
                      <td className="px-3 py-2 text-gray-500">{open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</td>
                    </tr>
                    {open && (
                      <tr className="bg-dark-900 border-t border-dark-700">
                        <td colSpan={6} className="px-4 py-3">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                              <p className="text-gray-400 text-[10px] uppercase tracking-wider font-bold mb-1">Valor anterior</p>
                              <pre className="bg-dark-700 rounded-lg p-2 text-xs text-gray-300 overflow-x-auto max-h-48">
{l.old_value ? JSON.stringify(l.old_value, null, 2) : '—'}
                              </pre>
                            </div>
                            <div>
                              <p className="text-gray-400 text-[10px] uppercase tracking-wider font-bold mb-1">Valor nuevo</p>
                              <pre className="bg-dark-700 rounded-lg p-2 text-xs text-gray-300 overflow-x-auto max-h-48">
{l.new_value ? JSON.stringify(l.new_value, null, 2) : '—'}
                              </pre>
                            </div>
                          </div>
                          {l.ip_address && (
                            <p className="text-gray-500 text-xs mt-2">IP: <span className="font-mono">{l.ip_address}</span></p>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
