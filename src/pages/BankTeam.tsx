import { useState, useEffect } from "react";
import { useOutletContext } from "react-router-dom";
import { Users2, Shield, Plus, Trash2, Loader2, Key, Copy, Check } from "lucide-react";
import { format } from "date-fns";

export function BankTeam() {
  const { bank } = useOutletContext<{ bank: any }>();
  const [staff, setStaff] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);

  const fetchStaff = () => {
    setLoading(true);
    fetch(`/api/banks/${bank.id}/team`)
      .then(r => r.json())
      .then(data => {
        setStaff(data);
        setLoading(false);
      });
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
      if (!res.ok) alert("Failed to add staff member");
      setShowAdd(false);
      setSubmitting(false);
      fetchStaff();
    });
  };

  const handleRemove = (staffId: string) => {
    if (!confirm("Remove this staff member?")) return;
    fetch(`/api/banks/${bank.id}/team/${staffId}`, { method: "DELETE" })
      .then(() => fetchStaff());
  };

  if (loading) return <div className="text-white/50 animate-pulse p-4">Loading team...</div>;

  const staffPortalUrl = `${window.location.origin}/bank/${bank.id}`;

  return (
    <div className="max-w-6xl mx-auto animate-in fade-in duration-500">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Team Management</h2>
          <p className="text-white/60 text-sm mt-1">Manage staff access and permissions for your bank.</p>
        </div>
        <button 
          onClick={() => setShowAdd(true)}
          className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2"
        >
          <Plus size={16} />
          Add Staff Member
        </button>
      </div>

      <div className="bg-gradient-to-r from-indigo-950/40 via-purple-950/20 to-[#0f0f15] border border-indigo-500/20 rounded-xl p-4 mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400 mt-0.5 sm:mt-0 shrink-0">
            <Shield size={18} />
          </div>
          <div>
            <p className="text-sm font-bold text-white flex items-center gap-2">
              Staff Portal Direct Login Link
            </p>
            <p className="text-xs text-zinc-400 mt-0.5">
              Share this URL with authorized bank staff. Staff can log in directly with their Discord or CityCorp account without needing Global SaaS Admin access. Access is strictly controlled by your staff list below.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
          <code className="text-xs bg-black/40 border border-white/10 px-3 py-1.5 rounded-lg font-mono text-indigo-300 truncate max-w-[240px]">
            {staffPortalUrl}
          </code>
          <button
            onClick={() => {
              navigator.clipboard.writeText(staffPortalUrl);
              setCopiedUrl(true);
              setTimeout(() => setCopiedUrl(false), 2000);
            }}
            className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors shrink-0 flex items-center gap-1.5"
          >
            {copiedUrl ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy Link</>}
          </button>
        </div>
      </div>

      {showAdd && (
        <div className="bg-[#0f0f15] border border-white/10 rounded-xl p-6 mb-6">
          <h3 className="font-semibold mb-4">Add Staff Member</h3>
          <form onSubmit={handleAdd} className="flex gap-4">
            <div className="flex-1">
              <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide">Discord ID or MC Username</label>
              <input name="discordId" required type="text" className="w-full bg-[#1a1a24] border border-white/10 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" placeholder="123456789 or notch" />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide">Role</label>
              <select name="role" className="w-full bg-[#1a1a24] border border-white/10 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500">
                <option value="teller">Teller</option>
                <option value="manager">Manager</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div className="flex items-end">
              <button disabled={submitting} type="submit" className="bg-white text-black px-6 py-2 rounded-lg font-medium hover:bg-gray-200 transition-colors flex items-center gap-2">
                {submitting ? <Loader2 className="animate-spin" size={16} /> : "Invite"}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-[#0f0f15] border border-white/10 rounded-xl overflow-hidden">
        {staff.length === 0 ? (
          <div className="p-8 text-center text-white/40 flex flex-col items-center justify-center">
            <Users2 size={48} className="mb-4 opacity-20" />
            <p>No staff members found.</p>
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-[#1a1a24] text-white/50 border-b border-white/10">
              <tr>
                <th className="px-6 py-4 font-medium">Identifier (Discord/MC)</th>
                <th className="px-6 py-4 font-medium">Role</th>
                <th className="px-6 py-4 font-medium">Added</th>
                <th className="px-6 py-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {staff.map((s: any) => (
                <tr key={s.id} className="hover:bg-white/5 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap text-white font-medium">
                    {s.discordId}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-1.5 text-white/80">
                      {s.role === 'admin' ? <Key size={14} className="text-yellow-400" /> : <Shield size={14} className="text-blue-400" />}
                      <span className="capitalize">{s.role}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-white/50 whitespace-nowrap">
                    {format(new Date(s.createdAt), "MMM d, yyyy")}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button onClick={() => handleRemove(s.id)} className="text-red-400 hover:text-red-300 p-1">
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
