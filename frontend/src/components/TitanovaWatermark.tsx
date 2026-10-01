import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Phone, X, ShieldCheck, ShieldAlert } from 'lucide-react'
import { systemApi } from '../services/api'

const BRAND_NAME = 'Software Titanova'
const BRAND_PHONE = '3013896861'
const BRAND_SLOGAN = 'Soluciones inteligentes, negocios en movimiento'

interface LicenseInfo {
  valid: boolean
  client: string
  key: string
  expires: string | null
  days_remaining: number | null
}

export default function TitanovaWatermark() {
  const [expanded, setExpanded] = useState(false)
  const [hidden, setHidden] = useState(false)

  const { data: license } = useQuery<LicenseInfo>({
    queryKey: ['license'],
    queryFn: () => systemApi.license().then(r => r.data),
    staleTime: 5 * 60 * 1000,
    retry: false,
  })

  const licenseValid = license?.valid !== false
  const expiringSoon = license?.days_remaining != null && license.days_remaining <= 15 && license.days_remaining >= 0

  if (hidden) return null

  return (
    <div
      className="fixed bottom-3 right-3 z-30 print:hidden select-none pointer-events-auto"
      aria-label="Software Titanova"
    >
      {expanded ? (
        <div className="bg-dark-800/95 backdrop-blur border border-brand-700/60 rounded-2xl shadow-2xl shadow-brand-900/40 px-4 py-3 max-w-xs">
          <div className="flex items-start gap-3">
            <div className="w-12 h-12 rounded-xl bg-white p-1 flex items-center justify-center flex-shrink-0 shadow-lg ring-1 ring-brand-600/40">
              <img src="/logos/logo-titanova.png" alt="Titanova" className="w-full h-full object-contain" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-black text-sm leading-tight">{BRAND_NAME}</p>
              <a
                href={`tel:${BRAND_PHONE}`}
                className="text-brand-400 hover:text-brand-300 text-xs flex items-center gap-1 mt-0.5"
              >
                <Phone size={11} /> {BRAND_PHONE}
              </a>
              <p className="text-gray-400 italic text-[11px] mt-1.5 leading-snug">
                "{BRAND_SLOGAN}"
              </p>
              {license && (
                <div className={`mt-2 pt-2 border-t border-dark-700 flex items-center gap-1.5 text-[10px] ${
                  licenseValid ? 'text-green-400' : 'text-red-400'
                }`}>
                  {licenseValid ? <ShieldCheck size={11} /> : <ShieldAlert size={11} />}
                  <span className="font-bold">
                    {licenseValid ? 'Licencia activa' : 'Licencia vencida'}
                  </span>
                  {license.days_remaining != null && licenseValid && (
                    <span className="text-gray-500">· {license.days_remaining}d</span>
                  )}
                </div>
              )}
              {license?.client && (
                <p className="text-gray-600 text-[10px] mt-0.5 truncate">{license.client}</p>
              )}
            </div>
            <button
              onClick={() => setExpanded(false)}
              className="text-gray-500 hover:text-white p-0.5 flex-shrink-0"
              aria-label="Contraer"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setExpanded(true)}
          onDoubleClick={() => setHidden(true)}
          className={`group flex items-center gap-2 bg-dark-800/70 backdrop-blur border hover:bg-dark-800/95 rounded-full pl-2 pr-3 py-1.5 shadow-lg transition-all opacity-60 hover:opacity-100 ${
            !licenseValid
              ? 'border-red-600 hover:border-red-400 shadow-red-900/40'
              : expiringSoon
              ? 'border-yellow-600 hover:border-yellow-400 shadow-yellow-900/30'
              : 'border-brand-700/40 hover:border-brand-500 shadow-brand-900/30'
          }`}
          title={`${BRAND_NAME} · ${BRAND_PHONE} · ${BRAND_SLOGAN}`}
        >
          <span className="w-7 h-7 rounded-full bg-white p-0.5 flex items-center justify-center shadow-inner ring-1 ring-brand-600/40">
            <img src="/logos/logo-titanova.png" alt="" className="w-full h-full object-contain" />
          </span>
          <span className="text-white text-[11px] font-bold tracking-wide hidden sm:inline">
            {BRAND_NAME}
          </span>
          <span className="text-brand-400 text-[10px] font-mono hidden md:inline">
            {BRAND_PHONE}
          </span>
          {!licenseValid && <ShieldAlert size={12} className="text-red-400" />}
        </button>
      )}
    </div>
  )
}
