import sys
with open('src/pages/BanksList.tsx', 'r') as f:
    code = f.read()

# State
code = code.replace(
  'const [editCityCorpAppSecret, setEditCityCorpAppSecret] = useState("");',
  'const [editCityCorpAppSecret, setEditCityCorpAppSecret] = useState("");\n  const [editCityCorpAuthUrl, setEditCityCorpAuthUrl] = useState("");'
)

# UseEffect
code = code.replace(
  'setEditCityCorpAppSecret(activeSelectedBank.cityCorpAppSecret || "");',
  'setEditCityCorpAppSecret(activeSelectedBank.cityCorpAppSecret || "");\n      setEditCityCorpAuthUrl(activeSelectedBank.cityCorpAuthUrl || "");'
)

# Put Body
code = code.replace(
  'cityCorpAppId: editCityCorpAppId,',
  'cityCorpAppId: editCityCorpAppId,\n                                cityCorpAuthUrl: editCityCorpAuthUrl,'
)

# Render HTML inputs for editing config
html_to_insert = """
                        <div>
                          <label className="block text-xs text-white/70 mb-1">Custom CityCorp OAuth URL</label>
                          <input 
                            type="text"
                            value={editCityCorpAuthUrl}
                            onChange={(e) => setEditCityCorpAuthUrl(e.target.value)}
                            placeholder="https://dashboard.cityrp.org/authorize?app_id=..."
                            className="w-full bg-[#0a0a0c] border border-white/10 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 placeholder:text-white/20"
                          />
                        </div>
"""
code = code.replace(
  '</p>\n                        </div>\n\n                        <div className="flex gap-2 pt-2">',
  '</p>\n                        </div>' + html_to_insert + '\n                        <div className="flex gap-2 pt-2">'
)

# Details view
details_html = """
                        <div>
                          <span className="text-white/50 block text-xs">Custom CityCorp OAuth URL</span>
                          <span className="font-mono text-white/90 text-[10px] break-all">
                            {selectedBank.cityCorpAuthUrl || 'Not configured'}
                          </span>
                        </div>
"""
code = code.replace(
  '{selectedBank.discordClientSecret ? \'••••••••\' : \'Not configured\'}\n                          </span>\n                        </div>',
  '{selectedBank.discordClientSecret ? \'••••••••\' : \'Not configured\'}\n                          </span>\n                        </div>' + details_html
)

with open('src/pages/BanksList.tsx', 'w') as f:
    f.write(code)
print("Patched BanksList.tsx")
