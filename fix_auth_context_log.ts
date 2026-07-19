import * as fs from 'fs';

let code = fs.readFileSync('src/lib/AuthContext.tsx', 'utf8');

const oldCheckSession = `  const checkSession = async () => {
    try {
      const res = await fetch('/api/auth/me');`;

const newCheckSession = `  const checkSession = async () => {
    console.log("checkSession called!");
    try {
      const res = await fetch('/api/auth/me');`;

code = code.replace(oldCheckSession, newCheckSession);

const oldHandleMessage = `    const handleMessage = (event: MessageEvent) => {
      // Just check the type, it's safe because it only triggers a refetch
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        checkSession();
      }
    };`;

const newHandleMessage = `    const handleMessage = (event: MessageEvent) => {
      console.log("Received postMessage:", event.data);
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        checkSession();
      }
    };`;

code = code.replace(oldHandleMessage, newHandleMessage);

fs.writeFileSync('src/lib/AuthContext.tsx', code);
console.log("Added logs");
