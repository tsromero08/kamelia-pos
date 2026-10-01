import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, ShoppingCart, ChefHat, Package, BookOpen,
  Users, Truck, Receipt, BarChart2, LogOut, UtensilsCrossed,
  AlertTriangle, TrendingUp, CalendarCheck, ClipboardList,
  DollarSign, Menu, X, Coffee, Sparkles, Calendar, Shield, Banknote,
} from 'lucide-react'
import { useState } from 'react'
import { useAuthStore } from '../store/authStore'
import { clsx } from 'clsx'
import NotificationsPanel from '../components/NotificationsPanel'
import TitanovaWatermark from '../components/TitanovaWatermark'
import TitanovaHeaderBadge from '../components/TitanovaHeaderBadge'
import ConnectionStatus from '../components/ConnectionStatus'
import { useSystemWS } from '../hooks/useSystemWS'
import { BRANDING } from '../config/branding'

const BRAND_INITIALS = BRANDING.shortName.slice(0, 2).toUpperCase()

// Navegación con control de rol
interface NavItem { to: string; icon: React.ElementType; label: string; roles: string[] }

const ALL_ROLES = ['Administrador', 'Cajero', 'Cocina', 'Mesero']

const navItems: NavItem[] = [
  { to: '/admin/dashboard', icon: LayoutDashboard, label: 'Dashboard',    roles: ['Administrador'] },
  { to: '/admin/mesas',     icon: Coffee,          label: 'Mesas',        roles: ['Administrador', 'Cajero', 'Mesero'] },
  { to: '/admin/pos',       icon: ShoppingCart,    label: 'POS',          roles: ['Administrador', 'Cajero', 'Mesero'] },
  { to: '/admin/caja',      icon: DollarSign,      label: 'Caja',         roles: ['Administrador', 'Cajero'] },
  { to: '/admin/cash-sessions', icon: Banknote,    label: 'Turnos de caja',roles: ['Administrador', 'Cajero', 'Mesero'] },
  { to: '/admin/kitchen',   icon: ChefHat,         label: 'Cocina (legacy)', roles: ['Administrador', 'Cajero', 'Cocina'] },
  { to: '/admin/cocina',    icon: ChefHat,         label: 'Cocina · Estaciones', roles: ['Administrador', 'Cocina'] },
  { to: '/admin/despacho/principal',  icon: Truck, label: 'Despacho', roles: ['Administrador', 'Cocina', 'Mesero'] },
  { to: '/admin/kitchen-config', icon: Sparkles,   label: 'Config Cocina', roles: ['Administrador'] },
  { to: '/admin/system-health',  icon: Shield,     label: 'Salud Sistema', roles: ['Administrador'] },
  { to: '/admin/orders',    icon: ClipboardList,   label: 'Pedidos',      roles: ['Administrador'] },
  { to: '/admin/customers', icon: Users,           label: 'Clientes',     roles: ['Administrador', 'Cajero'] },
  { to: '/admin/products',  icon: UtensilsCrossed, label: 'Productos',    roles: ['Administrador'] },
  { to: '/admin/addons',    icon: Sparkles,        label: 'Adiciones',    roles: ['Administrador'] },
  { to: '/admin/inventory', icon: Package,         label: 'Inventario',   roles: ['Administrador'] },
  { to: '/admin/batches',   icon: Calendar,        label: 'Lotes',        roles: ['Administrador'] },
  { to: '/admin/recipes',   icon: BookOpen,        label: 'Recetas',      roles: ['Administrador'] },
  { to: '/admin/purchases', icon: Truck,           label: 'Compras',      roles: ['Administrador'] },
  { to: '/admin/expenses',  icon: Receipt,         label: 'Gastos',       roles: ['Administrador'] },
  { to: '/admin/losses',    icon: AlertTriangle,   label: 'Pérdidas',     roles: ['Administrador'] },
  { to: '/admin/reports',   icon: BarChart2,       label: 'Reportes',     roles: ['Administrador'] },
  { to: '/admin/financial', icon: TrendingUp,      label: 'Financiero',   roles: ['Administrador'] },
  { to: '/admin/daily',     icon: CalendarCheck,   label: 'Cierre Diario',roles: ['Administrador'] },
  { to: '/admin/users',     icon: Users,           label: 'Usuarios',     roles: ['Administrador'] },
  { to: '/admin/audit',     icon: Shield,          label: 'Auditoría',    roles: ['Administrador'] },
]

