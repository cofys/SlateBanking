import React, { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { ShieldCheck, Lock, LogIn } from "lucide-react";
import { useAuth } from "../lib/AuthContext";
import { formatMoney } from "../lib/utils";
import { AuthScreen, BrandMark, PrimaryButton, ScreenLoader } from "../components/ui/chrome";

export function OnyxCheckout() {
  const [searchParams] = useSearchParams();
  const merchantId = searchParams.get("merchantId");
  const amount = searchParams.get("amount");
  const description = searchParams.get("description") || "Onyx Network Purchase";
  const callbackUrl = searchParams.get("callbackUrl");

  const { user, login, rememberMe, setRememberMe } = useAuth();
  const [merchant, setMerchant] = useState<any>(null);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [cards, setCards] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedSource, setSelectedSource] = useState("");
  const [approving, setApproving] = useState(false);

  useEffect(() => {
    document.title = "Onyx Secure Checkout";
    if (!merchantId || !amount) {
      setError("Invalid checkout link. Missing merchant ID or amount.");
      setLoading(false);
      return;
    }

    fetch(`/api/onyx/merchant/${merchantId}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) setError(d.error);
        else setMerchant(d);
        setLoading(false);
      });
  }, [merchantId, amount]);

  useEffect(() => {
    if (user) {
      fetch("/api/citizen/lookup")
        .then(r => r.json())
        .then(d => {
          if (d.accounts) setAccounts(d.accounts);
          if (d.cards) setCards(d.cards.filter((c: any) => !c.isLocked));
        });
    }
  }, [user]);

  const handleApprove = async () => {
    if (!selectedSource) {
      alert("Please select a funding source.");
      return;
    }

    setApproving(true);
    try {
      const cents = parseInt(amount as string, 10);
      const res = await fetch("/api/citizen/onyx-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: (cents / 100).toFixed(2),
          merchantId,
          sourceAccountId: selectedSource,
        }),
      });
      const data = await res.json();

      if (data.error) {
        alert(data.error);
        setApproving(false);
        return;
      }

      if (callbackUrl) {
        let url: URL;
        try {
          url = callbackUrl.startsWith("/") && !callbackUrl.startsWith("//")
            ? new URL(callbackUrl, window.location.origin)
            : new URL(callbackUrl);
        } catch {
          alert("Invalid merchant callback.");
          setApproving(false);
          return;
        }
        if (url.protocol !== "https:" && url.protocol !== "http:") {
          alert("Invalid merchant callback.");
          setApproving(false);
          return;
        }
        url.searchParams.set("token", data.paymentToken);
        url.searchParams.set("sourceAccountId", selectedSource);
        window.location.href = url.toString();
      } else {
        alert("Payment Approved! Please close this window and return to the merchant.");
      }
    } catch (e) {
      alert("An error occurred during approval.");
      setApproving(false);
    }
  };

  if (!user) {
    return (
      <AuthScreen
        mark={<BrandMark letter="O" color="#c5cad3" />}
        title="Onyx checkout"
        subtitle="Sign in with CityCorp to approve this charge"
      >
        <div className="space-y-4">
          <label className="flex items-center justify-center gap-2 cursor-pointer text-xs select-none" style={{ color: "var(--fg-muted)" }}>
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="w-4 h-4 rounded"
            />
            Remember this device
          </label>
          <PrimaryButton onClick={() => login(undefined, "citycorp")}>
            <LogIn size={16} /> Continue with CityCorp
          </PrimaryButton>
        </div>
      </AuthScreen>
    );
  }

  if (loading) return <ScreenLoader label="Preparing checkout" />;

  if (error) {
    return (
      <AuthScreen
        mark={<BrandMark letter="O" color="#d46a6a" />}
        title="Checkout error"
        subtitle={error}
      >
        <p className="text-xs" style={{ color: "var(--fg-subtle)" }}>Return to the merchant and try again.</p>
      </AuthScreen>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 sm:p-8 page-enter">
      <div className="max-w-md w-full surface overflow-hidden">
        <div className="p-8 border-b text-center" style={{ borderColor: "var(--border)", background: "var(--bg-subtle)" }}>
          <div className="mx-auto mb-4 w-fit">
            <BrandMark letter={merchant?.name || "O"} color="#c5cad3" size={56} />
          </div>
          <h1 className="text-xl font-semibold tracking-tight mb-1">{merchant?.name || "Merchant"}</h1>
          <p className="text-xs flex items-center justify-center gap-1" style={{ color: "var(--fg-subtle)" }}>
            <ShieldCheck size={12} style={{ color: "var(--ok)" }} /> Secure Onyx checkout
          </p>
        </div>

        <div className="p-8 space-y-6">
          <div className="text-center">
            <div className="text-sm font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--fg-subtle)" }}>Total</div>
            <div className="text-4xl font-semibold tracking-tight num">{formatMoney(parseInt(amount as string))}</div>
            <div className="text-sm mt-3 p-3 surface-quiet inline-block">{description}</div>
          </div>

          <div className="space-y-3">
            <label className="text-xs font-semibold uppercase tracking-wider pl-1" style={{ color: "var(--fg-subtle)" }}>Funding source</label>
            <select
              value={selectedSource}
              onChange={(e) => setSelectedSource(e.target.value)}
              className="w-full bg-[var(--bg-subtle)] border p-4 appearance-none min-h-11"
              style={{ borderColor: "var(--border)", borderRadius: "var(--radius-md)" }}
            >
              <option value="" disabled>Select an account or card…</option>
              {accounts.length > 0 && (
                <optgroup label="Bank Accounts">
                  {accounts.map((a: any) => (
                    <option key={a.id} value={a.id} disabled={a.balance < parseInt(amount as string)}>
                      {a.accountName} - {formatMoney(a.balance)} {a.balance < parseInt(amount as string) ? "(Insufficient)" : ""}
                    </option>
                  ))}
                </optgroup>
              )}
              {cards.length > 0 && (
                <optgroup label="Credit Cards">
                  {cards.map((c: any) => {
                    const available = (c.creditLimit || 0) - (c.creditUsed || 0);
                    return (
                      <option key={c.id} value={c.id} disabled={available < parseInt(amount as string)}>
                        Credit Card (..{c.cardNumber.slice(-4)}) - Avail: {formatMoney(available)}
                      </option>
                    );
                  })}
                </optgroup>
              )}
            </select>
          </div>

          <PrimaryButton disabled={!selectedSource || approving} onClick={handleApprove}>
            {approving ? (
              <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            ) : (
              <><Lock size={16} /> Approve payment</>
            )}
          </PrimaryButton>

          <p className="text-[10px] text-center px-4 leading-relaxed" style={{ color: "var(--fg-subtle)" }}>
            By approving, you authorize {merchant?.name || "this merchant"} to charge the selected source on the Onyx network.
          </p>
        </div>
      </div>
    </div>
  );
}
