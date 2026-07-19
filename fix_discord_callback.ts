import * as fs from 'fs';

let code = fs.readFileSync('server.ts', 'utf8');

const oldCallback = `    const hostname = req.hostname;
    let clientId = process.env.DISCORD_CLIENT_ID || '';
    let clientSecret = process.env.DISCORD_CLIENT_SECRET || '';

    if (hostname !== 'localhost' && hostname !== '127.0.0.1' && !hostname.includes('run.app') && !hostname.includes('onyx-network.com')) {
       try {
         const bank = await db.select().from(banks).where(like(banks.customDomain, \`%\${hostname}%\`)).get();
         if (bank && bank.discordClientId && bank.discordClientSecret) {
           clientId = bank.discordClientId;
           clientSecret = bank.discordClientSecret;
         }
       } catch (e) {
         console.error("Domain lookup error for OAuth Callback:", e);
       }
    }`;

const newCallback = `    const hostname = req.hostname;
    let clientId = process.env.DISCORD_CLIENT_ID || '';
    let clientSecret = process.env.DISCORD_CLIENT_SECRET || '';

    let bankToUse = null;
    if (bankId) {
       bankToUse = await db.select().from(banks).where(eq(banks.id, bankId)).get();
    } else if (hostname !== 'localhost' && hostname !== '127.0.0.1' && !hostname.includes('run.app') && !hostname.includes('onyx-network.com')) {
       try {
         bankToUse = await db.select().from(banks).where(like(banks.customDomain, \`%\${hostname}%\`)).get();
       } catch (e) {
         console.error("Domain lookup error for OAuth Callback:", e);
       }
    }
    
    if (bankToUse && bankToUse.discordClientId && bankToUse.discordClientSecret) {
       clientId = bankToUse.discordClientId;
       clientSecret = bankToUse.discordClientSecret;
    }`;

code = code.replace(oldCallback, newCallback);

fs.writeFileSync('server.ts', code);
console.log("Replaced callback");
