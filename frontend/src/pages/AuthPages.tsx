import { Eye, EyeOff, Plus, Shield } from "lucide-react";
import { FormEvent, ReactNode, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";

function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen">
      {/* Left — marketing panel */}
      <aside className="auth-panel-left relative hidden w-[48%] overflow-hidden lg:flex lg:flex-col lg:justify-center lg:px-10 xl:px-14">
        <div className="auth-panel-glow pointer-events-none absolute inset-0" />

        <div className="relative z-10 mx-auto w-full max-w-lg">
          <div className="auth-glass-card rounded-2xl p-8 xl:p-10">
            <div className="mb-8 flex items-start justify-between">
              <Plus className="h-4 w-4 text-white/50" strokeWidth={1.5} />
              <p className="text-right text-xs font-medium tracking-wide text-white/70">
                Nova Bank · Internal compliance portal
              </p>
            </div>

            <h1 className="text-3xl font-bold leading-tight text-white xl:text-4xl">
              NFIU regulatory reporting, simplified.
            </h1>
            <p className="mt-5 text-sm leading-relaxed text-white/75 xl:text-base">
              Extract Finacle data, validate records, and prepare CTR, FTR, and PEP filings for NFIU — with
              real-time screening for Nova Bank compliance officers.
            </p>

            <div className="mt-10 flex flex-wrap gap-x-10 gap-y-4 border-t border-white/10 pt-8">
              <div>
                <p className="text-xs text-white/55">Milestone 1</p>
                <p className="mt-1 text-lg font-semibold text-white">Reporting</p>
              </div>
              <div>
                <p className="text-xs text-white/55">Milestone 2</p>
                <p className="mt-1 text-lg font-semibold text-white">Screening</p>
              </div>
            </div>

            <div className="mt-8 flex justify-end">
              <Plus className="h-4 w-4 text-white/50" strokeWidth={1.5} />
            </div>
          </div>
        </div>
      </aside>

      {/* Right — form panel */}
      <main className="auth-panel-right flex min-h-screen flex-1 flex-col bg-white">
        <div className="auth-panel-left relative flex items-center justify-center px-6 py-8 lg:hidden">
          <div className="auth-panel-glow pointer-events-none absolute inset-0" />
          <div className="relative flex items-center gap-2 text-white">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/15">
              <Shield className="h-4 w-4" strokeWidth={2} />
            </div>
            <span className="text-lg font-bold">Nova Bank</span>
          </div>
        </div>
        {children}
      </main>
    </div>
  );
}

function AuthLogo() {
  return (
    <div className="text-cener">
      <div className="flex items-center justify-cnter gap-2.5">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand shadow-sm">
          <Shield className="h-5 w-5 text-white" strokeWidth={2} />
        </div>
        <span className="text-xl font-bold tracking-tight text-brand">Nova Bank</span>
      </div>
    </div>
  );
}

function AuthFooter() {
  return (
    <p className="mt-auto pb-8 text-center text-xs text-neutral-400">
      © {new Date().getFullYear()} Nova Bank. All rights reserved.
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
      <div className="flex flex-1 flex-col px-6 py-10 sm:px-12 lg:px-16 xl:px-24">
        <div className="mx-auto flex w-full max-w-[420px] flex-1 flex-col justify-center">
          <AuthLogo />

          <h2 className="mt-10 text-3xl font-bold text-neutral-900">Login</h2>

          <form onSubmit={onSubmit} className="mt-8 space-y-5">
            <div>
              <label htmlFor="email" className="mb-2 block text-sm font-medium text-neutral-700">
                Email address
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="Please enter your email address"
                className="auth-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <label htmlFor="password" className="text-sm font-medium text-neutral-700">
                  Password
                </label>
                <button
                  type="button"
                  className="text-sm font-medium text-brand hover:text-brand-hover"
                  onClick={() => setError("Contact your admin to reset your password.")}
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="Please enter your password"
                  className="auth-input pr-11"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            {error && (
              <p className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
            )}

            <button type="submit" className="auth-submit-btn" disabled={loading}>
              {loading ? "Signing in..." : "Login"}
            </button>
          </form>

          <p className="mt-8 text-center text-sm text-neutral-500">
            Need access?{" "}
            <span className="font-medium text-brand">Contact your compliance admin</span>
          </p>
        </div>

        <AuthFooter />
      </div>
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
      <div className="flex flex-1 flex-col px-6 py-10 sm:px-12 lg:px-16 xl:px-24">
        <div className="mx-auto flex w-full max-w-[420px] flex-1 flex-col justify-center">
          <AuthLogo />

          <h2 className="mt-10 text-3xl font-bold text-neutral-900">Verify OTP</h2>
          <p className="mt-2 text-sm text-neutral-500">
            Enter the 6-digit code sent for <span className="font-medium text-neutral-700">{email}</span>.
            In development, check the backend console.
          </p>

          <form onSubmit={onSubmit} className="mt-8 space-y-5">
            <div>
              <label htmlFor="otp" className="mb-2 block text-sm font-medium text-neutral-700">
                One-time password
              </label>
              <input
                id="otp"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="Enter 6-digit code"
                className="auth-input text-center text-2xl tracking-[0.35em]"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                required
              />
            </div>

            {error && (
              <p className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
            )}

            <button type="submit" className="auth-submit-btn" disabled={loading || code.length !== 6}>
              {loading ? "Verifying..." : "Verify & enter"}
            </button>
          </form>

          <Link
            to="/login"
            className="mt-8 block text-center text-sm font-medium text-brand hover:text-brand-hover"
          >
            Back to login
          </Link>
        </div>

        <AuthFooter />
      </div>
    </AuthShell>
  );
}
