import sys

with open("src/pages/BankSettings.tsx", "r") as f:
    code = f.read()

discord_uri_html = """
          <div className="mt-8 bg-[#5865F2]/10 border border-[#5865F2]/20 rounded-xl p-4">
            <h4 className="text-sm font-medium text-[#5865F2] mb-2">Required Discord OAuth Redirect URIs</h4>
            <p className="text-xs text-[#5865F2]/70 mb-3">
              If using a Custom Domain with your own Discord Application, you must add both of these URLs to the <strong>Redirects</strong> list in the Discord Developer Portal.
            </p>
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-[#1a1a24] border border-white/10 rounded-lg px-4 py-2 text-xs text-white/90 overflow-x-auto whitespace-nowrap">
                  {`https://${settings?.customDomain || window.location.hostname}/api/auth/discord/callback`}
                </code>
              </div>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-[#1a1a24] border border-white/10 rounded-lg px-4 py-2 text-xs text-white/90 overflow-x-auto whitespace-nowrap">
                  {`https://${settings?.customDomain || window.location.hostname}/api/auth/discord/link/callback`}
                </code>
              </div>
            </div>
          </div>
"""

code = code.replace(
  '        <div className="flex justify-end pt-4 pb-12">',
  discord_uri_html + '\n        <div className="flex justify-end pt-4 pb-12">'
)

with open("src/pages/BankSettings.tsx", "w") as f:
    f.write(code)

print("Discord URIs added")
