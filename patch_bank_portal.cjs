const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'src', 'pages', 'BankPortal.tsx');
let content = fs.readFileSync(file, 'utf8');

// Add bankNotFound state
content = content.replace(
  'const [bank, setBank] = useState<any>(null);',
  'const [bank, setBank] = useState<any>(null);\n  const [bankNotFound, setBankNotFound] = useState(false);'
);

// Update fetch logic
content = content.replace(
  '      .then(d => {\n        if (!d.error) { setBank(d); document.title = `${d.name} | Client Portal`; }\n      });',
  '      .then(d => {\n        if (!d.error) { \n          setBank(d); \n          document.title = `${d.name} | Client Portal`; \n        } else {\n          setBankNotFound(true);\n        }\n      })\n      .catch(() => setBankNotFound(true));'
);

// Update loading rendering
content = content.replace(
  '  if (isLoading || !bank) {\n    return (\n      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3">\n        <Loader2 className="animate-spin text-indigo-500" size={32} />\n        <p className="text-sm text-zinc-400 font-mono">Loading financial gateway...</p>\n      </div>\n    );\n  }',
  '  if (bankNotFound || !bankId) {\n    return (\n      <div className="min-h-screen bg-[#0a0a0c] flex flex-col items-center justify-center gap-4 text-white">\n        <AlertTriangle className="text-red-500" size={48} />\n        <h2 className="text-xl font-bold">Bank Not Found</h2>\n        <p className="text-white/50">The requested financial gateway could not be located.</p>\n      </div>\n    );\n  }\n\n  if (isLoading || !bank) {\n    return (\n      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3">\n        <Loader2 className="animate-spin text-indigo-500" size={32} />\n        <p className="text-sm text-zinc-400 font-mono">Loading financial gateway...</p>\n      </div>\n    );\n  }'
);

fs.writeFileSync(file, content);
console.log("Patched BankPortal.tsx");
