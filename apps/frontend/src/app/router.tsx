import { Navigate, Route, Routes } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuthStore } from '../stores/authStore';
import { AppLayout } from './layout/AppLayout';
import { LoginPage } from '../pages/LoginPage';
import { RegisterPage } from '../pages/RegisterPage';
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
import { NotFoundPage } from '../pages/NotFoundPage';

function PrivateRoute({ children }: { children: ReactNode }) {
  const token = useAuthStore((s) => s.token);
  if (!token) return <Navigate to="/login" replace />;
  return children;
}

export function AppRouter() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route
        path="/"
        element={
          <PrivateRoute>
            <AppLayout />
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
        <Route path="*" element={<NotFoundPage />} />
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
