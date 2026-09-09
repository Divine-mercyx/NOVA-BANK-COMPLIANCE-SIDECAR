export type ExtractionStatus = "running" | "success" | "partial" | "failed";
export type ReportType = "CTR" | "FTR" | "STR" | "PEP";
export type ReportStatus = "draft" | "pending_review" | "approved" | "submitted" | "rejected";
export type UserRole = "viewer" | "analyst" | "approver" | "admin";

export interface ExtractionRun {
  id: string;
  started_at: string;
  completed_at: string | null;
  status: ExtractionStatus;
  source: string;
  channels: string[];
  date_from: string | null;
  date_to: string | null;
  records_extracted: number;
  records_valid: number;
  records_invalid: number;
  error_summary: string | null;
}

export interface ExtractionLog {
  id: string;
  level: string;
  channel: string | null;
  message: string;
  created_at: string;
}

export interface StagingTransaction {
  id: string;
  finacle_ref: string;
  channel: string;
  transaction_date: string;
  amount: number;
  currency: string;
  sender_name: string;
  sender_account: string;
  receiver_name: string;
  narration: string | null;
  is_valid: boolean;
  validation_errors: string[] | null;
  reportable_ctr: boolean;
  reportable_ftr: boolean;
  reportable_pep: boolean;
  reportable_str: boolean;
}

export interface DataQualityMetrics {
  total_records: number;
  valid_records: number;
  invalid_records: number;
  validation_rate: number;
  by_channel: Record<string, number>;
  ctr_eligible: number;
  ftr_eligible: number;
  pep_eligible: number;
  str_eligible: number;
  last_extraction_at: string | null;
}

export interface RegulatoryReport {
  id: string;
  report_type: ReportType;
  status: ReportStatus;
  period_start: string;
  period_end: string;
  record_count: number;
  xml_path: string | null;
  csv_path: string | null;
  preview_data: {
    sample: Array<{
      ref: string;
      channel: string;
      amount: number;
      currency: string;
      sender: string;
      receiver: string;
    }>;
    totals: { count: number; total_amount: number };
  } | null;
  submitted_at: string | null;
  submitted_to: string | null;
  created_at: string;
}

export interface AuditEvent {
  id: string;
  actor_name: string;
  action: string;
  entity_type: string;
  entity_id: string;
  details: Record<string, unknown> | null;
  created_at: string;
}

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
}

export interface DashboardStats {
  pipeline_status: string;
  finacle_mode: string;
  last_extraction: ExtractionRun | null;
  total_staged_transactions: number;
  pending_reports: number;
  submitted_reports: number;
  data_quality: DataQualityMetrics;
  recent_audit: AuditEvent[];
}

export interface LoginResponse {
  otp_session_id: string;
  message: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export interface CreateStaffRequest {
  email: string;
  password: string;
  full_name: string;
  role: UserRole;
}

export interface UpdateStaffRequest {
  email?: string;
  full_name?: string;
  role?: UserRole;
  password?: string;
  is_active?: boolean;
}

export type AlertStatus = "pending" | "approved" | "rejected" | "escalated";
export type ScreeningType = "transaction" | "onboarding";

export interface ScreeningAlert {
  id: string;
  finacle_ref: string;
  screening_type: ScreeningType;
  status: AlertStatus;
  sender_name: string;
  receiver_name: string;
  amount: number;
  currency: string;
  channel: string;
  watchlist_source: string;
  matched_name: string;
  match_score: number;
  latency_ms: number;
  reviewed_by: string | null;
  reviewed_at: string | null;
  notes: string | null;
  created_at: string;
}

export interface ScreeningDashboard {
  pending_alerts: number;
  total_screened_today: number;
  escalated: number;
  avg_latency_ms: number;
  false_positive_rate: number;
  resolved_today: number;
}

export interface ScreeningPerformance {
  by_watchlist: Record<string, number>;
  by_status: Record<string, number>;
  recent_latency_ms: number[];
}

export interface ScreeningAuditEvent {
  id: string;
  actor_name: string;
  action: string;
  entity_id: string;
  details: Record<string, unknown> | null;
  created_at: string;
}

export interface IntegrationEndpointDoc {
  method: string;
  path: string;
  summary: string;
  auth: string;
}

export interface IntegrationInfo {
  base_url: string;
  openapi_url: string;
  finacle_mode: string;
  purpose: string;
  auth_header: string;
  endpoints: IntegrationEndpointDoc[];
}

export interface ApiKey {
  id: string;
  name: string;
  description: string | null;
  key_prefix: string;
  is_active: boolean;
  created_at: string;
  last_used_at: string | null;
}

export interface ApiKeyCreated extends ApiKey {
  api_key: string;
}

export interface CreateApiKeyRequest {
  name: string;
  description?: string;
}

function getToken() {
  return localStorage.getItem("nova-token");
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getToken();
  const res = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });
  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = await res.json();
      message = body.detail ?? body.message ?? message;
    } catch {
      const text = await res.text();
      if (text) message = text;
    }
    throw new Error(typeof message === "string" ? message : JSON.stringify(message));
  }
  return res.json();
}

