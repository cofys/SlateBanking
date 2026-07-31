const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'src', 'server', 'routes', 'portal.ts');
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  'res.status(500).json({ error: "Internal error" });',
  'res.status(500).json({ error: e.message || "Internal error", stack: e.stack });'
);

fs.writeFileSync(file, content);
