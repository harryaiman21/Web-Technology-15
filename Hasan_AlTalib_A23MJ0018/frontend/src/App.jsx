import { Suspense, lazy } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';

import ErrorBoundary from './components/ErrorBoundary';
import { AuthProvider, useAuth } from './hooks/useAuth';
import Board from './pages/Board';
import Login from './pages/Login';

const AdminCommandCenter = lazy(() => import('./pages/AdminCommandCenter'));
const PCCInbox = lazy(() => import('./pages/PCCInbox'));
const Proactive = lazy(() => import('./pages/Proactive'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const OpsCenter = lazy(() => import('./pages/OpsCenter'));
const CustomerChat = lazy(() => import('./pages/CustomerChat'));
const Detail = lazy(() => import('./pages/Detail'));
const OpsChat = lazy(() => import('./pages/OpsChat'));
const ReviewQueue = lazy(() => import('./pages/ReviewQueue'));
const ResolutionArchive = lazy(() => import('./pages/ResolutionArchive'));
const AuditTrace = lazy(() => import('./pages/AuditTrace'));
const HubDashboard = lazy(() => import('./pages/HubDashboard'));
const HubAlerts = lazy(() => import('./pages/HubAlerts'));
const RpaCenter = lazy(() => import('./pages/RpaCenter'));
const KnowledgeObservatory = lazy(() => import('./pages/KnowledgeObservatory'));
const IntakeHub = lazy(() => import('./pages/IntakeHub'));
const NexusBrain = lazy(() => import('./pages/NexusBrain'));

const queryClient = new QueryClient();

function FullPageLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--surface)]">
      <Loader2 className="animate-spin text-[var(--text-2)]" size={28} />
    </div>
  );
}

function ProtectedRoute({ children }) {
  const auth = useAuth();
  if (!auth) return <FullPageLoader />;
  const { user, isLoading } = auth;

  if (isLoading) return <FullPageLoader />;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function RoleRoute({ roles, children }) {
  const auth = useAuth();
  if (!auth) return <FullPageLoader />;
  const { user, isLoading } = auth;

  if (isLoading) return <FullPageLoader />;
  if (!user) return <Navigate to="/login" replace />;
  if (!roles.includes(user.role)) return <Navigate to="/board" replace />;
  return children;
}

function AppRoutes() {
  return (
    <Suspense fallback={<FullPageLoader />}>
      <Routes>
        <Route path="/" element={<Navigate to="/intake" replace />} />
        <Route path="/upload" element={<Navigate to="/intake" replace />} />
        <Route path="/login" element={<ErrorBoundary><Login /></ErrorBoundary>} />
        <Route path="/chat/:token" element={<ErrorBoundary><CustomerChat /></ErrorBoundary>} />
        <Route
          path="/board"
          element={<ErrorBoundary><ProtectedRoute><Board /></ProtectedRoute></ErrorBoundary>}
        />
        <Route
          path="/inbox"
          element={<ErrorBoundary><ProtectedRoute><PCCInbox /></ProtectedRoute></ErrorBoundary>}
        />
        <Route
          path="/incidents/:id"
          element={<ErrorBoundary><ProtectedRoute><Detail /></ProtectedRoute></ErrorBoundary>}
        />
        <Route
          path="/review"
          element={<ErrorBoundary><RoleRoute roles={['admin', 'reviewer']}><ReviewQueue /></RoleRoute></ErrorBoundary>}
        />
        <Route
          path="/admin"
          element={<ErrorBoundary><RoleRoute roles={['admin']}><AdminDashboard /></RoleRoute></ErrorBoundary>}
        />
        <Route
          path="/admin/ops"
          element={<ErrorBoundary><RoleRoute roles={['admin']}><AdminCommandCenter /></RoleRoute></ErrorBoundary>}
        />
        <Route
          path="/proactive"
          element={<ErrorBoundary><RoleRoute roles={['admin', 'reviewer']}><Proactive /></RoleRoute></ErrorBoundary>}
        />
        <Route
          path="/ops-chat"
          element={<ErrorBoundary><RoleRoute roles={['admin', 'reviewer']}><OpsChat /></RoleRoute></ErrorBoundary>}
        />
        <Route
          path="/live"
          element={<ErrorBoundary><RoleRoute roles={['admin', 'reviewer']}><OpsCenter /></RoleRoute></ErrorBoundary>}
        />
        <Route
          path="/resolution-archive"
          element={<ErrorBoundary><RoleRoute roles={['admin', 'reviewer']}><ResolutionArchive /></RoleRoute></ErrorBoundary>}
        />
        <Route
          path="/audit"
          element={<ErrorBoundary><RoleRoute roles={['admin', 'reviewer']}><AuditTrace /></RoleRoute></ErrorBoundary>}
        />
        <Route
          path="/hub"
          element={<ErrorBoundary><RoleRoute roles={['admin', 'reviewer']}><HubDashboard /></RoleRoute></ErrorBoundary>}
        />
        <Route
          path="/hub/alerts"
          element={<ErrorBoundary><RoleRoute roles={['admin', 'reviewer']}><HubAlerts /></RoleRoute></ErrorBoundary>}
        />
        <Route
          path="/rpa"
          element={<ErrorBoundary><RoleRoute roles={['admin', 'reviewer']}><RpaCenter /></RoleRoute></ErrorBoundary>}
        />
        <Route
          path="/knowledge"
          element={<ErrorBoundary><RoleRoute roles={['admin', 'reviewer']}><KnowledgeObservatory /></RoleRoute></ErrorBoundary>}
        />
        <Route
          path="/brain"
          element={<ErrorBoundary><RoleRoute roles={['admin', 'reviewer']}><NexusBrain /></RoleRoute></ErrorBoundary>}
        />
        <Route
          path="/intake"
          element={<ErrorBoundary><ProtectedRoute><IntakeHub /></ProtectedRoute></ErrorBoundary>}
        />
      </Routes>
    </Suspense>
  );
}

function AppShell() {
  return (
    <>
      <AppRoutes />
    </>
  );
}

import { ThemeProvider } from 'next-themes';
import { ViewProvider } from './context/ViewContext';
import { ToastProvider } from './components/ToastProvider';

export default function App() {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <BrowserRouter>
            <ViewProvider>
              <ToastProvider>
                <AppShell />
              </ToastProvider>
            </ViewProvider>
          </BrowserRouter>
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
