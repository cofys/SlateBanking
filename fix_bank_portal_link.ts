import * as fs from 'fs';

let code = fs.readFileSync('src/pages/BankPortal.tsx', 'utf8');

const oldFetch = `const res = await fetch(\`/api/auth/url?provider=discord&intent=link&returnTo=\${encodeURIComponent(window.location.pathname)}\`);`;
const newFetch = `const res = await fetch(\`/api/auth/url?provider=discord&intent=link&bankId=\${bankId}&returnTo=\${encodeURIComponent(window.location.pathname)}\`);`;

code = code.replace(oldFetch, newFetch);

fs.writeFileSync('src/pages/BankPortal.tsx', code);
console.log("Replaced link fetch");
