import { useEffect, useRef, useState } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import {
  LayoutDashboard,
  Building2,
  Settings,
  LogOut,
  Menu,
  X,
  ChevronRight,
  PackageOpen,
  CreditCard,
  Receipt,
  FileCheck,
  Users,
  MoreVertical,
  User,
  GitBranch,
  FileStack,
  Activity,
} from 'lucide-react'

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/tenants', label: 'Empresas', icon: Building2 },
  { to: '/fleet-migrations', label: 'Migraciones', icon: GitBranch },
  { to: '/fiscal', label: 'Documentos fiscales', icon: FileStack },
  { to: '/fiscal-operations', label: 'Operaciones fiscales', icon: Activity },
  { to: '/empresas-facturador', label: 'Facturador', icon: FileCheck },
  { to: '/plans', label: 'Planes', icon: PackageOpen },
  { to: '/subscriptions', label: 'Suscripciones', icon: CreditCard },
  { to: '/payments', label: 'Pagos', icon: Receipt },
  { to: '/saas-billing', label: 'Cobros SaaS', icon: CreditCard },
  { to: '/document-packages', label: 'Paquetes docs', icon: FileCheck },
  { to: '/users', label: 'Usuarios', icon: Users },
  { to: '/settings', label: 'Configuración', icon: Settings },
]

export default function MainLayout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const userMenuRef = useRef<HTMLDivElement | null>(null)

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  useEffect(() => {
    const handleClickOutside = (ev: MouseEvent) => {
      const el = userMenuRef.current
      if (!el) return
      if (ev.target instanceof Node && !el.contains(ev.target)) {
        setUserMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div className="flex h-screen overflow-hidden bg-slate-100">
      {/* Sidebar overlay mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 w-64 flex flex-col transform transition-transform duration-300 lg:translate-x-0 lg:static lg:inset-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{ background: 'var(--sa-sidebar-bg, #0f172a)' }}
      >
        {/* Logo */}
        <div className="flex items-center justify-between h-16 px-6 border-b border-slate-700/50">
          <span className="text-xl font-bold text-white tracking-tight">
            Tukifac <span className="text-blue-400 text-sm font-normal">Admin</span>
          </span>
          <button
            className="lg:hidden text-slate-400 hover:text-white"
            onClick={() => setSidebarOpen(false)}
          >
            <X size={20} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-400 hover:bg-slate-700/50 hover:text-white'
                }`
              }
            >
              <Icon size={18} />
              {label}
              {<ChevronRight size={14} className="ml-auto opacity-40" />}
            </NavLink>
          ))}
        </nav>

        {/* User info */}
        <div className="p-4 border-t border-slate-700/50">
          <div className="flex items-center gap-3" ref={userMenuRef}>
            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
              {user?.email?.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white font-medium truncate">{user?.email}</p>
              <p className="text-xs text-slate-400 capitalize">{user?.role}</p>
            </div>
            <div className="relative">
              <button
                type="button"
                onClick={() => setUserMenuOpen((v) => !v)}
                className="text-slate-400 hover:text-white transition-colors"
                title="Opciones"
              >
                <MoreVertical size={16} />
              </button>

              {userMenuOpen && (
                <div className="absolute bottom-8 right-0 w-44 bg-white rounded-lg shadow-lg border border-slate-200 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => {
                      setUserMenuOpen(false)
                      navigate('/profile')
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    <User size={16} className="text-slate-500" />
                    Perfil
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setUserMenuOpen(false)
                      handleLogout()
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                  >
                    <LogOut size={16} className="text-red-500" />
                    Cerrar sesión
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top navbar */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center px-6 gap-4 flex-shrink-0">
          <button
            className="lg:hidden text-slate-500 hover:text-slate-700"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu size={22} />
          </button>
          <div className="flex-1" />
          <span className="text-sm text-slate-500">
            Super Admin Panel
          </span>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6">
          <div className="page-fade">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
