import { ReactNode } from "react";

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`border border-ink-800 bg-ink-900/50 rounded-sm ${className}`}
    >
      {children}
    </div>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="text-[0.65rem] uppercase tracking-[0.2em] text-ink-500 mb-3 font-medium">
      {children}
    </div>
  );
}

export function Button({
  children,
  onClick,
  disabled,
  variant = "primary",
  type = "button",
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "ghost" | "danger";
  type?: "button" | "submit";
  className?: string;
}) {
  const styles = {
    primary:
      "bg-signal-green text-ink-950 hover:bg-signal-green/90 font-semibold",
    ghost:
      "border border-ink-700 text-ink-100 hover:border-ink-500 hover:bg-ink-900",
    danger: "bg-signal-red/10 border border-signal-red/40 text-signal-red hover:bg-signal-red/20",
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`px-4 py-2.5 text-sm rounded-sm transition-colors ${styles[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

export function Stat({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "positive" | "negative" | "warn";
}) {
  const tones = {
    neutral: "text-ink-50",
    positive: "text-signal-green",
    negative: "text-signal-red",
    warn: "text-signal-amber",
  };
  return (
    <div>
      <div className="text-[0.65rem] uppercase tracking-[0.2em] text-ink-500 mb-1">
        {label}
      </div>
      <div className={`font-mono text-lg tabular ${tones[tone]}`}>{value}</div>
    </div>
  );
}

export function Pill({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "positive" | "negative" | "warn" | "grade-a" | "grade-b" | "grade-c" | "grade-skip";
}) {
  const tones = {
    neutral: "bg-ink-800 text-ink-200",
    positive: "bg-signal-green/15 text-signal-green border border-signal-green/30",
    negative: "bg-signal-red/15 text-signal-red border border-signal-red/30",
    warn: "bg-signal-amber/15 text-signal-amber border border-signal-amber/30",
    "grade-a": "bg-signal-green text-ink-950 font-semibold",
    "grade-b": "bg-signal-blue/20 text-signal-blue border border-signal-blue/40",
    "grade-c": "bg-signal-amber/15 text-signal-amber border border-signal-amber/30",
    "grade-skip": "bg-ink-800 text-ink-500 line-through",
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-sm text-xs uppercase tracking-wider ${tones[tone]}`}
    >
      {children}
    </span>
  );
}
