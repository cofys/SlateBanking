import * as fs from 'fs';

let code = fs.readFileSync('server.ts', 'utf8');

const oldRedirectUri = `  const getRedirectUri = (req: express.Request) => {
    const protocol = (req.headers['x-forwarded-proto'] || req.protocol || 'http') as string;
    const host = (req.headers['x-forwarded-host'] || req.get('host')) as string;
    let actualProtocol = protocol;
    
    // Force HTTPS for all external domains
    if (host !== 'localhost' && host !== '127.0.0.1' && !host.includes('localhost:')) {
      actualProtocol = 'https';
    }
    
    let origin = \`\${actualProtocol}://\${host}\`;
    
    // In preview mode, fallback to APP_URL if host is localhost/internal and APP_URL exists
    if ((host?.includes('localhost') || host?.includes('127.0.0.1')) && process.env.APP_URL) {
       origin = process.env.APP_URL;
    }
    
    if (origin.endsWith('/')) origin = origin.slice(0, -1);
    return \`\${origin}/api/auth/discord/callback\`;
  };`;

const newRedirectUri = `  const getRedirectUri = (req: express.Request) => {
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

code = code.replace(oldRedirectUri, newRedirectUri);
fs.writeFileSync('server.ts', code);
console.log("Replaced getRedirectUri");
