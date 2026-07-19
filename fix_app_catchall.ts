import * as fs from 'fs';

let code = fs.readFileSync('src/App.tsx', 'utf8');

code = code.replace(
  '<Route path="/*" element={<div className="min-h-screen bg-[#0a0a0c] text-white overflow-y-auto"><BankPortal overrideBankId={customBankId} /></div>} />',
  '<Route path="/" element={<div className="min-h-screen bg-[#0a0a0c] text-white overflow-y-auto"><BankPortal overrideBankId={customBankId} /></div>} />'
);

fs.writeFileSync('src/App.tsx', code);
console.log("Replaced /* with /");
