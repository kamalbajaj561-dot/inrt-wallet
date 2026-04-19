/**
 * INRT WALLET — App.tsx (FINAL)
 * All routes wired up — production ready
 */
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { ToastProvider } from '@/context/ToastContext';
import { Layout } from '@/components/Layout';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import ToastContainer from '@/components/ToastContainer';
import { Suspense, lazy } from 'react';

// ── Eager load critical pages ────────────────────────────────────
import Login              from '@/pages/Login';
import Dashboard          from '@/pages/dashboard';
import AddMoney           from '@/pages/AddMoney';
import SendMoney          from '@/pages/SendMoney';

// ── Lazy load everything else (improves initial load speed) ─────
const TransactionHistory  = lazy(()=>import('@/pages/TransactionHistory'));
const KYCPage             = lazy(()=>import('@/pages/KYCPage'));
const RewardsPage         = lazy(()=>import('@/pages/RewardsPage'));
const QRPage              = lazy(()=>import('@/pages/QRPage'));
const RechargePage        = lazy(()=>import('@/pages/RechargePage'));
const BillPaymentsPage    = lazy(()=>import('@/pages/BillPaymentsPage'));
const CibilPage           = lazy(()=>import('@/pages/CibilPage'));
const ShareMarketPage     = lazy(()=>import('@/pages/ShareMarketPage'));
const GoldPage            = lazy(()=>import('@/pages/GoldPage'));
const ProfilePage         = lazy(()=>import('@/pages/ProfilePage'));
const NotificationsPage   = lazy(()=>import('@/pages/NotificationsPage'));
const RequestMoney        = lazy(()=>import('@/pages/RequestMoney'));
const ReceiveMoney        = lazy(()=>import('@/pages/ReceiveMoney'));
const LinkBank            = lazy(()=>import('@/pages/LinkBank'));
const Insights            = lazy(()=>import('@/pages/Insights'));
const Subscriptions       = lazy(()=>import('@/pages/Subscriptions'));
const SetPin              = lazy(()=>import('@/pages/SetPin'));
const SplitBill           = lazy(()=>import('@/pages/SplitBill'));
const Scan                = lazy(()=>import('@/pages/scan'));

