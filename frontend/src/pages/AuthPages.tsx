import { Check, Copy, Download, Eye, EyeOff } from "lucide-react";
import QRCode from "qrcode";
import { FormEvent, ReactNode, useEffect, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { OtpInput } from "../components/OtpInput";
import { useAuth } from "../lib/auth";
import { BrandLogo } from "../components/BrandLogo";

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

/** Only the challenge id and the email are kept (never a code or a key), and only until the tab closes. */
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
    { id: "verify", label: "Authenticator code" },
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
            <BrandLogo tone="light" className="h-9 w-auto max-w-[172px] brightness-0 invert" />
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
              <BrandLogo className="h-8 w-auto max-w-[150px]" />
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
      // First sign-in: connect an authenticator app. Otherwise: type the code from it.
      navigate(result.two_factor === "setup" ? "/set-up-authenticator" : "/verify-otp", {
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
        subtitle="Enter your Nova credentials. You will confirm with a code from your authenticator app on the next screen."
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
  const [recovery, setRecovery] = useState("");
  const [useRecovery, setUseRecovery] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const session = readOtpSession(location.state as OtpRouteState | null);

  if (!session) return <Navigate to="/login" replace />;

  const { otpSessionId, email } = session;
  const ready = useRecovery ? recovery.replace(/[\s-]/g, "").length >= 10 : code.length === 6;

  const submit = async (value: { code: string } | { recoveryCode: string }) => {
    setError("");
    setLoading(true);
    try {
      await verifyOtp(otpSessionId, value);
      clearOtpSession();
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid code");
      setCode("");
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!ready || loading) return;
    void submit(useRecovery ? { recoveryCode: recovery.trim() } : { code });
  };

  return (
    <AuthShell step="verify">
      <AuthPanelHeader
        title={useRecovery ? "Recovery code" : "Authenticator code"}
        subtitle={
          useRecovery ? (
            <>Enter one of the recovery codes you saved when you set up your authenticator app. Each one works once.</>
          ) : (
            <>
              Open your authenticator app and enter the 6-digit code for{" "}
              <span className="font-medium text-content">{email}</span>.
            </>
          )
        }
      />

      <form onSubmit={onSubmit} className="auth-form mt-7 space-y-4">
        {useRecovery ? (
          <div>
            <label htmlFor="recovery" className="auth-label">Recovery code</label>
            <input
              id="recovery"
              className="auth-input font-mono uppercase tracking-wider"
              placeholder="XXXXX-XXXXX-XXXXX"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              value={recovery}
              onChange={(e) => setRecovery(e.target.value)}
              disabled={loading}
            />
          </div>
        ) : (
          <div>
            <p className="auth-label">6-digit code</p>
            <OtpInput
              value={code}
              onChange={(next) => {
                setCode(next);
                // Sent as soon as the sixth digit is typed or pasted (the phone's code suggestion fills it).
                if (next.length === 6 && !loading) void submit({ code: next });
              }}
              disabled={loading}
            />
          </div>
        )}
        {error && <p className="auth-error" role="alert">{error}</p>}
        <button type="submit" className="btn-primary w-full py-2.5" disabled={loading || !ready}>
          {loading ? "Verifying…" : "Sign in to portal"}
        </button>
      </form>

      <button
        type="button"
        className="auth-footnote mt-6 block w-full hover:text-content"
        onClick={() => {
          setUseRecovery(!useRecovery);
          setError("");
        }}
      >
        {useRecovery ? "Use the code from my authenticator app" : "Lost your phone? Use a recovery code"}
      </button>
      <Link to="/login" className="auth-footnote mt-3 block hover:text-content" onClick={() => clearOtpSession()}>
        Back to sign in
      </Link>
    </AuthShell>
  );
}

/** Saves the recovery codes as a text file the person can keep somewhere safe. */
function downloadRecoveryCodes(email: string, codes: string[]) {
  const text = [
    "Nova Compliance Sidecar: recovery codes",
    `Account: ${email}`,
    "",
    "Each code works once, if you lose access to your authenticator app. Keep this file somewhere safe and private.",
    "",
    ...codes,
    "",
  ].join("\n");
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "nova-recovery-codes.txt";
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * First sign-in: nobody uses the portal with a password alone. Step 1 scan the QR code (or copy the key), step 2
 * type a code to prove it works, step 3 save the recovery codes. Only then is the portal opened.
 */
export function SetupAuthenticatorPage() {
  const { twoFactorSetup, twoFactorEnable, finishSignIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const session = readOtpSession(location.state as OtpRouteState | null);
  const [setup, setSetup] = useState<{ secret: string; otpauth_url: string } | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState<"key" | "codes" | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const otpSessionId = session?.otpSessionId;

  useEffect(() => {
    if (!otpSessionId) return;
    let cancelled = false;
    twoFactorSetup(otpSessionId)
      .then(async (result) => {
        if (cancelled) return;
        setSetup(result);
        setQr(await QRCode.toDataURL(result.otpauth_url, { margin: 1, width: 216, errorCorrectionLevel: "M" }));
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not start setup. Please sign in again.");
      });
    return () => {
      cancelled = true;
    };
  }, [otpSessionId, twoFactorSetup]);

  if (!session) return <Navigate to="/login" replace />;
  const { email } = session;

  const copy = async (text: string, what: "key" | "codes") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      /* clipboard blocked: the text is on screen to copy by hand */
    }
  };

  const confirm = async (value: string) => {
    setError("");
    setLoading(true);
    try {
      const result = await twoFactorEnable(session.otpSessionId, value);
      setCodes(result.recovery_codes);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid code");
      setCode("");
    } finally {
      setLoading(false);
    }
  };

  const onConfirm = (e: FormEvent) => {
    e.preventDefault();
    if (code.length === 6 && !loading) void confirm(code);
  };

  const finish = async () => {
    clearOtpSession();
    await finishSignIn();
    navigate("/", { replace: true });
  };

  // Step 3: the person is signed in on the server; show the recovery codes once before opening the portal.
  if (codes) {
    return (
      <AuthShell step="verify">
        <AuthPanelHeader
          title="Save your recovery codes"
          subtitle="If you lose your phone, each of these codes lets you sign in once. They are shown only now."
        />
        <div className="mt-6 grid grid-cols-2 gap-2 rounded-xl border border-border bg-surface-raised p-4 font-mono text-sm tracking-wider text-content">
          {codes.map((c) => (
            <span key={c}>{c}</span>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className="btn-secondary inline-flex items-center gap-2" onClick={() => copy(codes.join("\n"), "codes")}>
            {copied === "codes" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied === "codes" ? "Copied" : "Copy"}
          </button>
          <button type="button" className="btn-secondary inline-flex items-center gap-2" onClick={() => downloadRecoveryCodes(email, codes)}>
            <Download className="h-4 w-4" />
            Download
          </button>
        </div>
        <label className="mt-5 flex items-start gap-3 text-sm text-content">
          <input type="checkbox" className="mt-0.5 h-4 w-4" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
          <span>I have saved these codes somewhere safe.</span>
        </label>
        <button type="button" className="btn-primary mt-5 w-full py-2.5" disabled={!saved} onClick={finish}>
          Continue to the portal
        </button>
      </AuthShell>
    );
  }

  return (
    <AuthShell step="verify">
      <AuthPanelHeader
        title="Set up your authenticator app"
        subtitle={
          <>
            Nova signs you in with a code from an app on your phone: Google Authenticator, Microsoft Authenticator, 1Password
            or Authy. You only set this up once for <span className="font-medium text-content">{email}</span>.
          </>
        }
      />

      <ol className="mt-6 space-y-5 text-sm text-content">
        <li>
          <p className="font-medium">1. Scan this QR code with the app</p>
          <div className="mt-3 flex items-center gap-4">
            <div className="flex h-[216px] w-[216px] shrink-0 items-center justify-center rounded-xl border border-border bg-white">
              {qr ? <img src={qr} alt="QR code to add Nova to your authenticator app" width={216} height={216} /> : <span className="text-xs text-content-muted">Loading…</span>}
            </div>
          </div>
          {setup && (
            <details className="mt-3 text-content-muted">
              <summary className="cursor-pointer text-xs">Can't scan? Enter the key by hand</summary>
              <div className="mt-2 flex items-center gap-2">
                <code className="break-all rounded-lg bg-surface-raised px-2 py-1 font-mono text-xs text-content">{setup.secret.match(/.{1,4}/g)?.join(" ")}</code>
                <button type="button" className="btn-ghost rounded-lg p-2" aria-label="Copy the key" onClick={() => copy(setup.secret, "key")}>
                  {copied === "key" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </button>
              </div>
            </details>
          )}
        </li>
        <li>
          <form onSubmit={onConfirm}>
            <p className="font-medium">2. Enter the 6-digit code the app shows</p>
            <div className="mt-3">
              <OtpInput
                value={code}
                onChange={(next) => {
                  setCode(next);
                  if (next.length === 6 && !loading && setup) void confirm(next);
                }}
                disabled={loading || !setup}
              />
            </div>
            {error && <p className="auth-error mt-3" role="alert">{error}</p>}
            <button type="submit" className="btn-primary mt-4 w-full py-2.5" disabled={loading || code.length !== 6 || !setup}>
              {loading ? "Checking…" : "Confirm and continue"}
            </button>
          </form>
        </li>
      </ol>

      <Link to="/login" className="auth-footnote mt-6 block hover:text-content" onClick={() => clearOtpSession()}>
        Back to sign in
      </Link>
    </AuthShell>
  );
}
