import { AlertCircle, ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";

export function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center page-enter">
      <div
        className="w-16 h-16 border rounded-2xl flex items-center justify-center mb-6"
        style={{
          background: "color-mix(in oklab, var(--danger) 12%, transparent)",
          borderColor: "color-mix(in oklab, var(--danger) 25%, transparent)",
          color: "var(--danger)",
        }}
      >
        <AlertCircle size={28} />
      </div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] mb-2" style={{ color: "var(--fg-subtle)" }}>
        404
      </p>
      <h1 className="text-3xl font-semibold tracking-tight mb-2">Page not found</h1>
      <p className="text-sm max-w-md mb-8" style={{ color: "var(--fg-muted)" }}>
        That route does not exist, or the portal resource has moved.
      </p>
      <Link
        to="/"
        className="btn-accent inline-flex items-center gap-2 min-h-11 px-5 py-2.5 text-sm"
      >
        <ArrowLeft size={16} /> Return home
      </Link>
    </div>
  );
}
