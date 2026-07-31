const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'src', 'pages', 'BankAccounts.tsx');
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  '                <th className="px-6 py-4 font-semibold">Owner Username / Discord ID</th>',
  '                {bank.settings?.enableAccountTiers && <th className="px-6 py-4 font-semibold">Tier</th>}\n                <th className="px-6 py-4 font-semibold">Owner Username / Discord ID</th>'
);

content = content.replace(
  '                      </div>\n                    </td>\n                    <td className="px-6 py-4">',
  '                      </div>\n                    </td>\n                    {bank.settings?.enableAccountTiers && (\n                      <td className="px-6 py-4 text-white/70">\n                        {account.tierId && bank.settings?.accountTiers ? (\n                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-white/10 text-white/80 border border-white/5">\n                            {bank.settings.accountTiers.find((t:any) => t.id === account.tierId)?.name || "Unknown"}\n                          </span>\n                        ) : (\n                          <span className="text-white/40 italic text-xs">Standard</span>\n                        )}\n                      </td>\n                    )}\n                    <td className="px-6 py-4">'
);

fs.writeFileSync(file, content);
console.log("Patched successfully");
