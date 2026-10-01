import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { authApi } from '../services/api'
import { useAuthStore } from '../store/authStore'
import { Lock, Mail, Phone, Eye, EyeOff } from 'lucide-react'
import { BRANDING } from '../config/branding'

export default function Login() {
  const [email, setEmail] = useState(BRANDING.adminEmailPlaceholder)
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [logoError, setLogoError] = useState(false)
  const { setAuth } = useAuthStore()
  const navigate = useNavigate()

  const initials = BRANDING.shortName.slice(0, 2).toUpperCase()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await authApi.login(email, password)
      setAuth(res.data.user, res.data.access_token)
      toast.success(`Bienvenido, ${res.data.user.name}!`)
      navigate('/admin/dashboard')
    } catch {
      toast.error('Credenciales incorrectas')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-dark-900 px-4 relative overflow-hidden">
      {/* ── Marca de agua: logo gigante en el fondo ─────────── */}
      {!logoError && (
        <img
          src={BRANDING.logoPath}
          alt=""
          aria-hidden
          className="absolute inset-0 m-auto w-[500px] h-[500px] object-contain opacity-[0.04] blur-sm pointer-events-none select-none"
        />
      )}
      {/* Resplandor decorativo */}
      <div className="absolute inset-0 bg-gradient-to-br from-brand-900/20 via-transparent to-brand-900/10 pointer-events-none" />

      <div className="w-full max-w-sm relative z-10">
        {/* Logo + título grande */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center mb-4">
            {!logoError ? (
              <img
                src={BRANDING.logoPath}
                alt={BRANDING.name}
                className="h-28 w-28 rounded-3xl object-cover shadow-2xl shadow-brand-900/60 ring-2 ring-brand-700/40"
                onError={() => setLogoError(true)}
              />
            ) : (
              <div className="w-24 h-24 bg-brand-600 rounded-3xl flex items-center justify-center shadow-2xl shadow-brand-900/60">
                <span className="text-white font-black text-4xl">{initials}</span>
              </div>
            )}
          </div>
          <h1 className="text-3xl font-black text-white tracking-tight">{BRANDING.name}</h1>
          <p className="text-brand-400 text-xs font-bold uppercase tracking-widest mt-1">
            Sistema de gestión POS · v1.1
          </p>
        </div>

        {/* Form */}
        <div className="card">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Correo electrónico</label>
              <div className="relative">
                <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="input pl-9"
                  placeholder={BRANDING.adminEmailPlaceholder}
                  required
                />
              </div>
            </div>
            <div>
              <label className="label">Contraseña</label>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="input pl-9 pr-10"
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full py-3 text-base">
              {loading ? 'Ingresando...' : 'Ingresar al sistema'}
            </button>
          </form>
        </div>

        <p className="text-center text-gray-600 text-xs mt-6">
          {BRANDING.name} · NIT {BRANDING.nit} · Tel {BRANDING.phone}
        </p>

        {/* ── Banda de marca Software Titanova ──────── */}
        <div className="mt-5 flex flex-col items-center gap-2">
          <div className="flex items-center gap-3 bg-gradient-to-r from-brand-800/40 via-brand-700/40 to-brand-800/40 border border-brand-500/50 rounded-2xl px-4 py-2.5 shadow-lg shadow-brand-900/40">
            <span className="w-10 h-10 rounded-xl bg-white p-1 flex items-center justify-center shadow-inner">
              <img src="/logos/logo-titanova.png" alt="Titanova" className="w-full h-full object-contain" />
            </span>
            <div className="flex flex-col leading-tight">
              <span className="text-white text-sm font-black tracking-wide">Software Titanova</span>
              <a href="tel:3013896861" className="text-brand-300 hover:text-brand-200 text-[11px] font-mono flex items-center gap-1">
                <Phone size={10} /> 3013896861
              </a>
            </div>
          </div>
          <p className="text-brand-400 italic text-[11px] tracking-wide font-semibold">
            "Soluciones inteligentes, negocios en movimiento"
          </p>
        </div>
      </div>
    </div>
  )
}
