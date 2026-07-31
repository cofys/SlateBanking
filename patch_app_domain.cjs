const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'src', 'App.tsx');
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  "hostname.includes('run.app') || hostname.includes('onyx-network.com')",
  "hostname.includes('run.app') || hostname === 'onyx-network.com' || hostname === 'www.onyx-network.com'"
);

fs.writeFileSync(file, content);
console.log("Patched App.tsx");
