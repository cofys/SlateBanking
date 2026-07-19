import * as fs from 'fs';

let code = fs.readFileSync('server.ts', 'utf8');

const debugRoute = `
  app.get('/api/debug-host', (req, res) => {
    res.json({
      host: req.get('host'),
      hostname: req.hostname,
      headers: req.headers,
      protocol: req.protocol,
    });
  });
`;

code = code.replace('const app = express();', 'const app = express();' + debugRoute);
fs.writeFileSync('server.ts', code);
console.log("Added debug route");