// Items que van en la barra inferior móvil (máximo 5)
const mobileBottomItems: NavItem[] = [
  { to: '/admin/mesas',   icon: Coffee,       label: 'Mesas',  roles: ['Administrador', 'Cajero', 'Mesero'] },
  { to: '/admin/pos',     icon: ShoppingCart, label: 'POS',    roles: ['Administrador', 'Cajero', 'Mesero'] },
  { to: '/admin/caja',    icon: DollarSign,   label: 'Caja',   roles: ['Administrador', 'Cajero'] },
  { to: '/admin/kitchen', icon: ChefHat,      label: 'Cocina', roles: ['Administrador', 'Cajero', 'Cocina'] },
  { to: '/admin/dashboard',icon: LayoutDashboard,label:'Panel',roles: ['Administrador'] },
]

export default function AdminLayout() {
  const { user, logout, hasRole } = useAuthStore()
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [logoError, setLogoError] = useState(false)

  // Tiempo real global: invalida queries (Caja/POS/Cocina/Dashboard/Notificaciones)
  // automáticamente ante cualquier evento del sistema.
  useSystemWS()

  const roleName = user?.role?.name || ''
  const visibleNav = navItems.filter(item => item.roles.includes(roleName))
  const visibleMobile = mobileBottomItems.filter(item => item.roles.includes(roleName))

  const handleLogout = () => { logout(); navigate('/login') }

  const NavItem = ({ item, collapsed }: { item: NavItem; collapsed: boolean }) => (
    <NavLink
      to={item.to}
      onClick={() => setSidebarOpen(false)}
      className={({ isActive }) => clsx(
        'flex items-center gap-3 px-3 py-2.5 mx-2 rounded-xl transition-all text-sm font-medium',
        isActive
          ? 'bg-brand-600 text-white shadow-lg shadow-brand-900/40'
          : 'text-gray-400 hover:bg-dark-700 hover:text-white'
      )}
      title={collapsed ? item.label : undefined}
    >
      <item.icon size={18} className="flex-shrink-0" />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </NavLink>
  )

  return (
    <div className="flex h-screen bg-dark-900 overflow-hidden">

      {/* ── Sidebar escritorio (oculto en mobile) ─────────────────────── */}
      <aside className={clsx(
        'hidden md:flex flex-col bg-dark-800 border-r border-dark-700 transition-all duration-300 flex-shrink-0 relative',
        sidebarOpen ? 'w-56' : 'w-16'
      )}>
        {/* Logo */}
        <div className="flex items-center gap-3 p-3 border-b border-dark-700 min-h-[56px]">
          <div className="w-9 h-9 rounded-xl overflow-hidden flex-shrink-0 bg-brand-900 flex items-center justify-center border border-brand-700">
            {!logoError ? (
              <img src={BRANDING.logoPath} alt={BRANDING.shortName} className="w-full h-full object-cover"
                onError={() => setLogoError(true)} />
            ) : (
              <span className="text-brand-400 font-bold text-sm">{BRAND_INITIALS}</span>
            )}
          </div>
          {sidebarOpen && (
            <div className="overflow-hidden">
              <span className="font-bold text-white text-sm block truncate">{BRANDING.shortName}</span>
              <span className="text-brand-400 text-xs">{roleName}</span>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-2 space-y-0.5">
          {visibleNav.map(item => <NavItem key={item.to} item={item} collapsed={!sidebarOpen} />)}
        </nav>

        {/* Usuario + logout */}
        <div className="border-t border-dark-700 p-3 space-y-2">
          <div className={clsx('flex items-center gap-2', !sidebarOpen && 'justify-center')}>
            <div className="w-8 h-8 bg-brand-700 rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-white text-xs font-bold">{user?.name?.[0]?.toUpperCase()}</span>
            </div>
            {sidebarOpen && (
              <div className="overflow-hidden">
                <p className="text-white text-xs font-medium truncate">{user?.name}</p>
                <p className="text-gray-500 text-xs truncate">{roleName}</p>
              </div>
            )}
          </div>
          <button onClick={handleLogout}
            className={clsx(
              'flex items-center gap-2 px-2 py-1.5 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-900/20 transition-colors text-sm w-full',
              !sidebarOpen && 'justify-center'
            )}
            title={!sidebarOpen ? 'Cerrar sesión' : undefined}
          >
            <LogOut size={16} />
            {sidebarOpen && 'Cerrar sesión'}
          </button>
        </div>

        {/* Toggle */}
        <button
          onClick={() => setSidebarOpen(v => !v)}
          className="absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 bg-dark-700 border border-dark-500 rounded-full flex items-center justify-center text-gray-400 hover:text-white transition-colors z-10"
        >
          {sidebarOpen ? <X size={12} /> : <Menu size={12} />}
        </button>
      </aside>

      {/* ── Drawer móvil ─────────────────────────────────────────────── */}
      {sidebarOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          {/* Overlay */}
          <div className="absolute inset-0 bg-black/70" onClick={() => setSidebarOpen(false)} />
          {/* Panel */}
          <aside className="relative w-72 bg-dark-800 flex flex-col border-r border-dark-700 shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b border-dark-700">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl overflow-hidden bg-brand-900 border border-brand-700 flex items-center justify-center">
                  {!logoError ? (
                    <img src={BRANDING.logoPath} alt={BRANDING.shortName} className="w-full h-full object-cover"
                      onError={() => setLogoError(true)} />
                  ) : <span className="text-brand-400 font-bold text-sm">{BRAND_INITIALS}</span>}
                </div>
                <div>
                  <p className="text-white font-bold text-sm">{BRANDING.shortName}</p>
                  <p className="text-brand-400 text-xs">{roleName}</p>
                </div>
              </div>
              <button onClick={() => setSidebarOpen(false)} className="text-gray-400 hover:text-white p-1">
                <X size={20} />
              </button>
            </div>

            <nav className="flex-1 overflow-y-auto py-3 space-y-1 px-2">
              {visibleNav.map(item => <NavItem key={item.to} item={item} collapsed={false} />)}
            </nav>

            <div className="border-t border-dark-700 p-4 space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-brand-700 rounded-full flex items-center justify-center">
                  <span className="text-white text-sm font-bold">{user?.name?.[0]?.toUpperCase()}</span>
                </div>
                <div>
                  <p className="text-white text-sm font-medium">{user?.name}</p>
                  <p className="text-gray-500 text-xs">{user?.email}</p>
                </div>
              </div>
              <button onClick={handleLogout}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-red-400 hover:bg-red-900/20 transition-colors text-sm font-medium">
                <LogOut size={16} /> Cerrar sesión
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* ── Área principal ─────────────────────────────────────────────── */}
      <main className="flex-1 overflow-hidden min-w-0 flex flex-col">
        {/* Top bar */}
        <header className="flex items-center justify-between px-3 md:px-4 py-2 border-b border-dark-700 bg-dark-800/80 backdrop-blur flex-shrink-0 min-h-[48px]">
          {/* Hamburger — solo móvil */}
          <button
            onClick={() => setSidebarOpen(true)}
            className="md:hidden flex items-center gap-2 text-gray-400 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-dark-700"
          >
            <Menu size={20} />
            <span className="text-sm font-medium text-white">{user?.name}</span>
          </button>
          <div className="hidden md:block" />
          <div className="flex items-center gap-3">
            <ConnectionStatus />
            <TitanovaHeaderBadge />
            <NotificationsPanel />
          </div>
        </header>

        {/* Contenido con padding inferior en móvil para la bottom nav */}
        <div className="flex-1 overflow-y-auto pb-16 md:pb-0">
          <Outlet />
        </div>
      </main>

      {/* ── Bottom navigation — solo móvil ───────────────────────────── */}
      {visibleMobile.length > 0 && (
        <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-dark-800 border-t border-dark-700 flex">
          {visibleMobile.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => clsx(
                'flex-1 flex flex-col items-center justify-center py-2 gap-0.5 transition-colors text-xs font-medium',
                isActive ? 'text-brand-400' : 'text-gray-500'
              )}
            >
              {({ isActive }) => (
                <>
                  <item.icon size={22} className={isActive ? 'text-brand-400' : 'text-gray-500'} />
                  <span className="text-[10px]">{item.label}</span>
                </>
              )}
            </NavLink>
          ))}
          <button
            onClick={handleLogout}
            className="flex-shrink-0 flex flex-col items-center justify-center py-2 px-3 gap-0.5 text-gray-500 hover:text-red-400 transition-colors"
          >
            <LogOut size={22} />
            <span className="text-[10px]">Salir</span>
          </button>
        </nav>
      )}

      {/* ── Marca de agua Software Titanova ──────────────────────────── */}
      <TitanovaWatermark />
    </div>
  )
}
