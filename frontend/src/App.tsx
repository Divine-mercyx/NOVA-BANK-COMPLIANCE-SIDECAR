import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { HomeRoute, RequirePermission } from "./components/RequirePermission";
import { RolesPage } from "./pages/RolesPage";
import { AuthProvider } from "./lib/auth";
import { SidebarProvider } from "./lib/sidebar";
import { ThemeProvider } from "./lib/theme";
import { LoginPage, OtpPage, SetupAuthenticatorPage } from "./pages/AuthPages";
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
    <ThemeProvider>
      <AuthProvider>
        <SidebarProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/verify-otp" element={<OtpPage />} />
              <Route path="/set-up-authenticator" element={<SetupAuthenticatorPage />} />
              <Route element={<ProtectedRoute />}>
                <Route element={<Layout />}>
                  <Route index element={<HomeRoute><DashboardPage /></HomeRoute>} />
                  <Route path="extraction" element={<RequirePermission path="/extraction"><ExtractionPage /></RequirePermission>} />
                  <Route path="quality" element={<RequirePermission path="/quality"><QualityPage /></RequirePermission>} />
                  <Route path="reports" element={<RequirePermission path="/reports"><ReportsPage /></RequirePermission>} />
                  <Route path="audit" element={<RequirePermission path="/audit"><AuditPage /></RequirePermission>} />
                  <Route path="users" element={<RequirePermission path="/users"><UsersPage /></RequirePermission>} />
                  <Route path="roles" element={<RequirePermission path="/roles"><RolesPage /></RequirePermission>} />
                  <Route path="daily" element={<RequirePermission path="/daily"><DailyTransactionsPage /></RequirePermission>} />
                  <Route path="integration" element={<Navigate to="/integration/docs" replace />} />
                  <Route path="integration/docs" element={<RequirePermission path="/integration/docs"><IntegrationApiDocsPage /></RequirePermission>} />
                  <Route path="integration/keys" element={<RequirePermission path="/integration/keys"><ApiKeysPage /></RequirePermission>} />
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
