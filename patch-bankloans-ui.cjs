const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'src', 'pages', 'BankLoans.tsx');
let content = fs.readFileSync(file, 'utf8');

const editModalState = `
  const [editInterestRate, setEditInterestRate] = useState("");
  const [editPrincipal, setEditPrincipal] = useState("");
  const [editContractUrl, setEditContractUrl] = useState("");
  const [editContractText, setEditContractText] = useState("");
  
  useEffect(() => {
    if (selectedLoan) {
      setEditCollateralStatus(selectedLoan.collateralStatus || "none");
      setEditCollateralDesc(selectedLoan.collateralDescription || "");
      setEditCollateralVal(selectedLoan.collateralValue ? (selectedLoan.collateralValue / 100).toString() : "");
      setEditInterestRate(selectedLoan.interestRate ? (selectedLoan.interestRate / 100).toString() : "5");
      setEditPrincipal(selectedLoan.principalAmount ? (selectedLoan.principalAmount / 100).toString() : "");
      setEditContractUrl(selectedLoan.contractUrl || "");
      setEditContractText(selectedLoan.contractText || "");
    }
  }, [selectedLoan]);
  
  const handleUpdateLoan = async (statusOverride) => {
    try {
      const updates = {
        interestRate: parseFloat(editInterestRate) * 100,
        principalAmount: parseFloat(editPrincipal) * 100,
        collateralStatus: editCollateralStatus,
        collateralDescription: editCollateralDesc,
        collateralValue: parseFloat(editCollateralVal) * 100,
        contractUrl: editContractUrl,
        contractText: editContractText,
      };
      if (statusOverride) updates.status = statusOverride;
      
      const res = await fetch(\`/api/banks/\${bankId}/loans/\${selectedLoan.id}\`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates)
      });
      if (res.ok) {
        alert("Loan updated");
        fetchData();
        if (statusOverride === "active") setSelectedLoan(null);
      } else {
        const err = await res.json();
        alert("Error: " + err.error);
      }
    } catch (e) {
      alert("Error: " + e.message);
    }
  };
`;

const pendingEditUI = `
                {selectedLoan.status === "pending" || selectedLoan.status === "awaiting_signature" ? (
                  <div className="col-span-2 bg-black/20 p-6 rounded-xl border border-white/5 space-y-6">
                    <h3 className="text-white font-medium mb-2">Review Application & Terms</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs text-white/50 mb-1">Principal Amount ($)</label>
                        <input type="number" value={editPrincipal} onChange={e => setEditPrincipal(e.target.value)} className="w-full bg-slate-900 border border-white/10 rounded-lg px-3 py-2 text-white" />
                      </div>
                      <div>
                        <label className="block text-xs text-white/50 mb-1">Interest Rate (%)</label>
                        <input type="number" value={editInterestRate} onChange={e => setEditInterestRate(e.target.value)} className="w-full bg-slate-900 border border-white/10 rounded-lg px-3 py-2 text-white" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs text-white/50 mb-1">Contract Document URL (Optional)</label>
                      <input type="text" value={editContractUrl} onChange={e => setEditContractUrl(e.target.value)} className="w-full bg-slate-900 border border-white/10 rounded-lg px-3 py-2 text-white" placeholder="https://docs.google.com/..." />
                    </div>
                    <div>
                      <label className="block text-xs text-white/50 mb-1">Contract Text (Optional)</label>
                      <textarea value={editContractText} onChange={e => setEditContractText(e.target.value)} className="w-full bg-slate-900 border border-white/10 rounded-lg px-3 py-2 text-white min-h-[100px]" placeholder="By signing this, you agree to..." />
                    </div>
                    
                    <div className="flex gap-4 pt-4 border-t border-white/5">
                      <button onClick={() => handleUpdateLoan("awaiting_signature")} className="flex-1 bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:bg-amber-500/30 py-2 rounded-lg font-medium">
                        Request Client Signature
                      </button>
                      <button onClick={() => handleUpdateLoan("active")} className="flex-1 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30 py-2 rounded-lg font-medium">
                        Approve & Fund Immediately
                      </button>
                      <button onClick={() => handleUpdateLoan("rejected")} className="flex-1 bg-rose-500/20 text-rose-400 border border-rose-500/30 hover:bg-rose-500/30 py-2 rounded-lg font-medium">
                        Reject Application
                      </button>
                    </div>
                  </div>
                ) : (
`;

if (!content.includes('const [editContractUrl')) {
    // Inject editModalState
    content = content.replace(
      'useEffect(() => {\n    if (selectedLoan) {',
      editModalState.split('useEffect(()')[0] + '\n  useEffect(() => {\n    if (selectedLoan) {'
    );
    // Replace the inside of useEffect for selectedLoan to include the new fields
    content = content.replace(
      'setEditCollateralVal(selectedLoan.collateralValue ? (selectedLoan.collateralValue / 100).toString() : "");',
      'setEditCollateralVal(selectedLoan.collateralValue ? (selectedLoan.collateralValue / 100).toString() : "");\n      setEditInterestRate(selectedLoan.interestRate ? (selectedLoan.interestRate / 100).toString() : "5");\n      setEditPrincipal(selectedLoan.principalAmount ? (selectedLoan.principalAmount / 100).toString() : "");\n      setEditContractUrl(selectedLoan.contractUrl || "");\n      setEditContractText(selectedLoan.contractText || "");'
    );
    // Add handleUpdateLoan right after the fetchData function
    content = content.replace(
      '  const handleProcessDueLoans',
      editModalState.split('  const handleUpdateLoan = async')[1] ? '  const handleUpdateLoan = async' + editModalState.split('  const handleUpdateLoan = async')[1] + '\n\n  const handleProcessDueLoans' : '  const handleProcessDueLoans'
    );
    
    // Inject the UI
    const targetUI = '<div className="p-6 grid grid-cols-2 gap-8 max-h-[80vh] overflow-y-auto">';
    content = content.replace(
      targetUI,
      targetUI + '\n' + pendingEditUI
    );
    
    // Make sure we close the ) : ( from pendingEditUI
    const endTarget = '</motion.div>';
    // We need to add )} before the end of the scroll container
    content = content.replace(
      '              </div>\n\n              <div className="p-6 border-t border-white/5 bg-black/20',
      '                )}\n              </div>\n\n              <div className="p-6 border-t border-white/5 bg-black/20'
    );
    
    fs.writeFileSync(file, content);
    console.log("Patched UI successfully");
} else {
    console.log("Already patched");
}
