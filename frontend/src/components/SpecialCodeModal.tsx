import { useState } from 'react'
import { KeyRound, Eye, EyeOff, ShieldAlert } from 'lucide-react'
import Modal from './ui/Modal'
import { authApi } from '../services/api'

interface Props {
  title?: string
  description?: string
  actionContext?: string
  onConfirm: () => void
  onClose: () => void
}

export default function SpecialCodeModal({
  title = 'Código de Acceso Especial',
  description,
  actionContext,
  onConfirm,
  onClose,
}: Props) {
  const [code, setCode] = useState('')
  const [showCode, setShowCode] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleVerify = async () => {
    if (!code.trim()) { setError('Ingresa el código de acceso'); return }
    setLoading(true)
    setError('')
    try {
      await authApi.verifySpecialCode(code.trim(), actionContext)
      onConfirm()
      onClose()
    } catch {
      setError('Código incorrecto. Acción no autorizada.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal title={title} onClose={onClose} size="sm">
      <div className="space-y-4">
        <div className="flex items-start gap-3 bg-red-900/20 border border-red-700 rounded-lg p-3">
          <ShieldAlert size={18} className="text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-red-300 text-sm font-semibold">Acción crítica</p>
            <p className="text-red-400/80 text-xs mt-0.5">
              {description ||
                'Esta acción afecta datos sensibles (inventario, gastos o contabilidad). Ingresa el Código de Acceso Especial para autorizar.'}
            </p>
          </div>
        </div>

        <div>
          <label className="label text-xs flex items-center gap-1">
            <KeyRound size={12} /> Código de Acceso Especial
          </label>
          <div className="relative mt-1">
            <input
              type={showCode ? 'text' : 'password'}
              className="input pr-10 font-mono tracking-widest text-center"
              placeholder="••••••"
              value={code}
              onChange={e => { setCode(e.target.value); setError('') }}
              onKeyDown={e => e.key === 'Enter' && handleVerify()}
              autoFocus
              maxLength={50}
            />
            <button
              type="button"
              onClick={() => setShowCode(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
            >
              {showCode ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
          <p className="text-gray-600 text-[10px] mt-1.5">
            Solicítalo al administrador del sistema. Toda verificación queda registrada.
          </p>
        </div>

        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="btn-secondary flex-1">Cancelar</button>
          <button
            onClick={handleVerify}
            disabled={loading}
            className="btn-primary flex-1 flex items-center justify-center gap-2"
          >
            <KeyRound size={14} />
            {loading ? 'Verificando...' : 'Autorizar'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
