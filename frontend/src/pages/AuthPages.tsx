import { AlertCircle, ArrowLeft, CheckCircle2, Eye, EyeOff, LockKeyhole, Mail, UserRound } from "lucide-react";
import { AnimatePresence, motion, type Variants } from "motion/react";
import { FormEvent, type KeyboardEvent, type ReactNode, useEffect, useState } from "react";
import { Link, Navigate, useLocation, useNavigate, useOutlet } from "react-router-dom";
import { FieldToggle, PrimaryButton } from "../components/auth/AuthControls";
import { Field } from "../components/auth/Field";
import { OtpInput } from "../components/auth/OtpInput";
import { ArrowField } from "../components/ArrowField";
import { AnimatedAlert } from "../components/motion";
import { useAuth } from "../lib/auth";
import { useKeyboardAwareLayout } from "../lib/keyboard";
import { ENTRANCE, spring } from "../lib/motion";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const isEmail = (v: string) => EMAIL_RE.test(v.trim());

/** Native-feeling attributes for an email/username field: email keyboard, no auto-capitalise. */
const EMAIL_INPUT = {
  type: "email",
  name: "email",
  inputMode: "email",
  autoComplete: "username",
  autoCapitalize: "none",
  autoCorrect: "off",
  spellCheck: false,
  enterKeyHint: "next",
} as const;

/** Same functional entrance as the rest of the app: a 0.2s linear fade with a 10px rise. */
const viewVariants: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: ENTRANCE },
  exit: { opacity: 0, transition: { duration: 0.1, ease: "linear" } },
};

/** The twelve-spoke compass from the original sign-in, drawn in currentColor. */
function Compass({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} fill="currentColor" aria-hidden>
      <circle cx="16" cy="16" r="3" />
      {Array.from({ length: 12 }).map((_, i) => {
        const a = (i * Math.PI) / 6;
        return (
          <line
            key={i}
            x1={16 + Math.cos(a) * 6}
            y1={16 + Math.sin(a) * 6}
            x2={16 + Math.cos(a) * 11}
            y2={16 + Math.sin(a) * 11}
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        );
      })}
    </svg>
  );
}

/** White lockup for the navy panel: the original outlined compass with the product name. */
function Lockup() {
  return (
    <div className="flex items-center gap-3">
      <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-white/5 text-white">
        <Compass className="h-5 w-5" />
      </span>
      <div className="leading-tight">
        <p className="text-base font-semibold tracking-tight text-white">Nova Bank</p>
        <p className="text-sm text-white/65">Compliance portal</p>
      </div>
    </div>
  );
}

const heroItem: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: (i: number) => ({ opacity: 1, y: 0, transition: { ...ENTRANCE, duration: 0.35, delay: 0.12 + i * 0.08 } }),
};

/**
 * Shell for every auth route: a split card with the cobalt arrow field on the left and the white
 * form on the right, on the app's light canvas. The card is sized by its content, so nothing scrolls inside
 * it; on a very short screen the page scrolls instead. Only the form view swaps between steps.
 */
