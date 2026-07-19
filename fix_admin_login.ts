import * as fs from 'fs';

let code = fs.readFileSync('src/components/layout/BankAdminLayout.tsx', 'utf8');

code = code.replace(
    `onClick={() => login(bankId)}`,
    `onClick={() => login(bankId, 'discord')}`
);

fs.writeFileSync('src/components/layout/BankAdminLayout.tsx', code);
console.log("Replaced");
