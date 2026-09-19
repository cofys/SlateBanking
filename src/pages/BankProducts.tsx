import { useState, useEffect } from "react";
import { useOutletContext } from "react-router-dom";
import { Package, Plus, Percent, Clock, DollarSign, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { formatMoney } from "../lib/utils";

export function BankProducts() {
  const { bank } = useOutletContext<{ bank: any }>();
  const [loans, setLoans] = useState<any[]>([]);
  const [credits, setCredits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newProductType, setNewProductType] = useState<'loan'|'credit'>('loan');
  const [submitting, setSubmitting] = useState(false);
  
  const [editingProduct, setEditingProduct] = useState<any>(null);

  const fetchProducts = () => {
    fetch(`/api/banks/${bank.id}/products`)
      .then(r => r.json())
      .then(d => {
        setLoans(d.loans || []);
        setCredits(d.credits || []);
        setLoading(false);
      })
      .catch(console.error);
  };
  
  useEffect(() => {
    if (bank?.id) fetchProducts();
  }, [bank.id]);

  
  const handleDeleteProduct = (product: any, type: string) => {
    if (!confirm(`Are you sure you want to delete ${product.name}?`)) return;
    fetch(`/api/banks/${bank.id}/products/${product.id}?type=${type}`, { method: 'DELETE' })
      .then(res => res.json())
      .then(d => {
        if (d.error) return alert(d.error);
        fetchProducts();
      });
  };

  const handleCreateProduct = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const formData = new FormData(e.target as HTMLFormElement);
    const isLoan = editingProduct ? editingProduct.termDays !== undefined : newProductType === 'loan';
    const data = {
      type: isLoan ? 'loan' : 'credit',
      name: formData.get('name'),
      interestRate: Number(formData.get('interestRate')),
      maxLimit: Number(formData.get('maxLimit')),
      termDays: formData.get('termDays') ? Number(formData.get('termDays')) : undefined,
      rewardsPercent: formData.get('rewardsPercent') ? Number(formData.get('rewardsPercent')) : undefined,
      cashAdvanceFeePercent: formData.get('cashAdvanceFeePercent'),
      annualFee: formData.get('annualFee'),
      tierId: String(formData.get('tierId') || '').trim() || null,
      cashAdvanceEnabled: formData.get('cashAdvanceEnabled') === 'on',
      isActive: editingProduct ? !!editingProduct.isActive : true,
    };

    const url = editingProduct
      ? `/api/banks/${bank.id}/products/${editingProduct.id}`
      : `/api/banks/${bank.id}/products`;
    const method = editingProduct ? "PUT" : "POST";

    fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    }).then(res => res.json()).then(d => {
      setSubmitting(false);
      if (d.error) return alert(d.error);
      setShowAdd(false);
      fetchProducts();
    });
  };

  if (loading) return <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-white/30" size={32} /></div>;

  return (
    <>
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Financial Products</h2>
          <p className="text-white/50">Manage the loan and credit products offered to your customers.</p>
        </div>
        <button onClick={() => { setEditingProduct(null); setShowAdd(true); setNewProductType("loan"); }} className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2">
          <Plus size={16} /> New Product
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-[var(--bg-elevated)] border border-white/10 rounded-xl p-6">
          <h3 className="text-lg font-medium mb-4 flex items-center gap-2"><DollarSign size={18} className="text-emerald-400"/> Loan Products</h3>
          {loans.length === 0 ? (
            <p className="text-white/40 text-sm">No loan products configured. Click 'New Product' to create one.</p>
          ) : (
            <div className="space-y-3">
               {loans.map(loan => (
                 <div key={loan.id} className="bg-black/30 border border-white/5 rounded-lg p-4 flex justify-between items-center hover:border-emerald-500/20 transition-colors group">
                   <div>
                     <div className="font-medium text-white">{loan.name}</div>
                     <div className="text-xs text-white/50 mt-1 flex gap-3">
                       <span>{loan.interestRate}% APR</span>
                       <span>Max {formatMoney(loan.maxAmount)}</span>
                       <span>{loan.termDays} Days</span>
                     </div>
                   </div>
                   <div className="flex items-center gap-3">
                       <div className="hidden group-hover:flex items-center gap-2 mr-2">
                           <button onClick={() => { setEditingProduct(loan); setShowAdd(true); }} className="text-white/50 hover:text-white text-xs underline">Edit</button>
                           <button onClick={() => handleDeleteProduct(loan, 'loan')} className="text-red-500/50 hover:text-red-500 text-xs underline">Delete</button>
                       </div>
                       <div className={`px-2 py-1 ${loan.isActive ? 'bg-emerald-500/10 text-emerald-400' : 'bg-white/10 text-white/40'} text-[10px] font-bold rounded uppercase`}>
                           {loan.isActive ? 'Active' : 'Disabled'}
                       </div>
                   </div>
                 </div>
               ))}
            </div>
          )}
        </div>

        <div className="bg-[var(--bg-elevated)] border border-white/10 rounded-xl p-6">
          <h3 className="text-lg font-medium mb-4 flex items-center gap-2"><Percent size={18} className="text-blue-400"/> Credit Card Products</h3>
          {credits.length === 0 ? (
            <p className="text-white/40 text-sm">No credit products configured.</p>
          ) : (
            <div className="space-y-3">
               {credits.map(credit => (
                 <div key={credit.id} className="bg-black/30 border border-white/5 rounded-lg p-4 flex justify-between items-center hover:border-blue-500/20 transition-colors group">
                   <div>
                     <div className="font-medium text-white">{credit.name}</div>
                     <div className="text-xs text-white/50 mt-1 flex gap-3">
                       <span>{credit.interestRate}% APR</span>
                       <span>Limit {formatMoney(credit.maxLimit)}</span>
                       {credit.rewardsPercent > 0 && <span>{credit.rewardsPercent}% Cashback</span>}
                       {credit.cashAdvanceEnabled !== false && <span>Cash advance</span>}
                     </div>
                   </div>
                   <div className="flex items-center gap-3">
                       <div className="hidden group-hover:flex items-center gap-2 mr-2">
                           <button onClick={() => { setEditingProduct(credit); setShowAdd(true); }} className="text-white/50 hover:text-white text-xs underline">Edit</button>
                           <button onClick={() => handleDeleteProduct(credit, 'credit')} className="text-red-500/50 hover:text-red-500 text-xs underline">Delete</button>
                       </div>
                       <div className={`px-2 py-1 ${credit.isActive ? 'bg-blue-500/10 text-blue-400' : 'bg-white/10 text-white/40'} text-[10px] font-bold rounded uppercase`}>
                           {credit.isActive ? 'Active' : 'Disabled'}
                       </div>
                   </div>
                 </div>
               ))}
            </div>
          )}
        </div>
      </div>
    </div>
    
      {showAdd && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <form onSubmit={handleCreateProduct} className="bg-[#111118] border border-white/10 rounded-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-white/5 flex items-center justify-between">
              <h3 className="text-lg font-semibold">{editingProduct ? "Edit Product" : "New Financial Product"}</h3>
              <button type="button" onClick={() => { setShowAdd(false); setEditingProduct(null); }} className="text-white/40 hover:text-white transition-colors">
                <Plus size={20} className="rotate-45" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {!editingProduct && (
                <div>
                  <label className="block text-sm font-medium text-white/70 mb-1">Product Type</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => setNewProductType('loan')} className={`py-2 px-4 rounded-lg text-sm font-medium transition-colors border ${newProductType === 'loan' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-transparent border-white/10 text-white/50 hover:bg-white/5'}`}>
                      Loan
                    </button>
                    <button type="button" onClick={() => setNewProductType('credit')} className={`py-2 px-4 rounded-lg text-sm font-medium transition-colors border ${newProductType === 'credit' ? 'bg-blue-500/10 border-blue-500/30 text-blue-400' : 'bg-transparent border-white/10 text-white/50 hover:bg-white/5'}`}>
                      Credit Card
                    </button>
                  </div>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-white/70 mb-1">Product Name</label>
                <input required name="name" type="text" defaultValue={editingProduct?.name} className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-indigo-500" placeholder="e.g. Starter Loan" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-white/70 mb-1">Interest Rate (%)</label>
                  <input required name="interestRate" type="number" step="0.1" defaultValue={editingProduct?.interestRate} className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-indigo-500" placeholder="5.0" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-white/70 mb-1">{(editingProduct?.termDays !== undefined) || (!editingProduct && newProductType === 'loan') ? 'Max Amount' : 'Max Limit'}</label>
                  <input required name="maxLimit" type="number" defaultValue={editingProduct ? ((editingProduct.maxAmount || editingProduct.maxLimit)/100) : undefined} className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-indigo-500" placeholder="10000" />
                </div>
              </div>
              {(editingProduct?.termDays !== undefined) || (!editingProduct && newProductType === 'loan') ? (
                <div>
                  <label className="block text-sm font-medium text-white/70 mb-1">Term (Days)</label>
                  <input required name="termDays" type="number" defaultValue={editingProduct?.termDays} className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-indigo-500" placeholder="30" />
                </div>
              ) : (
                <>
                <div>
                  <label className="block text-sm font-medium text-white/70 mb-1">Rewards Percent (%)</label>
                  <input name="rewardsPercent" type="number" step="0.1" defaultValue={editingProduct?.rewardsPercent || 0} className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-indigo-500" placeholder="1.5" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-white/70 mb-1">Cash advance fee (%)</label>
                    <input name="cashAdvanceFeePercent" type="number" step="0.01" defaultValue={editingProduct ? ((editingProduct.cashAdvanceFeePercent || 300) / 100) : 3} className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-indigo-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-white/70 mb-1">Annual fee ($)</label>
                    <input name="annualFee" type="number" step="0.01" defaultValue={editingProduct ? ((editingProduct.annualFeeCents || 0) / 100) : 0} className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-indigo-500" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-white/70 mb-1">Optional account tier</label>
                  <input name="tierId" type="text" defaultValue={editingProduct?.tierId || ""} placeholder="Leave blank = any account can apply" className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-indigo-500" />
                  <p className="text-[11px] text-white/35 mt-1">Not a hard gate. If set, that tier auto-qualifies; others still apply for staff review.</p>
                </div>
                <label className="flex items-center gap-2 text-sm text-white/70">
                  <input type="checkbox" name="cashAdvanceEnabled" defaultChecked={editingProduct?.cashAdvanceEnabled !== false} />
                  Allow cash advances
                </label>
                </>
              )}
              
              {editingProduct && (
                <label className="flex items-center gap-3 cursor-pointer group mt-4">
                   <div className={`w-8 h-5 shrink-0 rounded-full flex items-center p-1 transition-colors ${editingProduct.isActive ? 'bg-indigo-500' : 'bg-white/10'}`}>
                      <div className={`w-3 h-3 bg-white rounded-full transition-transform ${editingProduct.isActive ? 'translate-x-3' : 'translate-x-0'}`}></div>
                   </div>
                   <input type="checkbox" name="isActive" className="hidden" checked={editingProduct.isActive} onChange={(e) => setEditingProduct({...editingProduct, isActive: e.target.checked})} />
                   <span className="text-sm text-white/80 group-hover:text-indigo-400 transition-colors">Product is Active</span>
                </label>
              )}
            </div>
            <div className="p-6 border-t border-white/5 bg-white/5 flex gap-3">
              <button disabled={submitting} type="button" onClick={() => { setShowAdd(false); setEditingProduct(null); }} className="flex-1 bg-transparent hover:bg-white/5 border border-white/10 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                Cancel
              </button>
              <button disabled={submitting} type="submit" className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                {submitting ? "Saving..." : (editingProduct ? "Save Changes" : "Create Product")}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
