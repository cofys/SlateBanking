const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const r = `      if (req.query.error) { return res.status(400).send(\`CityCorp OAuth Error: \${req.query.error} - \${req.query.error_description}\`); }
    if (!code || !stateStr) {
        return res.status(400).send(\`Missing code or state. URL: \${req.originalUrl}\`);
      }

      const parsedState = JSON.parse(decodeURIComponent(stateStr));
      const discordId = parsedState.discordId;`;

const s = `      const expectedNonce = req.cookies?.oauth_nonce;
      res.clearCookie('oauth_nonce');
      if (req.query.error) { return res.status(400).send(\`CityCorp OAuth Error: \${req.query.error} - \${req.query.error_description}\`); }
    if (!code || !stateStr) {
        return res.status(400).send(\`Missing code or state. URL: \${req.originalUrl}\`);
      }

      const parsedState = JSON.parse(decodeURIComponent(stateStr));
      if (!parsedState || !expectedNonce || parsedState.nonce !== expectedNonce) {
          return res.status(400).send("Invalid OAuth state / nonce. Please try again.");
      }
      const discordId = parsedState.discordId;`;
code = code.replace(r, s);
fs.writeFileSync('server.ts', code);
