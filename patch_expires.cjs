const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');
code = code.replace(/expiresIn: '7d'/g, "expiresIn: '1h'");
fs.writeFileSync('server.ts', code);
