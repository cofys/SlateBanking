import sys, re
with open('server.ts', 'r') as f:
    code = f.read()

# Fix /api/auth/citycorp/callback
code = code.replace(
    'const { code, state: stateStr } = req.query;',
    'const { state: stateStr } = req.query;\n    const code = req.query.code || req.query.client_secret;'
)

# Fix /api/portal/:bankId/oauth/callback
code = code.replace(
    'const code = req.query.client_secret as string;',
    'const code = (req.query.client_secret || req.query.code) as string;'
)

with open('server.ts', 'w') as f:
    f.write(code)
print("Patched callbacks")