export function AuthLayout() {
  const outlet = useOutlet();
  const { pathname } = useLocation();
  useKeyboardAwareLayout();

  // The block-by-block rise runs only while a step first appears, so later additions
  // (an error notice, the Caps Lock hint) show immediately instead of waiting on a delay.
  const [entering, setEntering] = useState(true);
  useEffect(() => {
    setEntering(true);
    const timer = window.setTimeout(() => setEntering(false), 1100);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  return (
    <div className="auth-shell">
      {/* Full-screen arrow field behind the card, washing out to the page canvas at the bottom. */}
      <div className="auth-canvas" aria-hidden>
        <ArrowField className="h-full w-full" fadeTo="#F8FAFC" fadeStart={0.55} glowAt={{ x: 0.5, y: 0.32 }} followPointer />
      </div>

      <motion.div
        className="relative z-10 grid w-full max-w-[52rem] grid-cols-12 overflow-hidden rounded-xl bg-white shadow-[0_0_0_1px_rgba(255,255,255,0.7),0_1px_2px_rgba(15,23,42,0.06),0_40px_80px_-28px_rgba(8,25,77,0.5)] ring-1 ring-inset ring-slate-900/[0.04]"
        initial={{ opacity: 0, y: 28, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 180, damping: 24, mass: 0.9 }}
      >
        <aside className="col-span-12 hidden lg:col-span-5 lg:block">
          <ArrowField className="h-full" glowAt={{ x: 0.5, y: 0.42 }} followPointer>
            <div className="p-10 xl:p-12">
              <motion.div custom={0} variants={heroItem} initial="hidden" animate="visible">
                <Lockup />
              </motion.div>
            </div>
          </ArrowField>
        </aside>

        <main className="col-span-12 flex flex-col lg:col-span-7">
          {/* Below lg the arrow field collapses into a slim band so the brand still leads. */}
          <ArrowField variant="solid" glowAt={{ x: 0.85, y: 0.5 }} className="auth-band px-6 py-4 sm:px-12 lg:hidden">
            <Lockup />
          </ArrowField>
          <div className="auth-form-area flex flex-1 flex-col justify-center px-6 py-8 sm:px-12 sm:py-10">
            <div className="mx-auto w-full max-w-md">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div key={pathname} className={entering ? "auth-stagger" : undefined} variants={viewVariants} initial="hidden" animate="visible" exit="exit">
                  {outlet}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </main>
      </motion.div>
    </div>
  );
}

function Heading({
  eyebrow,
  step,
  title,
  children,
}: {
  eyebrow: string;
  /** [current, total] for the two-step sign-in; draws a segmented tracker. */
  step?: [number, number];
  title: string;
  children: ReactNode;
}) {
  return (
    <header>
      <div className="auth-eyebrow mb-4 flex items-center gap-3">
        {step && (
          <div className="flex gap-1" aria-hidden>
            {Array.from({ length: step[1] }).map((_, i) => (
              <span key={i} className="h-1 w-6 overflow-hidden rounded-full bg-slate-200">
                {i < step[0] && (
                  <motion.span
                    className="block h-full w-full origin-left rounded-full bg-brand"
                    initial={{ scaleX: i === step[0] - 1 ? 0 : 1 }}
                    animate={{ scaleX: 1 }}
                    transition={{ duration: 0.5, delay: 0.25, ease: [0.22, 1, 0.36, 1] }}
                  />
                )}
              </span>
            ))}
          </div>
        )}
        <p className="caps-label">{step ? `Step ${step[0]} of ${step[1]} · ${eyebrow}` : eyebrow}</p>
      </div>
      <h1 className="text-[28px] font-bold leading-tight tracking-tight text-content">{title}</h1>
      <p className="mt-2 text-[15px] leading-6 text-content-muted">{children}</p>
    </header>
  );
}

function BackLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:text-brand-hover">
      <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
      {children}
    </Link>
  );
}

