import { clsx } from 'clsx'
import { OrderStatus } from '../../types'

const statusLabels: Record<OrderStatus, string> = {
  pending: 'Pendiente',
  in_preparation: 'En preparación',
  ready: 'Listo',
  delivered: 'Entregado',
  cancelled: 'Cancelado',
}

interface BadgeProps {
  status: OrderStatus
  className?: string
}

export default function Badge({ status, className }: BadgeProps) {
  return (
    <span className={clsx(
      'px-2 py-0.5 rounded-full text-xs font-semibold border',
      `badge-${status}`,
      className
    )}>
      {statusLabels[status]}
    </span>
  )
}
