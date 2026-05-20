interface BadgeProps {
  variant?: 'green' | 'red' | 'yellow' | 'blue' | 'gray'
  children: React.ReactNode
}

const variants = {
  green: 'bg-emerald-100 text-emerald-700',
  red: 'bg-red-100 text-red-700',
  yellow: 'bg-amber-100 text-amber-700',
  blue: 'bg-blue-100 text-blue-700',
  gray: 'bg-slate-100 text-slate-600',
}

export default function Badge({ variant = 'gray', children }: BadgeProps) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${variants[variant]}`}>
      {children}
    </span>
  )
}
