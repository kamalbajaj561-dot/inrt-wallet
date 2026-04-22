import { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';

// ── Eager ──────────────────────────────────────────────────────
import LoginPage   from './pages/LoginPage';
import Dashboard   from './pages/dashboard';
import AddMoney    from './pages/AddMoney';
import SendMoney   from './pages/SendMoney';

// ── Lazy ───────────────────────────────────────────────────────
const TransactionHistory = lazy(() => import('./pages/TransactionHistory'));
const KYCPage            = lazy(() => import('./pages/KYCPage'));
const RewardsPage        = lazy(() => import('./pages/RewardsPage'));
const QRPage             = lazy(() => import('./pages/QRPage'));
const RechargePage       = lazy(() => import('./pages/RechargePage'));
const BillPayments       = lazy(() => import('./pages/BillPayments'));
const CibilPage          = lazy(() => import('./pages/CibilPage'));
const ShareMarket        = lazy(() => import('./pages/ShareMarket'));
const GoldPage           = lazy(() => import('./pages/GoldPage'));
const CryptoPage         = lazy(() => import('./pages/CryptoPage'));
const ProfilePage        = lazy(() => import('./pages/ProfilePage'));
const NotificationsPage  = lazy(() => import('./pages/NotificationsPage'));
const RequestMoney       = lazy(() => import('./pages/RequestMoney'));
const ScanPay            = lazy(() => import('./pages/ScanPay'));
const LinkBank           = lazy(() => import('./pages/LinkBank'));
const InsurancePage      = lazy(() => import('./pages/InsurancePage'));
const LoansPage          = lazy(() => import('./pages/LoansPage'));
const MoviesPage         = lazy(() => import('./pages/MoviesPage'));
const TravelPage         = lazy(() => import('./pages/TravelPage'));
const SplitBill          = lazy(() => import('./pages/SplitBill'));
const Insights           = lazy(() => import('./pages/Insights'));
const SettingsPage       = lazy(() => import('./pages/SettingsPage'));

// ── Loading fallback ───────────────────────────────────────────
function Loader() {
  return (
    <div style={{ minHeight:'100vh',background:'#050914',display:'flex',
                   alignItems:'center',justifyContent:'center' }}>
      <div style={{ width:44,height:44,border:'3px solid #00e5cc',
                     borderTopColor:'transparent',borderRadius:'50%',
                     animation:'spin 0.7s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

// ── Auth guard ────────────────────────────────────────────────
function Guard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Loader />;
  return user ? <>{children}</> : <Navigate to="/login" replace />;
}

// ── Public guard (redirect if logged in) ──────────────────────
function PublicGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Loader />;
  return user ? <Navigate to="/dashboard" replace /> : <>{children}</>;
}

// ── App ───────────────────────────────────────────────────────
export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Suspense fallback={<Loader />}>
          <Routes>
            {/* Public */}
            <Route path="/login" element={<PublicGuard><LoginPage /></PublicGuard>} />

            {/* Dashboard */}
            <Route path="/dashboard" element={<Guard><Dashboard /></Guard>} />

            {/* Core wallet */}
            <Route path="/add-money"  element={<Guard><AddMoney /></Guard>} />
            <Route path="/send"       element={<Guard><SendMoney /></Guard>} />
            <Route path="/request"    element={<Guard><Suspense fallback={<Loader/>}><RequestMoney /></Suspense></Guard>} />
            <Route path="/qr"         element={<Guard><Suspense fallback={<Loader/>}><QRPage /></Suspense></Guard>} />
            <Route path="/scan"       element={<Guard><Suspense fallback={<Loader/>}><ScanPay /></Suspense></Guard>} />
            <Route path="/history"    element={<Guard><Suspense fallback={<Loader/>}><TransactionHistory /></Suspense></Guard>} />

            {/* KYC + Rewards */}
            <Route path="/kyc"        element={<Guard><Suspense fallback={<Loader/>}><KYCPage /></Suspense></Guard>} />
            <Route path="/rewards"    element={<Guard><Suspense fallback={<Loader/>}><RewardsPage /></Suspense></Guard>} />

            {/* Payments */}
            <Route path="/recharge"       element={<Guard><Suspense fallback={<Loader/>}><RechargePage /></Suspense></Guard>} />
            <Route path="/bill-payments"  element={<Guard><Suspense fallback={<Loader/>}><BillPayments /></Suspense></Guard>} />

            {/* Finance */}
            <Route path="/cibil"   element={<Guard><Suspense fallback={<Loader/>}><CibilPage /></Suspense></Guard>} />
            <Route path="/stocks"  element={<Guard><Suspense fallback={<Loader/>}><ShareMarket /></Suspense></Guard>} />
            <Route path="/gold"    element={<Guard><Suspense fallback={<Loader/>}><GoldPage /></Suspense></Guard>} />
            <Route path="/crypto"  element={<Guard><Suspense fallback={<Loader/>}><CryptoPage /></Suspense></Guard>} />

            {/* Profile + Account */}
            <Route path="/profile"       element={<Guard><Suspense fallback={<Loader/>}><ProfilePage /></Suspense></Guard>} />
            <Route path="/notifications" element={<Guard><Suspense fallback={<Loader/>}><NotificationsPage /></Suspense></Guard>} />
            <Route path="/settings"      element={<Guard><Suspense fallback={<Loader/>}><SettingsPage /></Suspense></Guard>} />
            <Route path="/link-bank"     element={<Guard><Suspense fallback={<Loader/>}><LinkBank /></Suspense></Guard>} />
            <Route path="/insights"      element={<Guard><Suspense fallback={<Loader/>}><Insights /></Suspense></Guard>} />
            <Route path="/split-bill"    element={<Guard><Suspense fallback={<Loader/>}><SplitBill /></Suspense></Guard>} />

            {/* Lifestyle */}
            <Route path="/insurance"     element={<Guard><Suspense fallback={<Loader/>}><InsurancePage /></Suspense></Guard>} />
            <Route path="/loans"         element={<Guard><Suspense fallback={<Loader/>}><LoansPage /></Suspense></Guard>} />
            <Route path="/movies"        element={<Guard><Suspense fallback={<Loader/>}><MoviesPage /></Suspense></Guard>} />
            <Route path="/travel"        element={<Guard><Suspense fallback={<Loader/>}><TravelPage /></Suspense></Guard>} />

            {/* Catch-all */}
            <Route path="/"  element={<Navigate to="/dashboard" replace />} />
            <Route path="*"  element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
  );
}
