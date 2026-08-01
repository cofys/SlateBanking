const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'server.ts');
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  'req.user = decoded;',
  '(req as any).user = decoded;'
);
content = content.replace(
  'req.user = decoded;',
  '(req as any).user = decoded;'
);
content = content.replace(
  'req.user = decoded;',
  '(req as any).user = decoded;'
);

content = content.replace(
  'discordId = decoded.discordId;',
  'discordId = (decoded as any).discordId;'
);
content = content.replace(
  'discordId = decoded.discordId;',
  'discordId = (decoded as any).discordId;'
);

content = content.replace(
  'res.on(\'finish\', () => {',
  'res.on(\'finish\', () => {\n      const token = req.cookies.session;'
);
content = content.replace(
  'let discordId = null;',
  'let discordId: string | null = null;'
);


fs.writeFileSync(file, content);
console.log("Patched server.ts");
