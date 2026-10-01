import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './store/authStore'
import AdminLayout from './layouts/AdminLayout'
import Login from './pages/Login'
import Dashboard from './pages/admin/Dashboard'
import POS from './pages/pos/POS'
import Caja from './pages/pos/Caja'
import Mesas from './pages/pos/Mesas'
import Kitchen from './pages/kitchen/Kitchen'
import KitchenHub from './pages/kitchen/KitchenHub'
import Neveras from './pages/kitchen/Neveras'
import StationScreen from './pages/kitchen/StationScreen'
import TotalsScreen from './pages/kitchen/TotalsScreen'
import DispatchScreen from './pages/dispatch/DispatchScreen'
import KitchenConfig from './pages/admin/KitchenConfig'
import SystemHealth from './pages/admin/SystemHealth'
import Products from './pages/admin/Products'
import Inventory from './pages/admin/Inventory'
import Recipes from './pages/admin/Recipes'
import Customers from './pages/admin/Customers'
import Purchases from './pages/admin/Purchases'
import Expenses from './pages/admin/Expenses'
import Losses from './pages/admin/Losses'
import Reports from './pages/admin/Reports'
import Financial from './pages/admin/Financial'
import Users from './pages/admin/Users'
import DailyClosure from './pages/admin/DailyClosure'
import Orders from './pages/admin/Orders'
import Addons from './pages/admin/Addons'
import Batches from './pages/admin/Batches'
import CashSessions from './pages/admin/CashSessions'
import AuditLogs from './pages/admin/AuditLogs'

// Redirige según el rol del usuario al entrar al sistema
function RoleRedirect() {
  const { hasRole } = useAuthStore()
  if (hasRole('Cocina')) return <Navigate to="/admin/kitchen" replace />
  if (hasRole('Mesero')) return <Navigate to="/admin/mesas" replace />
  if (hasRole('Cajero')) return <Navigate to="/admin/mesas" replace />
  return <Navigate to="/admin/dashboard" replace />
}

// Guard de ruta: bloquea acceso a roles no autorizados
function RoleGuard({ roles, children }: { roles: string[]; children: React.ReactNode }) {
  const { hasRole } = useAuthStore()
  if (roles.length > 0 && !hasRole(...roles)) {
    return <RoleRedirect />
  }
  return <>{children}</>
}

