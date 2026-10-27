import { Eye, EyeOff } from "lucide-react";
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
  "Finacle HTD extraction and same-day DTD staging",
  "CTR eligibility and NFIU-format partner export",
  "Audit trail with role-based staff access",
];

function AuthFlowSteps({ active }: { active: AuthFlowStep }) {
  const items: { id: AuthFlowStep; label: string }[] = [
    { id: "sign-in", label: "Sign in" },
    { id: "verify", label: "One-time code" },
  ];

  return (
    <nav className="auth-steps" aria-label="Sign-in steps">
      {items.map((item, index) => {
        const isActive = item.id === active;
        const isPast = active === "verify" && item.id === "sign-in";
        return (
          <span
            key={item.id}
            className={`auth-step-pill ${isActive ? "auth-step-pill-active" : ""} ${isPast ? "auth-step-pill-done" : ""}`}
            aria-current={isActive ? "step" : undefined}
          >
            <span className="auth-step-num">{isPast ? "✓" : index + 1}</span>
            {item.label}
          </span>
        );
      })}
    </nav>
  );
}

function AuthShell({ children, step }: { children: ReactNode; step: AuthFlowStep }) {
  return (
    <div className="auth-shell">
      <div className="auth-frame">
        <aside className="auth-hero relative hidden min-h-[520px] w-[42%] lg:block xl:w-[44%]">
          <div className="auth-hero-mesh" aria-hidden />
          <div className="relative z-10 flex h-full flex-col p-10 xl:p-11">
            <img src={NOVA_BANK_LOGO_URL} alt="Nova Bank" className="h-9 w-auto max-w-[172px] brightness-0 invert" />
            <div className="mt-10 flex-1">
              <p className="text-xs font-medium tracking-wide text-white/55">Internal platform</p>
              <h1 className="mt-2 max-w-sm text-2xl font-semibold leading-snug tracking-tight text-white">
                Compliance Sidecar
              </h1>
              <p className="mt-3 max-w-sm text-sm leading-relaxed text-white/75">
                Finacle reporting, regulatory staging, and controlled data handoff for Nova Bank operations.
              </p>
              <ul className="mt-9 space-y-3.5 border-t border-white/10 pt-8">
                {HERO_POINTS.map((line) => (
                  <li key={line} className="flex gap-3 text-sm leading-snug text-white/85">
                    <span className="mt-2 h-px w-3 shrink-0 bg-accent" aria-hidden />
                    {line}
                  </li>
                ))}
              </ul>
            </div>
            <p className="text-[11px] text-white/40">Authorised staff · Africa/Lagos</p>
          </div>
        </aside>

        <section className="auth-panel">
          <div className="auth-panel-inner">
            <div className="auth-panel-brand lg:hidden">
              <img src={NOVA_BANK_LOGO_URL} alt="Nova Bank" className="h-8 w-auto max-w-[150px]" />
            </div>
            <AuthFlowSteps active={step} />
            {children}
          </div>
        </section>
      </div>
    </div>
  );
}

function AuthPanelHeader({ title, subtitle }: { title: string; subtitle: ReactNode }) {
  return (
    <header className="auth-panel-header">
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
        title="Sign in"
        subtitle="Enter your Nova credentials. You will confirm with a one-time code on the next screen."
      />

      <form onSubmit={onSubmit} className="auth-form mt-7 space-y-4">
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
              className="text-xs text-content-muted hover:text-content"
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
              className="auth-input pr-10"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button
              type="button"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-content-subtle hover:text-content"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {error && <p className="auth-error" role="alert">{error}</p>}

        <button type="submit" className="btn-primary w-full py-2.5" disabled={loading}>
          {loading ? "Signing in…" : "Continue"}
        </button>
      </form>

      <p className="auth-footnote mt-6">Need access? Contact your compliance administrator.</p>
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
        title="One-time code"
        subtitle={
          <>
            Enter the 6-digit code sent to <span className="font-medium text-content">{email}</span>.
          </>
        }
      />

      <form onSubmit={onSubmit} className="auth-form mt-7 space-y-4">
        <div>
          <p className="auth-label">Verification code</p>
          <OtpInput value={code} onChange={setCode} disabled={loading} />
        </div>
        {error && <p className="auth-error" role="alert">{error}</p>}
        <button type="submit" className="btn-primary w-full py-2.5" disabled={loading || code.length !== 6}>
          {loading ? "Verifying…" : "Sign in to portal"}
        </button>
      </form>

      <Link
        to="/login"
        className="auth-footnote mt-6 block hover:text-content"
        onClick={() => clearOtpSession()}
      >
        Back to sign in
      </Link>
    </AuthShell>
  );
}
