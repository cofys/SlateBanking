const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'server.ts');
let content = fs.readFileSync(file, 'utf8');

// replace the first instance
content = content.replace("import jwt from 'jsonwebtoken';\n", "");

fs.writeFileSync(file, content);
console.log("Fixed duplicate import");
