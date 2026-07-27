import { AlertCircle, ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";

export function NotFound() {
  return (
    <div className="min-h-screen bg-[#0a0a0c] flex flex-col items-center justify-center p-6 text-white text-center animate-in fade-in duration-500">
      <div className="w-16 h-16 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center justify-center mb-6 text-red-400 shadow-xl">
        <AlertCircle size={32} />
      </div>
      <h1 className="text-4xl font-extrabold tracking-tight mb-2">404 - Page Not Found</h1>
      <p className="text-sm max-w-md text-white/60 mb-8">
        The route or financial portal resource you are looking for does not exist or has been moved.
      </p>
      <Link
        to="/"
        className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-medium px-5 py-2.5 rounded-lg text-sm transition-colors shadow-lg shadow-indigo-600/20"
      >
        <ArrowLeft size={16} /> Return to Dashboard
      </Link>
    </div>
  );
}
