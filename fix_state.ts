import * as fs from 'fs';

let code = fs.readFileSync('server.ts', 'utf8');

// For explicit citycorp
code = code.replace(
    `const state = encodeURIComponent(JSON.stringify({ bankId: bank.id }));`,
    `const state = encodeURIComponent(JSON.stringify({ bankId: bank.id, returnTo: req.query.returnTo }));`
);
// Replace again for implicit citycorp
code = code.replace(
    `const state = encodeURIComponent(JSON.stringify({ bankId: bank.id }));`,
    `const state = encodeURIComponent(JSON.stringify({ bankId: bank.id, returnTo: req.query.returnTo }));`
);

// For discord
const oldDiscord = `    const intent = req.query.intent || 'login';
    const stateObj: any = { intent };
    if (bank) stateObj.bankId = bank.id;
    const state = encodeURIComponent(JSON.stringify(stateObj));`;

const newDiscord = `    const intent = req.query.intent || 'login';
    const returnTo = req.query.returnTo;
    const stateObj: any = { intent };
    if (bank) stateObj.bankId = bank.id;
    if (returnTo) stateObj.returnTo = returnTo;
    const state = encodeURIComponent(JSON.stringify(stateObj));`;

code = code.replace(oldDiscord, newDiscord);

fs.writeFileSync('server.ts', code);
console.log("Replaced state obj");
