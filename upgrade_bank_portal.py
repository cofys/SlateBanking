import re

with open('src/pages/BankPortal.tsx', 'r') as f:
    content = f.read()

# 1. Update the Metrics Dashboard (the three blocks at the top of the content area)
metrics_old = r'<div className="grid grid-cols-1 md:grid-cols-3 gap-4">\s*<div className="bg-\[#0b0b10\] border border-white/10 rounded-2xl p-4 shadow-xl">.*?</div>\s*</div>'
metrics_new = """{/* Bento Grid Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className={`relative overflow-hidden rounded-3xl p-6 border border-white/5 bg-gradient-to-br ${theme.fromGradient} ${theme.toGradient} shadow-2xl group hover:scale-[1.02] transition-all duration-500`}>
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl -mr-10 -mt-10 group-hover:bg-white/20 transition-all" />
              <div className="relative z-10 flex flex-col h-full justify-between gap-4">
                <div className="flex items-center justify-between">
                  <div className="p-2.5 bg-white/10 rounded-xl backdrop-blur-sm text-white">
                    <Wallet size={20} />
                  </div>
                  <span className="text-[10px] uppercase tracking-widest font-bold text-white/70">Accounts</span>
                </div>
                <div>
                  <p className="text-4xl font-black text-white">{userData?.accounts?.length || 0}</p>
                </div>
              </div>
            </div>

            <div className={`relative overflow-hidden rounded-3xl p-6 border border-white/5 bg-[#13131c]/80 backdrop-blur-xl shadow-2xl group hover:border-${theme.primary}/30 transition-all duration-500 hover:scale-[1.02]`}>
              <div className={`absolute bottom-0 right-0 w-32 h-32 ${theme.bgLight} rounded-full blur-[50px] translate-y-1/2 translate-x-1/2`} />
              <div className="relative z-10 flex flex-col h-full justify-between gap-4">
                <div className="flex items-center justify-between">
                  <div className={`p-2.5 ${theme.bgLight} rounded-xl ${theme.textAccent}`}>
                    <CreditCard size={20} />
                  </div>
                  <span className="text-[10px] uppercase tracking-widest font-bold text-slate-400">Cards Issued</span>
                </div>
                <div>
                  <p className="text-4xl font-black text-white">{userData?.cards?.length || 0}</p>
                </div>
              </div>
            </div>

            <div className={`relative overflow-hidden rounded-3xl p-6 border border-white/5 bg-[#13131c]/80 backdrop-blur-xl shadow-2xl group hover:border-amber-500/30 transition-all duration-500 hover:scale-[1.02]`}>
              <div className="absolute bottom-0 left-0 w-32 h-32 bg-amber-500/10 rounded-full blur-[50px] translate-y-1/2 -translate-x-1/2" />
              <div className="relative z-10 flex flex-col h-full justify-between gap-4">
                <div className="flex items-center justify-between">
                  <div className="p-2.5 bg-amber-500/10 rounded-xl text-amber-400">
                    <Landmark size={20} />
                  </div>
                  <span className="text-[10px] uppercase tracking-widest font-bold text-slate-400">Active Loans</span>
                </div>
                <div>
                  <p className="text-4xl font-black text-white">{userData?.loans?.length || 0}</p>
                </div>
              </div>
            </div>
          </div>"""
content = re.sub(metrics_old, metrics_new, content, flags=re.DOTALL)


# 2. Update the Accounts Grid Cards to physical card style
accounts_old = r'<motion\.div \s*key=\{acc\.id\}\s*onClick=\{.*?\}\s*whileHover=\{\{ y: -2 \}\}\s*className=\{`rounded-2xl p-5 flex flex-col justify-between shadow-xl relative overflow-hidden group cursor-pointer transition-all duration-200 border.*?</motion\.div>'
accounts_new = """<motion.div 
                          key={acc.id}
                          onClick={() => setSelectedAccountId(isSelected ? "all" : acc.id)}
                          whileHover={{ scale: 1.02 }}
                          className={`relative h-48 rounded-3xl p-6 overflow-hidden cursor-pointer shadow-2xl transition-all duration-500 border ${
                            isSelected 
                              ? `border-white/30 ring-4 ring-white/10 ${theme.glow}` 
                              : "border-white/5 hover:border-white/20"
                          }`}
                        >
                          {/* Physical Card Backgrounds */}
                          <div className={`absolute inset-0 ${
                            isBusiness 
                              ? `bg-gradient-to-br ${theme.fromGradient} via-slate-900 to-black` 
                              : isSavings 
                                ? 'bg-gradient-to-br from-amber-900 via-amber-950 to-black' 
                                : 'bg-gradient-to-br from-slate-800 via-slate-900 to-black'
                          } z-0`} />
                          
                          {/* Ambient Glows */}
                          <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 blur-[40px] rounded-full translate-x-1/4 -translate-y-1/4 z-0" />
                          <div className={`absolute bottom-0 left-0 w-40 h-40 ${isSelected ? theme.bgLight : 'bg-black/20'} blur-[50px] rounded-full -translate-x-1/4 translate-y-1/4 z-0 transition-colors duration-500`} />
                          
                          <div className="relative z-10 h-full flex flex-col justify-between">
                            <div className="flex justify-between items-start">
                              <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-2">
                                  <h3 className="font-bold text-white text-base tracking-widest uppercase drop-shadow-md">{acc.accountName}</h3>
                                  {isSelected && (
                                    <span className="w-2 h-2 rounded-full bg-white animate-pulse" title="Active Focus" />
                                  )}
                                </div>
                                <span className={`inline-block text-[9px] uppercase tracking-widest font-bold px-2 py-0.5 rounded border backdrop-blur-md w-max
                                  ${isSavings ? "bg-amber-500/20 text-amber-200 border-amber-500/30" : 
                                   isBusiness ? "bg-white/10 text-white border-white/20" : 
                                   "bg-zinc-500/20 text-zinc-300 border-zinc-500/30"
                                  }`}
                                >
                                  {acc.type}
                                </span>
                              </div>
                              <Wallet className={isSelected ? 'text-white' : 'text-white/40'} size={24} />
                            </div>

                            <div className="space-y-3">
                              {/* EMV Chip placeholder */}
                              <div className="w-10 h-7 rounded bg-gradient-to-br from-yellow-200 to-yellow-500/50 opacity-80 shadow-inner" />
                              
                              <div className="flex items-center justify-between gap-4">
                                <p className="font-mono text-2xl font-bold tracking-tight text-white drop-shadow-lg">
                                  {formatMoney(acc.balance)}
                                </p>
                              </div>
                              
                              <div className="flex justify-between items-end text-[10px] font-mono text-white/60 uppercase tracking-widest">
                                <div className="flex flex-col">
                                  <span className="opacity-50">Acc ID</span>
                                  <span className="truncate max-w-[120px] font-bold text-white/80">{acc.id}</span>
                                </div>
                                {isSelected && (
                                  <span className="font-bold text-white animate-pulse">Focused</span>
                                )}
                              </div>
                            </div>
                          </div>
                        </motion.div>"""
content = re.sub(accounts_old, accounts_new, content, flags=re.DOTALL)


with open('src/pages/BankPortal.tsx', 'w') as f:
    f.write(content)

