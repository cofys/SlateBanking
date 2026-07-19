import * as fs from 'fs';

let code = fs.readFileSync('src/lib/AuthContext.tsx', 'utf8');

code = code.replace(
    `const res = await fetch('/api/auth/me');`,
    `const res = await fetch('/api/auth/me', { headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' } });`
);

fs.writeFileSync('src/lib/AuthContext.tsx', code);
console.log("Replaced cache");
