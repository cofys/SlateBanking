import { useState, useEffect } from "react";
import { useOutletContext } from "react-router-dom";
import { Copy, Plus, FileText, CheckCircle, XCircle, ArrowRight, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { formatMoney } from "../lib/utils";

export function BankInvoices() {
  const { bank } = useOutletContext<{ bank: any }>();
  const [invoices, setInvoices] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedInvoiceForPrint, setSelectedInvoiceForPrint] = useState<any | null>(null);
  
  const fetchInvoices = () => {
    setLoading(true);
    fetch(`/api/banks/${bank.id}/invoices`)
      .then(r => r.json())
      .then(data => {
        setInvoices(data);
        setLoading(false);
      });
  };

  const fetchAccounts = () => {
    fetch(`/api/banks/${bank.id}/accounts`)
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setAccounts(data);
      }).catch(() => {});
  };

  useEffect(() => {
    if (bank?.id) {
      fetchInvoices();
      fetchAccounts();
    }
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
                 <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide">Biller Account (Receives Funds)</label>
                 {accounts.length > 0 ? (
                   <select required name="billerAccountId" className="w-full bg-[#1a1a24] border border-white/10 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500">
                     <option value="">Select Biller...</option>
                     {accounts.map(acc => (
                       <option key={acc.id} value={acc.id}>
                         {acc.ownerMcUsername || acc.ownerDiscordId} - {acc.accountName} (${(acc.balance / 100).toFixed(2)})
                       </option>
                     ))}
                   </select>
                 ) : (
                   <input required name="billerAccountId" type="text" className="w-full bg-[#1a1a24] border border-white/10 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" placeholder="Username or Account ID" />
                 )}
               </div>
               <div className="flex-1">
                 <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide">Customer Account (Pays Funds)</label>
                 {accounts.length > 0 ? (
                   <select required name="customerAccountId" className="w-full bg-[#1a1a24] border border-white/10 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500">
                     <option value="">Select Customer...</option>
                     {accounts.map(acc => (
                       <option key={acc.id} value={acc.id}>
                         {acc.ownerMcUsername || acc.ownerDiscordId} - {acc.accountName} (${(acc.balance / 100).toFixed(2)})
                       </option>
                     ))}
                   </select>
                 ) : (
                   <input required name="customerAccountId" type="text" className="w-full bg-[#1a1a24] border border-white/10 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" placeholder="Username or Account ID" />
                 )}
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
                    <td className="px-6 py-4">
                      <div className="font-semibold text-white/90">{inv.billerUsername || inv.billerAccountId}</div>
                      <div className="text-xs text-white/40 font-mono mt-0.5">{inv.billerAccountName || inv.billerAccountId.split('-')[0]}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-semibold text-white/90">{inv.customerUsername || inv.customerAccountId}</div>
                      <div className="text-xs text-white/40 font-mono mt-0.5">{inv.customerAccountName || inv.customerAccountId.split('-')[0]}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-semibold font-mono text-white/90">{formatMoney(inv.amount)}</div>
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
                       <div className="flex justify-end gap-3 items-center">
                         <button 
                           type="button"
                           onClick={() => setSelectedInvoiceForPrint(inv)}
                           className="text-indigo-400 hover:text-indigo-300 transition-colors text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                         >
                           <FileText size={12} />
                           Invoice PDF
                         </button>
                         {inv.status === 'pending' && (
                           <button 
                             type="button"
                             onClick={() => handleCancel(inv.id)}
                             className="text-white/50 hover:text-red-400 transition-colors text-xs font-medium cursor-pointer"
                           >
                             Cancel
                           </button>
                         )}
                       </div>
                    </td>
                  </tr>
                ))}
             </tbody>
          </table>
        )}
      </div>

      {selectedInvoiceForPrint && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto print:absolute print:inset-0 print:bg-white print:p-0">
          <style dangerouslySetInnerHTML={{__html: `
            @media print {
              body * {
                visibility: hidden;
              }
              #printable-invoice, #printable-invoice * {
                visibility: visible;
              }
              #printable-invoice {
                position: absolute;
                left: 0;
                top: 0;
                width: 100%;
                background: white !important;
                color: black !important;
              }
            }
          `}} />
          <div className="bg-[#0f0f15] border border-white/10 rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh] print:max-h-none print:border-0 print:shadow-none print:w-full print:bg-white print:rounded-none">
            {/* Header controls (hidden on print) */}
            <div className="bg-[#0a0a0c] border-b border-white/10 px-6 py-4 flex justify-between items-center print:hidden">
              <div className="flex items-center gap-2">
                <FileText className="text-indigo-400" size={18} />
                <span className="font-semibold text-white">Invoice Document (PDF Preview)</span>
              </div>
              <div className="flex items-center gap-3">
                <button 
                  type="button"
                  onClick={() => window.print()}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-all cursor-pointer"
                >
                  Print / Save PDF
                </button>
                <button 
                  type="button"
                  onClick={() => setSelectedInvoiceForPrint(null)}
                  className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors text-white cursor-pointer"
                >
                  <XCircle size={16} />
                </button>
              </div>
            </div>

            {/* Printable Document Area */}
            <div id="printable-invoice" className="p-12 overflow-y-auto bg-white text-slate-900 font-sans print:p-0 print:overflow-visible flex-1 flex flex-col justify-between">
              <div>
                {/* Official Invoice Letterhead */}
                <div className="flex justify-between items-start border-b-2 border-indigo-900 pb-8 mb-8">
                  <div>
                    <h1 className="text-3xl font-extrabold tracking-tight text-indigo-950 uppercase">{bank.name}</h1>
                    <p className="text-xs font-mono text-indigo-800 tracking-wider mt-1">Onyx Clearinghouse Member No. #{bank.id.substring(0, 8).toUpperCase()}</p>
                    <p className="text-xs text-slate-500 mt-4 leading-normal">
                      100 Financial Plaza, Suite 400<br />
                      Global Digital Clearing, ONYX-900<br />
                      support@{bank.name.toLowerCase().replace(/\s+/g, '')}.com
                    </p>
                  </div>
                  <div className="text-right">
                    <h2 className="text-3xl font-extrabold text-indigo-950 uppercase tracking-wider">INVOICE</h2>
                    <p className="text-xs font-mono text-slate-500 mt-1">Invoice ID: {selectedInvoiceForPrint.id}</p>
                    <div className="mt-4 inline-block">
                      <span className={`px-2.5 py-1 rounded text-xs font-mono font-bold uppercase tracking-wider ${
                        selectedInvoiceForPrint.status === 'paid' ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' :
                        selectedInvoiceForPrint.status === 'cancelled' ? 'bg-zinc-100 text-zinc-800 border border-zinc-300' :
                        (new Date(selectedInvoiceForPrint.dueDate) < new Date() && selectedInvoiceForPrint.status === 'pending') ? 'bg-rose-100 text-rose-800 border border-rose-300' :
                        'bg-amber-100 text-amber-800 border border-amber-300'
                      }`}>
                        {selectedInvoiceForPrint.status}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Billing Addresses */}
                <div className="grid grid-cols-2 gap-8 mb-10 text-sm">
                  <div>
                    <h3 className="text-xs font-mono uppercase text-indigo-900 tracking-wider mb-2 font-bold">Biller (Receiver)</h3>
                    <p className="font-bold text-slate-900">{selectedInvoiceForPrint.billerUsername || bank.name}</p>
                    <p className="font-mono text-xs text-slate-500 mt-1">
                      Account: {selectedInvoiceForPrint.billerAccountName ? `${selectedInvoiceForPrint.billerAccountName} (${selectedInvoiceForPrint.billerAccountId})` : selectedInvoiceForPrint.billerAccountId}
                    </p>
                  </div>
                  <div>
                    <h3 className="text-xs font-mono uppercase text-indigo-900 tracking-wider mb-2 font-bold">Customer (Billed Party)</h3>
                    <p className="font-bold text-slate-900">{selectedInvoiceForPrint.customerUsername || "Registered Client"}</p>
                    <p className="font-mono text-xs text-slate-500 mt-1">
                      Account: {selectedInvoiceForPrint.customerAccountName ? `${selectedInvoiceForPrint.customerAccountName} (${selectedInvoiceForPrint.customerAccountId})` : selectedInvoiceForPrint.customerAccountId}
                    </p>
                  </div>
                </div>

                {/* Dates Block */}
                <div className="grid grid-cols-3 gap-4 mb-10 bg-slate-50 border border-slate-100 rounded-xl p-4 text-xs">
                  <div>
                    <span className="text-slate-400 block uppercase font-mono tracking-wider">Date Issued</span>
                    <span className="font-bold text-slate-800">{format(new Date(), "MMMM d, yyyy")}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block uppercase font-mono tracking-wider">Due Date</span>
                    <span className="font-bold text-slate-800">{format(new Date(selectedInvoiceForPrint.dueDate), "MMMM d, yyyy")}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block uppercase font-mono tracking-wider">Payment Term</span>
                    <span className="font-bold text-slate-800">Net Payable Upon Receipt</span>
                  </div>
                </div>

                {/* Itemized Line Items */}
                <div className="mb-10">
                  <h3 className="text-xs font-mono uppercase text-indigo-900 tracking-wider mb-3 font-bold">Line Items</h3>
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b-2 border-slate-300 text-slate-500 uppercase font-mono tracking-wider">
                        <th className="py-2.5 font-semibold">Service Description</th>
                        <th className="py-2.5 font-semibold text-right">Qty</th>
                        <th className="py-2.5 font-semibold text-right">Unit Price</th>
                        <th className="py-2.5 font-semibold text-right">Total Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      <tr>
                        <td className="py-4">
                          <span className="font-bold text-slate-900 text-sm">{selectedInvoiceForPrint.description}</span>
                          <span className="block text-[10px] text-slate-400 mt-1">Standard digital billing ledger transaction entry.</span>
                        </td>
                        <td className="py-4 text-right font-mono text-slate-700">1</td>
                        <td className="py-4 text-right font-mono text-slate-700">${(selectedInvoiceForPrint.amount / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        <td className="py-4 text-right font-mono font-bold text-slate-900">${(selectedInvoiceForPrint.amount / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Calculation breakdown */}
                <div className="flex justify-end text-sm">
                  <div className="w-80 space-y-2 border-t border-slate-200 pt-4">
                    <div className="flex justify-between text-slate-500">
                      <span>Subtotal:</span>
                      <span className="font-mono">${(selectedInvoiceForPrint.amount / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between text-slate-500">
                      <span>Clearing Fees (0.00%):</span>
                      <span className="font-mono">$0.00</span>
                    </div>
                    <div className="flex justify-between border-t-2 border-indigo-900 pt-2 text-indigo-950 font-bold text-base">
                      <span>Total Due (USD):</span>
                      <span className="font-mono">${(selectedInvoiceForPrint.amount / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Legal disclosure and Stamp */}
              <div className="border-t border-slate-200 pt-8 mt-12 flex justify-between items-end text-[10px] text-slate-400 leading-normal">
                <div>
                  <p className="font-semibold text-slate-500 uppercase tracking-wide mb-1">Slate SaaS Global Clearing System Invoice</p>
                  <p className="max-w-xl">
                    This invoice was generated electronically via the secure Onyx Global Clearing and settlement system. Authorized agents and compliance officers can trace transaction reference hashes using public docs and audit trails. Settlement must occur directly from registered bank balances.
                  </p>
                </div>
                <div className="text-right">
                  <div className="border border-indigo-900/20 rounded-full px-5 py-3.5 inline-block bg-indigo-50/10 text-indigo-950 font-serif italic text-center text-xs tracking-wider border-dashed">
                    Slate Authorized<br />
                    <span className="font-sans text-[8px] font-mono uppercase text-indigo-800 not-italic tracking-widest font-bold">SECURE INVOICE</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
