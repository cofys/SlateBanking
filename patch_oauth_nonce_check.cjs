const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const checkNonceCode = `    if (!stateObj || !expectedNonce || stateObj.nonce !== expectedNonce) {
      return res.status(400).send("Invalid OAuth state / nonce. Please try again.");
    }
    const intent = stateObj.intent;`;

code = code.replace(/const intent = stateObj\.intent;/, checkNonceCode); // This will replace the first occurrence (usually Discord callback)
code = code.replace(/const intent = stateObj\.intent;/, checkNonceCode); // CityCorp if any? Wait, intent might only be in Discord callback.

fs.writeFileSync('server.ts', code);
