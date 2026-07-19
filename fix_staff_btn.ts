import * as fs from 'fs';

let code = fs.readFileSync('src/pages/BankPortal.tsx', 'utf8');

const oldHeader = `<div className="flex items-center gap-4">
          <Link 
            to={\`/bank/\${bankId}\`} 
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-white/5 bg-[#0a0a0f] hover:bg-white/10 text-xs font-medium text-zinc-400 hover:text-white transition-all shadow-xl"
          >
            <ShieldCheck size={14} />
            Staff Portal
          </Link>

          {user && (`;

const newHeader = `<div className="flex items-center gap-4">
          {userData?.isStaff && (
            <Link 
              to={\`/bank/\${bankId}\`} 
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-white/5 bg-[#0a0a0f] hover:bg-white/10 text-xs font-medium text-zinc-400 hover:text-white transition-all shadow-xl"
            >
              <ShieldCheck size={14} />
              Staff Portal
            </Link>
          )}

          {user && (`;

if (code.includes(oldHeader)) {
    code = code.replace(oldHeader, newHeader);
    fs.writeFileSync('src/pages/BankPortal.tsx', code);
    console.log("Replaced staff button");
} else {
    console.log("Could not find staff button");
}
