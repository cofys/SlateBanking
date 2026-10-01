import React, { useState, useEffect } from "react";
import { useSearchParams, Link } from "react-router-dom";
import {
  ShieldCheck, Lock, LogIn, Check, Copy, AlertTriangle, ArrowRight,
  Wallet, Tag, Building2, Store, ExternalLink, Receipt, Clock, Sparkles
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useAuth } from "../lib/AuthContext";
import { formatMoney } from "../lib/utils";
import { AuthScreen, BrandMark, PrimaryButton, ScreenLoader } from "../components/ui/chrome";

export function OnyxCheckout() {
  const [searchParams] = useSearchParams();
  const merchantIdParam = searchParams.get("merchantId") || searchParams.get("merchant") || searchParams.get("id");
  const rawAmountParam = searchParams.get("amount") || searchParams.get("amt");
  
  // Support all parameter aliases for memo/item name
  const orderMemo = (
    searchParams.get("memo") ||
    searchParams.get("itemName") ||
    searchParams.get("item") ||
    searchParams.get("orderMemo") ||
    searchParams.get("description") ||
    searchParams.get("note") ||
    ""
  ).trim();

  const callbackUrl = searchParams.get("callbackUrl") || searchParams.get("return_url") || searchParams.get("redirect");

  const { user, login, rememberMe, setRememberMe } = useAuth();
  const [merchant, setMerchant] = useState<any>(null);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [cards, setCards] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedSource, setSelectedSource] = useState("");
  const [approving, setApproving] = useState(false);
  const [paymentSuccessData, setPaymentSuccessData] = useState<any>(null);
  const [copied, setCopied] = useState<string | null>(null);

  // Custom amount handling if amount was not predefined in URL
  const isPredefinedAmount = !!rawAmountParam && !isNaN(parseFloat(rawAmountParam)) && parseFloat(rawAmountParam) > 0;
  const initialCents = isPredefinedAmount ? Math.round(parseFloat(rawAmountParam) * 100) : 0;
  const [customAmountInput, setCustomAmountInput] = useState(isPredefinedAmount ? parseFloat(rawAmountParam).toFixed(2) : "");

  // Active cents to charge
  const effectiveCents = isPredefinedAmount
    ? initialCents
    : (customAmountInput && !isNaN(parseFloat(customAmountInput)) ? Math.round(parseFloat(customAmountInput) * 100) : 0);

  const copy = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied(null), 1500);
    } catch {}
  };

  useEffect(() => {
    document.title = "Onyx Secure Checkout";
    if (!merchantIdParam) {
      setError("Invalid checkout link. Missing merchant identifier.");
      setLoading(false);
      return;
    }

    fetch(`/api/onyx/merchant/${encodeURIComponent(merchantIdParam)}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) setError(d.error);
        else setMerchant(d);
        setLoading(false);
      })
      .catch(() => {
        setError("Failed to load storefront details.");
        setLoading(false);
      });
  }, [merchantIdParam]);

  useEffect(() => {
    if (user) {
      fetch("/api/citizen/lookup")
        .then(r => r.json())
        .then(d => {
          if (d.accounts) {
            const activeAccs = d.accounts.filter((a: any) => a.isActive !== false && !a.isFrozen);
            setAccounts(activeAccs);
            // Pre-select first account with sufficient balance if available
            if (activeAccs.length > 0) {
              const suitable = activeAccs.find((a: any) => a.balance >= effectiveCents) || activeAccs[0];
              setSelectedSource(suitable.id);
            }
          }
          if (d.cards) {
            setCards(d.cards.filter((c: any) => !c.isLocked));
          }
        })
        .catch(() => {});
    }
  }, [user, effectiveCents]);

  const handleApprove = async () => {
    if (effectiveCents <= 0) {
      alert("Please enter a valid payment amount greater than $0.00.");
      return;
    }

    if (!selectedSource) {
      alert("Please select a funding bank account or credit card.");
      return;
    }

    const selectedAcc = accounts.find((a) => a.id === selectedSource);
    if (selectedAcc && selectedAcc.balance < effectiveCents) {
      alert(`Insufficient funds in ${selectedAcc.accountName}. You need ${formatMoney(effectiveCents)}, but have ${formatMoney(selectedAcc.balance)}.`);
      return;
    }

    setApproving(true);
    const amountInDollarsStr = (effectiveCents / 100).toFixed(2);
    const resolvedMerchantId = merchant?.id || merchantIdParam;

    try {
      if (callbackUrl) {
        // OAuth / 3rd-party callback flow: generate payment token
        const res = await fetch("/api/citizen/onyx-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amount: amountInDollarsStr,
            merchantId: resolvedMerchantId,
            sourceAccountId: selectedSource,
          }),
        });
        const data = await res.json();

        if (data.error) {
          alert(data.error);
          setApproving(false);
          return;
        }

        let url: URL;
        try {
          url = callbackUrl.startsWith("/") && !callbackUrl.startsWith("//")
            ? new URL(callbackUrl, window.location.origin)
            : new URL(callbackUrl);
        } catch {
          alert("Invalid merchant callback URL.");
          setApproving(false);
          return;
        }
        if (url.protocol !== "https:" && url.protocol !== "http:") {
          alert("Invalid merchant callback protocol.");
          setApproving(false);
          return;
        }

        url.searchParams.set("token", data.paymentToken);
        url.searchParams.set("sourceAccountId", selectedSource);
        window.location.href = url.toString();
      } else {
        // Direct Instant Checkout: execute direct book payment
        const res = await fetch("/api/citizen/pay-merchant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            merchantId: resolvedMerchantId,
            sourceAccountId: selectedSource,
            amount: amountInDollarsStr,
            description: orderMemo || `Onyx Storefront: ${merchant?.name || "Purchase"}`,
          }),
        });
        const data = await res.json();

        if (data.error) {
          alert(data.error);
          setApproving(false);
          return;
        }

        setPaymentSuccessData({
          txId: data.txId || `tx_${Math.random().toString(36).substring(2, 11)}`,
          amountCents: effectiveCents,
          merchantName: merchant?.name || "Merchant",
          bankName: merchant?.bankName,
          orderMemo: orderMemo,
          sourceAccountName: selectedAcc?.accountName || "Bank Account",
          timestamp: new Date().toISOString(),
        });
        setApproving(false);
      }
    } catch (e: any) {
      alert(e?.message || "An error occurred during payment approval.");
      setApproving(false);
    }
  };

  if (!user) {
    return (
      <AuthScreen
        mark={<BrandMark letter="O" color="#818cf8" />}
        title="Onyx Checkout"
        subtitle="Sign in with CityCorp / Discord to authorize this payment"
      >
        <div className="space-y-4">
          <label className="flex items-center justify-center gap-2 cursor-pointer text-xs select-none text-white/60">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="w-4 h-4 rounded accent-indigo-500"
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

  if (loading) return <ScreenLoader label="Preparing secure checkout" />;

  if (error) {
    return (
      <AuthScreen
        mark={<BrandMark letter="O" color="#f87171" />}
        title="Checkout Unavailable"
        subtitle={error}
      >
        <div className="space-y-3 text-center">
          <p className="text-xs text-white/50">Please verify the checkout link or contact the merchant.</p>
          <Link
            to="/portal"
            className="inline-block text-xs font-bold text-indigo-400 hover:text-indigo-300 underline"
          >
            Return to Citizen Portal
          </Link>
        </div>
      </AuthScreen>
    );
  }

  // View: Celebratory Success Digital Receipt
  if (paymentSuccessData) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 sm:p-6 bg-[#0c0c0e] text-white">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
          className="max-w-md w-full bg-[#141418] border border-white/10 rounded-3xl overflow-hidden shadow-2xl space-y-6 p-6 sm:p-8"
        >
          {/* Top Stamp */}
          <div className="text-center space-y-3">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/10">
              <Check size={32} strokeWidth={2.5} />
            </div>
            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-[11px] font-bold uppercase tracking-wider mb-1">
                <Sparkles size={12} /> Payment Settled
              </div>
              <h2 className="text-2xl font-bold tracking-tight text-white">
                {paymentSuccessData.merchantName}
              </h2>
              {paymentSuccessData.bankName && (
                <p className="text-xs text-white/40">{paymentSuccessData.bankName}</p>
              )}
            </div>
          </div>

          {/* Amount Display */}
          <div className="text-center p-5 rounded-2xl bg-white/[0.03] border border-white/5 space-y-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-white/40">Total Debited</span>
            <div className="text-4xl font-extrabold font-mono text-emerald-400 tracking-tight">
              {formatMoney(paymentSuccessData.amountCents)}
            </div>
          </div>

          {/* Receipt Details Breakdown */}
          <div className="p-4 rounded-2xl bg-black/40 border border-white/5 space-y-3 text-xs">
            {paymentSuccessData.orderMemo && (
              <div className="flex items-start justify-between gap-2 pb-2 border-b border-white/5">
                <span className="text-white/40 flex items-center gap-1.5">
                  <Tag size={12} className="text-indigo-400" /> Order Memo / Item
                </span>
                <span className="font-bold text-white text-right break-words max-w-[200px]">
                  {paymentSuccessData.orderMemo}
                </span>
              </div>
            )}

            <div className="flex items-center justify-between pb-2 border-b border-white/5">
              <span className="text-white/40 flex items-center gap-1.5">
                <Wallet size={12} className="text-indigo-400" /> Debited Account
              </span>
              <span className="font-medium text-white">{paymentSuccessData.sourceAccountName}</span>
            </div>

            <div className="flex items-center justify-between pb-2 border-b border-white/5">
              <span className="text-white/40 flex items-center gap-1.5">
                <Clock size={12} className="text-indigo-400" /> Timestamp
              </span>
              <span className="font-mono text-white/70">
                {new Date(paymentSuccessData.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-white/40 flex items-center gap-1.5">
                <Receipt size={12} className="text-indigo-400" /> Reference ID
              </span>
              <div className="flex items-center gap-1.5 font-mono text-[11px] text-white/70">
                <span>{paymentSuccessData.txId.substring(0, 16)}...</span>
                <button
                  type="button"
                  onClick={() => copy(paymentSuccessData.txId, "copy_tx")}
                  className="p-1 rounded hover:bg-white/10 text-white/50 hover:text-white transition"
                  title="Copy Reference ID"
                >
                  {copied === "copy_tx" ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                </button>
              </div>
            </div>
          </div>

          {/* Navigation Action Buttons */}
          <div className="space-y-2 pt-2">
            <Link
              to="/portal"
              className="w-full flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl font-bold text-sm text-white bg-indigo-600 hover:bg-indigo-500 shadow-lg shadow-indigo-600/20 transition active:scale-[0.98]"
            >
              <span>Return to Bank Portal</span>
              <ArrowRight size={16} />
            </Link>
          </div>
        </motion.div>
      </div>
    );
  }

  const selectedAcc = accounts.find((a) => a.id === selectedSource);
  const isInsufficient = selectedAcc && selectedAcc.balance < effectiveCents;

  return (
    <div className="min-h-screen flex items-center justify-center p-4 sm:p-6 bg-[#0c0c0e] text-white">
      <div className="max-w-md w-full bg-[#141418] border border-white/10 rounded-3xl overflow-hidden shadow-2xl space-y-6">
        {/* Merchant Branding Header */}
        <div className="p-6 sm:p-8 border-b border-white/10 text-center bg-gradient-to-b from-white/[0.04] to-transparent">
          <div className="mx-auto mb-3 w-fit">
            <BrandMark letter={merchant?.name || "O"} color="#818cf8" size={52} />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-white">{merchant?.name || "Storefront"}</h1>
          {merchant?.bankName && (
            <p className="text-xs text-white/50 mt-0.5 flex items-center justify-center gap-1">
              <Building2 size={12} className="text-indigo-400" /> {merchant.bankName}
            </p>
          )}
          <div className="mt-2.5 inline-flex items-center justify-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[11px] font-semibold">
            <ShieldCheck size={12} /> Verified Onyx Merchant
          </div>
        </div>

        <div className="p-6 sm:p-8 pt-0 space-y-6">
          {/* Order Memo / Item Banner */}
          {orderMemo && (
            <div className="p-4 rounded-2xl bg-indigo-950/30 border border-indigo-500/20 space-y-1">
              <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-indigo-300">
                <Tag size={12} /> Order Memo / Item Description
              </div>
              <div className="text-sm font-semibold text-white break-words leading-snug">
                {orderMemo}
              </div>
            </div>
          )}

          {/* Amount Section */}
          <div className="text-center p-5 rounded-2xl bg-white/[0.02] border border-white/5 space-y-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-white/40 block">
              {isPredefinedAmount ? "Total Amount Due" : "Enter Checkout Amount ($ USD)"}
            </span>
            
            {isPredefinedAmount ? (
              <div className="text-4xl sm:text-5xl font-extrabold tracking-tight font-mono text-white">
                {formatMoney(effectiveCents)}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="relative max-w-[240px] mx-auto">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-2xl font-bold text-white/40 font-mono">$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    placeholder="0.00"
                    value={customAmountInput}
                    onChange={(e) => setCustomAmountInput(e.target.value)}
                    className="w-full bg-black/60 border border-white/20 focus:border-indigo-500 rounded-2xl pl-9 pr-4 py-3 text-2xl font-bold font-mono text-center text-white outline-none transition"
                  />
                </div>
                {/* Preset Pills */}
                <div className="flex flex-wrap items-center justify-center gap-1.5 pt-1">
                  {[10, 25, 50, 100, 500, 1000, 5000].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setCustomAmountInput(preset.toString())}
                      className="px-2.5 py-1 rounded-lg text-xs font-mono font-semibold bg-white/5 hover:bg-white/10 border border-white/10 text-white/80 hover:text-white transition"
                    >
                      ${preset.toLocaleString()}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Fee summary */}
            <div className="flex items-center justify-center gap-2 text-[11px] text-white/40 pt-1">
              <span>Network fee:</span>
              <span className="text-emerald-400 font-medium">$0.00 (Instant Clearing)</span>
            </div>
          </div>

          {/* Funding Source Account Picker */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-bold uppercase tracking-wider text-white/50 pl-1">
                Select Funding Source
              </label>
              {selectedAcc && (
                <span className={`text-xs font-mono font-medium ${isInsufficient ? "text-rose-400" : "text-emerald-400"}`}>
                  Bal: {formatMoney(selectedAcc.balance)}
                </span>
              )}
            </div>

            <div className="space-y-2">
              {accounts.map((a: any) => {
                const isSelected = selectedSource === a.id;
                const insufficient = a.balance < effectiveCents;

                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => setSelectedSource(a.id)}
                    className={`w-full text-left p-3.5 rounded-2xl border transition flex items-center justify-between gap-3 ${
                      isSelected
                        ? "bg-indigo-600/15 border-indigo-500/50 shadow-md shadow-indigo-500/10"
                        : "bg-white/[0.02] border-white/10 hover:border-white/20 hover:bg-white/[0.04]"
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                        isSelected ? "bg-indigo-600 text-white" : "bg-white/5 text-white/50"
                      }`}>
                        <Wallet size={16} />
                      </div>
                      <div className="min-w-0">
                        <div className="font-bold text-xs text-white truncate">{a.accountName}</div>
                        <div className="text-[11px] text-white/40 truncate">
                          {a.bankName || "Bank Account"} · {a.accountType || "Checking"}
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className={`font-mono text-xs font-bold ${insufficient ? "text-rose-400/80" : "text-white"}`}>
                        {formatMoney(a.balance)}
                      </div>
                      {insufficient && (
                        <span className="text-[10px] text-rose-400 font-semibold block">Insufficient</span>
                      )}
                    </div>
                  </button>
                );
              })}

              {accounts.length === 0 && (
                <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs text-center space-y-1">
                  <AlertTriangle size={16} className="mx-auto" />
                  <p className="font-semibold">No active bank accounts found.</p>
                  <p className="text-[11px] text-amber-300/70">Open an account in your bank portal to pay.</p>
                </div>
              )}
            </div>
          </div>

          {/* Insufficient Funds Warning */}
          {isInsufficient && (
            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center gap-2.5 text-xs text-rose-300">
              <AlertTriangle size={16} className="shrink-0 text-rose-400" />
              <span>
                Selected account lacks sufficient balance to cover {formatMoney(effectiveCents)}.
              </span>
            </div>
          )}

          {/* Approve Button */}
          <button
            type="button"
            disabled={!selectedSource || isInsufficient || approving || effectiveCents <= 0}
            onClick={handleApprove}
            className="w-full py-4 rounded-2xl font-bold text-sm text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:hover:bg-indigo-600 shadow-lg shadow-indigo-600/25 transition active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
          >
            {approving ? (
              <>
                <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                <span>Processing Settlement...</span>
              </>
            ) : (
              <>
                <Lock size={16} />
                <span>Authorize & Pay {effectiveCents > 0 ? formatMoney(effectiveCents) : ""}</span>
              </>
            )}
          </button>

          <p className="text-[11px] text-center px-4 text-white/40 leading-relaxed">
            By authorizing, you approve instant book settlement of {effectiveCents > 0 ? formatMoney(effectiveCents) : "the payment"} into {merchant?.name || "the merchant"}'s corporate account on the Onyx network.
          </p>
        </div>
      </div>
    </div>
  );
}
