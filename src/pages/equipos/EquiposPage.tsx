import { Suspense, lazy } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Banknote, BarChart3, Boxes, ClipboardList, LayoutDashboard, Layers, PackageCheck, RotateCcw, Settings2, Truck, Upload } from 'lucide-react'
import Spinner from '@/components/ui/Spinner'
import Forbidden from '@/components/auth/Forbidden'
import { useAuth } from '@/contexts/AuthContext'

const DashboardTab = lazy(() => import('./DashboardTab'))
const ReturnsTab = lazy(() => import('./ReturnsTab'))
const ReportsTab = lazy(() => import('./ReportsTab'))
const OrdersTab = lazy(() => import('./OrdersTab'))
const ShipmentsTab = lazy(() => import('./ShipmentsTab'))
const PaymentsTab = lazy(() => import('./PaymentsTab'))
const StockTab = lazy(() => import('./StockTab'))
const CatalogTab = lazy(() => import('./CatalogTab'))
const CarriersTab = lazy(() => import('./CarriersTab'))
const ImportTab = lazy(() => import('./ImportTab'))
const SettingsTab = lazy(() => import('./SettingsTab'))

const TABS = [
  { key: 'panel', label: 'Panel', icon: LayoutDashboard, permission: 'equipos.view', Component: DashboardTab },
  { key: 'pedidos', label: 'Pedidos', icon: ClipboardList, permission: 'equipos.view', Component: OrdersTab },
  { key: 'envios', label: 'Envíos', icon: PackageCheck, permission: 'equipos.view', Component: ShipmentsTab },
  { key: 'cobros', label: 'Cobros y clientes', icon: Banknote, permission: 'equipos.payments_view', Component: PaymentsTab },
  { key: 'retornos', label: 'Retornos', icon: RotateCcw, permission: 'equipos.view', Component: ReturnsTab },
  { key: 'reportes', label: 'Reportes', icon: BarChart3, permission: 'equipos.reports', Component: ReportsTab },
  { key: 'stock', label: 'Stock', icon: Boxes, permission: 'equipos.stock_view', Component: StockTab },
  { key: 'catalogo', label: 'Catálogo', icon: Layers, permission: 'equipos.view', Component: CatalogTab },
  { key: 'transportistas', label: 'Transportistas', icon: Truck, permission: 'equipos.view', Component: CarriersTab },
  { key: 'importar', label: 'Importar Excel', icon: Upload, permission: 'equipos.import', Component: ImportTab },
  { key: 'configuracion', label: 'Configuración', icon: Settings2, permission: 'equipos.view', Component: SettingsTab },
] as const

/**
 * Módulo «Gestión de Equipos» (solo dueño y roles con permiso). El menú lateral del panel es plano, por eso las pantallas
 * se navegan con pestañas; cada pestaña se muestra solo si el rol tiene su permiso.
 */
export default function EquiposPage() {
  const { hasPermission } = useAuth()
  const [params, setParams] = useSearchParams()
  const visible = TABS.filter((t) => hasPermission(t.permission))
  if (visible.length === 0) return <Forbidden />
  const active = visible.find((t) => t.key === params.get('tab')) ?? visible[0]
  const Active = active.Component

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Equipos</h1>
        <p className="text-sm text-slate-500 mt-1">Catálogo, stock y envíos de equipos POS</p>
      </div>
      <nav className="flex gap-1 border-b border-slate-200 overflow-x-auto" aria-label="Secciones de equipos">
        {visible.map((t) => {
          const Icon = t.icon
          const on = t.key === active.key
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setParams({ tab: t.key }, { replace: true })}
              aria-current={on ? 'page' : undefined}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${
                on ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Icon size={16} /> {t.label}
            </button>
          )
        })}
      </nav>
      <Suspense fallback={<div className="flex justify-center py-16"><Spinner /></div>}>
        <Active />
      </Suspense>
    </div>
  )
}