// ── Loading fallback ─────────────────────────────────────────────
function PageLoader() {
  return (
    <div style={{ minHeight:'100vh',background:'#0a0a0f',display:'flex',alignItems:'center',justifyContent:'center' }}>
      <div style={{ width:40,height:40,border:'3px solid #f0b429',borderTopColor:'transparent',
                    borderRadius:'50%',animation:'spin 0.7s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

// ── Coming Soon placeholder ───────────────────────────────────────
function ComingSoon({ title, icon, back='/dashboard' }: { title:string; icon:string; back?:string }) {
  return (
    <div style={{ minHeight:'100vh',background:'#0a0a0f',fontFamily:"'DM Sans',sans-serif" }}>
      <div style={{ background:'linear-gradient(160deg,#0f0f1a,#111118)',padding:'52px 16px 20px',
                     display:'flex',alignItems:'center',gap:14 }}>
        <a href={back} style={{ background:'rgba(255,255,255,0.06)',border:'1px solid rgba(255,255,255,0.07)',
                                  borderRadius:12,width:40,height:40,fontSize:18,cursor:'pointer',color:'#f0f0f8',
                                  display:'flex',alignItems:'center',justifyContent:'center',textDecoration:'none' }}>←</a>
        <h1 style={{ fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:20,color:'#f0f0f8' }}>{title}</h1>
      </div>
      <div style={{ display:'flex',flexDirection:'column',alignItems:'center',padding:'80px 24px',textAlign:'center' }}>
        <span style={{ fontSize:72,marginBottom:16 }}>{icon}</span>
        <h2 style={{ fontFamily:"'Syne',sans-serif",fontWeight:800,color:'#f0f0f8',fontSize:22,marginBottom:8 }}>{title}</h2>
        <p style={{ color:'#8888a8',fontSize:15,marginBottom:8 }}>Coming very soon!</p>
        <p style={{ color:'#555570',fontSize:13 }}>We're building this feature for you.</p>
      </div>
    </div>
  );
}

// ── Auth guard ───────────────────────────────────────────────────
function Guard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <PageLoader />;
  return user ? <>{children}</> : <Navigate to="/login" replace />;
}

// ── App ──────────────────────────────────────────────────────────
export default function App() {
  return (
    <Router>
      <AuthProvider>
        <ToastProvider>
          <Toaster
            position="top-center"
            toastOptions={{
              duration: 3000,
              style: { background:'#1e1e2a', color:'#f0f0f8', border:'1px solid rgba(255,255,255,0.1)' },
              success: { style: { background:'rgba(16,185,129,0.15)', color:'#10b981' } },
              error:   { style: { background:'rgba(239,68,68,0.15)',  color:'#ef4444' } },
            }}
          />
          <ToastContainer />

          <Suspense fallback={<PageLoader />}>
            <Routes>
              {/* Public */}
              <Route path="/login" element={<Login />} />

              {/* Core wallet — no Layout wrapper (pages have own nav) */}
              <Route path="/dashboard"    element={<Guard><Dashboard /></Guard>} />
              <Route path="/add-money"    element={<Guard><AddMoney /></Guard>} />
              <Route path="/send"         element={<Guard><Suspense fallback={<PageLoader/>}><SendMoney /></Suspense></Guard>} />
              <Route path="/qr"           element={<Guard><Suspense fallback={<PageLoader/>}><QRPage /></Suspense></Guard>} />
              <Route path="/history"      element={<Guard><Suspense fallback={<PageLoader/>}><TransactionHistory /></Suspense></Guard>} />
              <Route path="/kyc"          element={<Guard><Suspense fallback={<PageLoader/>}><KYCPage /></Suspense></Guard>} />
              <Route path="/rewards"      element={<Guard><Suspense fallback={<PageLoader/>}><RewardsPage /></Suspense></Guard>} />
              <Route path="/profile"      element={<Guard><Suspense fallback={<PageLoader/>}><ProfilePage /></Suspense></Guard>} />
              <Route path="/notifications"element={<Guard><Suspense fallback={<PageLoader/>}><NotificationsPage /></Suspense></Guard>} />

              {/* Financial Services */}
              <Route path="/recharge"     element={<Guard><Suspense fallback={<PageLoader/>}><RechargePage /></Suspense></Guard>} />
              <Route path="/bill-payments"element={<Guard><Suspense fallback={<PageLoader/>}><BillPaymentsPage /></Suspense></Guard>} />
              <Route path="/cibil"        element={<Guard><Suspense fallback={<PageLoader/>}><CibilPage /></Suspense></Guard>} />
              <Route path="/stocks"       element={<Guard><Suspense fallback={<PageLoader/>}><ShareMarketPage /></Suspense></Guard>} />
              <Route path="/gold"         element={<Guard><Suspense fallback={<PageLoader/>}><GoldPage /></Suspense></Guard>} />

              {/* Wrapped in Layout */}
              <Route element={<ProtectedRoute />}>
                <Route path="/receive"    element={<Layout><Suspense fallback={<PageLoader/>}><ReceiveMoney /></Suspense></Layout>} />
                <Route path="/request"    element={<Layout><Suspense fallback={<PageLoader/>}><RequestMoney /></Suspense></Layout>} />
                <Route path="/link-bank"  element={<Layout><Suspense fallback={<PageLoader/>}><LinkBank /></Suspense></Layout>} />
                <Route path="/insights"   element={<Layout><Suspense fallback={<PageLoader/>}><Insights /></Suspense></Layout>} />
                <Route path="/subscriptions" element={<Layout><Suspense fallback={<PageLoader/>}><Subscriptions /></Suspense></Layout>} />
                <Route path="/set-pin"    element={<Layout><Suspense fallback={<PageLoader/>}><SetPin /></Suspense></Layout>} />
                <Route path="/split-bill" element={<Layout><Suspense fallback={<PageLoader/>}><SplitBill /></Suspense></Layout>} />
                <Route path="/split/:id"  element={<Layout><Suspense fallback={<PageLoader/>}><SplitBill /></Suspense></Layout>} />
                <Route path="/scan"       element={<Layout><Suspense fallback={<PageLoader/>}><Scan /></Suspense></Layout>} />
              </Route>

              {/* Coming soon pages */}
              <Route path="/invest"       element={<Guard><ComingSoon title="Mutual Funds" icon="📈" /></Guard>} />
              <Route path="/insurance"    element={<Guard><ComingSoon title="Insurance" icon="🛡️" /></Guard>} />
              <Route path="/loans"        element={<Guard><ComingSoon title="Instant Loans" icon="💰" /></Guard>} />
              <Route path="/fastag"       element={<Guard><ComingSoon title="FASTag Recharge" icon="🚗" /></Guard>} />
              <Route path="/travel"       element={<Guard><ComingSoon title="Travel Bookings" icon="✈️" /></Guard>} />
              <Route path="/movies"       element={<Guard><ComingSoon title="Movie Tickets" icon="🎬" /></Guard>} />
              <Route path="/offers"       element={<Guard><ComingSoon title="Offers & Deals" icon="🏷️" /></Guard>} />
              <Route path="/merchant"     element={<Guard><ComingSoon title="Merchant Dashboard" icon="🏪" /></Guard>} />
              <Route path="/savings"      element={<Guard><ComingSoon title="Savings Goals" icon="🎯" /></Guard>} />

              {/* Catch all */}
              <Route path="/"  element={<Navigate to="/dashboard" replace />} />
              <Route path="*"  element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </Suspense>
        </ToastProvider>
      </AuthProvider>
    </Router>
  );
}
