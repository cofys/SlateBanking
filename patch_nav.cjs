const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'src', 'components', 'layout', 'DashboardLayout.tsx');
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  'import { Link, Outlet, useLocation } from "react-router-dom";\nimport { Activity, Building2, Settings, Shield, LogOut } from "lucide-react";',
  'import { Link, Outlet, useLocation } from "react-router-dom";\nimport { Activity, Building2, Settings, Shield, LogOut, Eye } from "lucide-react";'
);

content = content.replace(
  '{ name: "CityCorp Network", path: "/citycorp", icon: Settings },',
  '{ name: "CityCorp Network", path: "/citycorp", icon: Settings },\n    { name: "Eye of God", path: "/eye-of-god", icon: Eye },'
);

fs.writeFileSync(file, content);
console.log("Patched layout");
