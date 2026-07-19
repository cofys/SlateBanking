import * as fs from 'fs';

let code = fs.readFileSync('server.ts', 'utf8');

const oldDiscordStr = `              // Always try to close
              try { window.close(); } catch(e) {}
              
              // If not closed, redirect after delay
              setTimeout(() => {
                window.location.href = '\\\${dest}';
              }, 1500);`;

const newDiscordStr = `              // Always try to close
              try { window.close(); } catch(e) {}
              
              // If not closed, redirect after delay
              setTimeout(() => {
                if (!window.opener) {
                  window.location.href = '\\\${dest}';
                } else {
                  document.body.innerHTML = "<h2>Authentication Successful!</h2><p>You can close this window now.</p>";
                }
              }, 500);`;

code = code.replace(oldDiscordStr, newDiscordStr);

fs.writeFileSync('server.ts', code);
console.log("Replaced discord popup close logic");
