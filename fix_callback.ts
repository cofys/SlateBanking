import * as fs from 'fs';

let code = fs.readFileSync('server.ts', 'utf8');

const oldDiscordDest = `      const dest = (intent === 'link' || bankId) ? '/portal' : '/admin';`;
const newDiscordDest = `      let dest = (intent === 'link' || bankId) ? '/portal' : '/admin';
      try {
        if (state) {
            const decodedState = JSON.parse(decodeURIComponent(state as string));
            if (decodedState.returnTo) dest = decodedState.returnTo;
        }
      } catch (e) {}`;
code = code.replace(oldDiscordDest, newDiscordDest);

const oldCityCorpDest = `              if (!window.opener) {
                window.location.href = '/portal';
              } else {`;
const newCityCorpDest = `              const params = new URLSearchParams(window.location.search);
              let stateObj = {};
              try {
                if (params.get('state')) stateObj = JSON.parse(decodeURIComponent(params.get('state')));
              } catch(e) {}
              const dest = stateObj.returnTo || '/portal';
              
              if (!window.opener) {
                window.location.href = dest;
              } else {`;
code = code.replace(oldCityCorpDest, newCityCorpDest);

fs.writeFileSync('server.ts', code);
console.log("Replaced callback logic");
