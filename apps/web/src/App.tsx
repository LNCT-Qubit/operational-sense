import React from 'react';
import { Outlet, Route, Routes, useLocation, Navigate } from 'react-router'
import { getCurrentUser } from './api/session';
import type { BackendRole } from './api/auth';
import LandingPage from './pages/LandingPage';
import Header from './component/supervisorComponent/Header'
import MobileNav from './component/supervisorComponent/MobileNav'
import NetworkStatus from './component/supervisorComponent/NetworkStatus'
import { CasesProvider, useCases } from './content/CasesContext'
import ApproveReject from './pages/SupervisorPage/ApproveReject'
import Dashboard from './pages/SupervisorPage/Dashboard'
import Profile from './pages/SupervisorPage/Profile'
import ReviewQueue from './pages/SupervisorPage/ReviewQueue'
import TechnicianPage from './pages/TechnicianPage'

function pageTitle(path: string) {
  if (path.includes('/queue')) return 'Review Queue'
  if (path.includes('/decide')) return 'Approve / Reject'
  if (path.includes('/profile')) return 'Profile'
  return 'Dashboard'
}

function RequireRole({ allowed }: { allowed: BackendRole[] }) {
  const user = getCurrentUser();
  if (!user) return <Navigate to="/" replace />;
  if (!allowed.includes(user.role)) {
    return <Navigate to={user.role === 'SUPERVISOR' ? '/supervisor' : '/technician'} replace />;
  }
  return <Outlet />;
}

function Layout() {
  const { message } = useCases()
  const { pathname } = useLocation()
  return (
    <div className="workshop-page">
      <Header />
      <main className="workspace">
        <div className="mobile-page-label">
          <span>{pageTitle(pathname)}</span>
          <NetworkStatus />
        </div>
        <Outlet />
      </main>
      <MobileNav />
      {message && <div className="toast" role="status">{message}</div>}
    </div>
  )
}

export const App: React.FC = () => {
  return (
    <CasesProvider>
      <Routes>
        {/* Landing / Authentication Page */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/signup" element={<LandingPage initialMode="signup" />} />
        <Route path="/register" element={<LandingPage initialMode="signup" />} />

        {/* Supervisor routes are protected by the authenticated database role. */}
        <Route element={<RequireRole allowed={['SUPERVISOR']} />}>
          <Route path="/supervisor" element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="queue" element={<ReviewQueue />} />
            <Route path="decide/:id?" element={<ApproveReject />} />
            <Route path="profile" element={<Profile />} />
          </Route>
          {/* Backward-compatible root-level supervisor routes */}
          <Route element={<Layout />}>
            <Route path="/queue" element={<ReviewQueue />} />
            <Route path="/decide/:id?" element={<ApproveReject />} />
            <Route path="/profile" element={<Profile />} />
          </Route>
        </Route>

        {/* Technician Portal */}
        <Route element={<RequireRole allowed={['TECHNICIAN']} />}>
          <Route path="/technician" element={<TechnicianPage />} />
        </Route>

        {/* Fallback to Landing Page */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </CasesProvider>
  );
};

export default App;
