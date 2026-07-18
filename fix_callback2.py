import sys, re
with open('server.ts', 'r') as f:
    code = f.read()

discord_login_html = """      res.send(`
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
                window.location.href = '/admin';
              } else {
                window.close();
                setTimeout(() => {
                  window.location.href = '/admin';
                }, 1000);
              }
            </script>
            <div style="font-family: sans-serif; text-align: center; padding-top: 2rem; color: white; background: #0a0a0c; height: 100vh; margin: 0; box-sizing: border-box;">
              <h2>Authentication Successful!</h2>
              <p style="color: rgba(255,255,255,0.7);">Redirecting you back...</p>
            </div>
          </body>
        </html>
      `);"""

code = re.sub(r'res\.send\(`\s*<html style="background: #0a0a0c.*?You can now safely close this window.*?</script>\s*</body>\s*</html>\s*`\);', discord_login_html, code, flags=re.DOTALL)

with open('server.ts', 'w') as f:
    f.write(code)
print("Discord login callback updated")
