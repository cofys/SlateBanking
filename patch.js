const fs = require('fs');
let content = fs.readFileSync('server.ts', 'utf8');

const oldCode = `    try {
      const parsedState = JSON.parse(decodeURIComponent(stateStr as string));
      const bankId = parsedState.bankId;

      const bank = await db.select().from(banks).where(eq(banks.id, bankId)).get();`;

const newCode = `    try {
      let bankId;
      try {
        const parsedState = JSON.parse(decodeURIComponent(stateStr as string));
        bankId = parsedState.bankId;
      } catch (e) {
        // If state is not JSON, try to find bank by host or just get the first one if there's only one
        const host = req.get('host');
        let possibleBank = await db.select().from(banks).where(eq(banks.customDomain, host || "")).get();
        if (!possibleBank) {
            const allBanks = await db.select().from(banks).all();
            if (allBanks.length === 1) possibleBank = allBanks[0];
            else possibleBank = allBanks.find(b => b.cityCorpAppId);
        }
        if (possibleBank) bankId = possibleBank.id;
      }

      if (!bankId) return res.status(400).send("Could not identify bank from state or host");
      
      const bank = await db.select().from(banks).where(eq(banks.id, bankId)).get();`;

content = content.replace(oldCode, newCode);
fs.writeFileSync('server.ts', content);
