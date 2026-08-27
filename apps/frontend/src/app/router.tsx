import { Navigate, Route, Routes } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../stores/authStore';
import { settingsApi } from '../api';
import { AppLayout } from './layout/AppLayout';
import { LoginPage } from '../pages/LoginPage';
import { RegisterPage } from '../pages/RegisterPage';
import { ForgotPasswordPage } from '../pages/ForgotPasswordPage';
import { ResetPasswordPage } from '../pages/ResetPasswordPage';
import { GetStartedPage } from '../pages/GetStartedPage';
import { HomePage } from '../pages/HomePage';
import { ScannerPage } from '../pages/ScannerPage';
import { ChartsPage } from '../pages/ChartsPage';
import { SignalsPage } from '../pages/SignalsPage';
import { TradesPage } from '../pages/TradesPage';
import { PortfolioPage } from '../pages/PortfolioPage';
import { JournalPage } from '../pages/JournalPage';
import { AnalyticsPage } from '../pages/AnalyticsPage';
import { SettingsPage } from '../pages/SettingsPage';
import { BacktestPage } from '../pages/BacktestPage';
import { SubscriptionPage } from '../pages/SubscriptionPage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { ManagerLayout } from '../pages/manager/ManagerLayout';
import { ManagerOverviewPage } from '../pages/manager/ManagerOverviewPage';
import { ManagerUsersPage } from '../pages/manager/ManagerUsersPage';
import { ManagerSubscriptionsPage } from '../pages/manager/ManagerSubscriptionsPage';
import { ManagerPaymentsPage } from '../pages/manager/ManagerPaymentsPage';

function PrivateRoute({ children }: { children: ReactNode }) {
  const token = useAuthStore((s) => s.token);
  if (!token) return <Navigate to="/login" replace />;
  return children;
}

function AdminRoute({ children }: { children: ReactNode }) {
  const user = useAuthStore((s) => s.user);
  if (user?.role !== 'admin') return <Navigate to="/" replace />;
  return children;
}

/** Blocks the app shell until a new user finishes Demo vs Live onboarding. */
function OnboardingGate({ children }: { children: ReactNode }) {
  const { data: settings, isLoading, isError } = useQuery({
    queryKey: ['settings'],
    queryFn: settingsApi.get,
  });

  if (isLoading) return null;
  // Fail open so a settings blip does not trap the user on a blank screen.
  if (isError) return children;
  if (settings?.onboarding?.tradingPathChosen === false) {
    return <Navigate to="/get-started" replace />;
  }
  return children;
}

export function AppRouter() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route
        path="/get-started"
        element={
          <PrivateRoute>
            <GetStartedPage />
          </PrivateRoute>
        }
      />
      <Route
        path="/"
        element={
          <PrivateRoute>
            <OnboardingGate>
              <AppLayout />
            </OnboardingGate>
          </PrivateRoute>
        }
      >
        <Route index element={<HomePage />} />
        <Route path="scanner" element={<ScannerPage />} />
        <Route path="charts" element={<ChartsPage />} />
        <Route path="signals" element={<SignalsPage />} />
        <Route path="trades" element={<TradesPage />} />
        <Route path="portfolio" element={<PortfolioPage />} />
        <Route path="journal" element={<JournalPage />} />
        <Route path="analytics" element={<AnalyticsPage />} />
        <Route path="backtest" element={<BacktestPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="subscription" element={<SubscriptionPage />} />
        <Route
          path="manager"
          element={
            <AdminRoute>
              <ManagerLayout />
            </AdminRoute>
          }
        >
          <Route index element={<ManagerOverviewPage />} />
          <Route path="users" element={<ManagerUsersPage />} />
          <Route path="subscriptions" element={<ManagerSubscriptionsPage />} />
          <Route path="payments" element={<ManagerPaymentsPage />} />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
