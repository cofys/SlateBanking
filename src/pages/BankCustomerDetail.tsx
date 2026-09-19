import { useState, useEffect } from "react";
import { useOutletContext, useParams, Link, useNavigate } from "react-router-dom";
import { ArrowLeft, User, Wallet, Activity, Calendar, ChevronRight, Pencil, ShieldCheck, Save, CheckCircle2, AlertTriangle, ShieldAlert } from "lucide-react";
import { format } from "date-fns";

export function BankCustomerDetail() {
  const { bank } = useOutletContext<{ bank: any }>();
  const { discordId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState("");
  const [kycStatus, setKycStatus] = useState("pending");
  const [linkedDiscordId, setLinkedDiscordId] = useState("");
  const [mcUsername, setMcUsername] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const fetchCustomer = () => {
    if (bank?.id && discordId) {
      setLoading(true);
      fetch(`/api/banks/${bank.id}/customers/${discordId}`)
        .then(r => r.ok ? r.json() : Promise.reject(new Error("Failed to fetch")))
        .then(d => {
          setData(d);
          setNotes(d.notes || "");
          setKycStatus(d.kycStatus || "pending");
          setLinkedDiscordId(d.linkedDiscordId || d.discordId || "");
          setMcUsername(d.mcUsername || "");
          setLoading(false);
        })
        .catch(e => {
          console.error("fetch customer error", e);
          setData({ error: "Fetch failed" });
          setLoading(false);
        });
    }
  };

  useEffect(() => {
    fetchCustomer();
  }, [bank, discordId]);

  const handleSaveProfile = async () => {
    if (!bank?.id || !discordId) return;
    setSavingProfile(true);
    setSaveSuccess(false);
    try {
      const res = await fetch(`/api/banks/${bank.id}/customers/${discordId}/profile`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes, kycStatus, linkedDiscordId, mcUsername })
      });
      if (res.ok) {
        setSaveSuccess(true);
        fetchCustomer();
        setTimeout(() => setSaveSuccess(false), 3000);
      } else {
        alert("Failed to save customer profile");
      }
    } catch (err) {
      console.error(err);
      alert("Error saving profile");
    } finally {
      setSavingProfile(false);
    }
  };

  if (loading) return <div className="p-10 text-white/50 animate-pulse text-center">Loading customer profile...</div>;
  if (!data || data.error) return <div className="p-10 text-center text-red-400">Error loading customer profile.</div>;

  const isUnassigned = discordId?.startsWith("unassigned_") || discordId === "imported";

  return (
    <div className="max-w-6xl mx-auto animate-in fade-in duration-500 pb-12">
      {/* Header */}
      <div className="mb-8">
        <Link to={`/bank/${bank.id}/customers`} className="text-white/40 hover:text-white transition-colors flex items-center gap-2 text-sm mb-4">
          <ArrowLeft size={16} /> Back to Customers
        </Link>
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div className="flex items-center gap-4">
            <div className={`w-16 h-16 rounded-full flex items-center justify-center ${isUnassigned ? 'bg-amber-500/10 text-amber-500' : 'bg-indigo-500/20 text-indigo-400'}`}>
              <User size={32} />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-3xl font-bold tracking-tight text-white">{isUnassigned ? "Unassigned Customer" : (data?.mcUsername || discordId)}</h2>
                <button 
                  onClick={async () => {
                    const newId = prompt("Enter Username or Discord ID to merge this customer into:", discordId);
                    if (!newId || newId === discordId) return;
                    const res = await fetch(`/api/banks/${bank.id}/customers/${discordId}/update-id`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ newDiscordId: newId })
                    });
                    if (res.ok) {
                      navigate(`/bank/${bank.id}/customers/${newId}`, { replace: true });
                    } else {
                      const err = await res.json();
                      alert(`Failed to update ID: ${err.error || 'Unknown error'}`);
                    }
                  }}
                  className="text-white/40 hover:text-white transition-colors"
                  title="Rename/Update Discord ID"
                >
                  <Pencil size={18} />
                </button>
                {data.accounts?.some((a: any) => !a.isActive) && (
                  <span className="bg-red-500/20 text-red-400 border border-red-500/30 text-xs font-semibold px-2.5 py-0.5 rounded-full uppercase tracking-wider">Frozen</span>
                )}
              </div>
              <div className="flex items-center gap-4 mt-2 text-white/50 text-sm">
                <span className="flex items-center gap-1"><Calendar size={14} /> First Joined {data.firstJoined ? format(new Date(data.firstJoined), "MMM d, yyyy") : "Unknown"}</span>
                <span className="flex items-center gap-1"><Wallet size={14} /> {data.accounts?.length || 0} Account(s)</span>
              </div>
            </div>
          </div>
          <div className="flex flex-col items-start md:items-end gap-3 w-full md:w-auto">
            <div className="text-left md:text-right">
              <div className="text-xs text-white/40 uppercase tracking-wider font-semibold">Total Net Worth</div>
              <div className="text-3xl font-semibold text-emerald-400 mt-1">
                ${((data.totalBalance || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </div>
            </div>
            <button
              onClick={async () => {
                const isFrozen = data.accounts?.some((a: any) => !a.isActive);
                if (!confirm(`Are you sure you want to ${isFrozen ? 'unfreeze' : 'freeze'} this customer's accounts?`)) return;
                
                const res = await fetch(`/api/banks/${bank.id}/customers/${discordId}/freeze`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ freeze: !isFrozen })
                });
                if (res.ok) {
                  fetchCustomer();
                }
              }}
              className={`w-full md:w-auto px-4 py-2 text-sm font-medium rounded-lg transition-colors border ${data.accounts?.some((a: any) => !a.isActive) ? 'border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/10' : 'border-red-500/50 text-red-500 hover:bg-red-500/10'}`}
            >
              {data.accounts?.some((a: any) => !a.isActive) ? 'Unfreeze Accounts' : 'Freeze Accounts'}
            </button>
          </div>
        </div>
      </div>

      {isUnassigned && (
        <div className="mb-8 bg-amber-500/5 border border-amber-500/20 rounded-xl p-5 flex items-start gap-3">
          <AlertTriangle className="text-amber-500 shrink-0 mt-0.5" size={20} />
          <div>
            <h4 className="text-amber-400 font-medium text-sm">Auto-Imported Unassigned Account</h4>
            <p className="text-white/60 text-xs mt-1">
              This account was imported from CityCorp and has not yet been linked to a specific user's Username or Discord ID. You can reassign individual accounts under this customer profile below by clicking their edit/reassign option to assign them to real members.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Admin Profile Controls */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-[var(--bg-elevated)] border border-white/10 rounded-xl p-6 shadow-xl">
            <h3 className="text-base font-semibold text-white/90 mb-4 flex items-center gap-2">
              <ShieldCheck size={18} className="text-indigo-400" />
              Administrative Profile
            </h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-white/40 uppercase tracking-wider mb-2">Linked Discord ID</label>
                <input 
                  type="text"
                  value={linkedDiscordId}
                  onChange={(e) => setLinkedDiscordId(e.target.value)}
                  placeholder="e.g. 123456789012345678 or @username"
                  className="w-full bg-[var(--bg-subtle)] border border-white/15 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-white/40 uppercase tracking-wider mb-2">Minecraft Username</label>
                <input 
                  type="text"
                  value={mcUsername}
                  onChange={(e) => setMcUsername(e.target.value)}
                  placeholder="e.g. Steve"
                  className="w-full bg-[var(--bg-subtle)] border border-white/15 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-white/40 uppercase tracking-wider mb-2">KYC Status</label>
                <select 
                  value={kycStatus}
                  onChange={(e) => setKycStatus(e.target.value)}
                  className="w-full bg-[var(--bg-subtle)] border border-white/15 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
                >
                  <option value="pending">🟡 Pending Verification</option>
                  <option value="approved">🟢 Verified Profile</option>
                  <option value="rejected">🔴 Rejected / Flagged</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-white/40 uppercase tracking-wider mb-2">Internal Notes</label>
                <textarea 
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full bg-[var(--bg-subtle)] border border-white/15 rounded-lg p-3 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors placeholder:text-white/20 resize-none"
                  rows={4}
                  placeholder="Add administrative records, verification details, or server-role notes about this member..."
                />
              </div>

              <button 
                onClick={handleSaveProfile}
                disabled={savingProfile}
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-2.5 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
              >
                {savingProfile ? (
                  "Saving Profile..."
                ) : (
                  <>
                    <Save size={16} />
                    Save Profile Settings
                  </>
                )}
              </button>

              {saveSuccess && (
                <p className="text-emerald-400 text-xs text-center flex items-center justify-center gap-1.5 animate-bounce">
                  <CheckCircle2 size={12} /> Profile updated successfully!
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Accounts & History */}
        <div className="lg:col-span-2 space-y-8">
          <div>
            <h3 className="text-lg font-semibold flex items-center gap-2 text-white/90 mb-4">
              <Wallet className="text-indigo-400" size={18} />
              Held Accounts
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {data.accounts?.map((acc: any) => (
                <div 
                  key={acc.id} 
                  className="bg-[var(--bg-elevated)] border border-white/10 rounded-xl p-5 flex flex-col justify-between hover:border-white/20 transition-all group"
                >
                  <div>
                    <div className="flex justify-between items-start gap-2 mb-2">
                      <div className="font-semibold text-white truncate">{acc.accountName}</div>
                      <button
                        onClick={async (e) => {
                          e.preventDefault();
                          const newId = prompt(`Enter Username or Discord ID for account "${acc.accountName}":`, acc.ownerDiscordId);
                          if (!newId || newId === acc.ownerDiscordId) return;
                          const res = await fetch(`/api/banks/${bank.id}/accounts/${acc.id}/update-account`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ newDiscordId: newId })
                          });
                          if (res.ok) {
                            fetchCustomer();
                          } else {
                            const err = await res.json();
                            alert(`Failed to update account owner: ${err.error || 'Unknown error'}`);
                          }
                        }}
                        className="text-xs text-white/40 hover:text-white bg-white/5 hover:bg-white/10 border border-white/15 rounded px-2 py-0.5 transition-colors flex items-center gap-1"
                        title="Reassign owner of this account"
                      >
                        <Pencil size={11} /> Reassign
                      </button>
                    </div>
                    <div className="text-2xl font-semibold text-emerald-400 tracking-tight">
                      ${(acc.balance / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                  <div className="text-xs text-white/40 mt-4 pt-3 border-t border-white/5 flex justify-between items-center">
                    <span>Opened {format(new Date(acc.createdAt), "MMM d, yyyy")}</span>
                    <Link to={`/bank/${bank.id}/accounts/${acc.id}`} className="text-indigo-400 hover:text-indigo-300 font-medium flex items-center gap-0.5">
                      View details <ChevronRight size={12} />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold flex items-center gap-2 text-white/90 mb-4">
              <Activity className="text-emerald-400" size={18} />
              Recent Account Activity
            </h3>
            
            <div className="bg-[var(--bg-elevated)] border border-white/10 rounded-xl overflow-hidden shadow-xl">
              {data.transactions?.length === 0 ? (
                <div className="p-8 text-center text-white/40">No recent transactions found.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm min-w-[500px]">
                    <thead className="bg-[var(--bg-subtle)] text-white/50 border-b border-white/10">
                      <tr>
                        <th className="px-6 py-4 font-medium">Type</th>
                        <th className="px-6 py-4 font-medium">From/To</th>
                        <th className="px-6 py-4 font-medium">Amount</th>
                        <th className="px-6 py-4 font-medium">Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {data.transactions?.map((tx: any) => (
                        <tr key={tx.id} className="hover:bg-white/5 transition-colors">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`capitalize px-2 py-0.5 rounded text-xs font-semibold ${
                              tx.type === 'deposit' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                              tx.type === 'withdraw' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                              'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                            }`}>
                              {tx.type}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap font-mono text-xs text-white/70">
                            {tx.type === 'transfer' ? (
                              <span>{tx.fromAccountId?.substring(0, 8)} ➔ {tx.toAccountId?.substring(0, 16)}</span>
                            ) : (
                              <span>{tx.fromAccountId?.substring(0, 12) || "External"}</span>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap font-medium">
                            <span className={tx.type === 'deposit' ? 'text-emerald-400' : 'text-red-400'}>
                              {tx.type === 'deposit' ? '+' : '-'}${Math.abs(tx.amount / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-white/50 whitespace-nowrap text-xs">
                            {format(new Date(tx.timestamp), "MMM d, yyyy HH:mm")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
