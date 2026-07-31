const fs = require('fs');
const path = require('path');

const appFile = path.join(__dirname, 'src', 'App.tsx');
let appContent = fs.readFileSync(appFile, 'utf8');
appContent = appContent.replace(
  "hostname === 'onyx-network.com' || hostname === 'www.onyx-network.com'",
  "hostname === 'sb.azisle.com' || hostname === 'azisle.com' || hostname === 'www.azisle.com'"
);
fs.writeFileSync(appFile, appContent);

const authFile = path.join(__dirname, 'src', 'server', 'authRoutes.ts');
let authContent = fs.readFileSync(authFile, 'utf8');
authContent = authContent.replace(
  "hostname !== 'onyx-network.com' && hostname !== 'www.onyx-network.com'",
  "hostname !== 'sb.azisle.com' && hostname !== 'azisle.com' && hostname !== 'www.azisle.com'"
);
fs.writeFileSync(authFile, authContent);

console.log("Patched domains");
