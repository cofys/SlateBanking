const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'src', 'pages', 'CitizenPortal.tsx');
let content = fs.readFileSync(file, 'utf8');

const signatureCode = `
              {loan.status === "awaiting_signature" && (
                <div className="mt-6 pt-4 border-t border-white/5 space-y-3">
                  <div className="bg-amber-500/10 border border-amber-500/20 p-3 rounded-lg text-amber-200/80 text-xs">
                    Your loan application has been reviewed and requires your signature. Please review the contract terms below.
                  </div>
                  {(loan.contractUrl || loan.contractText) && (
                    <div className="bg-black/20 p-3 rounded-lg border border-white/5 max-h-40 overflow-y-auto text-xs text-white/70 whitespace-pre-wrap">
                      {loan.contractText || <a href={loan.contractUrl} target="_blank" rel="noreferrer" className="text-indigo-400 hover:underline">View Contract Document</a>}
                    </div>
                  )}
                  <button onClick={async () => {
                    const res = await fetch(\`/api/citizen/loans/\${loan.id}/sign\`, { method: "POST", headers: { "Content-Type": "application/json" } });
                    if (res.ok) {
                      alert("Contract signed successfully! Loan is now active and funds have been deposited.");
                      refresh();
                    } else {
                      const err = await res.json();
                      alert("Error: " + err.error);
                    }
                  }} className="w-full bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg py-2 text-sm font-medium transition-colors">
                    Sign & Accept Terms
                  </button>
                </div>
              )}
              {loan.status === "pending" && (
                <div className="mt-6 pt-4 border-t border-white/5 text-center text-xs text-slate-500">
                  Your application is currently under review by bank staff.
                </div>
              )}
`;

if (!content.includes('loan.status === "awaiting_signature"')) {
    content = content.replace(
        '{loan.status === "active" && (',
        signatureCode + '\n              {loan.status === "active" && ('
    );
    fs.writeFileSync(file, content);
    console.log("Patched UI successfully");
} else {
    console.log("Already patched");
}
