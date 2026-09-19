import { Activity, Building2, Users, ArrowUpRight, Search, Loader2, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { format } from "date-fns";
import { PageIntro, StatCard } from "../components/ui/chrome";

export function Overview() {
  const [statsData, setStatsData] = useState({
    bankCount: 0,
    userCount: 0,
    onyxProcessedCents: 0,
    totalPlatformVolumeCents: 0,
    timeline: [] as any[],
  });
  const [recentTransactions, setRecentTransactions] = useState<any[]>([]);
  const [corpSearchQuery, setCorpSearchQuery] = useState("");
  const [corpSearchResult, setCorpSearchResult] = useState<number | null>(null);
  const [corpSearchLoading, setCorpSearchLoading] = useState(false);
  const [corpSearchError, setCorpSearchError] = useState("");

  const handleCorpSearch = async () => {
    if (!corpSearchQuery.trim()) return;
    setCorpSearchLoading(true);
    setCorpSearchResult(null);
    setCorpSearchError("");
    try {
      const res = await fetch(`/api/banks/corp-finder?query=${encodeURIComponent(corpSearchQuery)}`);
      const data = await res.json();
      if (res.ok && data.searchResults && data.searchResults.length > 0) {
        setCorpSearchResult(data.searchResults[0].corpId);
      } else {
        setCorpSearchError("No matching Corporation found in registry.");
      }
    } catch (e) {
      setCorpSearchError("Failed to search database.");
    } finally {
      setCorpSearchLoading(false);
    }
  };

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch("/api/stats");
        if (!res.ok || !res.headers.get("content-type")?.includes("application/json")) return;
        setStatsData(await res.json());
      } catch (e) {
        console.error("Stats fetch error:", e);
      }
    };
    const fetchTransactions = async () => {
      try {
        const res = await fetch("/api/transactions/recent");
        if (!res.ok || !res.headers.get("content-type")?.includes("application/json")) return;
        const data = await res.json();
        setRecentTransactions(data.slice(0, 10));
      } catch (e) {
        console.error("Transactions fetch error:", e);
      }
    };
    fetchStats();
    fetchTransactions();
  }, []);

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(val / 100);
  const formatNumber = (val: number) => new Intl.NumberFormat("en-US").format(val);

  return (
    <div className="max-w-6xl space-y-8">
      <PageIntro
        kicker="Network"
        title="Platform overview"
        description="Live volume, tenants, and clearinghouse activity across Slate."
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 stagger-in">
        <StatCard label="Active banks" value={formatNumber(statsData.bankCount)} hint="Connected tenants" icon={<Building2 size={16} />} delay={0} />
        <StatCard label="Platform volume" value={formatCurrency(statsData.totalPlatformVolumeCents)} hint="All processed funds" icon={<Activity size={16} />} delay={0.05} />
        <StatCard label="Onyx processed" value={formatCurrency(statsData.onyxProcessedCents)} hint="Cross-bank rails" icon={<ArrowUpRight size={16} />} delay={0.1} />
        <StatCard label="Open accounts" value={formatNumber(statsData.userCount)} hint="Across the network" icon={<Users size={16} />} delay={0.15} />
      </div>

      <div className="surface-quiet p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: "color-mix(in oklab, var(--accent) 14%, transparent)", color: "var(--accent)" }}>
            <Search size={18} />
          </div>
          <div>
            <h2 className="font-semibold">Corp ID finder</h2>
            <p className="text-sm" style={{ color: "var(--fg-muted)" }}>Look up a registered CityCorp corporation.</p>
          </div>
        </div>
        <div className="flex flex-col md:flex-row items-end gap-4 max-w-3xl">
          <div className="flex-1 w-full">
            <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] mb-2" style={{ color: "var(--fg-subtle)" }}>
              Corporation name
            </label>
            <input
              type="text"
              value={corpSearchQuery}
              onChange={(e) => setCorpSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCorpSearch()}
              placeholder="Exact or partial name"
              className="w-full border rounded-xl px-4 py-2.5 text-sm"
              style={{ background: "var(--bg)", borderColor: "var(--border)" }}
            />
          </div>
          <button
            onClick={handleCorpSearch}
            disabled={corpSearchLoading || !corpSearchQuery.trim()}
            className="w-full md:w-auto px-6 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2 h-[42px]"
            style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
          >
            {corpSearchLoading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
            Find ID
          </button>
        </div>
        {corpSearchResult !== null && (
          <div className="mt-4 p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between max-w-3xl gap-4" style={{ background: "color-mix(in oklab, var(--ok) 10%, transparent)", borderColor: "color-mix(in oklab, var(--ok) 25%, transparent)" }}>
            <div>
              <p className="font-medium text-sm" style={{ color: "var(--ok)" }}>Corporation found</p>
              <p className="text-xs mt-1" style={{ color: "var(--fg-muted)" }}>Corporation ID</p>
            </div>
            <div className="text-3xl font-mono font-semibold num px-6 py-2 rounded-lg border text-center" style={{ background: "var(--bg)", borderColor: "var(--border)" }}>
              {corpSearchResult}
            </div>
          </div>
        )}
        {corpSearchError && (
          <div className="mt-4 p-3 rounded-xl border flex items-center gap-2 text-sm max-w-3xl" style={{ color: "var(--danger)", background: "color-mix(in oklab, var(--danger) 10%, transparent)", borderColor: "color-mix(in oklab, var(--danger) 25%, transparent)" }}>
            <XCircle size={16} />
            {corpSearchError}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 surface-quiet p-6 h-[400px] flex flex-col">
          <h3 className="font-medium text-sm" style={{ color: "var(--fg-muted)" }}>Platform volume · 30 days</h3>
          <div className="flex-1 mt-6 text-sm">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={statsData.timeline} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorVolume" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#c5cad3" stopOpacity={0.28} />
                    <stop offset="95%" stopColor="#c5cad3" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(244,244,245,0.06)" vertical={false} />
                <XAxis
                  dataKey="date"
                  stroke="rgba(244,244,245,0.25)"
                  tickFormatter={(val: any) => {
                    try { return format(new Date(val), "MMM d"); } catch { return String(val); }
                  }}
                  tick={{ fill: "rgba(244,244,245,0.45)", fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                  dy={10}
                />
                <YAxis
                  stroke="rgba(244,244,245,0.25)"
                  tickFormatter={(val) => `$${val}`}
                  tick={{ fill: "rgba(244,244,245,0.45)", fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  contentStyle={{ backgroundColor: "#111114", border: "1px solid rgba(244,244,245,0.1)", borderRadius: "12px" }}
                  labelFormatter={(val: any) => {
                    try { return val ? format(new Date(val), "MMM d, yyyy") : ""; } catch { return String(val); }
                  }}
                  formatter={(value: any) => [`$${value}`, "Volume"]}
                />
                <Area type="monotone" dataKey="volume" stroke="#c5cad3" strokeWidth={2} fillOpacity={1} fill="url(#colorVolume)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="surface-quiet p-6 h-[400px] flex flex-col">
          <h3 className="font-medium text-sm" style={{ color: "var(--fg-muted)" }}>Live ledger</h3>
          <div className="mt-4 space-y-2 overflow-y-auto pr-1">
            {recentTransactions.length === 0 ? (
              <p className="text-xs" style={{ color: "var(--fg-subtle)" }}>No transactions yet.</p>
            ) : (
              recentTransactions.map((tx, i) => (
                <div key={tx.id || i} className="flex justify-between items-center p-3 rounded-xl border" style={{ background: "var(--bg)", borderColor: "var(--border)" }}>
                  <div className="min-w-0 flex-1 mr-3">
                    <p className="text-xs font-mono truncate" style={{ color: "var(--fg-muted)" }}>
                      {tx.type} · {tx.bankName || "Unknown"}
                    </p>
                    <p className="text-[11px] truncate" style={{ color: "var(--fg-subtle)" }}>{tx.description || "—"}</p>
                  </div>
                  <p className={`text-sm font-mono font-medium num ${tx.type === "deposit" || tx.type === "onyx_payment" ? "text-emerald-400" : ""}`}>
                    {tx.type === "deposit" || tx.type === "onyx_payment" ? "+" : "−"}{formatCurrency(tx.amount || 0)}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
