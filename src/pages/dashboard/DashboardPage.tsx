import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Building2, CheckCircle, XCircle, TrendingUp, ArrowRight } from 'lucide-react'
import { dashboardService, DashboardData } from '@/services/dashboard.service'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import Spinner from '@/components/ui/Spinner'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

function StatCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string
  value: number
  icon: React.ElementType
  color: string
}) {
  return (
    <Card>
      <CardBody className="flex items-center gap-4">
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
          <Icon size={22} className="text-white" />
        </div>
        <div>
          <p className="text-2xl font-bold text-slate-800">{value}</p>
          <p className="text-sm text-slate-500">{label}</p>
        </div>
      </CardBody>
    </Card>
  )
}

const statusVariant = (s: string) =>
  s === 'active' ? 'green' : s === 'inactive' ? 'red' : 'yellow'

const statusLabel = (s: string) =>
  s === 'active' ? 'Activo' : s === 'inactive' ? 'Inactivo' : s

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    dashboardService
      .getStats()
      .then(setData)
      .catch(() => setError('No se pudo cargar el dashboard'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex justify-center items-center h-48">
        <Spinner size={36} />
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-600">
        {error}
      </div>
    )
  }

  const stats = data!.stats
  const planData = [
    { plan: 'Trial', cantidad: stats.trial },
    { plan: 'Basic', cantidad: stats.basic },
    { plan: 'Pro', cantidad: stats.pro },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Dashboard</h1>
        <p className="text-slate-500 text-sm mt-1">Resumen general del sistema</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Empresas" value={stats.total} icon={Building2} color="bg-blue-500" />
        <StatCard label="Activas" value={stats.active} icon={CheckCircle} color="bg-emerald-500" />
        <StatCard label="Suspendidas" value={stats.inactive} icon={XCircle} color="bg-red-500" />
        <StatCard label="Plan Pro" value={stats.pro} icon={TrendingUp} color="bg-violet-500" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Plan chart */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <h2 className="font-semibold text-slate-700">Distribución por Plan</h2>
          </CardHeader>
          <CardBody>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={planData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="plan" tick={{ fontSize: 12, fill: '#64748b' }} />
                <YAxis tick={{ fontSize: 12, fill: '#64748b' }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13 }}
                />
                <Bar dataKey="cantidad" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardBody>
        </Card>

        {/* Recent tenants */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex items-center justify-between">
            <h2 className="font-semibold text-slate-700">Empresas recientes</h2>
            <Link
              to="/tenants"
              className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
            >
              Ver todas <ArrowRight size={14} />
            </Link>
          </CardHeader>
          <div className="divide-y divide-slate-50">
            {data!.recent_tenants.length === 0 ? (
              <CardBody>
                <p className="text-slate-400 text-sm text-center py-4">No hay empresas aún</p>
              </CardBody>
            ) : (
              data!.recent_tenants.map((t) => (
                <div key={t.id} className="px-6 py-3 flex items-center gap-4">
                  <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center text-slate-600 font-bold text-sm flex-shrink-0">
                    {t.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{t.name}</p>
                    <p className="text-xs text-slate-400 truncate">{t.email}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Badge variant="blue">{t.plan}</Badge>
                    <Badge variant={statusVariant(t.status)}>{statusLabel(t.status)}</Badge>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}
