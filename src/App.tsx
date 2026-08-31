import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'sonner'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import RequirePermission from '@/components/auth/RequirePermission'
import MainLayout from '@/layouts/MainLayout'
import LoginPage from '@/pages/auth/LoginPage'
import DashboardPage from '@/pages/dashboard/DashboardPage'
import TenantsPage from '@/pages/tenants/TenantsPage'
import EmpresasFacturadorPage from '@/pages/empresas-facturador/EmpresasFacturadorPage'
import PlansPage from '@/pages/plans/PlansPage'
import SubscriptionsPage from '@/pages/subscriptions/SubscriptionsPage'
import PaymentsPage from '@/pages/payments/PaymentsPage'
import UsersPage from '@/pages/users/UsersPage'
import RolesPage from '@/pages/roles/RolesPage'
import ProfilePage from '@/pages/profile/ProfilePage'
import SettingsPage from '@/pages/SettingsPage'
import SaasBillingSettingsPage from '@/pages/saas/SaasBillingSettingsPage'
import DocumentPackagesPage from '@/pages/document-packages/DocumentPackagesPage'
import FleetMigrationsPage from '@/pages/migrations/FleetMigrationsPage'
import FiscalDocumentsPage from '@/pages/fiscal/FiscalDocumentsPage'
import OperacionesFiscalesPage from '@/pages/fiscal/OperacionesFiscalesPage'
import Spinner from '@/components/ui/Spinner'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth()
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner size={40} />
      </div>
    )
  }
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />
}

function AppRoutes() {
  const { isAuthenticated } = useAuth()
  return (
    <Routes>
      <Route
        path="/login"
        element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <LoginPage />}
      />
      <Route
        element={
          <RequireAuth>
            <MainLayout />
          </RequireAuth>
        }
      >
        {/* Cada ruta declara su permiso — 401 (sesión inválida) ya se resolvió en RequireAuth
            arriba; lo que RequirePermission cubre es 403 (sesión válida, sin el permiso), y
            nunca redirige: muestra una pantalla de acceso denegado en el propio lugar (Fase 9 §3). */}
        <Route path="/dashboard" element={<RequirePermission permission="dashboard.view"><DashboardPage /></RequirePermission>} />
        <Route path="/tenants" element={<RequirePermission permission="empresas.view"><TenantsPage /></RequirePermission>} />
        <Route path="/empresas-facturador" element={<RequirePermission permission="facturador.view"><EmpresasFacturadorPage /></RequirePermission>} />
        <Route path="/empresas-sunat" element={<Navigate to="/empresas-facturador" replace />} />
        <Route path="/empresas-pse" element={<Navigate to="/empresas-facturador" replace />} />
        <Route path="/plans" element={<RequirePermission permission="planes.view"><PlansPage /></RequirePermission>} />
        <Route path="/subscriptions" element={<RequirePermission permission="suscripciones.view"><SubscriptionsPage /></RequirePermission>} />
        <Route path="/payments" element={<RequirePermission permission="pagos.view"><PaymentsPage /></RequirePermission>} />
        <Route path="/users" element={<RequirePermission permission="usuarios_central.view"><UsersPage /></RequirePermission>} />
        <Route path="/roles" element={<RequirePermission permission="roles.view"><RolesPage /></RequirePermission>} />
        {/* /profile: autoservicio — cualquier usuario autenticado ve y edita su propio perfil, sin
            ningún permiso granular de por medio (igual que el resto de "self-service" del backend). */}
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/settings" element={<RequirePermission permission="ajustes.view"><SettingsPage /></RequirePermission>} />
        <Route path="/saas-billing" element={<RequirePermission permission="ajustes.view"><SaasBillingSettingsPage /></RequirePermission>} />
        <Route path="/document-packages" element={<RequirePermission permission="documentos.view"><DocumentPackagesPage /></RequirePermission>} />
        <Route path="/fleet-migrations" element={<RequirePermission permission="migraciones.view"><FleetMigrationsPage /></RequirePermission>} />
        <Route path="/fiscal" element={<RequirePermission permission="fiscal.view"><FiscalDocumentsPage /></RequirePermission>} />
        <Route path="/fiscal-operations" element={<RequirePermission permission="fiscal.view"><OperacionesFiscalesPage /></RequirePermission>} />
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
        <Toaster position="top-right" richColors closeButton />
      </AuthProvider>
    </BrowserRouter>
  )
}
