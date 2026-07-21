const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');
code = code.replace(/sameSite: 'none'/g, "sameSite: 'lax'");
fs.writeFileSync('server.ts', code);
