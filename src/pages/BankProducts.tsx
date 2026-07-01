import { useState, useEffect } from "react";
import { useOutletContext } from "react-router-dom";
import { Package, Plus, Percent, Clock, DollarSign, Loader2 } from "lucide-react";
import { format } from "date-fns";

export function BankProducts() {
  const { bank } = useOutletContext<{ bank: any }>();
  const [loans, setLoans] = useState<any[]>([]);
  const [credits, setCredits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // We would fetch products here
    setLoading(false);
  }, [bank.id]);

  if (loading) return <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-white/30" size={32} /></div>;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Financial Products</h2>
          <p className="text-white/50">Manage the loan and credit products offered to your customers.</p>
        </div>
        <button className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2">
          <Plus size={16} /> New Product
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-[#0f0f15] border border-white/10 rounded-xl p-6">
          <h3 className="text-lg font-medium mb-4 flex items-center gap-2"><DollarSign size={18} className="text-emerald-400"/> Loan Products</h3>
          {loans.length === 0 ? (
            <p className="text-white/40 text-sm">No loan products configured. Click 'New Product' to create one.</p>
          ) : (
            <div className="space-y-3">
               {/* List loans here */}
            </div>
          )}
        </div>

        <div className="bg-[#0f0f15] border border-white/10 rounded-xl p-6">
          <h3 className="text-lg font-medium mb-4 flex items-center gap-2"><Percent size={18} className="text-blue-400"/> Credit Card Products</h3>
          {credits.length === 0 ? (
            <p className="text-white/40 text-sm">No credit products configured.</p>
          ) : (
            <div className="space-y-3">
               {/* List credits here */}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
