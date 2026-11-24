import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Layout } from './components/Layout';

import Login from './pages/Login';
import AuthCallback from './pages/AuthCallback';
import JobsList from './pages/JobsList';
import CreateJob from './pages/CreateJob';
import JobDetail from './pages/JobDetail';
import Stats from './pages/Stats';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            {/* Public authentication routes */}
            <Route path="/login" element={<Login />} />
            <Route path="/auth/callback" element={<AuthCallback />} />

            {/* Protected dashboard layout */}
            <Route
              element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }
            >
              <Route path="/" element={<Navigate to="/jobs" replace />} />
              <Route path="/jobs" element={<JobsList />} />
              <Route path="/jobs/new" element={<CreateJob />} />
              <Route path="/jobs/:id" element={<JobDetail />} />
              <Route path="/stats" element={<Stats />} />
            </Route>

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/jobs" replace />} />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
