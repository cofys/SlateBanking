import { useState, useEffect } from "react";
import { format } from "date-fns";
import { Download, Search } from "lucide-react";

export function TransactionsList() {
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    fetch("/api/transactions/recent")
      .then((res) => res.json())
      .then((data) => {
        setTransactions(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setTransactions([]);
        setLoading(false);
      });
  }, []);

  const handleExportCSV = () => {
    if (transactions.length === 0) return;
    const headers = ["ID", "Bank Name", "Amount", "Type", "Description", "Date"];
    const csvContent = [
      headers.join(","),
      ...transactions.map(tx => [
        tx.id,
        tx.bankName || "Unknown",
        tx.amount / 100,
        tx.type,
        `"${(tx.description || "").replace(/"/g, '""')}"`,
        new Date(tx.timestamp).toISOString()
      ].join(","))
    ].join("\\n");

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `transactions_export_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filtered = transactions.filter(tx => 
    (tx.description && tx.description.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (tx.bankName && tx.bankName.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (tx.type && tx.type.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Platform Transactions</h1>
          <p className="text-sm text-white/50 mt-1">
            Global view of all transactions across all hosted bank instances.
          </p>
        </div>
        <button 
          onClick={handleExportCSV}
          className="flex items-center gap-2 bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors"
        >
          <Download size={16} /> Export CSV
        </button>
      </div>

      <div className="bg-[#0f0f15] border border-white/10 rounded-xl overflow-hidden shadow-2xl">
        <div className="p-4 border-b border-white/10 flex items-center">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" size={16} />
            <input
              type="text"
              placeholder="Search by description, bank, or type..."
              className="w-full bg-[#16161d] border border-white/10 rounded-md py-2 pl-9 pr-4 text-sm text-white placeholder-white/30 focus:outline-none focus:border-indigo-500 transition-colors"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-white/40 uppercase bg-white/5 border-b border-white/10">
              <tr>
                <th className="px-6 py-3 font-medium">Bank</th>
                <th className="px-6 py-3 font-medium">Type</th>
                <th className="px-6 py-3 font-medium">Description</th>
                <th className="px-6 py-3 font-medium">Amount</th>
                <th className="px-6 py-3 font-medium text-right">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-white/40">
                    Loading transactions...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-white/40">
                    No transactions found.
                  </td>
                </tr>
              ) : (
                filtered.map((tx) => (
                  <tr key={tx.id} className="hover:bg-white/5 transition-colors">
                    <td className="px-6 py-4 font-medium">{tx.bankName || "Unknown"}</td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-white/10 text-white/80">
                        {tx.type}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-white/70 max-w-xs truncate" title={tx.description}>
                      {tx.description || "-"}
                    </td>
                    <td className="px-6 py-4 font-mono font-medium">
                      <span className={tx.type === 'deposit' || tx.type === 'onyx_payment' ? 'text-green-400' : 'text-red-400'}>
                        {tx.type === 'deposit' || tx.type === 'onyx_payment' ? '+' : '-'}${((tx.amount || 0) / 100).toFixed(2)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right text-white/40 whitespace-nowrap">
                      {format(new Date(tx.timestamp), "MMM d, yyyy h:mm a")}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
