import sys
with open('src/pages/BankSettings.tsx', 'r') as f:
    code = f.read()

code = code.replace(
  'cityCorpAppSecret: formData.get("cityCorpAppSecret")',
  'cityCorpAppSecret: formData.get("cityCorpAppSecret"),\n      cityCorpAuthUrl: formData.get("cityCorpAuthUrl")'
)

html_to_insert = """
            <div className="mt-4">
              <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide flex items-center gap-2">
                Custom CityCorp OAuth URL (Optional)
              </label>
              <input 
                name="cityCorpAuthUrl" 
                type="text" 
                placeholder="https://dashboard.cityrp.org/authorize?app_id=..."
                defaultValue={settings?.cityCorpAuthUrl || ""} 
                className="w-full bg-[#1a1a24] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors placeholder:text-white/20" 
              />
              <p className="text-xs text-white/40 mt-1.5">
                If provided, this exact URL will be used for logging in users via CityCorp.
              </p>
            </div>
"""

code = code.replace(
  '</p>\n            </div>\n          </div>',
  '</p>\n            </div>' + html_to_insert + '\n          </div>'
)

with open('src/pages/BankSettings.tsx', 'w') as f:
    f.write(code)
print("Patched BankSettings.tsx")
