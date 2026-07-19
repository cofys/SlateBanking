import * as fs from 'fs';

let code = fs.readFileSync('server.ts', 'utf8');

const oldPopupClose = `                            // Always try to close
              try { window.close(); } catch(e) {}
              
              // If not closed, redirect after delay
              setTimeout(() => {
                window.location.href = '\${dest}';
              }, 1500);`;

const newPopupClose = `              // Always try to close
              try { window.close(); } catch(e) {}
              
              // If not closed, redirect after delay
              setTimeout(() => {
                if (!window.opener) {
                  window.location.href = '\${dest}';
                } else {
                  // Fallback for popup that failed to close
                  document.body.innerHTML = "<h2>Authentication Successful!</h2><p>You can close this window now.</p>";
                }
              }, 500);`;

code = code.replace(oldPopupClose, newPopupClose);

const oldCityCorpPopup = `              // If not opened in a popup (no opener), redirect to the portal
              if (!window.opener) {
                window.location.href = '/portal';
              } else {
                window.close();
                setTimeout(() => {
                  window.location.href = '/portal';
                }, 1000);
              }`;

const newCityCorpPopup = `              try { window.close(); } catch(e) {}
              setTimeout(() => {
                if (!window.opener) {
                  window.location.href = '/portal';
                } else {
                  document.body.innerHTML = "<h2>Authentication Successful!</h2><p>You can close this window now.</p>";
                }
              }, 500);`;

code = code.replace(oldCityCorpPopup, newCityCorpPopup);

fs.writeFileSync('server.ts', code);
console.log("Replaced popup close logic");
