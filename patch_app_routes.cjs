const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'src', 'App.tsx');
let content = fs.readFileSync(file, 'utf8');

content = "import { EyeOfGod } from './pages/EyeOfGod';\n" + content;
content = content.replace(
  '<Route path="citycorp" element={<CityCorpLogs />} />',
  '<Route path="citycorp" element={<CityCorpLogs />} />\n          <Route path="eye-of-god" element={<EyeOfGod />} />'
);

fs.writeFileSync(file, content);
console.log("Patched App.tsx");
