/**
 * Badge sutil pero notorio que va al lado de la barra de notificaciones.
 * Refuerza la marca Software Titanova en cada pantalla, sin estorbar.
 */
export default function TitanovaHeaderBadge() {
  return (
    <div className="flex items-center gap-2 print:hidden">
      <div className="hidden md:flex items-center gap-2 bg-gradient-to-r from-brand-900/60 via-brand-800/60 to-brand-900/60 border border-brand-600/40 rounded-full pl-1 pr-3 py-1 shadow-md shadow-brand-900/30 hover:shadow-brand-900/60 transition-all">
        <span className="w-7 h-7 rounded-full bg-white p-0.5 flex items-center justify-center shadow-inner">
          <img src="/logos/logo-titanova.png" alt="Titanova" className="w-full h-full object-contain" />
        </span>
        <span className="text-white text-[11px] font-black tracking-wide">
          Software Titanova
        </span>
      </div>
      {/* Versión compacta mobile */}
      <div className="md:hidden flex items-center gap-1 bg-brand-900/40 border border-brand-700/40 rounded-full pl-0.5 pr-2 py-0.5">
        <span className="w-5 h-5 rounded-full bg-white p-0.5 flex items-center justify-center">
          <img src="/logos/logo-titanova.png" alt="" className="w-full h-full object-contain" />
        </span>
        <span className="text-brand-200 text-[10px] font-bold">Titanova</span>
      </div>
    </div>
  )
}
