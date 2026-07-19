import * as fs from 'fs';

let code = fs.readFileSync('server.ts', 'utf8');

const oldStr = `              try { window.close(); } catch(e) {}
              setTimeout(() => {
                if (!window.opener) {
                  window.location.href = '/portal';
                } else {`;

const newStr = `              try { window.close(); } catch(e) {}
              setTimeout(() => {
                const params = new URLSearchParams(window.location.search);
                let stateObj = {};
                try {
                  if (params.get('state')) stateObj = JSON.parse(decodeURIComponent(params.get('state')));
                } catch(e) {}
                const dest = stateObj.returnTo || '/portal';
                if (!window.opener) {
                  window.location.href = dest;
                } else {`;

code = code.replace(oldStr, newStr);

fs.writeFileSync('server.ts', code);
console.log("Replaced");
