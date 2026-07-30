const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'src', 'pages', 'CitizenPortal.tsx');
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  '  const [depositing, setDepositing] = useState(false);',
  '  const [depositing, setDepositing] = useState(false);\n\n  useEffect(() => {\n    document.title = "Citizen Portal | Slate Banking";\n  }, []);'
);

fs.writeFileSync(file, content);
console.log("Patched citizen successfully");
