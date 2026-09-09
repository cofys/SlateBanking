import re

with open('src/pages/BankPortal.tsx', 'r') as f:
    content = f.read()

old = r'<div className="max-w-6xl mx-auto px-4 py-8 space-y-8 mb-24">'
new = """<div className="min-h-screen bg-[#060609] text-slate-300 font-sans selection:bg-indigo-500/30 relative overflow-hidden">
      {/* Ambient background glows */}
      <div className={`absolute top-0 left-1/4 w-[500px] h-[500px] ${theme.bgLight} rounded-full blur-[120px] pointer-events-none opacity-50`} />
      <div className={`absolute bottom-0 right-1/4 w-[600px] h-[600px] bg-indigo-600/5 rounded-full blur-[150px] pointer-events-none opacity-50`} />
      
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-8 mb-24 relative z-10">"""

content = content.replace(old, new)
content = content.replace('return (\n    <div className="min', 'return (\n    <div className="min') # already matched

# wait, we need to close the wrapping div!
old_end = r'\{/\* TRANSACTION RECEIPT MODAL \*/\}.*?</AnimatePresence>\s*</div>\s*\);\s*\}'
def close_div_replacer(match):
    original = match.group(0)
    return original.replace('</div>\n  );\n}', '</div>\n    </div>\n  );\n}')

content = re.sub(old_end, close_div_replacer, content, flags=re.DOTALL)

with open('src/pages/BankPortal.tsx', 'w') as f:
    f.write(content)
