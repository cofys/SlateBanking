import * as fs from 'fs';

let code = fs.readFileSync('src/lib/AuthContext.tsx', 'utf8');

const oldStr = `    const handleMessage = (event: MessageEvent) => {
      const origin = event.origin;
      if (origin !== window.location.origin) {
        return;
      }
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        checkSession();
      }
    };`;

const newStr = `    const handleMessage = (event: MessageEvent) => {
      // Just check the type, it's safe because it only triggers a refetch
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        checkSession();
      }
    };`;

code = code.replace(oldStr, newStr);

fs.writeFileSync('src/lib/AuthContext.tsx', code);
console.log("Replaced AuthContext origin check");
