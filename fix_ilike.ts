import * as fs from 'fs';

let code = fs.readFileSync('server.ts', 'utf8');

code = code.replace(/ilike/g, 'like');

fs.writeFileSync('server.ts', code);
console.log("Replaced ilike");
