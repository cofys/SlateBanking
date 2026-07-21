const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const r1 = `const state = encodeURIComponent(JSON.stringify({ bankId: bank.id, returnTo: req.query.returnTo }));`;
const s1 = `const { v4: uuidv4 } = await import("uuid");
        const nonce = uuidv4();
        res.cookie('oauth_nonce', nonce, { maxAge: 10 * 60 * 1000, httpOnly: true, secure: true, sameSite: 'lax' });
        const state = encodeURIComponent(JSON.stringify({ bankId: bank.id, returnTo: req.query.returnTo, nonce }));`;
code = code.replace(r1, s1);

const r2 = `const state = encodeURIComponent(JSON.stringify({ bankId: bank.id, returnTo: req.query.returnTo }));`;
code = code.replace(r2, s1); // replace second occurrence

const r3 = `const state = encodeURIComponent(JSON.stringify({
        bankId,
        discordId: (req as any).user.discordId
      }));`;
const s3 = `const { v4: uuidv4 } = await import("uuid");
      const nonce = uuidv4();
      res.cookie('oauth_nonce', nonce, { maxAge: 10 * 60 * 1000, httpOnly: true, secure: true, sameSite: 'lax' });
      const state = encodeURIComponent(JSON.stringify({
        bankId,
        discordId: (req as any).user.discordId,
        nonce
      }));`;
code = code.replace(r3, s3);

fs.writeFileSync('server.ts', code);
