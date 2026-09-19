import type { ReactNode } from "react";
import { Loader2, Shield } from "lucide-react";
import { motion } from "motion/react";
import {
  accentForeground,
  COLOR_SCHEMES,
  fadeUp,
  motionEase,
  PRIMARY_SCHEMES,
  SCHEME_HEX,
  type ColorSchemeId,
  stagger,
} from "../../lib/theme";

export function BrandMark({
  letter = "S",
  color = "#c5cad3",
  size = 56,
}: {
  letter?: string;
  color?: string;
  size?: number;
}) {
  const fg = accentForeground(color);
  return (
    <div className="relative mx-auto" style={{ width: size, height: size }}>
      <div
        className="rounded-2xl flex items-center justify-center font-semibold tracking-tight shadow-lg"
        style={{
          width: size,
          height: size,
          background: color,
          color: fg,
          fontSize: size * 0.38,
          borderRadius: Math.max(12, size * 0.28),
        }}
      >
        {letter.slice(0, 1).toUpperCase()}
      </div>
      <div
        className="absolute -bottom-1 -right-1 rounded-md border flex items-center justify-center"
        style={{
          width: size * 0.34,
          height: size * 0.34,
          background: "var(--bg-elevated)",
          borderColor: "var(--border)",
          color: "var(--fg-muted)",
        }}
      >
        <Shield size={size * 0.16} />
      </div>
    </div>
  );
}

export function AuthScreen({
  mark,
  title,
  subtitle,
  children,
  footer,
}: {
  mark: ReactNode;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(900px 420px at 50% -8%, color-mix(in oklab, var(--accent) 14%, transparent), transparent 58%)",
        }}
      />
      <motion.div
        initial="hidden"
        animate="visible"
        variants={stagger}
        className="relative z-10 w-full max-w-md"
      >
        <motion.div
          variants={fadeUp}
          className="border bg-[var(--bg-elevated)]/95 backdrop-blur-xl p-8 sm:p-10 text-center space-y-6 shadow-2xl"
          style={{ borderColor: "var(--border)", borderRadius: "var(--radius-xl)" }}
        >
          {mark}
          <div>
            <h1 className="text-2xl font-semibold tracking-tight" style={{ letterSpacing: "-0.03em" }}>
              {title}
            </h1>
            {subtitle && (
              <p className="mt-1.5 text-xs font-medium" style={{ color: "var(--fg-muted)" }}>
                {subtitle}
              </p>
            )}
          </div>
          {children}
          {footer}
        </motion.div>
      </motion.div>
    </div>
  );
}

export function ScreenLoader({ label = "Loading" }: { label?: string }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3" style={{ color: "var(--fg-subtle)" }}>
      <Loader2 className="animate-spin" size={22} />
      <p className="text-xs tracking-wide uppercase">{label}</p>
    </div>
  );
}

export function PageIntro({
  kicker,
  title,
  description,
  actions,
}: {
  kicker?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <motion.header
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: motionEase }}
      className="flex flex-col sm:flex-row sm:items-end justify-between gap-4"
    >
      <div>
        {kicker && (
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] mb-2" style={{ color: "var(--fg-subtle)" }}>
            {kicker}
          </p>
        )}
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight" style={{ letterSpacing: "-0.03em" }}>
          {title}
        </h1>
        {description && (
          <p className="mt-1.5 text-sm max-w-xl" style={{ color: "var(--fg-muted)" }}>
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
    </motion.header>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  delay = 0,
}: {
  label: string;
  value: string;
  hint?: string;
  icon?: ReactNode;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: motionEase }}
      className="surface-quiet p-5"
    >
      <div className="flex items-start justify-between mb-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--fg-subtle)" }}>
          {label}
        </p>
        {icon && (
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: "color-mix(in oklab, var(--accent) 12%, transparent)", color: "var(--accent)" }}
          >
            {icon}
          </div>
        )}
      </div>
      <p className="text-2xl sm:text-3xl font-semibold tracking-tight num">{value}</p>
      {hint && (
        <p className="text-xs mt-1.5" style={{ color: "var(--fg-subtle)" }}>
          {hint}
        </p>
      )}
    </motion.div>
  );
}

export function PrimaryButton({
  children,
  className = "",
  color,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { color?: string }) {
  const bg = color || "var(--accent)";
  const fg = color ? accentForeground(color) : "var(--accent-fg)";
  return (
    <button
      {...props}
      className={`w-full py-3.5 px-4 font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50 min-h-11 ${className}`}
      style={{
        background: bg,
        color: fg,
        borderRadius: "var(--radius-md)",
      }}
    >
      {children}
    </button>
  );
}

export function GhostButton({
  children,
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`w-full py-3 px-4 font-semibold text-sm flex items-center justify-center gap-2 border disabled:opacity-50 min-h-11 ${className}`}
      style={{
        background: "color-mix(in oklab, var(--fg) 6%, transparent)",
        borderColor: "var(--border)",
        borderRadius: "var(--radius-md)",
      }}
    >
      {children}
    </button>
  );
}

export function SchemeSwatches({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: ColorSchemeId, hex: string) => void;
}) {
  const current = COLOR_SCHEMES.find((s) => s.id === value) || COLOR_SCHEMES[0];
  const extras = COLOR_SCHEMES.filter((s) => !PRIMARY_SCHEMES.some((p) => p.id === s.id));
  return (
    <div className="space-y-3">
      <input type="hidden" name="colorScheme" value={current.id} />
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {PRIMARY_SCHEMES.map((s) => {
          const selected = s.id === current.id;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onChange(s.id, s.hex)}
              className="text-left p-3 min-h-11 border transition-colors"
              style={{
                borderRadius: "var(--radius-md)",
                borderColor: selected ? s.hex : "var(--border)",
                background: selected ? `${s.hex}18` : "color-mix(in oklab, var(--fg) 3%, transparent)",
                boxShadow: selected ? `0 0 0 1px ${s.hex}` : undefined,
              }}
            >
              <span className="flex items-center gap-2.5">
                <span className="w-5 h-5 rounded-full shrink-0 border" style={{ background: s.hex, borderColor: "var(--border)" }} />
                <span>
                  <span className="block text-sm font-semibold leading-tight">{s.label}</span>
                  <span className="block text-[11px]" style={{ color: "var(--fg-subtle)" }}>{s.description}</span>
                </span>
              </span>
            </button>
          );
        })}
      </div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--fg-subtle)" }}>
        Legacy
      </p>
      <div className="flex flex-wrap gap-2">
        {extras.map((s) => {
          const selected = s.id === current.id;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onChange(s.id, s.hex)}
              className="px-3 py-2 min-h-11 text-xs font-medium border flex items-center gap-2"
              style={{
                borderRadius: "var(--radius-sm)",
                borderColor: selected ? s.hex : "var(--border)",
                background: selected ? `${s.hex}18` : "transparent",
              }}
            >
              <span className="w-3 h-3 rounded-full" style={{ background: s.hex }} />
              {s.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export { SCHEME_HEX };