/** Inline banner for form-level errors / confirmations. */
function Notice({ show, tone, children }: { show: boolean; tone: "error" | "success"; children: ReactNode }) {
  const Icon = tone === "error" ? AlertCircle : CheckCircle2;
  return (
    <AnimatedAlert
      show={show}
      role={tone === "error" ? "alert" : "status"}
      className={`flex gap-2.5 rounded-lg border px-3.5 py-2.5 text-sm leading-[1.375rem] ${
        tone === "error" ? "border-danger/40 bg-danger/10 text-danger" : "border-success/40 bg-emerald-50 text-emerald-700"
      }`}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <span>{children}</span>
    </AnimatedAlert>
  );
}

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [emailTouched, setEmailTouched] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const emailValid = isEmail(email);
  const emailError = emailTouched && email.length > 0 && !emailValid ? "Enter a valid email address, like name@novabank.ng." : "";

  const trackCaps = (e: KeyboardEvent<HTMLInputElement>) => setCapsLock(e.getModifierState("CapsLock"));

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (!emailValid) {
      setEmailTouched(true);
      if (!email) setError("Enter your work email and password.");
      document.getElementById("email")?.focus();
      return;
    }
    setLoading(true);
    try {
      const result = await login(email.trim(), password);
      navigate("/verify-otp", { state: { otpSessionId: result.otp_session_id, email: email.trim() } });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed. Try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Heading eyebrow="Secure sign-in" step={[1, 2]} title="Welcome back">
        Sign in with your Nova Bank work account. You&apos;ll confirm with a one-time code next.
      </Heading>

      <form onSubmit={onSubmit} noValidate className="mt-6 space-y-5">
        <Field
          {...EMAIL_INPUT}
          id="email"
          label="Work email"
          leading={<Mail className="h-4 w-4" />}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onBlur={() => setEmailTouched(true)}
          placeholder="name@novabank.ng"
          error={emailError}
          valid={emailValid}
          required
        />
        <Field
          id="password"
          placeholder="Enter your password"
          leading={<LockKeyhole className="h-4 w-4" />}
          label="Password"
          name="password"
          type={showPassword ? "text" : "password"}
          autoComplete="current-password"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="go"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={trackCaps}
          onKeyUp={trackCaps}
          onBlur={() => setCapsLock(false)}
          warning={capsLock ? "Caps Lock is on." : undefined}
          required
          trailing={
            <FieldToggle
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              aria-pressed={showPassword}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </FieldToggle>
          }
        />

        <div className="flex justify-end">
          <Link to="/forgot-password" className="text-sm font-medium text-brand hover:text-brand-hover">
            Forgot password?
          </Link>
        </div>

        <Notice show={Boolean(error)} tone="error">
          {error}
        </Notice>

        <PrimaryButton type="submit" disabled={loading}>
          {loading ? "Signing in…" : "Sign in"}
        </PrimaryButton>
      </form>

    </>
  );
}

export function OtpPage() {
  const { verifyOtp } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const state = location.state as { otpSessionId?: string; email?: string } | null;
  const otpSessionId = state?.otpSessionId;
  const email = state?.email;

  if (!otpSessionId) return <Navigate to="/login" replace />;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await verifyOtp(otpSessionId, code);
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "That code was not accepted. Try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Heading eyebrow="Verify it's you" step={[2, 2]} title="Enter your code">
        We generated a 6-digit code for <span className="font-medium text-content">{email}</span>.
      </Heading>

      <form onSubmit={onSubmit} className="mt-6 space-y-5">
        <div>
          <label htmlFor="otp" className="label">
            One-time password
          </label>
          <OtpInput
            id="otp"
            value={code}
            invalid={Boolean(error)}
            disabled={loading}
            describedBy={error ? "otp-error" : undefined}
            onChange={(next) => {
              setCode(next);
              if (error) setError("");
            }}
          />
        </div>

        <div id="otp-error">
          <Notice show={Boolean(error)} tone="error">
            {error}
          </Notice>
        </div>

        <PrimaryButton type="submit" disabled={loading || code.length !== 6}>
          {loading ? "Verifying…" : "Verify and continue"}
        </PrimaryButton>
      </form>

      <div className="mt-6">
        <BackLink to="/login">Back to sign in</BackLink>
      </div>
    </>
  );
}

/**
 * There is no self-service reset endpoint: an admin sets a new password from Team → Edit member.
 * This view says so plainly instead of pretending to send an email.
 */
export function ForgotPasswordPage() {
  const steps = [
    "Ask a compliance administrator to reset your password.",
    "They open Team, choose Edit on your profile and set a new temporary password.",
    "Sign in with the temporary password, then enter your one-time code.",
  ];
  return (
    <>
      <Heading eyebrow="Account help" title="Reset your password">
        Passwords are reset by an administrator. There is no emailed link.
      </Heading>

      <ol className="mt-6 space-y-4">
        {steps.map((text, i) => (
          <li key={text} className="flex items-start gap-3 rounded-lg border border-border bg-slate-50 px-3.5 py-3 text-sm text-content-muted">
            <span
              className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand font-mono text-xs font-bold text-white"
              aria-hidden
            >
              {i + 1}
            </span>
            <span>{text}</span>
          </li>
        ))}
      </ol>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <BackLink to="/login">Back to sign in</BackLink>
        <Link to="/request-access" className="text-sm font-medium text-brand hover:text-brand-hover">
          Need an account instead?
        </Link>
      </div>
    </>
  );
}

