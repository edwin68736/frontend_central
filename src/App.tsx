import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'sonner'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import MainLayout from '@/layouts/MainLayout'
import LoginPage from '@/pages/auth/LoginPage'
import DashboardPage from '@/pages/dashboard/DashboardPage'
import TenantsPage from '@/pages/tenants/TenantsPage'
import EmpresasSunatPage from '@/pages/empresas-sunat/EmpresasSunatPage'
import EmpresasPsePage from '@/pages/empresas-pse/EmpresasPsePage'
import PlansPage from '@/pages/plans/PlansPage'
import SubscriptionsPage from '@/pages/subscriptions/SubscriptionsPage'
import PaymentsPage from '@/pages/payments/PaymentsPage'
import UsersPage from '@/pages/users/UsersPage'
import ProfilePage from '@/pages/profile/ProfilePage'
import SettingsPage from '@/pages/SettingsPage'
import SaasBillingSettingsPage from '@/pages/saas/SaasBillingSettingsPage'
import DocumentPackagesPage from '@/pages/document-packages/DocumentPackagesPage'
import FleetMigrationsPage from '@/pages/migrations/FleetMigrationsPage'
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
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/tenants" element={<TenantsPage />} />
        <Route path="/empresas-sunat" element={<EmpresasSunatPage />} />
        <Route path="/empresas-pse" element={<EmpresasPsePage />} />
        <Route path="/plans" element={<PlansPage />} />
        <Route path="/subscriptions" element={<SubscriptionsPage />} />
        <Route path="/payments" element={<PaymentsPage />} />
        <Route path="/users" element={<UsersPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/saas-billing" element={<SaasBillingSettingsPage />} />
        <Route path="/document-packages" element={<DocumentPackagesPage />} />
        <Route path="/fleet-migrations" element={<FleetMigrationsPage />} />
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
