import { Eye, EyeOff } from "lucide-react";
import { FormEvent, ReactNode, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { NOVA_BANK_LOGO_URL } from "../lib/brand";

function AuthMark() {
  return (
    <span className="auth-mark">
      <svg viewBox="0 0 32 32" className="h-5 w-5" fill="currentColor" aria-hidden>
        <circle cx="16" cy="16" r="3" />
        {Array.from({ length: 12 }).map((_, i) => {
          const a = (i * Math.PI) / 6;
          const x1 = 16 + Math.cos(a) * 6;
          const y1 = 16 + Math.sin(a) * 6;
          const x2 = 16 + Math.cos(a) * 11;
          const y2 = 16 + Math.sin(a) * 11;
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="currentColor" strokeWidth="2" strokeLinecap="round" />;
        })}
      </svg>
    </span>
  );
}

function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="auth-shell">
      <div className="auth-frame">
        <aside className="auth-hero relative hidden min-h-[580px] w-[46%] lg:block">
          <div className="relative z-10 flex h-full flex-col justify-end p-10 xl:p-12">
            <div className="inline-flex rounded-xl bg-white/95 px-3 py-2 shadow-md">
              <img src={NOVA_BANK_LOGO_URL} alt="Nova Bank" className="h-8 w-auto max-w-[160px]" />
            </div>
            <h1 className="mt-4 max-w-sm text-[2rem] font-semibold leading-tight text-white">
              Compliance reporting from the bank&apos;s own books.
            </h1>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-white/65">
              Extract Finacle, stage CTR and DTD, and hand clean data to filing and screening partners.
            </p>
          </div>
        </aside>
        <section className="flex flex-1 flex-col justify-center px-8 py-12 sm:px-12 lg:px-14">
          {children}
        </section>
      </div>
    </div>
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
      navigate("/verify-otp", { state: { otp_session_id: result.otp_session_id, email } });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell>
      <AuthMark />
      <h2 className="auth-title">Sign in</h2>
      <p className="auth-subtitle">Welcome to Nova Bank compliance — authorised staff only.</p>

      <form onSubmit={onSubmit} className="mt-8 space-y-5">
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
          <div className="mb-1.5 flex items-center justify-between">
            <label htmlFor="password" className="auth-label mb-0">Password</label>
            <button
              type="button"
              className="text-xs text-content-subtle hover:text-accent"
              onClick={() => setError("Contact your administrator to reset your password.")}
            >
              Forgot password
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
              className="absolute right-3 top-1/2 -translate-y-1/2 text-content-subtle hover:text-content"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {error && <p className="auth-error">{error}</p>}

        <button type="submit" className="auth-submit-btn" disabled={loading}>
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <p className="auth-footnote mt-8">Need access? Speak to your compliance administrator.</p>
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

  const otpSessionId = (location.state as { otpSessionId?: string; email?: string } | null)?.otpSessionId;
  const email = (location.state as { otpSessionId?: string; email?: string } | null)?.email;

  if (!otpSessionId) return <Navigate to="/login" replace />;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await verifyOtp(otpSessionId, code);
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid code");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell>
      <AuthMark />
      <h2 className="auth-title">Verify access</h2>
      <p className="auth-subtitle">
        Enter the 6-digit code sent for <span className="font-medium text-content">{email}</span>.
      </p>

      <form onSubmit={onSubmit} className="mt-8 space-y-5">
        <div>
          <label htmlFor="otp" className="auth-label">One-time password</label>
          <input
            id="otp"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            className="auth-input text-center text-xl tracking-[0.4em]"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            required
          />
        </div>
        {error && <p className="auth-error">{error}</p>}
        <button type="submit" className="auth-submit-btn" disabled={loading || code.length !== 6}>
          {loading ? "Verifying…" : "Continue"}
        </button>
      </form>

      <Link to="/login" className="auth-footnote mt-8 block hover:text-accent">
        Back to sign in
      </Link>
    </AuthShell>
  );
}
