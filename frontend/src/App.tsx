import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AuthProvider } from "./lib/auth";
import { AppMotionConfig } from "./lib/motion";
import { ThemeProvider } from "./lib/theme";
import { AuthLayout, ForgotPasswordPage, LoginPage, OtpPage, RequestAccessPage } from "./pages/AuthPages";
import { AuditPage } from "./pages/AuditPage";
import { DashboardPage } from "./pages/DashboardPage";
import { ExtractionPage } from "./pages/ExtractionPage";
import { QualityPage } from "./pages/QualityPage";
import { ReportsPage } from "./pages/ReportsPage";
import { UsersPage } from "./pages/UsersPage";
import { DailyTransactionsPage } from "./pages/DailyTransactionsPage";
import { ApiKeysPage } from "./pages/integration/ApiKeysPage";
import { IntegrationApiDocsPage } from "./pages/integration/IntegrationApiDocsPage";

export default function App() {
  return (
    <AppMotionConfig>
    <ThemeProvider>
      <AuthProvider>
          <BrowserRouter>
            <Routes>
              {/* One persistent shell for every auth step; only the form view swaps. */}
              <Route element={<AuthLayout />}>
                <Route path="/login" element={<LoginPage />} />
                <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                <Route path="/request-access" element={<RequestAccessPage />} />
                <Route path="/verify-otp" element={<OtpPage />} />
              </Route>
              <Route element={<ProtectedRoute />}>
                <Route element={<Layout />}>
                  <Route index element={<DashboardPage />} />
                  <Route path="extraction" element={<ExtractionPage />} />
                  <Route path="quality" element={<QualityPage />} />
                  <Route path="reports" element={<ReportsPage />} />
                  <Route path="audit" element={<AuditPage />} />
                  <Route path="users" element={<UsersPage />} />
                  <Route path="daily" element={<DailyTransactionsPage />} />
                  <Route path="integration" element={<Navigate to="/integration/docs" replace />} />
                  <Route path="integration/docs" element={<IntegrationApiDocsPage />} />
                  <Route path="integration/keys" element={<ApiKeysPage />} />
                </Route>
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
    </AppMotionConfig>
  );
}
