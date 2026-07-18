import sys
with open('server.ts', 'r') as f:
    code = f.read()

citycorp_html = """
      res.send(`
        <html style="background: #0a0a0c; color: white; font-family: sans-serif;">
          <body style="margin: 0; padding: 2rem; text-align: center;">
            <script>
              try {
                if (window.opener) {
                  window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS', user: ${JSON.stringify(payload)} }, '*');
                }
              } catch(e) {}
              
              try {
                localStorage.setItem('oauth_auth_success', Date.now().toString());
              } catch(e) {}
              
              // If not opened in a popup (no opener), redirect to the portal
              if (!window.opener) {
                window.location.href = '/citizen/assets';
              } else {
                window.close();
                setTimeout(() => {
                  window.location.href = '/citizen/assets';
                }, 1000);
              }
            </script>
            <div style="font-family: sans-serif; text-align: center; padding-top: 2rem; color: white; background: #0a0a0c; height: 100vh; margin: 0; box-sizing: border-box;">
              <h2>Authentication Successful!</h2>
              <p style="color: rgba(255,255,255,0.7);">Redirecting you back...</p>
            </div>
          </body>
        </html>
      `);
"""

discord_link_html = """
      res.send(`
        <html style="background: #0a0a0c; color: white; font-family: sans-serif;">
          <body style="margin: 0; padding: 2rem; text-align: center;">
            <script>
              try {
                if (window.opener) {
                  window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, '*');
                }
              } catch(e) {}
              
              try {
                localStorage.setItem('oauth_auth_success', Date.now().toString());
              } catch(e) {}
              
              if (!window.opener) {
                window.location.href = '/citizen/assets';
              } else {
                window.close();
                setTimeout(() => {
                  window.location.href = '/citizen/assets';
                }, 1000);
              }
            </script>
            <div style="font-family: sans-serif; text-align: center; padding-top: 2rem; color: white; background: #0a0a0c; height: 100vh; margin: 0; box-sizing: border-box;">
              <h2>Authentication Successful!</h2>
              <p style="color: rgba(255,255,255,0.7);">Redirecting you back...</p>
            </div>
          </body>
        </html>
      `);
"""

# Replace in citycorp callback
old_citycorp = """      res.send(`
        <html>
          <body>
            <script>
              window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS', user: ${JSON.stringify(payload)} }, '*');
              localStorage.setItem('oauth_auth_success', Date.now().toString());
              window.close();
            </script>
            <p>Authentication successful! You can close this window.</p>
          </body>
        </html>
      `);"""
code = code.replace(old_citycorp, citycorp_html)

# Replace in discord link callback
old_discord_link = """      res.send(`
        <html><body>
          <script>
            window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, '*');
            localStorage.setItem('oauth_auth_success', Date.now().toString());
            window.close();
          </script>
          <p>Discord account linked successfully! You can close this window.</p>
        </body></html>
      `);"""
code = code.replace(old_discord_link, discord_link_html)

with open('server.ts', 'w') as f:
    f.write(code)

print("Callbacks updated")
