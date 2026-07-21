const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const replacement = `      if (state) {
        const decodedState = JSON.parse(decodeURIComponent(state as string));
        if (decodedState.nonce !== expectedNonce) {
           return res.status(400).send("Invalid OAuth state / nonce. Please try again.");
        }
        console.log("Discord Callback - Decoded State:", decodedState);
        intent = decodedState.intent || 'login';
        bankId = decodedState.bankId;
      }`;
code = code.replace(/if \(state\) \{\s*const decodedState = JSON\.parse\(decodeURIComponent\(state as string\)\);\s*console\.log\("Discord Callback - Decoded State:", decodedState\);\s*intent = decodedState\.intent \|\| 'login';\s*bankId = decodedState\.bankId;\s*\}/, replacement);
fs.writeFileSync('server.ts', code);
