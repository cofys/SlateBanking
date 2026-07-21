const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const r = `  const getRedirectUri = (req: express.Request) => {
    let origin = '';
    
    // 1. Try to get origin from Referer header (most reliable for proxied frontends)
    const referer = req.headers.referer;
    if (referer) {
      try {
        const url = new URL(referer);
        origin = url.origin;
      } catch (e) {
        // ignore invalid URL
      }
    }
    
    // 2. Fallback to Host headers
    if (!origin) {
      const protocol = (req.headers['x-forwarded-proto'] || req.protocol || 'http') as string;
      const host = (req.headers['x-forwarded-host'] || req.get('host')) as string;
      let actualProtocol = protocol;
      if (host !== 'localhost' && host !== '127.0.0.1' && !host.includes('localhost:')) {
        actualProtocol = 'https';
      }
      origin = \`\${actualProtocol}://\${host}\`;
    }
    
    // 3. Fallback for internal localhost
    if ((origin.includes('localhost') || origin.includes('127.0.0.1')) && process.env.APP_URL) {
       origin = process.env.APP_URL;
    }
    
    if (origin.endsWith('/')) origin = origin.slice(0, -1);
    return \`\${origin}/api/auth/discord/callback\`;
  };`;

const s = `  const getRedirectUri = async (req: express.Request) => {
    let origin = '';
    const referer = req.headers.referer;
    if (referer) {
      try { origin = new URL(referer).origin; } catch (e) {}
    }
    if (!origin) {
      const host = (req.headers['x-forwarded-host'] || req.get('host')) as string;
      origin = \`https://\${host}\`;
    }
    
    const { db } = await import("./src/db/index");
    const { banks } = await import("./src/db/schema");
    const { eq } = await import("drizzle-orm");
    const validDomain = await db.select().from(banks).where(eq(banks.customDomain, origin)).get();
    
    if (!validDomain && process.env.APP_URL && origin !== process.env.APP_URL) {
       origin = process.env.APP_URL; // Fallback to trusted APP_URL if not a valid custom domain
    } else if (!validDomain && !process.env.APP_URL) {
       // If no app url is set and it's not a known domain, fallback to localhost for safety
       if (origin.includes("localhost") || origin.includes("127.0.0.1") || origin.includes("run.app")) {
           // Allow development origins
       } else {
           origin = "http://localhost:3000";
       }
    }
    
    if (origin.endsWith('/')) origin = origin.slice(0, -1);
    return \`\${origin}/api/auth/discord/callback\`;
  };`;

code = code.replace(r, s);
code = code.replace(/const redirectUri = getRedirectUri\(req\);/g, "const redirectUri = await getRedirectUri(req);");
fs.writeFileSync('server.ts', code);
