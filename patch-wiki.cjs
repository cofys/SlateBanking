const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'WIKI.md');
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  'or their direct **Discord ID**, significantly reducing friction when re-associating imported CityCorp transactions.',
  'or their direct **Discord ID**, significantly reducing friction when re-associating imported CityCorp transactions. This same flexibility applies to the **Bank Team (Staff Roster)**, allowing staff to be added securely via their Discord ID or Minecraft Username.'
);

fs.writeFileSync(file, content);
console.log("Patched WIKI successfully");
