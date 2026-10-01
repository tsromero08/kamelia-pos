/**
 * Panel "todo verde" para el dueño del rancho.
 * Pinta el estado del servidor + DB + scheduler + esquema.
 */
import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, AlertTriangle, XCircle, Server, Database, Calendar, Layers, Wifi } from 'lucide-react'
import { useConnectionStatus } from '../../hooks/useConnectionStatus'

interface Health {
  status: string
  checks: Record<string, { ok: boolean; error?: string; missing_tables?: string[]; tables?: number }>
}

function Row({ ok, label, icon: Icon, detail }: { ok: boolean; label: string; icon: any; detail?: string }) {
  return (
    <div className={`flex items-center gap-3 p-4 rounded-2xl border-2 ${
      ok ? 'bg-green-950/30 border-green-700' : 'bg-red-950/30 border-red-700'
    }`}>
      <Icon size={28} className={ok ? 'text-green-400' : 'text-red-400'} />
      <div className="flex-1">
        <div className="text-white font-bold">{label}</div>
        {detail && <div className="text-xs text-gray-400">{detail}</div>}
      </div>
      {ok ? <CheckCircle2 size={28} className="text-green-400" /> : <XCircle size={28} className="text-red-400" />}
    </div>
  )
}

export default function SystemHealth() {
  const conn = useConnectionStatus()
  const { data: health } = useQuery<Health>({
    queryKey: ['health-deep'],
    queryFn: () => fetch('/health/deep').then(r => r.json()),
    refetchInterval: 10000,
  })

  const dbOk = health?.checks?.database?.ok ?? false
  const schemaOk = health?.checks?.schema?.ok ?? false
  const schedOk = health?.checks?.scheduler?.ok ?? false
  const allOk = conn.healthy && dbOk && schemaOk && schedOk

  return (
    <div className="p-4 md:p-8 space-y-5 min-h-screen bg-dark-900">
      <div>
        <h1 className="text-3xl font-black text-white mb-1">Salud del Sistema</h1>
        <p className="text-gray-400">Estado en vivo del servidor LAN del rancho</p>
      </div>

      <div className={`p-6 rounded-3xl text-center ${
        allOk ? 'bg-green-900/40 border-2 border-green-600' : 'bg-orange-900/40 border-2 border-orange-600'
      }`}>
        {allOk ? (
          <>
            <CheckCircle2 size={80} className="text-green-400 mx-auto mb-2" />
            <div className="text-4xl font-black text-white">TODO FUNCIONA</div>
            <div className="text-green-300 mt-1">Sistema 100% operativo</div>
          </>
        ) : (
          <>
            <AlertTriangle size={80} className="text-orange-400 mx-auto mb-2" />
            <div className="text-4xl font-black text-white">REVISA EL SISTEMA</div>
            <div className="text-orange-300 mt-1">Hay componentes con problemas</div>
          </>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Row ok={conn.online} label="WiFi del navegador" icon={Wifi} detail={conn.online ? 'Conectado a red' : 'Sin red'} />
        <Row ok={conn.serverOk} label="Servidor del rancho" icon={Server} detail={`Último ping: ${conn.lastPing?.toLocaleTimeString() || 'nunca'}`} />
        <Row ok={dbOk} label="Base de datos PostgreSQL" icon={Database} detail={dbOk ? 'Respondiendo consultas' : (health?.checks?.database?.error || 'sin respuesta')} />
        <Row ok={schemaOk} label="Esquema de tablas" icon={Layers} detail={
          schemaOk
            ? `${health?.checks?.schema?.tables || '?'} tablas presentes`
            : `Faltan: ${(health?.checks?.schema?.missing_tables || []).join(', ')}`
        } />
        <Row ok={schedOk} label="Cierre automático (scheduler)" icon={Calendar} detail={schedOk ? 'Cron de cierre diario activo' : 'No corriendo'} />
      </div>

      <div className="bg-dark-800 rounded-2xl p-4">
        <h3 className="text-gray-400 text-xs uppercase tracking-wider mb-2">URLs operativas</h3>
        <ul className="text-sm text-gray-300 space-y-1 font-mono">
          <li>https://kamelia.local — POS / app</li>
          <li>https://kamelia.local/admin/cocina — Hub de cocina</li>
          <li>https://kamelia.local/admin/despacho/principal — Despacho principal</li>
          <li>https://kamelia.local/health/deep — Diagnóstico JSON</li>
        </ul>
      </div>
    </div>
  )
}
