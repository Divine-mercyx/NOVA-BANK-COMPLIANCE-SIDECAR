import { Eye, EyeOff } from "lucide-react";
import { FormEvent, useState } from "react";
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

function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="flex flex-col items-center border-b border-border pb-6">
          <img src={NOVA_BANK_LOGO_URL} alt="Nova Bank" className="h-9 w-auto max-w-[168px]" />
          <p className="mt-2 text-xs text-content-muted">Compliance Sidecar</p>
        </div>
        <div className="pt-6">{children}</div>
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
    <AuthShell>
      <h1 className="auth-heading">Sign in</h1>
      <p className="auth-lead">Staff access only. You will be asked for a one-time code next.</p>

      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <div>
          <label htmlFor="email" className="auth-label">Email</label>
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
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <p className="auth-footnote mt-6">Need an account? Contact your compliance administrator.</p>
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
    <AuthShell>
      <h1 className="auth-heading">Verification code</h1>
      <p className="auth-lead">
        Enter the 6-digit code sent to <span className="font-medium text-content">{email}</span>.
      </p>

      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <div>
          <p className="auth-label">Code</p>
          <OtpInput value={code} onChange={setCode} disabled={loading} />
        </div>
        {error && <p className="auth-error" role="alert">{error}</p>}
        <button type="submit" className="btn-primary w-full py-2.5" disabled={loading || code.length !== 6}>
          {loading ? "Verifying…" : "Continue"}
        </button>
      </form>

      <Link
        to="/login"
        className="auth-footnote mt-6 block text-center hover:text-content"
        onClick={() => clearOtpSession()}
      >
        Back to sign in
      </Link>
    </AuthShell>
  );
}