export default function App() {
  const { isAuthenticated } = useAuthStore()
  const authed = isAuthenticated()

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/admin"
        element={authed ? <AdminLayout /> : <Navigate to="/login" replace />}
      >
        <Route index element={<RoleRedirect />} />

        {/* Solo Admin */}
        <Route path="dashboard" element={<RoleGuard roles={['Administrador']}><Dashboard /></RoleGuard>} />
        <Route path="products"  element={<RoleGuard roles={['Administrador']}><Products /></RoleGuard>} />
        <Route path="inventory" element={<RoleGuard roles={['Administrador']}><Inventory /></RoleGuard>} />
        <Route path="recipes"   element={<RoleGuard roles={['Administrador']}><Recipes /></RoleGuard>} />
        <Route path="purchases" element={<RoleGuard roles={['Administrador']}><Purchases /></RoleGuard>} />
        <Route path="expenses"  element={<RoleGuard roles={['Administrador']}><Expenses /></RoleGuard>} />
        <Route path="losses"    element={<RoleGuard roles={['Administrador']}><Losses /></RoleGuard>} />
        <Route path="reports"   element={<RoleGuard roles={['Administrador']}><Reports /></RoleGuard>} />
        <Route path="financial" element={<RoleGuard roles={['Administrador']}><Financial /></RoleGuard>} />
        <Route path="users"     element={<RoleGuard roles={['Administrador']}><Users /></RoleGuard>} />
        <Route path="daily"     element={<RoleGuard roles={['Administrador']}><DailyClosure /></RoleGuard>} />
        <Route path="orders"    element={<RoleGuard roles={['Administrador']}><Orders /></RoleGuard>} />
        <Route path="addons"    element={<RoleGuard roles={['Administrador']}><Addons /></RoleGuard>} />
        <Route path="batches"   element={<RoleGuard roles={['Administrador']}><Batches /></RoleGuard>} />
        <Route path="audit"     element={<RoleGuard roles={['Administrador']}><AuditLogs /></RoleGuard>} />

        {/* Caja: turnos */}
        <Route path="cash-sessions" element={<RoleGuard roles={['Administrador', 'Cajero', 'Mesero']}><CashSessions /></RoleGuard>} />

        {/* Admin + Cajero + Mesero */}
        <Route path="mesas"     element={<RoleGuard roles={['Administrador', 'Cajero', 'Mesero']}><Mesas /></RoleGuard>} />
        <Route path="pos"       element={<RoleGuard roles={['Administrador', 'Cajero', 'Mesero']}><POS /></RoleGuard>} />

        {/* Admin + Cajero */}
        <Route path="caja"      element={<RoleGuard roles={['Administrador', 'Cajero']}><Caja /></RoleGuard>} />
        <Route path="customers" element={<RoleGuard roles={['Administrador', 'Cajero']}><Customers /></RoleGuard>} />

        {/* Admin + Cocina */}
        <Route path="kitchen"   element={<RoleGuard roles={['Administrador', 'Cocina']}><Kitchen /></RoleGuard>} />

        {/* Sistema de cocina por estaciones (Rancho La Kamelia) */}
        <Route path="cocina"                    element={<RoleGuard roles={['Administrador', 'Cocina']}><KitchenHub /></RoleGuard>} />
        <Route path="cocina/neveras"            element={<RoleGuard roles={['Administrador', 'Cocina']}><Neveras /></RoleGuard>} />
        <Route path="cocina/emplatamiento"      element={<RoleGuard roles={['Administrador', 'Cocina']}><TotalsScreen /></RoleGuard>} />
        <Route path="cocina/parrilla"           element={<RoleGuard roles={['Administrador', 'Cocina']}><TotalsScreen /></RoleGuard>} />
        <Route path="cocina/sudados"            element={<RoleGuard roles={['Administrador', 'Cocina']}><TotalsScreen /></RoleGuard>} />
        <Route path="cocina/fritos"             element={<RoleGuard roles={['Administrador', 'Cocina']}><TotalsScreen /></RoleGuard>} />
        <Route path="cocina/entradas"           element={<RoleGuard roles={['Administrador', 'Cocina']}><StationScreen /></RoleGuard>} />
        <Route path="cocina/sopas"              element={<RoleGuard roles={['Administrador', 'Cocina']}><StationScreen /></RoleGuard>} />
        <Route path="cocina/barra"              element={<RoleGuard roles={['Administrador', 'Cocina']}><StationScreen /></RoleGuard>} />

        {/* Despachos */}
        <Route path="despacho/principal" element={<RoleGuard roles={['Administrador', 'Cocina', 'Mesero']}><DispatchScreen /></RoleGuard>} />
        <Route path="despacho/entradas"  element={<RoleGuard roles={['Administrador', 'Cocina', 'Mesero']}><DispatchScreen /></RoleGuard>} />
        <Route path="despacho/sopas"     element={<RoleGuard roles={['Administrador', 'Cocina', 'Mesero']}><DispatchScreen /></RoleGuard>} />
        <Route path="despacho/bebidas"   element={<RoleGuard roles={['Administrador', 'Cocina', 'Mesero']}><DispatchScreen /></RoleGuard>} />

        {/* Config admin de cocina */}
        <Route path="kitchen-config" element={<RoleGuard roles={['Administrador']}><KitchenConfig /></RoleGuard>} />
        <Route path="system-health"  element={<RoleGuard roles={['Administrador']}><SystemHealth /></RoleGuard>} />
      </Route>
      <Route path="*" element={<Navigate to={authed ? '/admin' : '/login'} replace />} />
    </Routes>
  )
}
