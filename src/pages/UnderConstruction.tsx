import { Settings, Wrench } from "lucide-react";

export function UnderConstruction({ title }: { title: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-white/50 animate-in fade-in duration-500">
      <div className="w-16 h-16 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-center mb-6 text-white/40 shadow-lg">
        <Settings className="animate-[spin_4s_linear_infinite]" size={32} />
      </div>
      <h2 className="text-xl font-bold tracking-tight text-white mb-2">{title}</h2>
      <p className="text-sm max-w-sm text-center">
        This module is currently being configured for your bank's environment. Check back soon.
      </p>
    </div>
  );
}
