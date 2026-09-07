import { useState, useEffect, useMemo } from "react";
import { useOutletContext } from "react-router-dom";
import { 
  Users2, Shield, Plus, Trash2, Loader2, Key, Copy, Check, 
  Search, SlidersHorizontal, CheckCircle2, XCircle, AlertTriangle,
  UserCheck, Banknote, Landmark, FileText, Activity, Lock
} from "lucide-react";
import { format } from "date-fns";

interface StaffRoleDefinition {
  id: string;
  name: string;
  badgeColor: string;
  description: string;
  permissions: {
    accounts: boolean;
    depositsWithdrawals: boolean;
    transfers: boolean;
    loansUnderwriting: boolean;
    collateralManagement: boolean;
    treasuryPayroll: boolean;
    clearinghouseWires: boolean;
    complianceAudit: boolean;
    settingsAndTeam: boolean;
  };
}

const ROLES: Record<string, StaffRoleDefinition> = {
  admin: {
    id: "admin",
    name: "Executive Admin",
    badgeColor: "bg-amber-500/10 text-amber-300 border-amber-500/30",
    description: "Unrestricted executive control over bank operations, staff, clearinghouse, and tenant configuration.",
    permissions: {
      accounts: true,
      depositsWithdrawals: true,
      transfers: true,
      loansUnderwriting: true,
      collateralManagement: true,
      treasuryPayroll: true,
      clearinghouseWires: true,
      complianceAudit: true,
      settingsAndTeam: true,
    }
  },
  manager: {
    id: "manager",
    name: "Branch Manager",
    badgeColor: "bg-indigo-500/10 text-indigo-300 border-indigo-500/30",
    description: "Full operational authority over accounts, loans, treasury reserves, payroll batches, and analytics.",
    permissions: {
      accounts: true,
      depositsWithdrawals: true,
      transfers: true,
      loansUnderwriting: true,
      collateralManagement: true,
      treasuryPayroll: true,
      clearinghouseWires: false,
      complianceAudit: true,
      settingsAndTeam: false,
    }
  },
  loan_officer: {
    id: "loan_officer",
    name: "Loan & Underwriting Officer",
    badgeColor: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
    description: "Reviews loan requests, underwrites terms, binds collateral assets, manages late fees, and assesses credit risk.",
    permissions: {
      accounts: true,
      depositsWithdrawals: false,
      transfers: false,
      loansUnderwriting: true,
      collateralManagement: true,
      treasuryPayroll: false,
      clearinghouseWires: false,
      complianceAudit: false,
      settingsAndTeam: false,
    }
  },
  compliance: {
    id: "compliance",
    name: "Compliance & Risk Auditor",
    badgeColor: "bg-rose-500/10 text-rose-300 border-rose-500/30",
    description: "Monitors suspicious activity, inspects audit logs, manages KYC verification, and freezes/unfreezes accounts.",
    permissions: {
      accounts: true,
      depositsWithdrawals: false,
      transfers: false,
      loansUnderwriting: false,
      collateralManagement: false,
      treasuryPayroll: false,
      clearinghouseWires: false,
      complianceAudit: true,
      settingsAndTeam: false,
    }
  },
  teller: {
    id: "teller",
    name: "Bank Teller",
    badgeColor: "bg-blue-500/10 text-blue-300 border-blue-500/30",
    description: "Counter-service operations: deposits, cash withdrawals, client transfers, and balance verification.",
    permissions: {
      accounts: true,
      depositsWithdrawals: true,
      transfers: true,
      loansUnderwriting: false,
      collateralManagement: false,
      treasuryPayroll: false,
      clearinghouseWires: false,
      complianceAudit: false,
      settingsAndTeam: false,
    }
  }
};

