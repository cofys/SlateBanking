import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { Building2, Coins, Landmark, RefreshCw, Wallet } from "lucide-react";
import { formatMoney } from "../lib/utils";
import { PageIntro, StatCard } from "../components/ui/chrome";

function NamedBalance({ label, row }: { label: string; row: { name: string; balance: number | null; missing?: boolean } | null }) {
  if (!row) {
    return (
      <div className="surface p-5">
        <p className="text-[11px] uppercase tracking-wider" style={{ color: "var(--fg-subtle)" }}>{label}</p>
        <p className="text-sm mt-2" style={{ color: "var(--fg-muted)" }}>Not set</p>
        <p className="text-[11px] mt-1" style={{ color: "var(--fg-subtle)" }}>Configure the named CityCorp subaccount in bank settings.</p>
      </div>
    );
  }
  return (
    <div className="surface p-5">
      <p className="text-[11px] uppercase tracking-wider" style={{ color: "var(--fg-subtle)" }}>{label}</p>
      <p className="text-lg font-semibold mt-1 font-mono">{row.balance == null ? "—" : formatMoney(row.balance)}</p>
      <p className="text-[11px] mt-1 font-mono" style={{ color: row.missing ? "var(--warn)" : "var(--fg-muted)" }}>
        {row.name}{row.missing ? " · missing on books" : ""}
      </p>
    </div>
  );
}

export function BankTreasury() {
  const { bankId } = useParams();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [msg, setMsg] = useState("");

  const load = async () => {
    try {
      const res = await fetch(`/api/banks/${bankId}/treasury`);
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [bankId]);

  const sync = async () => {
    setSyncing(true);
    setMsg("");
    try {
      const res = await fetch(`/api/banks/${bankId}/treasury/sync-corp-transactions`, { method: "POST" });
      const result = await res.json();
      if (res.ok) {
        setMsg(`Synced CityCorp corp history (${result.scannedCount || 0} scanned).`);
        await load();
      } else {
        setMsg(result.error || "Sync failed");
      }
    } catch (e: any) {
      setMsg(e.message || "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3" style={{ color: "var(--fg-subtle)" }}>
        <RefreshCw className="animate-spin" size={22} />
        <p className="text-xs uppercase tracking-wide">Reading CityCorp</p>
      </div>
    );
  }

  const corp = data?.corpCash || {};
  const ledger = Array.isArray(data?.recentLedger) ? data.recentLedger : [];

  return (
    <div className="max-w-6xl mx-auto space-y-8 page-enter pb-12">
      <PageIntro
        kicker="CityCorp"
        title="Treasury"
        description="Corp cash and named subaccounts from CityCorp. Client deposits are cached named accounts — transfers are not re-entered here."
        actions={
          <button
            onClick={sync}
            disabled={syncing}
            className="btn-accent min-h-11 px-5 py-2.5 text-sm flex items-center gap-2"
          >
            <RefreshCw size={15} className={syncing ? "animate-spin" : ""} />
            {syncing ? "Syncing…" : "Refresh CityCorp"}
          </button>
        }
      />

      {msg && (
        <p className="text-sm" style={{ color: "var(--fg-muted)" }}>{msg}</p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard
          label="Corp cash"
          value={corp.balance == null ? "—" : formatMoney(corp.balance)}
          hint={corp.connected ? (corp.name || "CityCorp corp wallet") : "CityCorp not connected"}
          icon={<Building2 size={16} />}
        />
        <StatCard
          label="Client books"
          value={formatMoney(data?.clientDeposits || 0)}
          hint="Named customer accounts (cached)"
          icon={<Wallet size={16} />}
        />
        <StatCard
          label="Loans outstanding"
          value={formatMoney(data?.outstandingLoans || 0)}
          hint="Active remaining principal"
          icon={<Landmark size={16} />}
        />
      </div>

      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--fg-muted)" }}>Named operating accounts</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <NamedBalance label="Operating" row={data?.operating} />
          <NamedBalance label="Loan pool" row={data?.loanPool} />
          <NamedBalance label="Fee collection" row={data?.feeAccount} />
          <NamedBalance label="Interest pool" row={data?.interestPool} />
          <NamedBalance label="Settlement" row={data?.settlement} />
        </div>
        <p className="text-[11px] mt-3 max-w-2xl" style={{ color: "var(--fg-subtle)" }}>
          Corp cash is the CityCorp corp wallet. Named accounts are subaccounts of that corp. They are not added together as a fake balance sheet — CityCorp already holds the money.
        </p>
      </div>

      <div className="surface overflow-hidden">
        <div className="p-5 border-b flex items-center gap-2" style={{ borderColor: "var(--border)" }}>
          <Coins size={16} style={{ color: "var(--accent)" }} />
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider">Recent ledger</h3>
            <p className="text-[11px]" style={{ color: "var(--fg-subtle)" }}>Synced from CityCorp. Do not post transfers onto this list.</p>
          </div>
        </div>
        {ledger.length === 0 ? (
          <p className="p-8 text-sm" style={{ color: "var(--fg-subtle)" }}>No ledger rows yet. Refresh CityCorp or wait for in-game activity.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-[11px] uppercase tracking-wider" style={{ color: "var(--fg-subtle)" }}>
                <tr>
                  <th className="px-5 py-3 font-medium">When</th>
                  <th className="px-5 py-3 font-medium">Type</th>
                  <th className="px-5 py-3 font-medium">Memo</th>
                  <th className="px-5 py-3 font-medium text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {ledger.map((tx: any) => (
                  <tr key={tx.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="px-5 py-3 whitespace-nowrap" style={{ color: "var(--fg-muted)" }}>
                      {tx.timestamp ? new Date(tx.timestamp).toLocaleString() : "—"}
                    </td>
                    <td className="px-5 py-3 capitalize">{String(tx.type || "").replace(/_/g, " ")}</td>
                    <td className="px-5 py-3 max-w-sm truncate">{tx.description || "—"}</td>
                    <td className="px-5 py-3 text-right font-mono">{formatMoney(tx.amount || 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
