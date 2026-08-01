const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'src', 'components', 'layout', 'DashboardLayout.tsx');
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  'import { Building2, Activity, Shield, Settings, Menu, X, LogIn } from "lucide-react";',
  'import { Building2, Activity, Shield, Settings, Menu, X, LogIn, Eye } from "lucide-react";'
);

fs.writeFileSync(file, content);
console.log("Patched DashboardLayout.tsx");
