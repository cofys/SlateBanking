import * as fs from 'fs';

let code = fs.readFileSync('src/pages/CitizenPortal.tsx', 'utf8');

const oldEnd = `      )}
    </div>
  );
}`;

const newEnd = `      )}
      {/* Footer */}
      <div className="mt-12 text-center text-xs text-white/30 pb-8 flex items-center justify-center gap-4">
        <span>&copy; {new Date().getFullYear()} CityCorp Network</span>
        <span>&bull;</span>
        <a href="/docs" className="hover:text-white/70 transition-colors">Developer API</a>
        <span>&bull;</span>
        <a href="/admin" className="hover:text-white/70 transition-colors">Global Admin</a>
      </div>
    </div>
  );
}`;

code = code.replace(oldEnd, newEnd);
fs.writeFileSync('src/pages/CitizenPortal.tsx', code);
console.log("Replaced");