export function BankTeam() {
  const { bank } = useOutletContext<{ bank: any }>();
  const [staff, setStaff] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [showMatrix, setShowMatrix] = useState(false);
  const [editingStaffId, setEditingStaffId] = useState<string | null>(null);
  const [editRole, setEditRole] = useState<string>("teller");

  const fetchStaff = () => {
    setLoading(true);
    fetch(`/api/banks/${bank.id}/team`)
      .then(r => r.json())
      .then(data => {
        setStaff(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    if (bank?.id) fetchStaff();
  }, [bank]);

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const formData = new FormData(e.target as HTMLFormElement);
    const data = {
      discordId: formData.get("discordId"),
      role: formData.get("role")
    };

    fetch(`/api/banks/${bank.id}/team`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    }).then(async res => {
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert("Failed to add staff member: " + (err.error || "Unknown error"));
      } else {
        setShowAdd(false);
        fetchStaff();
      }
      setSubmitting(false);
    });
  };

  const handleUpdateRole = async (staffId: string, newRole: string) => {
    try {
      const res = await fetch(`/api/banks/${bank.id}/team/${staffId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole })
      });
      if (res.ok) {
        setEditingStaffId(null);
        fetchStaff();
      } else {
        const err = await res.json().catch(() => ({}));
        alert("Failed to update role: " + (err.error || "Forbidden"));
      }
    } catch (e: any) {
      alert("Error updating role: " + e.message);
    }
  };

  const handleRemove = (staffId: string) => {
    if (!confirm("Are you sure you want to remove this staff member? Their access will be revoked immediately.")) return;
    fetch(`/api/banks/${bank.id}/team/${staffId}`, { method: "DELETE" })
      .then(async res => {
        if (res.ok) {
          fetchStaff();
        } else {
          const err = await res.json().catch(() => ({}));
          alert("Failed to remove staff: " + (err.error || "Forbidden"));
        }
      });
  };

  const filteredStaff = useMemo(() => {
    return staff.filter(s => {
      const matchesSearch = !searchQuery || s.discordId.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesRole = roleFilter === "all" || s.role === roleFilter;
      return matchesSearch && matchesRole;
    });
  }, [staff, searchQuery, roleFilter]);

  const roleCounts = useMemo(() => {
    const counts: Record<string, number> = { admin: 0, manager: 0, loan_officer: 0, compliance: 0, teller: 0 };
    staff.forEach(s => {
      if (counts[s.role] !== undefined) counts[s.role]++;
      else counts.admin++;
    });
    return counts;
  }, [staff]);

  if (loading) return <div className="text-white/50 animate-pulse p-4">Loading team...</div>;

  const staffPortalUrl = `${window.location.origin}/bank/${bank.id}`;

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <Users2 className="text-indigo-400" /> Team & RBAC Management
          </h2>
          <p className="text-white/60 text-sm mt-1">
            Grant role-based access to your bank staff across tellers, loan underwriters, compliance officers, and executive admins.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setShowMatrix(!showMatrix)}
            className="bg-white/5 hover:bg-white/10 text-zinc-300 border border-white/10 px-3.5 py-2 rounded-xl text-sm font-semibold transition-colors flex items-center gap-2"
          >
            <Shield size={16} />
            {showMatrix ? "Hide Permissions" : "Permission Matrix"}
          </button>
          <button 
            onClick={() => setShowAdd(true)}
            className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl font-semibold transition-colors flex items-center gap-2 shadow-lg shadow-indigo-600/20"
          >
            <Plus size={16} />
            Add Staff Member
          </button>
        </div>
      </div>

      {/* Role Summary Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {Object.entries(ROLES).map(([key, def]) => {
          const count = roleCounts[key] || 0;
          return (
            <div 
              key={key}
              onClick={() => setRoleFilter(roleFilter === key ? "all" : key)}
              className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
                roleFilter === key 
                  ? "bg-indigo-500/10 border-indigo-500/40 ring-1 ring-indigo-500/30" 
                  : "bg-[#0b0b12] border-white/10 hover:border-white/20"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">{def.name.split(' ')[0]}</span>
                <span className={`text-xs font-mono px-1.5 py-0.5 rounded-full border ${def.badgeColor}`}>
                  {count}
                </span>
              </div>
              <p className="text-lg font-black text-white mt-1">{count} <span className="text-xs font-normal text-zinc-500">Staff</span></p>
            </div>
          );
        })}
      </div>

      {/* Direct Login Link Banner */}
      <div className="bg-gradient-to-r from-indigo-950/40 via-purple-950/20 to-[#0f0f15] border border-indigo-500/20 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 mt-0.5 sm:mt-0 shrink-0">
            <Shield size={18} />
          </div>
          <div>
            <p className="text-sm font-bold text-white flex items-center gap-2">
              Staff Portal Direct Access URL
            </p>
            <p className="text-xs text-zinc-400 mt-0.5">
              Staff members can sign in directly using their Discord, Minecraft username, or CityCorp ID. Access privileges are strictly governed by their assigned RBAC tier.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
          <code className="text-xs bg-black/40 border border-white/10 px-3 py-2 rounded-xl font-mono text-indigo-300 truncate max-w-[240px]">
            {staffPortalUrl}
          </code>
          <button
            onClick={() => {
              navigator.clipboard.writeText(staffPortalUrl);
              setCopiedUrl(true);
              setTimeout(() => setCopiedUrl(false), 2000);
            }}
            className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-3 py-2 rounded-xl transition-colors shrink-0 flex items-center gap-1.5"
          >
            {copiedUrl ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy Link</>}
          </button>
        </div>
      </div>

      {/* Permission Matrix Drawer */}
      {showMatrix && (
        <div className="bg-[#0b0b12] border border-white/10 rounded-2xl p-6 space-y-4 animate-in fade-in duration-300">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <SlidersHorizontal className="text-indigo-400" size={18} /> Granular Role Permission Matrix
            </h3>
            <button onClick={() => setShowMatrix(false)} className="text-xs text-zinc-400 hover:text-white">
              Close
            </button>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-white/10 text-zinc-400 uppercase tracking-wider">
                  <th className="py-3 px-4 font-semibold">Capability / Module</th>
                  {Object.values(ROLES).map(r => (
                    <th key={r.id} className="py-3 px-3 font-semibold text-center">{r.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-zinc-300">
                <tr>
                  <td className="py-2.5 px-4 font-medium text-white">View & Search Accounts</td>
                  {Object.values(ROLES).map(r => (
                    <td key={r.id} className="py-2.5 px-3 text-center">
                      {r.permissions.accounts ? <CheckCircle2 size={16} className="inline text-emerald-400" /> : <XCircle size={16} className="inline text-zinc-600" />}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="py-2.5 px-4 font-medium text-white">Counter Deposits & Cash Withdrawals</td>
                  {Object.values(ROLES).map(r => (
                    <td key={r.id} className="py-2.5 px-3 text-center">
                      {r.permissions.depositsWithdrawals ? <CheckCircle2 size={16} className="inline text-emerald-400" /> : <XCircle size={16} className="inline text-zinc-600" />}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="py-2.5 px-4 font-medium text-white">Direct Account Transfers</td>
                  {Object.values(ROLES).map(r => (
                    <td key={r.id} className="py-2.5 px-3 text-center">
                      {r.permissions.transfers ? <CheckCircle2 size={16} className="inline text-emerald-400" /> : <XCircle size={16} className="inline text-zinc-600" />}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="py-2.5 px-4 font-medium text-white">Loan Underwriting & Credit Decisions</td>
                  {Object.values(ROLES).map(r => (
                    <td key={r.id} className="py-2.5 px-3 text-center">
                      {r.permissions.loansUnderwriting ? <CheckCircle2 size={16} className="inline text-emerald-400" /> : <XCircle size={16} className="inline text-zinc-600" />}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="py-2.5 px-4 font-medium text-white">Collateral Binding & Default Seizures</td>
                  {Object.values(ROLES).map(r => (
                    <td key={r.id} className="py-2.5 px-3 text-center">
                      {r.permissions.collateralManagement ? <CheckCircle2 size={16} className="inline text-emerald-400" /> : <XCircle size={16} className="inline text-zinc-600" />}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="py-2.5 px-4 font-medium text-white">Treasury Management & Payroll Batches</td>
                  {Object.values(ROLES).map(r => (
                    <td key={r.id} className="py-2.5 px-3 text-center">
                      {r.permissions.treasuryPayroll ? <CheckCircle2 size={16} className="inline text-emerald-400" /> : <XCircle size={16} className="inline text-zinc-600" />}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="py-2.5 px-4 font-medium text-white">Inter-Bank Clearinghouse Settlements & Wires</td>
                  {Object.values(ROLES).map(r => (
                    <td key={r.id} className="py-2.5 px-3 text-center">
                      {r.permissions.clearinghouseWires ? <CheckCircle2 size={16} className="inline text-emerald-400" /> : <XCircle size={16} className="inline text-zinc-600" />}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="py-2.5 px-4 font-medium text-white">Compliance Logs & Account Freeze Controls</td>
                  {Object.values(ROLES).map(r => (
                    <td key={r.id} className="py-2.5 px-3 text-center">
                      {r.permissions.complianceAudit ? <CheckCircle2 size={16} className="inline text-emerald-400" /> : <XCircle size={16} className="inline text-zinc-600" />}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="py-2.5 px-4 font-medium text-white">Bank Settings, Webhooks & Team RBAC</td>
                  {Object.values(ROLES).map(r => (
                    <td key={r.id} className="py-2.5 px-3 text-center">
                      {r.permissions.settingsAndTeam ? <CheckCircle2 size={16} className="inline text-emerald-400" /> : <XCircle size={16} className="inline text-zinc-600" />}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add Staff Modal */}
      {showAdd && (
        <div className="bg-[#0b0b12] border border-white/10 rounded-2xl p-6 mb-6 shadow-2xl">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-white text-base">Invite / Provision Staff Member</h3>
            <button onClick={() => setShowAdd(false)} className="text-zinc-500 hover:text-white text-xs">Cancel</button>
          </div>
          <form onSubmit={handleAdd} className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-[11px] font-bold text-zinc-400 mb-1.5 uppercase tracking-wide">Identifier (Discord ID, MC Username, or UUID)</label>
              <input 
                name="discordId" 
                required 
                type="text" 
                className="w-full bg-[#14141e] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 font-mono" 
                placeholder="123456789, notch, or UUID" 
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-zinc-400 mb-1.5 uppercase tracking-wide">Assigned RBAC Role</label>
              <select 
                name="role" 
                defaultValue="teller"
                className="w-full bg-[#14141e] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
              >
                <option value="teller">Bank Teller (Counter deposits, withdrawals, transfers)</option>
                <option value="loan_officer">Loan & Underwriting Officer (Loans, collateral, credit)</option>
                <option value="compliance">Compliance Auditor (Audit logs, KYC, account freeze)</option>
                <option value="manager">Branch Manager (Treasury, payroll, loans, accounts)</option>
                <option value="admin">Executive Admin (Unrestricted control)</option>
              </select>
            </div>
            <div className="flex items-end">
              <button 
                disabled={submitting} 
                type="submit" 
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-2.5 rounded-xl font-bold transition-colors flex items-center justify-center gap-2"
              >
                {submitting ? <Loader2 className="animate-spin" size={16} /> : "Grant Access"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Staff Roster Table */}
      <div className="bg-[#0b0b12] border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
        {/* Table Controls */}
        <div className="p-4 border-b border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-white text-sm">Staff Directory ({filteredStaff.length})</h3>
            {roleFilter !== "all" && (
              <span className="text-[10px] bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded-full uppercase font-bold">
                Filtered: {roleFilter}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <input 
                type="text" 
                placeholder="Search staff identifier..." 
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="bg-black/40 border border-white/10 rounded-xl py-1.5 px-3 pl-8 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500 font-mono w-48 sm:w-60"
              />
              <Search className="absolute left-2.5 top-2 text-zinc-500" size={13} />
            </div>

            <select
              value={roleFilter}
              onChange={e => setRoleFilter(e.target.value)}
              className="bg-black/40 border border-white/10 rounded-xl py-1.5 px-3 text-xs text-white focus:outline-none focus:border-indigo-500 capitalize"
            >
              <option value="all">All Roles</option>
              <option value="admin">Executive Admin</option>
              <option value="manager">Branch Manager</option>
              <option value="loan_officer">Loan Officer</option>
              <option value="compliance">Compliance</option>
              <option value="teller">Teller</option>
            </select>
          </div>
        </div>

        {filteredStaff.length === 0 ? (
          <div className="p-12 text-center text-white/40 flex flex-col items-center justify-center">
            <Users2 size={48} className="mb-3 opacity-20" />
            <p className="text-sm font-medium">No staff members match the selected criteria.</p>
            {(searchQuery || roleFilter !== "all") && (
              <button 
                onClick={() => { setSearchQuery(""); setRoleFilter("all"); }}
                className="mt-2 text-xs text-indigo-400 hover:text-indigo-300 font-bold"
              >
                Reset active filters
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#11111a] text-zinc-400 border-b border-white/10 text-xs uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-3.5 font-semibold">Identifier (Discord / MC / UUID)</th>
                  <th className="px-6 py-3.5 font-semibold">Assigned Role</th>
                  <th className="px-6 py-3.5 font-semibold">Permissions Summary</th>
                  <th className="px-6 py-3.5 font-semibold">Provisioned</th>
                  <th className="px-6 py-3.5 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredStaff.map((s: any) => {
                  const roleDef = ROLES[s.role] || ROLES.teller;
                  const isEditing = editingStaffId === s.id;

                  return (
                    <tr key={s.id} className="hover:bg-white/5 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span className="text-white font-mono font-bold text-sm select-all">
                            {s.discordId}
                          </span>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(s.discordId);
                              alert(`Copied ID: ${s.discordId}`);
                            }}
                            className="text-zinc-500 hover:text-zinc-300 p-1 transition-colors"
                            title="Copy ID"
                          >
                            <Copy size={12} />
                          </button>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {isEditing ? (
                          <div className="flex items-center gap-2">
                            <select
                              value={editRole}
                              onChange={e => setEditRole(e.target.value)}
                              className="bg-[#1a1a26] border border-indigo-500 rounded-lg px-2.5 py-1 text-xs text-white"
                            >
                              <option value="teller">Teller</option>
                              <option value="loan_officer">Loan Officer</option>
                              <option value="compliance">Compliance</option>
                              <option value="manager">Manager</option>
                              <option value="admin">Executive Admin</option>
                            </select>
                            <button
                              onClick={() => handleUpdateRole(s.id, editRole)}
                              className="bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold px-2 py-1 rounded transition-colors"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setEditingStaffId(null)}
                              className="text-zinc-500 hover:text-white text-[11px] px-1"
                            >
                              ✕
                            </button>
                          </div>
                        ) : (
                          <div 
                            onClick={() => {
                              setEditingStaffId(s.id);
                              setEditRole(s.role || "teller");
                            }}
                            className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full border cursor-pointer hover:opacity-80 transition-opacity ${roleDef.badgeColor}`}
                            title="Click to modify staff role"
                          >
                            {s.role === 'admin' ? <Key size={12} /> : <Shield size={12} />}
                            <span>{roleDef.name}</span>
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-xs text-zinc-400 max-w-[280px]">
                        <p className="truncate">{roleDef.description}</p>
                      </td>
                      <td className="px-6 py-4 text-zinc-500 text-xs whitespace-nowrap font-mono">
                        {format(new Date(s.createdAt), "MMM d, yyyy")}
                      </td>
                      <td className="px-6 py-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-2">
                          <button 
                            onClick={() => {
                              setEditingStaffId(s.id);
                              setEditRole(s.role || "teller");
                            }}
                            className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold px-2 py-1 rounded hover:bg-white/5 transition-colors"
                          >
                            Change Role
                          </button>
                          <button 
                            onClick={() => handleRemove(s.id)} 
                            className="text-red-400 hover:text-red-300 p-1.5 hover:bg-red-500/10 rounded transition-colors"
                            title="Revoke staff access"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
