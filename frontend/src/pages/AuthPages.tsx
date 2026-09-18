import { Eye, EyeOff, Shield } from "lucide-react";
import { FormEvent, ReactNode, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";

function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-100 px-4 py-12">
      <div className="w-full max-w-[420px]">{children}</div>
    </div>
  );
}

function AuthLogo() {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-9 w-9 items-center justify-center border border-neutral-800 bg-neutral-900 text-white">
        <Shield className="h-4 w-4" strokeWidth={2} />
      </div>
      <div>
        <p className="text-sm font-semibold tracking-tight text-neutral-900">Nova Bank</p>
        <p className="text-xs text-neutral-500">Compliance portal</p>
      </div>
    </div>
  );
}

function AuthFooter() {
  return (
    <p className="mt-10 text-center text-xs text-neutral-400">
      © {new Date().getFullYear()} Nova Bank. Internal use only.
    </p>
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
      navigate("/verify-otp", { state: { otpSessionId: result.otp_session_id, email } });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell>
      <div className="border border-neutral-200 bg-white px-8 py-10">
        <AuthLogo />
        <h1 className="mt-8 text-xl font-semibold text-neutral-900">Sign in</h1>
        <p className="mt-1 text-sm text-neutral-500">Authorised staff only.</p>

        <form onSubmit={onSubmit} className="mt-8 space-y-5">
          <div>
            <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-neutral-700">
              Email
            </label>
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
              <label htmlFor="password" className="text-sm font-medium text-neutral-700">
                Password
              </label>
              <button
                type="button"
                className="text-xs text-neutral-500 hover:text-neutral-800"
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
                className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {error && (
            <p className="border border-neutral-300 bg-neutral-50 px-3 py-2 text-sm text-neutral-800">{error}</p>
          )}

          <button type="submit" className="auth-submit-btn" disabled={loading}>
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
      <AuthFooter />
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
      <div className="border border-neutral-200 bg-white px-8 py-10">
        <AuthLogo />
        <h1 className="mt-8 text-xl font-semibold text-neutral-900">One-time password</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Enter the 6-digit code for <span className="font-medium text-neutral-800">{email}</span>.
        </p>

        <form onSubmit={onSubmit} className="mt-8 space-y-5">
          <div>
            <label htmlFor="otp" className="mb-1.5 block text-sm font-medium text-neutral-700">
              Code
            </label>
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

          {error && (
            <p className="border border-neutral-300 bg-neutral-50 px-3 py-2 text-sm text-neutral-800">{error}</p>
          )}

          <button type="submit" className="auth-submit-btn" disabled={loading || code.length !== 6}>
            {loading ? "Verifying…" : "Continue"}
          </button>
        </form>

        <Link to="/login" className="mt-6 block text-center text-sm text-neutral-500 hover:text-neutral-800">
          Back to sign in
        </Link>
      </div>
      <AuthFooter />
    </AuthShell>
  );
}
