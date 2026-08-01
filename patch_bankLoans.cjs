const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'src', 'pages', 'BankLoans.tsx');
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  '(statusOverride) =>',
  '(statusOverride: any) =>'
);

content = content.replace(
  '} catch (e) {',
  '} catch (e: any) {'
);

fs.writeFileSync(file, content);
console.log("Patched BankLoans.tsx");
