import re

with open('src/pages/CitizenPortal.tsx', 'r') as f:
    content = f.read()

# Add activeTab state
content = content.replace(
    'const [userData, setUserData] = useState<any>(null);',
    'const [userData, setUserData] = useState<any>(null);\n  const [activeTab, setActiveTab] = useState<"assets" | "transfer" | "invoices" | "loans" | "apply">("assets");'
)

# We want to replace the whole `userData && !userData.error && (` block.
# Let's find the start of it.
start_idx = content.find('{userData && !userData.error && (')
end_idx = content.find('{userData?.error && (')

if start_idx != -1 and end_idx != -1:
    new_block = """{userData && !userData.error && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 mt-8">

          {/* Action Hub Navigation */}
          <div className="flex overflow-x-auto hide-scrollbar gap-2 p-1 bg-white/5 rounded-2xl border border-white/10 w-fit mx-auto">
            <button
              onClick={() => setActiveTab("assets")}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 flex items-center gap-2 ${activeTab === "assets" ? "bg-white/10 text-white shadow-sm" : "text-white/50 hover:text-white hover:bg-white/5"}`}
            >
              <Wallet size={16} /> My Assets
            </button>
            <button
              onClick={() => setActiveTab("transfer")}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 flex items-center gap-2 ${activeTab === "transfer" ? "bg-white/10 text-white shadow-sm" : "text-white/50 hover:text-white hover:bg-white/5"}`}
            >
              <ArrowRight size={16} /> Transfer & Pay
            </button>
            <button
              onClick={() => setActiveTab("invoices")}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 flex items-center gap-2 ${activeTab === "invoices" ? "bg-amber-500/20 text-amber-400 shadow-sm" : "text-white/50 hover:text-amber-400 hover:bg-amber-500/10"}`}
            >
              <Clock size={16} /> Bills {userData.pendingInvoices?.length > 0 && <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse ml-1" />}
            </button>
            <button
              onClick={() => setActiveTab("loans")}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 flex items-center gap-2 ${activeTab === "loans" ? "bg-blue-500/20 text-blue-400 shadow-sm" : "text-white/50 hover:text-blue-400 hover:bg-blue-500/10"}`}
            >
              <ShieldCheck size={16} /> Loans
            </button>
            <button
              onClick={() => setActiveTab("apply")}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 flex items-center gap-2 ${activeTab === "apply" ? "bg-emerald-500/20 text-emerald-400 shadow-sm" : "text-white/50 hover:text-emerald-400 hover:bg-emerald-500/10"}`}
            >
              <CreditCard size={16} /> Apply
            </button>
          </div>

          <div className="bg-[#0f0f15]/80 border border-white/10 rounded-3xl p-6 md:p-8 backdrop-blur-xl shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
            
            {activeTab === "assets" && (
              <div className="space-y-12 animate-in fade-in duration-300">
                {/* Accounts */}
                <div>
                  <h3 className="text-lg font-medium text-white/90 mb-4 flex items-center gap-2"><ShieldCheck className="text-emerald-400" size={18} /> Verified Network Accounts</h3>
                  {userData.accounts?.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {userData.accounts.map((acc: any) => (
                        <div key={acc.id} className="bg-black/40 border border-white/10 rounded-2xl overflow-hidden hover:border-blue-500/30 transition-colors">
                          <div className="p-5 border-b border-white/5 bg-gradient-to-br from-white/[0.02] to-transparent">
                            <div className="flex justify-between items-start mb-4">
                              <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center text-blue-400 font-bold uppercase text-xs">
                                {acc.bankName.substring(0, 2)}
                              </div>
                              <span 
                                className="text-[10px] font-mono text-white/30 bg-white/5 px-2 py-1 rounded-full cursor-pointer hover:bg-white/10 transition-colors truncate max-w-[120px]" 
                                title="Click to copy"
                                onClick={() => {
                                  navigator.clipboard.writeText(acc.id);
                                }}
                              >
                                {acc.id}
                              </span>
                            </div>
                            <div>
                              <p className="text-sm font-medium text-white/80">{acc.bankName}</p>
                              <p className="text-indigo-300 text-xs mt-0.5">{acc.accountName}</p>
                            </div>
                          </div>
                          <div className="p-5 flex items-end justify-between bg-[#0a0a0c]/50">
                            <p className="text-xs text-white/40 font-medium">Balance</p>
                            <p className="text-2xl font-mono tracking-tight text-white/90">{formatMoney(acc.balance || 0)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center p-8 bg-black/20 border border-white/5 rounded-2xl">
                      <Wallet className="mx-auto text-white/20 mb-3" size={32} />
                      <p className="text-white/60 text-sm">No active accounts found.</p>
                    </div>
                  )}
                </div>

                {/* Cards */}
                {userData.cards?.length > 0 && (
                  <div>
                    <h3 className="text-lg font-medium text-white/90 mb-4 flex items-center gap-2"><CreditCard className="text-blue-400" size={18} /> Connected Cards</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <!-- Cards mapped exactly as before -->
                      REPLACE_CARDS
                    </div>
                  </div>
                )}

                {/* Transactions */}
                {userData.recentTx?.length > 0 && (
                  <div>
                    <h3 className="text-lg font-medium text-white/90 mb-4 flex items-center gap-2"><Clock className="text-indigo-400" size={18} /> Recent Transactions</h3>
                    <div className="divide-y divide-white/5 bg-black/20 border border-white/5 rounded-2xl overflow-hidden">
                      <!-- TX mapped exactly as before -->
                      REPLACE_TX
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === "transfer" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-in fade-in duration-300">
                <!-- Execute Transfer & Onyx Quick Pay -->
                REPLACE_TRANSFER
              </div>
            )}

            {activeTab === "invoices" && (
              <div className="space-y-6 animate-in fade-in duration-300">
                <!-- Invoices -->
                REPLACE_INVOICES
              </div>
            )}

            {activeTab === "loans" && (
              <div className="space-y-6 animate-in fade-in duration-300">
                <!-- Loans -->
                REPLACE_LOANS
              </div>
            )}

            {activeTab === "apply" && (
              <div className="animate-in fade-in duration-300">
                <!-- Apply -->
                REPLACE_APPLY
              </div>
            )}

          </div>
        </div>
      )}"""
    
    # We need to extract the parts to replace
    # It might be easier to just write the file completely by grabbing parts from old content, or just using regex.
