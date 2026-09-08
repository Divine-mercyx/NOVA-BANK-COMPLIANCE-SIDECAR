const CHANNEL_LABELS: Record<string, string> = {
  NIP: "Instant Payment (NIP)",
  SWIFT: "SWIFT Transfers",
  RTGS: "Real-Time Gross Settlement",
  NEFT: "National Electronic Funds Transfer",
  NAPS: "NAPS Clearing",
  CASH_DEPOSIT: "Cash Deposits",
  CASH_WITHDRAWAL: "Cash Withdrawals",
  MOBILE: "Mobile Banking",
};

const REPORT_LABELS: Record<string, string> = {
  CTR: "Currency Transaction Report",
  FTR: "Foreign Transaction Report",
  STR: "Suspicious Transaction Report",
  PEP: "Politically Exposed Persons",
};

const ACTION_LABELS: Record<string, string> = {
  ETL_COMPLETED: "ETL pipeline completed",
  REPORT_GENERATED: "Regulatory report generated",
  REPORT_APPROVED: "Report approved for submission",
  REPORT_SUBMITTED: "Report submitted to NFIU",
  REPORT_REJECTED: "Report rejected",
  STAFF_CREATED: "New staff member added",
  STAFF_UPDATED: "Staff member updated",
  STAFF_REMOVED: "Staff member removed",
  LOGIN_SUCCESS: "Successful login",
  SCREENING_SIMULATED: "Screening batch simulated",
  ALERT_APPROVED: "Alert marked false positive",
  ALERT_REJECTED: "Transaction rejected",
  ALERT_ESCALATED: "Alert escalated",
};

export function channelLabel(channel: string) {
  return CHANNEL_LABELS[channel] ?? channel.replace(/_/g, " ");
}

export function reportLabel(type: string) {
  return REPORT_LABELS[type] ?? type;
}

export function actionLabel(action: string) {
  return ACTION_LABELS[action] ?? action.replace(/_/g, " ").toLowerCase();
}

export function formatNumber(value: number) {
  return new Intl.NumberFormat("en-NG").format(value);
}

export function formatCurrency(amount: number, currency = "NGN") {
  try {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency,
      maximumFractionDigits: currency === "NGN" ? 0 : 2,
    }).format(amount);
  } catch {
    return `${currency} ${formatNumber(amount)}`;
  }
}

export function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function formatRelative(value: string | null | undefined) {
  if (!value) return "Never";
  const diff = Date.now() - new Date(value).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function formatDateRange(from: string | null | undefined, to: string | null | undefined) {
  if (!from && !to) return "Default window";
  const opts: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeZone: "Africa/Lagos" };
  const fmt = (v: string) => new Intl.DateTimeFormat("en-NG", opts).format(new Date(v));
  if (from && to) return `${fmt(from)} → ${fmt(to)}`;
  if (from) return `From ${fmt(from)}`;
  return `Until ${fmt(to!)}`;
}

export function roleLabel(role: string) {
  return role.charAt(0).toUpperCase() + role.slice(1);
}
