/**
 * Hub central de cocina — accesos a las 8 estaciones + 4 colas de despacho.
 * Pensado para que el supervisor abra la pantalla correcta en cada display.
 */
import { Link } from 'react-router-dom'
import { Snowflake, Flame, Coffee, ChefHat, GlassWater, Soup, Truck, Package } from 'lucide-react'

const STATIONS = [
  { to: '/admin/cocina/neveras',       icon: Snowflake, label: 'Neveras',        color: 'from-sky-700 to-sky-900',     desc: 'Alistamiento central' },
  { to: '/admin/cocina/parrilla',      icon: Flame,     label: 'Parrilla',       color: 'from-red-700 to-red-900',     desc: 'Cortes asados' },
  { to: '/admin/cocina/sudados',       icon: Coffee,    label: 'Sudados',        color: 'from-amber-700 to-amber-900', desc: 'Salsas, cazuelas' },
  { to: '/admin/cocina/fritos',        icon: Flame,     label: 'Fritos',         color: 'from-yellow-700 to-yellow-900', desc: 'Pescados, papas' },
  { to: '/admin/cocina/emplatamiento', icon: ChefHat,   label: 'Emplatamiento',  color: 'from-brand-700 to-brand-900', desc: 'Totales consolidados' },
  { to: '/admin/cocina/entradas',      icon: Package,   label: 'Entradas',       color: 'from-lime-700 to-lime-900',   desc: 'Entradas + acompañamientos' },
  { to: '/admin/cocina/sopas',         icon: Soup,      label: 'Sopas',          color: 'from-purple-700 to-purple-900', desc: 'Cazuelas, mondongo, ajiaco' },
  { to: '/admin/cocina/barra',         icon: GlassWater,label: 'Barra',          color: 'from-cyan-700 to-cyan-900',   desc: 'Bebidas, jugos, licores' },
]

const DISPATCH = [
  { to: '/admin/despacho/principal', label: 'Despacho · Principales', color: 'bg-brand-700' },
  { to: '/admin/despacho/entradas',  label: 'Despacho · Entradas',    color: 'bg-lime-700' },
  { to: '/admin/despacho/sopas',     label: 'Despacho · Sopas',       color: 'bg-purple-700' },
  { to: '/admin/despacho/bebidas',   label: 'Despacho · Bebidas',     color: 'bg-cyan-700' },
]

export default function KitchenHub() {
  return (
    <div className="p-4 md:p-8 min-h-screen bg-dark-900 space-y-8">
      <div>
        <h1 className="text-4xl font-black text-white mb-1">Cocina · Rancho La Kamelia</h1>
        <p className="text-gray-400">Selecciona la pantalla para esta estación o cola de despacho</p>
      </div>

      <section>
        <h2 className="text-sm uppercase tracking-wider text-gray-500 mb-3">Estaciones de cocina</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {STATIONS.map(s => (
            <Link
              key={s.to}
              to={s.to}
              className={`bg-gradient-to-br ${s.color} rounded-2xl p-5 hover:scale-105 transition-transform shadow-xl`}
            >
              <s.icon size={40} className="text-white/80 mb-2" />
              <div className="text-white font-black text-xl">{s.label}</div>
              <div className="text-white/70 text-sm">{s.desc}</div>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-sm uppercase tracking-wider text-gray-500 mb-3">Colas de despacho</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {DISPATCH.map(d => (
            <Link
              key={d.to}
              to={d.to}
              className={`${d.color} hover:brightness-110 rounded-2xl p-5 transition shadow-xl flex items-center gap-3`}
            >
              <Truck size={36} className="text-white/90" />
              <span className="text-white font-bold text-lg">{d.label}</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}
