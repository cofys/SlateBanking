import { useState, useEffect } from "react";
import { useOutletContext } from "react-router-dom";
import { Copy, Plus, FileText, CheckCircle, XCircle, ArrowRight, Loader2 } from "lucide-react";
import { format } from "date-fns";

export function BankInvoices() {
  const { bank } = useOutletContext<{ bank: any }>();
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  
  const fetchInvoices = () => {
    setLoading(true);
    fetch(`/api/banks/${bank.id}/invoices`)
      .then(r => r.json())
      .then(data => {
        setInvoices(data);
        setLoading(false);
      });
  };

  useEffect(() => {
    if (bank?.id) fetchInvoices();
  }, [bank]);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const fd = new FormData(e.target as HTMLFormElement);
    const data = {
      billerAccountId: fd.get("billerAccountId"),
      customerAccountId: fd.get("customerAccountId"),
      amount: parseFloat(fd.get("amount") as string) * 100,
      description: fd.get("description"),
      dueDateDays: parseInt(fd.get("dueDateDays") as string)
    };

    fetch(`/api/banks/${bank.id}/invoices`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    }).then(async res => {
      setSubmitting(false);
      if (!res.ok) {
         const err = await res.json().catch(()=>({}));
         alert(err.error || "Failed");
         return;
      }
      setShowAdd(false);
      fetchInvoices();
    });
  };

  const handleCancel = (invoiceId: string) => {
     if (!confirm("Are you sure you want to cancel this invoice?")) return;
     fetch(`/api/banks/${bank.id}/invoices/${invoiceId}/status`, {
       method: "PUT",
       headers: { "Content-Type": "application/json" },
       body: JSON.stringify({ status: 'cancelled' })
     }).then(() => fetchInvoices());
  };

  return (
    <div className="max-w-6xl mx-auto animate-in fade-in duration-500">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Invoices</h2>
          <p className="text-white/60 text-sm mt-1">Issue and manage payment requests between accounts.</p>
        </div>
        <button 
          onClick={() => setShowAdd(!showAdd)}
          className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
        >
          {showAdd ? "Close Form" : <><Plus size={16} /> New Invoice</>}
        </button>
      </div>

      {showAdd && (
        <div className="bg-[#0f0f15] border border-white/10 p-6 rounded-xl mb-8">
          <h3 className="text-lg font-medium mb-4">Draft New Invoice</h3>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="flex gap-4">
               <div className="flex-1">
                 <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide">Biller Account ID (Receives Funds)</label>
                 <input required name="billerAccountId" type="text" className="w-full bg-[#1a1a24] border border-white/10 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 font-mono" placeholder="acc-uuid" />
               </div>
               <div className="flex-1">
                 <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide">Customer Account ID (Pays Funds)</label>
                 <input required name="customerAccountId" type="text" className="w-full bg-[#1a1a24] border border-white/10 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 font-mono" placeholder="acc-uuid" />
               </div>
            </div>
            
            <div className="flex gap-4 pt-2">
               <div className="w-1/3">
                 <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide">Amount Due ($)</label>
                 <input required name="amount" type="number" step="0.01" min="0.01" className="w-full bg-[#1a1a24] border border-white/10 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" placeholder="100.00" />
               </div>
               <div className="w-1/3">
                 <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide">Due In (Days)</label>
                 <select name="dueDateDays" className="w-full bg-[#1a1a24] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500">
                   <option value="1">1 Day</option>
                   <option value="7">7 Days</option>
                   <option value="14">14 Days</option>
                   <option value="30">30 Days</option>
                 </select>
               </div>
               <div className="flex-1">
                 <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide">Description / Notes</label>
                 <input required name="description" type="text" className="w-full bg-[#1a1a24] border border-white/10 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" placeholder="e.g. Server Hosting Fees" />
               </div>
            </div>
            
            <div className="pt-4 flex gap-4">
              <button disabled={submitting} type="submit" className="bg-white hover:bg-gray-200 text-black px-6 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2">
                {submitting ? <Loader2 className="animate-spin" size={16} /> : "Issue Invoice"}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-[#0f0f15] border border-white/10 rounded-xl overflow-hidden overflow-x-auto">
        {loading ? (
          <div className="p-8 text-center text-white/50">Loading invoices...</div>
        ) : invoices.length === 0 ? (
          <div className="p-12 text-center flex flex-col items-center">
             <FileText className="text-white/20 mb-4" size={48} />
             <p className="text-white/50">No invoices have been issued.</p>
          </div>
        ) : (
          <table className="w-full text-sm text-left min-w-[800px]">
             <thead className="text-xs text-white/40 uppercase tracking-widest bg-white/5 border-b border-white/10">
               <tr>
                 <th className="px-6 py-4 font-medium">Invoice & Description</th>
                 <th className="px-6 py-4 font-medium">Biller (To)</th>
                 <th className="px-6 py-4 font-medium">Customer (From)</th>
                 <th className="px-6 py-4 font-medium">Amount & Due Date</th>
                 <th className="px-6 py-4 font-medium">Status</th>
                 <th className="px-6 py-4 font-medium text-right">Actions</th>
               </tr>
             </thead>
             <tbody className="divide-y divide-white/5">
                {invoices.map(inv => (
                  <tr key={inv.id} className="hover:bg-white/[0.02] transition-colors group">
                    <td className="px-6 py-4">
                      <div className="font-medium text-white/90">{inv.description}</div>
                      <div className="text-xs text-white/40 font-mono mt-1 w-32 truncate" title={inv.id}>{inv.id}</div>
                    </td>
                    <td className="px-6 py-4 font-mono text-xs text-white/60">
                      {inv.billerAccountId.split('-')[0]}...
                    </td>
                    <td className="px-6 py-4 font-mono text-xs text-white/60">
                      {inv.customerAccountId.split('-')[0]}...
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-medium text-white/90">${(inv.amount / 100).toFixed(2)}</div>
                      <div className="text-xs text-white/50 mt-1">Due {format(new Date(inv.dueDate), "MMM d, yyyy")}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded text-xs uppercase tracking-wider font-medium inline-flex items-center gap-1 ${
                        inv.status === 'paid' ? 'bg-emerald-500/20 text-emerald-400' :
                        inv.status === 'cancelled' ? 'bg-zinc-500/20 text-zinc-400' :
                        (new Date(inv.dueDate) < new Date() && inv.status === 'pending') ? 'bg-red-500/20 text-red-400' :
                        'bg-amber-500/20 text-amber-400'
                      }`}>
                         {inv.status === 'paid' ? <CheckCircle size={12}/> : 
                          inv.status === 'cancelled' ? <XCircle size={12}/> : <ArrowRight size={12}/>}
                         {(new Date(inv.dueDate) < new Date() && inv.status === 'pending') ? 'OVERDUE' : inv.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                       {inv.status === 'pending' && (
                         <button 
                           onClick={() => handleCancel(inv.id)}
                           className="text-white/50 hover:text-red-400 transition-colors text-xs font-medium"
                         >
                           Cancel
                         </button>
                       )}
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
