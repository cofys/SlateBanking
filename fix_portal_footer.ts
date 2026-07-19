import * as fs from 'fs';

let code = fs.readFileSync('src/pages/BankPortal.tsx', 'utf8');

const oldStr = `      {/* Error Output */}
      {userData?.error && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-2xl text-center text-xs font-medium max-w-md mx-auto">
          {userData.error}
        </div>
      )}
    </div>
  );
}`;

const newStr = `      {/* Error Output */}
      {userData?.error && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-2xl text-center text-xs font-medium max-w-md mx-auto">
          {userData.error}
        </div>
      )}
      
      {/* Footer */}
      <div className="mt-12 text-center text-xs text-white/30 flex items-center justify-center gap-4 pb-8">
        <span>&copy; {new Date().getFullYear()} {bankData?.name}</span>
        <span>&bull;</span>
        <a href={\`/bank/\${bankId}\`} className="hover:text-white/70 transition-colors">Staff Portal</a>
      </div>
    </div>
  );
}`;

code = code.replace(oldStr, newStr);

fs.writeFileSync('src/pages/BankPortal.tsx', code);
console.log("Replaced footer");
