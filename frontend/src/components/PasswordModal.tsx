import { useState } from 'react'
import { Lock, Eye, EyeOff } from 'lucide-react'
import Modal from './ui/Modal'
import { authApi } from '../services/api'
import { useAuthStore } from '../store/authStore'

interface Props {
  title?: string
  description?: string
  onConfirm?: () => void
  onConfirmWithPassword?: (password: string) => void
  onClose: () => void
}

export default function PasswordModal({
  title = 'Acción protegida',
  description,
  onConfirm,
  onConfirmWithPassword,
  onClose,
}: Props) {
  const { user } = useAuthStore()
  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleVerify = async () => {
    if (!password.trim()) { setError('Ingresa la contraseña'); return }
    setLoading(true)
    setError('')
    try {
      await authApi.login(user?.email || '', password)
      if (onConfirmWithPassword) {
        onConfirmWithPassword(password)
      } else if (onConfirm) {
        onConfirm()
      }
      onClose()
    } catch {
      setError('Contraseña incorrecta. Solo usuarios autorizados pueden hacer este cambio.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal title={title} onClose={onClose} size="sm">
      <div className="space-y-4">
        <div className="flex items-start gap-3 bg-yellow-900/20 border border-yellow-700 rounded-lg p-3">
          <Lock size={18} className="text-yellow-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-yellow-300 text-sm font-semibold">Acción restringida</p>
            <p className="text-yellow-400/80 text-xs mt-0.5">
              {description || 'Esta acción requiere autorización. Ingresa la contraseña de administrador para continuar.'}
            </p>
          </div>
        </div>

        <div>
          <label className="label text-xs">Contraseña de autorización</label>
          <div className="relative mt-1">
            <input
              type={showPwd ? 'text' : 'password'}
              className="input pr-10"
              placeholder="••••••••"
              value={password}
              onChange={e => { setPassword(e.target.value); setError('') }}
              onKeyDown={e => e.key === 'Enter' && handleVerify()}
              autoFocus
            />
            <button
              type="button"
              onClick={() => setShowPwd(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
            >
              {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
        </div>

        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="btn-secondary flex-1">Cancelar</button>
          <button
            onClick={handleVerify}
            disabled={loading}
            className="btn-primary flex-1 flex items-center justify-center gap-2"
          >
            <Lock size={14} />
            {loading ? 'Verificando...' : 'Autorizar'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
