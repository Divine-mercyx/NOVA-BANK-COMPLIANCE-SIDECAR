import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AuthProvider } from "./lib/auth";
import { SidebarProvider } from "./lib/sidebar";
import { ThemeProvider } from "./lib/theme";
import { LoginPage, OtpPage } from "./pages/AuthPages";
import { AuditPage } from "./pages/AuditPage";
import { DashboardPage } from "./pages/DashboardPage";
import { ExtractionPage } from "./pages/ExtractionPage";
import { QualityPage } from "./pages/QualityPage";
import { ReportsPage } from "./pages/ReportsPage";
import { UsersPage } from "./pages/UsersPage";
import { ScreeningAlertsPage } from "./pages/screening/ScreeningAlertsPage";
import { ScreeningAuditPage } from "./pages/screening/ScreeningAuditPage";
import { ScreeningPerformancePage } from "./pages/screening/ScreeningPerformancePage";
import { ApiKeysPage } from "./pages/integration/ApiKeysPage";
import { IntegrationApiDocsPage } from "./pages/integration/IntegrationApiDocsPage";

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <SidebarProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/verify-otp" element={<OtpPage />} />
              <Route element={<ProtectedRoute />}>
                <Route element={<Layout />}>
                  <Route index element={<DashboardPage />} />
                  <Route path="extraction" element={<ExtractionPage />} />
                  <Route path="quality" element={<QualityPage />} />
                  <Route path="reports" element={<ReportsPage />} />
                  <Route path="audit" element={<AuditPage />} />
                  <Route path="users" element={<UsersPage />} />
                  <Route path="screening" element={<ScreeningAlertsPage />} />
                  <Route path="screening/performance" element={<ScreeningPerformancePage />} />
                  <Route path="screening/audit" element={<ScreeningAuditPage />} />
                  <Route path="integration/docs" element={<IntegrationApiDocsPage />} />
                  <Route path="integration/keys" element={<ApiKeysPage />} />
                </Route>
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </SidebarProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
