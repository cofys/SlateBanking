import * as fs from 'fs';

let code = fs.readFileSync('server.ts', 'utf8');

const oldHelmet = `  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
  }));`;

const newHelmet = `  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: false
  }));`;

code = code.replace(oldHelmet, newHelmet);

fs.writeFileSync('server.ts', code);
console.log("Replaced helmet config");
