/**
 * Admin: configurar estaciones, tiempos por producto, despachadores activos
 * y bloqueo "86" rápido de productos.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { kitchenApi, productsApi, dispatchApi, usersApi } from '../../services/api'
import { KitchenStation } from '../../types/kitchen'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { Save, AlertOctagon, Check, Users as UsersIcon, Settings2 } from 'lucide-react'

const STATION_OPTIONS = [
  { value: 'neveras',       label: 'Neveras (alistamiento)' },
  { value: 'parrilla',      label: 'Parrilla' },
  { value: 'sudados',       label: 'Sudados' },
  { value: 'fritos',        label: 'Fritos' },
  { value: 'emplatamiento', label: 'Emplatamiento (defecto principales)' },
  { value: 'entradas',      label: 'Entradas' },
  { value: 'sopas',         label: 'Sopas' },
  { value: 'barra',         label: 'Barra / Bebidas' },
]

const QUEUE_OPTIONS = [
  { value: 'principal', label: 'Principales (multi-despachador)' },
  { value: 'entradas',  label: 'Entradas' },
  { value: 'sopas',     label: 'Sopas' },
  { value: 'bebidas',   label: 'Bebidas' },
]

export default function KitchenConfig() {
  const qc = useQueryClient()
  const [tab, setTab] = useState<'products' | 'stations' | 'shifts'>('products')

  const { data: stations = [] } = useQuery<KitchenStation[]>({
    queryKey: ['kitchen-stations'],
    queryFn: () => kitchenApi.stations().then(r => r.data),
  })

  const { data: products = [] } = useQuery<any[]>({
    queryKey: ['products-full'],
    queryFn: () => productsApi.list(false).then(r => r.data),
  })

  const { data: users = [] } = useQuery<any[]>({
    queryKey: ['users-all'],
    queryFn: () => usersApi.list().then(r => r.data),
  })

  const { data: shifts = [] } = useQuery<any[]>({
    queryKey: ['dispatch-shifts-all'],
    queryFn: () => dispatchApi.shifts().then(r => r.data),
  })

  const saveProduct = async (p: any, data: any) => {
    try {
      await kitchenApi.setProductConfig(p.id, data)
      toast.success(`${p.name} actualizado`)
      qc.invalidateQueries({ queryKey: ['products-full'] })
    } catch {
      toast.error('Error al guardar')
    }
  }

  const toggleSoldOut = async (p: any) => {
    await kitchenApi.toggleSoldOut(p.id)
    qc.invalidateQueries({ queryKey: ['products-full'] })
  }

  const setShift = async (userId: number, queueType: string, isActive: boolean) => {
    await dispatchApi.setShift({ user_id: userId, queue_type: queueType, is_active: isActive })
    qc.invalidateQueries({ queryKey: ['dispatch-shifts-all'] })
    toast.success(isActive ? 'Despachador activado' : 'Despachador desactivado')
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <h1 className="text-3xl font-black text-white">Configuración de Cocina</h1>

      <div className="flex gap-2 border-b border-dark-700">
        {[
          ['products', 'Productos · tiempos · "86"', Settings2],
          ['stations', 'Estaciones', Settings2],
          ['shifts',   'Despachadores activos', UsersIcon],
        ].map(([k, label, Icon]: any) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`px-4 py-2 font-bold flex items-center gap-2 border-b-2 transition ${
              tab === k ? 'border-brand-500 text-brand-400' : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            <Icon size={16} /> {label}
          </button>
        ))}
      </div>

      {tab === 'products' && (
        <div className="overflow-x-auto rounded-2xl border border-dark-700">
          <table className="w-full">
            <thead className="bg-dark-800 text-gray-400 text-xs uppercase">
              <tr>
                <th className="text-left p-3">Producto</th>
                <th className="text-left p-3">Estación</th>
                <th className="text-center p-3">Tiempo (min)</th>
                <th className="text-center p-3">Pasa Neveras</th>
                <th className="text-center p-3">Pide punto</th>
                <th className="text-center p-3">"86" / Agotar</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p: any) => (
                <ProductRow
                  key={p.id}
                  product={p}
                  onSave={(d) => saveProduct(p, d)}
                  onToggleSoldOut={() => toggleSoldOut(p)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'stations' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {stations.map((s) => (
            <StationCard key={s.id} station={s} onSaved={() => qc.invalidateQueries({ queryKey: ['kitchen-stations'] })} />
          ))}
        </div>
      )}

      {tab === 'shifts' && (
        <div className="bg-dark-800 rounded-2xl p-4">
          <p className="text-gray-400 text-sm mb-4">
            Activa los despachadores por cola. <b>Principales</b> admite varios al tiempo;
            las otras colas idealmente 1 cada una.
          </p>
          <table className="w-full">
            <thead className="text-gray-400 text-xs uppercase">
              <tr>
                <th className="text-left p-2">Usuario</th>
                {QUEUE_OPTIONS.map(q => (
                  <th key={q.value} className="text-center p-2">{q.label.split(' ')[0]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map((u: any) => (
                <tr key={u.id} className="border-t border-dark-700">
                  <td className="p-2">
                    <div className="text-white font-bold">{u.name}</div>
                    <div className="text-xs text-gray-500">{u.role?.name}</div>
                  </td>
                  {QUEUE_OPTIONS.map(q => {
                    const active = shifts.some((s: any) => s.user_id === u.id && s.queue_type === q.value && s.is_active)
                    return (
                      <td key={q.value} className="text-center p-2">
                        <button
                          onClick={() => setShift(u.id, q.value, !active)}
                          className={`w-10 h-6 rounded-full transition ${
                            active ? 'bg-green-600' : 'bg-dark-600'
                          }`}
                          title={active ? 'Activo' : 'Inactivo'}
                        >
                          <span className={`block w-5 h-5 bg-white rounded-full transition-transform ${active ? 'translate-x-4' : 'translate-x-0.5'}`} />
                        </button>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Subcomponentes ────────────────────────────────────────────────────
function ProductRow({ product, onSave, onToggleSoldOut }: any) {
  const [section, setSection] = useState(product.kitchen_section || 'entradas')
  const [time, setTime] = useState(product.preparation_time_min ?? 15)
  const [neveras, setNeveras] = useState(!!product.requires_neveras)
  const [point, setPoint] = useState(!!product.requires_cooking_point)
  return (
    <tr className="border-t border-dark-700 hover:bg-dark-800/40">
      <td className="p-2">
        <div className={`font-bold ${product.is_sold_out ? 'text-red-400 line-through' : 'text-white'}`}>
          {product.name}
        </div>
        <div className="text-xs text-gray-500">{product.category?.name || ''}</div>
      </td>
      <td className="p-2">
        <select
          value={section}
          onChange={e => setSection(e.target.value)}
          className="bg-dark-700 border border-dark-600 rounded px-2 py-1 text-sm text-white"
        >
          {STATION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </td>
      <td className="text-center p-2">
        <input
          type="number"
          min={0}
          max={240}
          value={time}
          onChange={e => setTime(parseInt(e.target.value) || 0)}
          className="bg-dark-700 border border-dark-600 rounded px-2 py-1 w-20 text-center text-white"
        />
      </td>
      <td className="text-center p-2">
        <input type="checkbox" checked={neveras} onChange={e => setNeveras(e.target.checked)} className="w-5 h-5" />
      </td>
      <td className="text-center p-2">
        <input type="checkbox" checked={point} onChange={e => setPoint(e.target.checked)} className="w-5 h-5" />
      </td>
      <td className="text-center p-2 flex items-center justify-center gap-2">
        <button
          onClick={() => onSave({ kitchen_section: section, preparation_time_min: time, requires_neveras: neveras, requires_cooking_point: point, is_sold_out: product.is_sold_out })}
          className="px-3 py-1 bg-brand-600 hover:bg-brand-700 text-white rounded text-sm font-bold flex items-center gap-1"
        >
          <Save size={14} /> Guardar
        </button>
        <button
          onClick={onToggleSoldOut}
          className={`px-3 py-1 rounded text-sm font-bold flex items-center gap-1 ${
            product.is_sold_out ? 'bg-green-700 hover:bg-green-800 text-white' : 'bg-red-700 hover:bg-red-800 text-white'
          }`}
          title="Marcar agotado / disponible"
        >
          {product.is_sold_out ? <Check size={14} /> : <AlertOctagon size={14} />}
          {product.is_sold_out ? 'Reactivar' : '86'}
        </button>
      </td>
    </tr>
  )
}

function StationCard({ station, onSaved }: any) {
  const [name, setName] = useState(station.display_name)
  const [color, setColor] = useState(station.color)
  const [concurrent, setConcurrent] = useState(station.max_concurrent)
  const [active, setActive] = useState(station.is_active)
  const save = async () => {
    try {
      await kitchenApi.updateStation(station.id, { display_name: name, color, max_concurrent: concurrent, is_active: active })
      toast.success(`${name} actualizada`)
      onSaved()
    } catch { toast.error('Error') }
  }
  return (
    <div className="bg-dark-800 rounded-2xl p-4 border-2" style={{ borderColor: color }}>
      <div className="text-xs uppercase text-gray-500 mb-1">{station.key}</div>
      <input value={name} onChange={e => setName(e.target.value)} className="bg-dark-700 border border-dark-600 rounded px-2 py-1 w-full text-white font-bold mb-2" />
      <label className="text-xs text-gray-400">Color</label>
      <input type="color" value={color} onChange={e => setColor(e.target.value)} className="w-full h-8 mb-2" />
      <label className="text-xs text-gray-400">Capacidad simultánea</label>
      <input type="number" min={1} value={concurrent} onChange={e => setConcurrent(parseInt(e.target.value) || 1)} className="bg-dark-700 border border-dark-600 rounded px-2 py-1 w-full text-white mb-2" />
      <label className="flex items-center gap-2 text-sm text-gray-300 mb-3">
        <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} /> Activa
      </label>
      <button onClick={save} className="w-full py-2 bg-brand-600 hover:bg-brand-700 text-white rounded font-bold flex items-center justify-center gap-1">
        <Save size={14} /> Guardar
      </button>
    </div>
  )
}
