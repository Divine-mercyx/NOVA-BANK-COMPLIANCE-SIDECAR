import { ArrowRight, CheckCircle2, Database, FileOutput, Layers, UploadCloud } from "lucide-react";
import { Link } from "react-router-dom";

const steps = [
  {
    icon: UploadCloud,
    title: "Extract",
    description: "Pull transactions from Finacle read-replica across all payment channels.",
    href: "/extraction",
  },
  {
    icon: Layers,
    title: "Transform",
    description: "Validate records and map them to NFIU compliance standards.",
    href: "/quality",
  },
  {
    icon: Database,
    title: "Stage",
    description: "Load clean data into the isolated PostgreSQL warehouse.",
    href: "/quality",
  },
  {
    icon: FileOutput,
    title: "Report",
    description: "Generate CTR, FTR, and PEP files for regulator review.",
    href: "/reports",
  },
];

export function PipelineStory({ activeStep = 0 }: { activeStep?: number }) {
  return (
    <div className="card overflow-hidden">
      <div className="border-b border-border px-6 py-4">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">How it works</p>
        <h3 className="mt-1 font-display text-xl text-content">From Finacle to NFIU submission</h3>
        <p className="mt-1 text-sm text-content-muted">
          Every transaction follows a controlled path — extract, validate, stage, then report.
        </p>
      </div>
      <div className="grid gap-0 md:grid-cols-4">
        {steps.map((step, index) => {
          const done = index < activeStep;
          const active = index === activeStep;
          const Icon = step.icon;
          return (
            <Link
              key={step.title}
              to={step.href}
              className={`group border-b border-border p-5 transition md:border-b-0 md:border-r last:md:border-r-0 ${
                active ? "bg-brand-muted/40" : "hover:bg-surface-overlay/50"
              }`}
            >
              <div className="mb-3 flex items-center gap-2">
                <div
                  className={`rounded-lg p-2 ${
                    done
                      ? "bg-success/10 text-success"
                      : active
                        ? "bg-brand/15 text-brand"
                        : "bg-surface-overlay text-content-muted"
                  }`}
                >
                  {done ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                </div>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-content-subtle">
                  Step {index + 1}
                </span>
              </div>
              <h4 className="font-semibold text-content">{step.title}</h4>
              <p className="mt-2 text-xs leading-relaxed text-content-muted">{step.description}</p>
              <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-brand opacity-0 transition group-hover:opacity-100">
                View <ArrowRight className="h-3 w-3" />
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
