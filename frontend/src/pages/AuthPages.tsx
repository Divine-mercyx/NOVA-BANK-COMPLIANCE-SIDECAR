import { Eye, EyeOff, LockKeyhole, ShieldCheck } from "lucide-react";
import { FormEvent, ReactNode, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { OtpInput } from "../components/OtpInput";
import { useAuth } from "../lib/auth";
import { NOVA_BANK_LOGO_URL } from "../lib/brand";

const OTP_SESSION_STORAGE_KEY = "nova_otp_session";

type OtpRouteState = {
  otp_session_id?: string;
  otpSessionId?: string;
  email?: string;
};

type AuthFlowStep = "sign-in" | "verify";

function readOtpSession(state: OtpRouteState | null): { otpSessionId: string; email: string } | null {
  const fromState = state?.otp_session_id ?? state?.otpSessionId;
  const email = state?.email;
  if (fromState && email) return { otpSessionId: fromState, email };

  try {
    const raw = sessionStorage.getItem(OTP_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { otpSessionId?: string; email?: string };
    if (parsed.otpSessionId && parsed.email) return { otpSessionId: parsed.otpSessionId, email: parsed.email };
  } catch {
    /* ignore */
  }
  return null;
}

function storeOtpSession(otpSessionId: string, email: string) {
  sessionStorage.setItem(OTP_SESSION_STORAGE_KEY, JSON.stringify({ otpSessionId, email }));
}

function clearOtpSession() {
  sessionStorage.removeItem(OTP_SESSION_STORAGE_KEY);
}

const HERO_POINTS = [
  "Finacle HTD and same-day DTD in one pipeline",
  "CTR staging and partner export with NFIU columns",
  "Audit trail and role-based access for compliance teams",
];

function AuthFlowSteps({ active }: { active: AuthFlowStep }) {
  const steps: { id: AuthFlowStep; label: string }[] = [
    { id: "sign-in", label: "Sign in" },
    { id: "verify", label: "Verify OTP" },
  ];
  const activeIndex = steps.findIndex((s) => s.id === active);

  return (
    <ol className="auth-steps" aria-label="Sign-in progress">
      {steps.map((step, index) => {
        const done = index < activeIndex;
        const current = step.id === active;
        return (
          <li
            key={step.id}
            className={`auth-step ${current ? "auth-step-active" : ""} ${done ? "auth-step-done" : ""}`}
            aria-current={current ? "step" : undefined}
          >
            <span className="auth-step-dot" aria-hidden>{done ? "✓" : index + 1}</span>
            <span className="auth-step-label">{step.label}</span>
          </li>
        );
      })}
    </ol>
  );
}

function AuthShell({ children, step }: { children: ReactNode; step: AuthFlowStep }) {
  return (
    <div className="auth-shell">
      <div className="auth-frame">
        <aside className="auth-hero relative hidden min-h-[560px] w-[44%] xl:w-[46%] lg:block">
          <div className="auth-hero-mesh" aria-hidden />
          <div className="relative z-10 flex h-full flex-col justify-between p-10 xl:p-12">
            <div>
              <span className="auth-hero-badge">Staff compliance portal</span>
              <div className="mt-8 inline-flex rounded-2xl border border-white/15 bg-white/95 px-4 py-3 shadow-lg backdrop-blur-sm">
                <img src={NOVA_BANK_LOGO_URL} alt="Nova Bank" className="h-9 w-auto max-w-[180px]" />
              </div>
            </div>
            <div>
              <h1 className="max-w-md text-[2rem] font-semibold leading-[1.15] tracking-tight text-white xl:text-[2.15rem]">
                Reporting from the bank&apos;s own books.
              </h1>
              <p className="mt-4 max-w-md text-sm leading-relaxed text-white/70">
                Extract, stage, and hand off clean transaction data to filing and screening partners — without leaving
                Nova controls.
              </p>
              <ul className="mt-8 space-y-3">
                {HERO_POINTS.map((line) => (
                  <li key={line} className="flex gap-3 text-sm text-white/80">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent shadow-[0_0_10px_rgb(var(--nova-cyan)/0.9)]" />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </div>
            <p className="text-xs text-white/45">Authorised Nova Bank staff only · Africa/Lagos operations</p>
          </div>
        </aside>

        <section className="auth-panel">
          <div className="auth-panel-inner wow-page-enter">
            <div className="auth-panel-brand lg:hidden">
              <img src={NOVA_BANK_LOGO_URL} alt="Nova Bank" className="h-8 w-auto max-w-[150px]" />
            </div>
            <AuthFlowSteps active={step} />
            {children}
          </div>
        </section>
      </div>
      <p className="auth-page-foot">Nova Bank Compliance Sidecar · Internal use</p>
    </div>
  );
}

function AuthPanelHeader({
  icon,
  title,
  subtitle,
}: {
  icon: ReactNode;
  title: string;
  subtitle: ReactNode;
}) {
  return (
    <header className="auth-panel-header">
      <span className="auth-mark">{icon}</span>
      <h2 className="auth-title">{title}</h2>
      <p className="auth-subtitle">{subtitle}</p>
    </header>
  );
}

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await login(email, password);
      storeOtpSession(result.otp_session_id, email);
      navigate("/verify-otp", {
        state: { otp_session_id: result.otp_session_id, email },
        replace: true,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell step="sign-in">
      <AuthPanelHeader
        icon={<LockKeyhole className="h-5 w-5" strokeWidth={2} />}
        title="Sign in"
        subtitle="Use your Nova work email and password. A one-time code is required on the next step."
      />

      <form onSubmit={onSubmit} className="auth-form-card mt-8">
        <div className="space-y-5">
          <div>
            <label htmlFor="email" className="auth-label">Work email</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="name@novabank.ng"
              className="auth-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <label htmlFor="password" className="auth-label mb-0">Password</label>
              <button
                type="button"
                className="shrink-0 text-xs font-medium text-accent hover:text-accent-hover"
                onClick={() => setError("Contact your administrator to reset your password.")}
              >
                Forgot password?
              </button>
            </div>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                className="auth-input pr-11"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-content-subtle transition hover:bg-surface-overlay hover:text-content"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {error && <p className="auth-error" role="alert">{error}</p>}

          <button type="submit" className="auth-submit-btn" disabled={loading}>
            {loading ? "Signing in…" : "Continue to verification"}
          </button>
        </div>
      </form>

      <p className="auth-footnote mt-6">
        <ShieldCheck className="inline h-3.5 w-3.5 -translate-y-px text-accent" aria-hidden />
        <span className="ml-1.5">Need access? Contact your compliance administrator.</span>
      </p>
    </AuthShell>
  );
}

export function OtpPage() {
  const { verifyOtp } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const session = readOtpSession(location.state as OtpRouteState | null);

  if (!session) return <Navigate to="/login" replace />;

  const { otpSessionId, email } = session;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await verifyOtp(otpSessionId, code);
      clearOtpSession();
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid code");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell step="verify">
      <AuthPanelHeader
        icon={<ShieldCheck className="h-5 w-5" strokeWidth={2} />}
        title="Verify access"
        subtitle={
          <>
            Enter the 6-digit code sent to{" "}
            <span className="font-medium text-content">{email}</span>.
          </>
        }
      />

      <form onSubmit={onSubmit} className="auth-form-card mt-8">
        <div className="space-y-5">
          <div>
            <p className="auth-label text-center">One-time password</p>
            <OtpInput value={code} onChange={setCode} disabled={loading} />
          </div>
          {error && <p className="auth-error" role="alert">{error}</p>}
          <button type="submit" className="auth-submit-btn" disabled={loading || code.length !== 6}>
            {loading ? "Verifying…" : "Enter portal"}
          </button>
        </div>
      </form>

      <Link
        to="/login"
        className="auth-footnote mt-6 block text-center transition hover:text-accent"
        onClick={() => clearOtpSession()}
      >
        Back to sign in
      </Link>
    </AuthShell>
  );
}
