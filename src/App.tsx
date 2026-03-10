/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from '@/context/AuthContext';
import { Layout } from '@/components/Layout';
import { ProtectedRoute, AdminRoute } from '@/components/ProtectedRoute';

// Pages
import Login from '@/pages/Login';
import Dashboard from '@/pages/dashboard';
import SendMoney from '@/pages/SendMoney';
import ReceiveMoney from '@/pages/ReceiveMoney';
import TransactionHistory from '@/pages/TransactionHistory';
import AdminPanel from '@/pages/AdminPanel';
import SetupGuide from '@/pages/SetupGuide';
import MerchantDashboard from '@/pages/MerchantDashboard';
import RequestMoney from '@/pages/RequestMoney';
import LinkBank from '@/pages/LinkBank';
import AddMoney from '@/pages/AddMoney';
import Profile from '@/pages/Profile';
import Notifications from '@/pages/Notifications';
import Subscriptions from '@/pages/Subscriptions';
import SetPin from '@/pages/SetPin';
import SplitBill from '@/pages/SplitBill';
import SplitDetails from '@/pages/SplitDetails';
import Insights from '@/pages/Insights';
import Scan from './pages/scan'


export default function App() {
  return (
    <Router>
      <AuthProvider>
        <Toaster position="top-center" />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/setup" element={<SetupGuide />} />
          <Route path="/scan" element={<Scan />} />
          
          <Route element={<ProtectedRoute />}>
            <Route element={<Layout><Dashboard /></Layout>} path="/dashboard" />
            <Route element={<Layout><SendMoney /></Layout>} path="/send" />
            <Route element={<Layout><ReceiveMoney /></Layout>} path="/receive" />
            <Route element={<Layout><TransactionHistory /></Layout>} path="/history" />
            <Route element={<Layout><MerchantDashboard /></Layout>} path="/merchant" />
            <Route element={<Layout><RequestMoney /></Layout>} path="/request" />
            <Route element={<Layout><LinkBank /></Layout>} path="/link-bank" />
            <Route element={<Layout><AddMoney /></Layout>} path="/add-money" />
            <Route element={<Layout><Profile /></Layout>} path="/profile" />
            <Route element={<Layout><Notifications /></Layout>} path="/notifications" />
            <Route element={<Layout><Subscriptions /></Layout>} path="/subscriptions" />
            <Route element={<Layout><SetPin /></Layout>} path="/set-pin" />
            <Route element={<Layout><SplitBill /></Layout>} path="/split-bill" />
            <Route element={<Layout><SplitDetails /></Layout>} path="/split/:id" />
            <Route element={<Layout><Insights /></Layout>} path="/insights" />
            <Route element={<Layout><Dashboard /></Layout>} path="/" />
          </Route>

          <Route element={<AdminRoute />}>
            <Route element={<Layout><AdminPanel /></Layout>} path="/admin" />
          </Route>

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AuthProvider>
    </Router>
  );
}
