/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { Toaster } from 'sonner';

// Pages (to be created)
import Login from './pages/Login';
import Dashboard from './pages/admin/Dashboard';
import Inventory from './pages/admin/Inventory';
import Finance from './pages/admin/Finance';
import Waiters from './pages/admin/Waiters';
import Settings from './pages/admin/Settings';
import WaiterApp from './pages/waiter/WaiterApp';
import WaiterLogin from './pages/waiter/WaiterLogin';
import KitchenDisplay from './pages/kitchen/KitchenDisplay';
import BarDisplay from './pages/bar/BarDisplay';
import Cashier from './pages/cashier/Cashier';
import QRMenu from './pages/public/QRMenu';
import Layout from './components/Layout';

function ProtectedRoute({ children, allowedRoles }: { children: React.ReactNode, allowedRoles?: string[] }) {
  const { user, userData, loading } = useAuth();

  if (loading) return <div className="flex items-center justify-center h-screen">Loading...</div>;
  
  if (!user || !userData) return <Navigate to="/login" replace />;

  if (allowedRoles && !allowedRoles.includes(userData.role) && userData.role !== 'admin') {
    return <Navigate to="/unauthorized" replace />;
  }

  return <>{children}</>;
}

function AppRoutes() {
  const { userData } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/waiter/login" element={<WaiterLogin />} />
      <Route path="/menu" element={<QRMenu />} />
      <Route path="/waiter/*" element={<WaiterApp />} />
      
      <Route path="/" element={
        <ProtectedRoute>
          <Layout />
        </ProtectedRoute>
      }>
        <Route index element={
          userData?.role === 'waiter' ? <Navigate to="/waiter" replace /> :
          userData?.role === 'kitchen' ? <Navigate to="/kitchen" replace /> :
          userData?.role === 'bar' ? <Navigate to="/bar" replace /> :
          userData?.role === 'cashier' ? <Navigate to="/cashier" replace /> :
          <Navigate to="/dashboard" replace />
        } />
        
        <Route path="dashboard" element={<ProtectedRoute allowedRoles={['manager']}><Dashboard /></ProtectedRoute>} />
        <Route path="inventory" element={<ProtectedRoute allowedRoles={['manager']}><Inventory /></ProtectedRoute>} />
        <Route path="waiters" element={<ProtectedRoute allowedRoles={['manager']}><Waiters /></ProtectedRoute>} />
        <Route path="finance" element={<ProtectedRoute allowedRoles={['manager', 'cashier']}><Finance /></ProtectedRoute>} />
        <Route path="settings" element={<ProtectedRoute allowedRoles={['manager']}><Settings /></ProtectedRoute>} />
        
        <Route path="kitchen" element={<ProtectedRoute allowedRoles={['kitchen', 'manager']}><KitchenDisplay /></ProtectedRoute>} />
        <Route path="bar" element={<ProtectedRoute allowedRoles={['bar', 'manager']}><BarDisplay /></ProtectedRoute>} />
        <Route path="cashier" element={<ProtectedRoute allowedRoles={['cashier', 'manager']}><Cashier /></ProtectedRoute>} />
      </Route>
      
      <Route path="/unauthorized" element={<div className="p-8 text-center">Unauthorized Access</div>} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
        <Toaster position="top-right" />
      </BrowserRouter>
    </AuthProvider>
  );
}
