const VARIANTS = {
  green:  'bg-green-100 text-green-800 border border-green-200/80',
  gray:   'bg-slate-100 text-slate-600 border border-slate-200/80',
  blue:   'bg-blue-100 text-blue-800 border border-blue-200/80',
  amber:  'bg-amber-100 text-amber-800 border border-amber-200/80',
  red:    'bg-red-100 text-red-800 border border-red-200/80',
  purple: 'bg-purple-100 text-purple-800 border border-purple-200/80',
}

export default function Badge({ children, variant = 'gray', className = '' }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full
                      text-xs font-medium ${VARIANTS[variant]} ${className}`}>
      {children}
    </span>
  )
}
