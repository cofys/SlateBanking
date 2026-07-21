const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

// Inside /api/auth/url
let replacement1 = `    const { v4: uuidv4 } = await import("uuid");
    const nonce = uuidv4();
    res.cookie('oauth_nonce', nonce, { maxAge: 10 * 60 * 1000, httpOnly: true, secure: true, sameSite: 'lax' });
    const stateObj: any = { intent, nonce };`;
code = code.replace(/const stateObj: any = \{ intent \};/, replacement1);

// Citycorp callback check
let replacement2 = `    const { code, state } = req.query;
    const expectedNonce = req.cookies.oauth_nonce;
    res.clearCookie('oauth_nonce');`;
code = code.replace(/const \{ code, state \} = req\.query;\n\s*const fs = require\('fs'\);/, replacement2 + '\n    const fs = require(\'fs\');');

// Discord callback check
code = code.replace(/const \{ code, state \} = req\.query;\n\s*const fs = require\('fs'\);/g, replacement2 + '\n    const fs = require(\'fs\');');

fs.writeFileSync('server.ts', code);