const ROLE_OPTIONS = [
  { id: "viewer", label: "Viewer", hint: "Read-only access" },
  { id: "analyst", label: "Analyst", hint: "Run Finacle extraction" },
  { id: "approver", label: "Approver", hint: "Review staged data" },
] as const;

/**
 * Accounts are created by an admin (Team → Add member); there is no self-registration API. So
 * this view helps you ask for one: it writes a ready-to-send request and copies it. Nothing is
 * stored or submitted anywhere.
 */
export function RequestAccessPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [emailTouched, setEmailTouched] = useState(false);
  const [role, setRole] = useState<(typeof ROLE_OPTIONS)[number]["id"]>("analyst");
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");

  const emailValid = isEmail(email);
  const emailError = emailTouched && email.length > 0 && !emailValid ? "Enter a valid email address, like name@novabank.ng." : "";
  const ready = name.trim().length > 1 && emailValid;
  const roleLabel = ROLE_OPTIONS.find((r) => r.id === role)?.label ?? role;

  const onKeyDownRole = (e: KeyboardEvent) => {
    const i = ROLE_OPTIONS.findIndex((r) => r.id === role);
    if (e.key === "ArrowRight" || e.key === "ArrowDown") setRole(ROLE_OPTIONS[(i + 1) % ROLE_OPTIONS.length].id);
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp")
      setRole(ROLE_OPTIONS[(i - 1 + ROLE_OPTIONS.length) % ROLE_OPTIONS.length].id);
    else return;
    e.preventDefault();
  };

  const onCopy = async (e: FormEvent) => {
    e.preventDefault();
    setCopyError("");
    const text = `Please create a Nova Bank Compliance account for ${name.trim()} (${email.trim()}) with the ${roleLabel} role.`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 3500);
    } catch {
      setCopyError("Could not access the clipboard. Send your name, email and role to your administrator instead.");
    }
  };

  return (
    <>
      <Heading eyebrow="New here?" title="Request an account">
        An administrator creates accounts. Fill this in and copy a ready-made request to send them.
      </Heading>

      <form onSubmit={onCopy} noValidate className="mt-6 space-y-5">
        <Field
          label="Full name"
          leading={<UserRound className="h-4 w-4" />}
          name="name"
          autoComplete="name"
          autoCapitalize="words"
          enterKeyHint="next"
          placeholder="Ada Okafor"
          value={name}
          onChange={(e) => setName(e.target.value)}
          valid={name.trim().length > 1}
          required
        />
        <Field
          {...EMAIL_INPUT}
          autoComplete="email"
          enterKeyHint="done"
          label="Work email"
          leading={<Mail className="h-4 w-4" />}
          placeholder="name@novabank.ng"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onBlur={() => setEmailTouched(true)}
          error={emailError}
          valid={emailValid}
          required
        />

        <div>
          <p id="role-label" className="label">
            Role you need
          </p>
          <div role="radiogroup" aria-labelledby="role-label" onKeyDown={onKeyDownRole} className="grid grid-cols-12 gap-2">
            {ROLE_OPTIONS.map((r) => {
              const selected = r.id === role;
              return (
                <motion.button
                  key={r.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => setRole(r.id)}
                  whileTap={{ scale: 0.98 }}
                  transition={spring}
                  className={`col-span-4 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                    selected
                      ? "border-brand bg-brand-muted"
                      : "border-[rgb(var(--input-border))] bg-white hover:border-border-strong"
                  }`}
                >
                  <span className="block text-sm font-semibold text-content">{r.label}</span>
                  <span className="mt-0.5 block text-xs leading-4 text-content-muted">{r.hint}</span>
                </motion.button>
              );
            })}
          </div>
        </div>

        <Notice show={Boolean(copyError)} tone="error">
          {copyError}
        </Notice>
        <Notice show={copied} tone="success">
          Request copied. Paste it to your compliance administrator.
        </Notice>

        <PrimaryButton type="submit" disabled={!ready}>
          {copied ? "Copied" : "Copy request"}
        </PrimaryButton>
      </form>

      <div className="mt-6">
        <BackLink to="/login">Back to sign in</BackLink>
      </div>
    </>
  );
}
