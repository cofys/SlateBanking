import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { LogIn, Send } from "lucide-react";
import { useAuth } from "../lib/AuthContext";
import { formatMoney } from "../lib/utils";
import { AuthScreen, BrandMark, PrimaryButton, ScreenLoader } from "../components/ui/chrome";

export function PayLink() {
  const { linkId } = useParams();
  const { user, login, rememberMe, setRememberMe } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [linkData, setLinkData] = useState<any>(null);
  const [accounts, setAccounts] = useState<any[]>([]);

  useEffect(() => {
    fetch(`/api/citizen/payment-links/${linkId}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) setError(d.error);
        else setLinkData(d);
        setLoading(false);
      });
  }, [linkId]);

  useEffect(() => {
    if (user) {
      fetch('/api/citizen/lookup')
        .then(r => r.json())
        .then(d => {
           if (d.accounts) setAccounts(d.accounts);
        });
    }
  }, [user]);

  if (loading) return <ScreenLoader label="Opening payment" />;

  if (error || !linkData) return (
    <AuthScreen
      mark={<BrandMark letter="P" color="#d46a6a" />}
      title="Invalid payment link"
      subtitle={error || "This link does not exist or has expired."}
    >
      <p className="text-xs" style={{ color: "var(--fg-subtle)" }}>Ask the merchant for a new request.</p>
    </AuthScreen>
  );

  if (!user) return (
    <AuthScreen
      mark={<BrandMark letter={linkData.bankName || "P"} color="#c5cad3" />}
      title="Authorize payment"
      subtitle={`Pay ${linkData.accountName} at ${linkData.bankName}`}
      footer={
        <p className="text-[11px] leading-relaxed" style={{ color: "var(--fg-subtle)" }}>
          Secured under Onyx instant settlement.
        </p>
      }
    >
      <div className="surface-quiet p-4">
        <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-subtle)" }}>Amount due</div>
        <div className="text-2xl font-semibold tracking-tight mt-0.5 num">{formatMoney(linkData.amount)}</div>
        {linkData.description && (
          <p className="text-xs mt-1" style={{ color: "var(--fg-muted)" }}>{linkData.description}</p>
        )}
      </div>
      <div className="space-y-4">
        <label className="flex items-center justify-center gap-2 cursor-pointer text-xs select-none" style={{ color: "var(--fg-muted)" }}>
          <input
            type="checkbox"
            checked={rememberMe}
            onChange={(e) => setRememberMe(e.target.checked)}
            className="w-4 h-4 rounded"
          />
          Remember me on this device
        </label>
        <PrimaryButton onClick={() => login(undefined, "citycorp")}>
          <LogIn size={16} /> Continue with CityCorp
        </PrimaryButton>
      </div>
    </AuthScreen>
  );

  return (
    <div className="min-h-screen flex items-center justify-center p-6 page-enter">
      <div className="surface p-8 max-w-md w-full">
        <div className="h-1 -mt-8 -mx-8 mb-8 rounded-t-[16px]" style={{ background: "var(--accent)" }} />
        <div className="text-center mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">Payment request</h1>
          <p className="text-sm mt-2" style={{ color: "var(--fg-muted)" }}>
            Paying <span className="font-semibold" style={{ color: "var(--fg)" }}>{linkData.accountName}</span> ({linkData.bankName})
          </p>
        </div>

        <div className="surface-quiet p-6 text-center mb-8">
          <div className="text-sm mb-1" style={{ color: "var(--fg-muted)" }}>Requested amount</div>
          <div className="text-4xl font-semibold tracking-tight num" style={{ color: "var(--ok)" }}>
            {linkData.link.amount > 0 ? formatMoney(linkData.link.amount) : "Open amount"}
          </div>
          {linkData.link.description && (
            <div className="text-sm mt-4" style={{ color: "var(--fg-muted)" }}>{linkData.link.description}</div>
          )}
        </div>

        <form onSubmit={async (e:any) => {
            e.preventDefault();
            const fd = new FormData(e.target);
            
            const res = await fetch('/api/citizen/transfer', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                  fromAccountId: fd.get("fromAccountId"),
                  toAccountId: linkData.link.billerAccountId,
                  amount: linkData.link.amount > 0 ? (linkData.link.amount / 100).toFixed(2) : fd.get("amount"),
                  description: linkData.link.description
              })
            });
            
            if (res.ok) {
               alert("Payment successful!");
               window.location.href = "/portal";
            } else {
               const err = await res.json();
               alert(err.error || "Payment failed");
            }
         }}>
           {linkData.link.amount === 0 && (
              <div className="mb-4">
                <label className="block text-sm font-medium mb-1" style={{ color: "var(--fg-muted)" }}>Amount ($)</label>
                <input required name="amount" type="number" step="0.01" min="0.01" className="w-full bg-[var(--bg-subtle)] border px-4 py-3 text-sm" style={{ borderColor: "var(--border)", borderRadius: "var(--radius-md)" }} placeholder="0.00" />
              </div>
           )}
           <div className="mb-6">
              <label className="block text-sm font-medium mb-1" style={{ color: "var(--fg-muted)" }}>Pay from</label>
              <select required name="fromAccountId" className="w-full bg-[var(--bg-subtle)] border px-4 py-3 text-sm min-h-11" style={{ borderColor: "var(--border)", borderRadius: "var(--radius-md)" }}>
                <option value="">Select account…</option>
                {accounts.map((acc: any) => <option key={acc.id} value={acc.id}>{acc.accountName} ({formatMoney(acc.balance)})</option>)}
              </select>
           </div>
           
           <button type="submit" className="w-full min-h-11 font-semibold py-3 px-4 flex items-center justify-center gap-2" style={{ background: "var(--ok)", color: "#0a0a0b", borderRadius: "var(--radius-md)" }}>
             <Send size={16} /> Send payment
           </button>
        </form>
      </div>
    </div>
  );
}
