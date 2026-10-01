import { ReactNode } from 'react'
import { useAuthStore } from '../store/authStore'

/**
 * Renderiza children solo si el usuario actual es Administrador.
 * Si no, opcionalmente muestra un fallback (típicamente null).
 *
 * Uso típico para ocultar botones de Eliminar/Modificar a no-admin:
 *   <AdminOnly>
 *     <button onClick={handleDelete}>Eliminar</button>
 *   </AdminOnly>
 *
 * El backend mantiene la última línea de defensa con get_admin.
 */
interface Props {
  children: ReactNode
  fallback?: ReactNode
}

export default function AdminOnly({ children, fallback = null }: Props) {
  const { hasRole } = useAuthStore()
  if (!hasRole('Administrador')) return <>{fallback}</>
  return <>{children}</>
}

/** Hook simple para condicionar lógica además del render. */
export function useIsAdmin(): boolean {
  const { hasRole } = useAuthStore()
  return hasRole('Administrador')
}
