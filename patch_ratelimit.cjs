const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const r = `  const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000,
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use('/api/', globalLimiter);`;

const s = `  const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000,
    standardHeaders: true,
    legacyHeaders: false,
  });
  const strictLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 min
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use('/api/', globalLimiter);
  app.use('/api/v1/transfers', strictLimiter);
  app.use('/api/portal/*/transfer', strictLimiter);
  app.use('/api/citizen/transfer', strictLimiter);
  app.use('/api/onyx/checkout', strictLimiter);
  app.use('/api/auth/', strictLimiter);`;

code = code.replace(r, s);
fs.writeFileSync('server.ts', code);
