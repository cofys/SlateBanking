const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'src', 'components', 'layout', 'BankAdminLayout.tsx');
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  'import { Percent,  useEffect, useState } from "react";',
  'import { useEffect, useState } from "react";'
);

content = content.replace(
  'import { Activity, LayoutDashboard, Settings, LogOut, ArrowRightLeft, Users, UserSquare, BarChart3, ShieldCheck, Wrench, Code2, Users2, Landmark, Lock, CreditCard, Briefcase, Repeat, Building2, Menu, X, LogIn, FileText } from "lucide-react";',
  'import { Activity, LayoutDashboard, Settings, LogOut, ArrowRightLeft, Users, UserSquare, BarChart3, ShieldCheck, Wrench, Code2, Users2, Landmark, Lock, CreditCard, Briefcase, Repeat, Building2, Menu, X, LogIn, FileText, Percent, Layers } from "lucide-react";'
);

fs.writeFileSync(file, content);
console.log("Patched imports");