export const api = {
  login: (email: string, password: string) =>
    request<LoginResponse>("/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  verifyOtp: (otp_session_id: string, code: string) =>
    request<AuthResponse>("/api/v1/auth/verify-otp", {
      method: "POST",
      body: JSON.stringify({ otp_session_id, code }),
    }),
  me: () => request<User>("/api/v1/auth/me"),
  createStaff: (payload: CreateStaffRequest) =>
    request<User>("/api/v1/auth/staff", { method: "POST", body: JSON.stringify(payload) }),
  updateStaff: (id: string, payload: UpdateStaffRequest) =>
    request<User>(`/api/v1/auth/staff/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  removeStaff: (id: string) =>
    request<User>(`/api/v1/auth/staff/${id}`, { method: "DELETE" }),
  dashboard: () => request<DashboardStats>("/api/v1/dashboard"),
  runEtl: (params?: { date_from: string; date_to: string }) =>
    request<ExtractionRun>("/api/v1/etl/run", {
      method: "POST",
      body: JSON.stringify(params ?? {}),
    }),
  getRun: (id: string) => request<ExtractionRun>(`/api/v1/etl/runs/${id}`),
  listRuns: () => request<ExtractionRun[]>("/api/v1/etl/runs"),
  runLogs: (id: string) => request<ExtractionLog[]>(`/api/v1/etl/runs/${id}/logs`),
  waitForEtlRun: async (
    runId: string,
    onUpdate?: (run: ExtractionRun, logs: ExtractionLog[]) => void,
  ): Promise<ExtractionRun> => {
    while (true) {
      const [run, logs] = await Promise.all([api.getRun(runId), api.runLogs(runId)]);
      onUpdate?.(run, logs);
      if (run.status !== "running") return run;
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  },
  transactions: (validOnly = false, channel?: string) => {
    const params = new URLSearchParams({ valid_only: String(validOnly) });
    if (channel) params.set("channel", channel);
    return request<StagingTransaction[]>(`/api/v1/staging/transactions?${params}`);
  },
  quality: () => request<DataQualityMetrics>("/api/v1/analytics/quality"),
  reports: () => request<RegulatoryReport[]>("/api/v1/reports"),
  generateReport: (report_type: ReportType, period_start: string, period_end: string) =>
    request<RegulatoryReport>("/api/v1/reports/generate", {
      method: "POST",
      body: JSON.stringify({ report_type, period_start, period_end }),
    }),
  approveReport: (id: string, actor_name?: string) =>
    request<RegulatoryReport>(`/api/v1/reports/${id}/approve`, {
      method: "POST",
      body: JSON.stringify({ actor_name: actor_name ?? "Compliance Officer" }),
    }),
  submitReport: (id: string, actor_name?: string) =>
    request<RegulatoryReport>(`/api/v1/reports/${id}/submit`, {
      method: "POST",
      body: JSON.stringify({ actor_name: actor_name ?? "Compliance Officer" }),
    }),
  rejectReport: (id: string, actor_name?: string, notes?: string) =>
    request<RegulatoryReport>(`/api/v1/reports/${id}/reject`, {
      method: "POST",
      body: JSON.stringify({ actor_name: actor_name ?? "Compliance Officer", notes }),
    }),
  audit: () => request<AuditEvent[]>("/api/v1/audit"),
  users: () => request<User[]>("/api/v1/users"),

  screeningDashboard: () => request<ScreeningDashboard>("/api/v1/screening/dashboard"),
  screeningPerformance: () => request<ScreeningPerformance>("/api/v1/screening/performance"),
  screeningAlerts: (status?: AlertStatus) =>
    request<ScreeningAlert[]>(`/api/v1/screening/alerts${status ? `?status=${status}` : ""}`),
  simulateScreening: (count = 5) =>
    request<ScreeningAlert[]>("/api/v1/screening/simulate", {
      method: "POST",
      body: JSON.stringify({ count }),
    }),
  approveAlert: (id: string, actor_name?: string, notes?: string) =>
    request<ScreeningAlert>(`/api/v1/screening/alerts/${id}/approve`, {
      method: "POST",
      body: JSON.stringify({ actor_name: actor_name ?? "Compliance Officer", notes }),
    }),
  rejectAlert: (id: string, actor_name?: string, notes?: string) =>
    request<ScreeningAlert>(`/api/v1/screening/alerts/${id}/reject`, {
      method: "POST",
      body: JSON.stringify({ actor_name: actor_name ?? "Compliance Officer", notes }),
    }),
  escalateAlert: (id: string, actor_name?: string, notes?: string) =>
    request<ScreeningAlert>(`/api/v1/screening/alerts/${id}/escalate`, {
      method: "POST",
      body: JSON.stringify({ actor_name: actor_name ?? "Compliance Officer", notes }),
    }),
  screeningAudit: () => request<ScreeningAuditEvent[]>("/api/v1/screening/audit"),

  integrationInfo: () => request<IntegrationInfo>("/api/v1/integration/info"),
  listApiKeys: () => request<ApiKey[]>("/api/v1/integration/keys"),
  createApiKey: (payload: CreateApiKeyRequest) =>
    request<ApiKeyCreated>("/api/v1/integration/keys", { method: "POST", body: JSON.stringify(payload) }),
  revokeApiKey: (id: string) =>
    request<ApiKey>(`/api/v1/integration/keys/${id}`, { method: "DELETE" }),
};
