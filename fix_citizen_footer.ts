import * as fs from 'fs';

let code = fs.readFileSync('src/pages/CitizenPortal.tsx', 'utf8');

const oldFooter = `      {/* Footer */}
      <div className="mt-12 text-center text-xs text-white/30 pb-8">
        &copy; {new Date().getFullYear()} CityCorp Network &bull; <Link to="/docs" className="hover:text-white/70 transition-colors">Developer API</Link>
      </div>`;

const newFooter = `      {/* Footer */}
      <div className="mt-12 text-center text-xs text-white/30 pb-8 flex items-center justify-center gap-4">
        <span>&copy; {new Date().getFullYear()} CityCorp Network</span>
        <span>&bull;</span>
        <Link to="/docs" className="hover:text-white/70 transition-colors">Developer API</Link>
        <span>&bull;</span>
        <Link to="/admin" className="hover:text-white/70 transition-colors">Global Admin</Link>
      </div>`;

if (code.includes(oldFooter)) {
    code = code.replace(oldFooter, newFooter);
    fs.writeFileSync('src/pages/CitizenPortal.tsx', code);
    console.log("Replaced footer in citizen portal");
} else {
    console.log("Failed to find footer in citizen portal");
}
