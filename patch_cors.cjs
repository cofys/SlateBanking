const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const replacement = `  app.use(cors({
    origin: async (origin, callback) => {
      if (!origin) return callback(null, true);
      const { db } = await import("./src/db/index.js");
      const { banks } = await import("./src/db/schema.js");
      const { eq } = await import("drizzle-orm");
      
      const customDomains = await db.select({ customDomain: banks.customDomain }).from(banks).where(eq(banks.customDomain, origin));
      if (customDomains.length > 0 || origin.includes("localhost") || origin.includes("127.0.0.1") || origin.includes("run.app")) {
        callback(null, true);
      } else {
        callback(null, false);
      }
    },
    credentials: true
  }));`;

code = code.replace(/app\.use\(cors\(\)\);/, replacement);
fs.writeFileSync('server.ts', code);
