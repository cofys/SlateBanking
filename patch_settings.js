const fs = require('fs');
let code = fs.readFileSync('src/pages/BankSettings.tsx', 'utf8');

code = code.replace(
  'cityCorpAppSecret: formData.get("cityCorpAppSecret")',
  'cityCorpAppSecret: formData.get("cityCorpAppSecret"),\n      cityCorpAuthUrl: formData.get("cityCorpAuthUrl")'
);

const htmlToInsert = `
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
                If provided, this exact URL will be used for logging in users via CityCorp. The state parameter will be used as the bank identifier.
              </p>
            </div>
`;

code = code.replace(
  '</p>\n            </div>\n          </div>',
  '</p>\n            </div>' + htmlToInsert + '\n          </div>'
);

fs.writeFileSync('src/pages/BankSettings.tsx', code);
