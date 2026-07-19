import * as fs from 'fs';

let code = fs.readFileSync('src/pages/BankPortal.tsx', 'utf8');

code = code.replace(
    `import { useParams } from "react-router-dom";`,
    `import { useParams, Link } from "react-router-dom";`
);

const oldHeader = `        </div>
        {user && (
          <div className="flex items-center gap-4 bg-[#0a0a0f] border border-white/5 rounded-2xl p-2 px-4 shadow-xl">`;

const newHeader = `        </div>
        
        <div className="flex items-center gap-4">
          <Link 
            to={\`/bank/\${bankId}\`} 
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-white/5 bg-[#0a0a0f] hover:bg-white/10 text-xs font-medium text-zinc-400 hover:text-white transition-all shadow-xl"
          >
            <ShieldCheck size={14} />
            Staff Portal
          </Link>

          {user && (
            <div className="flex items-center gap-4 bg-[#0a0a0f] border border-white/5 rounded-2xl p-2 px-4 shadow-xl">`;

const oldClose = `              <LogOut size={16} />
            </button>
          </div>
        )}
      </div>`;

const newClose = `              <LogOut size={16} />
            </button>
          </div>
          )}
        </div>
      </div>`;

code = code.replace(oldHeader, newHeader);
code = code.replace(oldClose, newClose);

fs.writeFileSync('src/pages/BankPortal.tsx', code);
console.log("Replaced");
