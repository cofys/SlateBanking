import * as fs from 'fs';

let code = fs.readFileSync('src/lib/citycorp_api.ts', 'utf8');

code = code.replace(`private baseUrl = "https://api.cityrp.org";`, `private baseUrl = "https://api.cityrp.org/citycorp";`);

code = code.replace(/\/corp\/accounts/g, '/accounts');
code = code.replace(/\/corp\/pay/g, '/pay');

fs.writeFileSync('src/lib/citycorp_api.ts', code);
console.log("Replaced");
