const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

code = code.replace(/fs\.appendFileSync\('auth_debug\.log', JSON\.stringify\(\{ query: req\.query, time: new Date\(\)\.toISOString\(\) \}\) \+ '\\n'\);\n/g, '');

const debugHostRegex = /app\.get\('\/api\/debug-host', \(req, res\) => \{\n\s*res\.json\(\{\n\s*host: req\.get\('host'\),\n\s*hostname: req\.hostname,\n\s*headers: req\.headers,\n\s*protocol: req\.protocol,\n\s*\}\);\n\s*\}\);\n/m;
code = code.replace(debugHostRegex, '');

fs.writeFileSync('server.ts', code);
