import { LucideIcon, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { clsx } from 'clsx'

interface StatCardProps {
  title: string
  value: string | number
  subtitle?: string
  icon?: LucideIcon
  trend?: number
  color?: 'orange' | 'green' | 'red' | 'blue' | 'default'
}

const colors = {
  orange: 'text-brand-400',
  green: 'text-green-400',
  red: 'text-red-400',
  blue: 'text-blue-400',
  default: 'text-white',
}

export default function StatCard({ title, value, subtitle, icon: Icon, trend, color = 'default' }: StatCardProps) {
  return (
    <div className="card flex flex-col gap-2">
      <div className="flex items-start justify-between">
        <span className="text-sm text-gray-400 font-medium">{title}</span>
        {Icon && <Icon size={18} className={colors[color]} />}
      </div>
      <div className={clsx('text-2xl font-bold', colors[color])}>{value}</div>
      {(subtitle || trend !== undefined) && (
        <div className="flex items-center gap-2">
          {trend !== undefined && (
            <span className={clsx('flex items-center gap-0.5 text-xs font-semibold',
              trend > 0 ? 'text-green-400' : trend < 0 ? 'text-red-400' : 'text-gray-400')}>
              {trend > 0 ? <TrendingUp size={12} /> : trend < 0 ? <TrendingDown size={12} /> : <Minus size={12} />}
              {Math.abs(trend).toFixed(1)}%
            </span>
          )}
          {subtitle && <span className="text-xs text-gray-500">{subtitle}</span>}
        </div>
      )}
    </div>
  )
}
