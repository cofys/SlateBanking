const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'src', 'server', 'routes', 'global.ts');
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  'const { desc, limit } = await import("drizzle-orm");',
  'const { desc } = await import("drizzle-orm");'
);

fs.writeFileSync(file, content);
console.log("Patched global.ts");
