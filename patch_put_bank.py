import sys
with open('server.ts', 'r') as f:
    code = f.read()

# PUT /api/banks/:id
code = code.replace(
  'if (b.discordClientSecret !== undefined && b.discordClientSecret !== "") updateData.discordClientSecret = b.discordClientSecret;',
  'if (b.discordClientSecret !== undefined && b.discordClientSecret !== "") updateData.discordClientSecret = b.discordClientSecret;\n      if (b.cityCorpAuthUrl !== undefined) updateData.cityCorpAuthUrl = b.cityCorpAuthUrl;'
)

# PUT /api/banks/:bankId/settings
code = code.replace(
  'if (b.cityCorpAppSecret !== undefined && b.cityCorpAppSecret !== "") {\n        updateData.cityCorpAppSecret = b.cityCorpAppSecret;\n        updateData.corpApiKey = b.cityCorpAppSecret;\n      }',
  'if (b.cityCorpAppSecret !== undefined && b.cityCorpAppSecret !== "") {\n        updateData.cityCorpAppSecret = b.cityCorpAppSecret;\n        updateData.corpApiKey = b.cityCorpAppSecret;\n      }\n      if (b.cityCorpAuthUrl !== undefined) updateData.cityCorpAuthUrl = b.cityCorpAuthUrl;'
)

with open('server.ts', 'w') as f:
    f.write(code)
print("Patched PUT routes")
