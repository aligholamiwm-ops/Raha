import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import client from '../api/client';
import { 
  FiServer, FiUsers, FiTag, FiBarChart2, FiPlus, FiTrash2, 
  FiEdit2, FiRefreshCw, FiChevronDown, FiChevronUp, FiCheck, FiX, FiInfo, FiZap
} from 'react-icons/fi';

const Card = ({ children, className = "" }) => (
  <div className={`bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-2xl p-4 mb-4 ${className}`}>
    {children}
  </div>
);

const SectionHeader = ({ title, icon: Icon, onAdd }) => (
  <div className="flex items-center justify-between mb-4">
    <div className="flex items-center gap-2">
      <div className="w-1 h-4 bg-emerald-500 rounded-full" />
      <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
        {Icon && <Icon className="text-emerald-500" />}
        {title}
      </h2>
    </div>
    {onAdd && (
      <button onClick={onAdd} className="p-1 hover:bg-slate-700 rounded-lg transition-colors text-emerald-500">
        <FiPlus size={20} />
      </button>
    )}
  </div>
);

const Input = ({ label, ...props }) => (
  <div className="mb-3">
    <label className="block text-xs font-medium text-slate-400 mb-1">{label}</label>
    <input 
      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500"
      {...props}
    />
  </div>
);

const Select = ({ label, options, ...props }) => (
  <div className="mb-3">
    <label className="block text-xs font-medium text-slate-400 mb-1">{label}</label>
    <select 
      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500"
      {...props}
    >
      {options.map(opt => (
        <option key={opt.value || opt} value={opt.value || opt}>{opt.label || opt}</option>
      ))}
    </select>
  </div>
);

const Button = ({ children, variant = "primary", icon: Icon, ...props }) => {
  const variants = {
    primary: "bg-emerald-500 hover:bg-emerald-600 text-white",
    secondary: "bg-slate-700 hover:bg-slate-600 text-white",
    danger: "bg-rose-500 hover:bg-rose-600 text-white",
    outline: "border border-slate-700 hover:bg-slate-800 text-slate-300"
  };
  return (
    <button 
      className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 disabled:opacity-50 ${variants[variant]}`}
      {...props}
    >
      {Icon && <Icon size={16} />}
      {children}
    </button>
  );
};

const Badge = ({ children, variant = "info" }) => {
  const variants = {
    success: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
    danger: "bg-rose-500/10 text-rose-500 border-rose-500/20",
    info: "bg-blue-500/10 text-blue-500 border-blue-500/20",
    warning: "bg-amber-500/10 text-amber-500 border-amber-500/20"
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${variants[variant]}`}>
      {children}
    </span>
  );
};


export default function Admin() {
  const { user } = useApp();
  const [activeTab, setActiveTab] = useState("stats");
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  
  // Lists
  const [servers, setServers] = useState([]);
  const [cleanIps, setCleanIps] = useState([]);
  const [plans, setPlans] = useState([]);
  const [discounts, setDiscounts] = useState([]);
  const [testingServer, setTestingServer] = useState(null);
  const [serverTestResult, setServerTestResult] = useState(null);

  const [showIpForm, setShowIpForm] = useState(false);
  const [ipForm, setIpForm] = useState({ isp_name: "MCI", ip_address: "" });

  const [showPlanForm, setShowPlanForm] = useState(false);
  const [planForm, setPlanForm] = useState({ plan_name: "", traffic_gb: 10, price_usd: 5 });
  const [editingPlan, setEditingPlan] = useState(null);

  const [showDiscountForm, setShowDiscountForm] = useState(false);
  const [discountForm, setDiscountForm] = useState({ code: "", discount_percent: 10 });
  const [editingDiscount, setEditingDiscount] = useState(null);

  const [userSearch, setUserSearch] = useState("");
  const [foundUser, setFoundUser] = useState(null);
  const [foundUsers, setFoundUsers] = useState([]);
  const [userTickets, setUserTickets] = useState([]);
  const [userLoans, setUserLoans] = useState([]);
  const [chargeAmount, setChargeAmount] = useState(0);
  const [loanAmount, setLoanAmount] = useState('');
  const [loanNote, setLoanNote] = useState('');
  const [allocatingLoan, setAllocatingLoan] = useState(false);

  useEffect(() => {
    if (activeTab === "stats") fetchStats();
    if (activeTab === "servers") { fetchServers(); fetchCleanIps(); }
    if (activeTab === "pricing") { fetchPlans(); fetchDiscounts(); }
  }, [activeTab]);

  const fetchStats = async () => {
    try {
      const res = await client.get("/api/v1/admin/stats");
      setStats(res.data);
    } catch (err) { console.error("Failed to fetch stats", err); }
  };

  const fetchServers = async () => {
    try {
      const res = await client.get("/api/v1/admin/servers/");
      setServers(res.data);
    } catch (err) { console.error("Failed to fetch servers", err); }
  };

  const fetchCleanIps = async () => {
    try {
      const res = await client.get("/api/v1/clean-ips/");
      setCleanIps(res.data);
    } catch (err) { console.error("Failed to fetch clean IPs", err); }
  };

  const fetchPlans = async () => {
    try {
      const res = await client.get("/api/v1/plans/");
      setPlans(res.data);
    } catch (err) { console.error("Failed to fetch plans", err); }
  };

  const fetchDiscounts = async () => {
    try {
      const res = await client.get("/api/v1/discounts/");
      setDiscounts(res.data);
    } catch (err) { console.error("Failed to fetch discounts", err); }
  };

  const handleTestServer = async (serverName) => {
    setTestingServer(serverName);
    setServerTestResult(null);
    try {
      const res = await client.post(`/api/v1/admin/servers/${encodeURIComponent(serverName)}/test`);
      setServerTestResult({ name: serverName, ...res.data });
    } catch (err) {
      setServerTestResult({ name: serverName, status: "failed", error: err.response?.data?.detail || err.message });
    }
    setTestingServer(null);
  };

  const handleIpSubmit = async (e) => {
    e.preventDefault();
    try {
      await client.post("/api/v1/clean-ips/", ipForm);
      alert("Clean IP added!");
      setIpForm({ isp_name: "MCI", ip_address: "" });
      setShowIpForm(false);
      fetchCleanIps();
    } catch (err) { alert("Error: " + (err.response?.data?.detail || err.message)); }
  };

  const deleteIp = async (isp, ip) => {
    if (!window.confirm("Delete IP?")) return;
    try {
      await client.delete(`/api/v1/clean-ips/${isp}/${ip}`);
      fetchCleanIps();
    } catch (err) { alert("Error deleting IP"); }
  };

  const handleUserSearch = async () => {
    if (!userSearch) return;
    setLoading(true);
    setFoundUser(null);
    setFoundUsers([]);
    setUserTickets([]);
    setUserLoans([]);
    try {
      const res = await client.get(`/api/v1/admin/users/search?q=${encodeURIComponent(userSearch)}`);
      const results = res.data || [];
      if (results.length === 1) {
        await loadUserDetails(results[0]);
      } else if (results.length > 1) {
        setFoundUsers(results);
      } else {
        alert("No users found");
      }
    } catch (err) { 
      alert("Search failed: " + (err.response?.data?.detail || err.message));
    }
    setLoading(false);
  };

  const loadUserDetails = async (user) => {
    setFoundUser(user);
    setFoundUsers([]);
    try {
      const [ticketsRes, loansRes] = await Promise.allSettled([
        client.get(`/api/v1/admin/users/${user.telegram_id}/tickets`),
        client.get(`/api/v1/loans/admin/user/${user.telegram_id}`),
      ]);
      setUserTickets(ticketsRes.status === 'fulfilled' ? ticketsRes.value.data || [] : []);
      setUserLoans(loansRes.status === 'fulfilled' ? loansRes.value.data || [] : []);
    } catch (err) {
      console.error("Failed to load user details", err);
    }
  };

  const handleCharge = async () => {
    try {
      await client.post(`/api/v1/users/${foundUser.telegram_id}/add_balance?amount=${chargeAmount}`);
      alert("Balance added!");
      await loadUserDetails(foundUser);
    } catch (err) { alert("Error charging user"); }
  };

  const handleRoleChange = async (newRole) => {
    try {
      await client.put(`/api/v1/admin/users/${foundUser.telegram_id}/role`, { role: newRole });
      alert("Role updated!");
      await loadUserDetails(foundUser);
    } catch (err) { alert("Error updating role: " + (err.response?.data?.detail || err.message)); }
  };

  const handleAllocateLoan = async () => {
    const amount = parseFloat(loanAmount);
    if (!amount || amount <= 0) { alert("Enter a valid loan amount"); return; }
    setAllocatingLoan(true);
    try {
      await client.post('/api/v1/loans/admin/allocate', {
        telegram_id: foundUser.telegram_id,
        amount_usdt: amount,
        note: loanNote || null,
      });
      alert(`Loan of $${amount} USDT allocated and balance charged!`);
      setLoanAmount('');
      setLoanNote('');
      await loadUserDetails(foundUser);
    } catch (err) {
      alert("Error allocating loan: " + (err.response?.data?.detail || err.message));
    } finally {
      setAllocatingLoan(false);
    }
  };

  const handlePlanSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingPlan) {
        await client.put(`/api/v1/plans/${editingPlan}`, { traffic_gb: planForm.traffic_gb, price_usd: planForm.price_usd });
      } else {
        await client.post("/api/v1/plans/", { plan_name: planForm.plan_name, traffic_gb: planForm.traffic_gb, price_usd: planForm.price_usd });
      }
      alert("Plan saved!");
      setPlanForm({ plan_name: "", traffic_gb: 10, price_usd: 5 });
      setEditingPlan(null);
      setShowPlanForm(false);
      fetchPlans();
    } catch (err) { alert("Error saving plan: " + (err.response?.data?.detail || err.message)); }
  };

  const deletePlan = async (name) => {
    if (!window.confirm("Delete plan?")) return;
    try {
      await client.delete(`/api/v1/plans/${name}`);
      fetchPlans();
    } catch (err) { alert("Error deleting plan"); }
  };

  const handleDiscountSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingDiscount) {
        await client.put(`/api/v1/discounts/${editingDiscount}`, discountForm);
      } else {
        await client.post("/api/v1/discounts/", discountForm);
      }
      alert("Discount saved!");
      setDiscountForm({ code: "", discount_percent: 10 });
      setEditingDiscount(null);
      setShowDiscountForm(false);
      fetchDiscounts();
    } catch (err) { alert("Error saving discount"); }
  };

  const deleteDiscount = async (code) => {
    if (!window.confirm("Delete discount?")) return;
    try {
      await client.delete(`/api/v1/discounts/${code}`);
      fetchDiscounts();
    } catch (err) { alert("Error deleting discount"); }
  };

  if (user?.role !== "admin") {
    return <div className="p-8 text-center text-slate-400">Access Denied. Admins only.</div>;
  }

  return (
    <div className="p-4 pb-24 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-white mb-6 flex items-center gap-2">
        <FiBarChart2 className="text-emerald-500" />
        Admin Dashboard
      </h1>
      
      <div className="flex gap-2 mb-6 overflow-x-auto pb-2 no-scrollbar">
        {[
          { id: "stats", label: "Stats", icon: FiBarChart2 },
          { id: "servers", label: "Servers", icon: FiServer },
          { id: "users", label: "Users", icon: FiUsers },
          { id: "pricing", label: "Pricing", icon: FiTag }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 rounded-full text-sm font-medium capitalize transition-all flex items-center gap-2 whitespace-nowrap ${
              activeTab === tab.id ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/20" : "bg-slate-800 text-slate-400 hover:bg-slate-700"
            }`}
          >
            <tab.icon size={14} />
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "stats" && stats && (
        <div className="grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <Card><div className="text-xs text-slate-400">Total Users</div><div className="text-xl font-bold text-white">{stats.total_users}</div></Card>
          <Card><div className="text-xs text-slate-400">Revenue</div><div className="text-xl font-bold text-emerald-400">${stats.total_revenue_usd}</div></Card>
          <Card><div className="text-xs text-slate-400">Active Configs</div><div className="text-xl font-bold text-blue-400">{stats.active_configs}</div></Card>
          <Card><div className="text-xs text-slate-400">Open Tickets</div><div className="text-xl font-bold text-rose-400">{stats.open_tickets}</div></Card>
          <div className="col-span-2">
            <Button onClick={() => client.post("/api/v1/admin/sync-configs").then(res => alert(`Servers OK: ${res.data.servers_ok}, Failed: ${res.data.servers_failed}, Clients: ${res.data.total_clients}`))} className="w-full" icon={FiRefreshCw}>Test Server Connectivity</Button>
            <p className="text-[10px] text-slate-500 mt-2 text-center italic">
              * Tests connectivity to all XUI servers and returns live config counts.
            </p>
          </div>
        </div>
      )}

      {activeTab === "servers" && (
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <Card>
            <SectionHeader title="XUI Servers" icon={FiServer} />
            <div className="mb-3 p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl">
              <p className="text-xs text-amber-400">
                🔒 Server credentials are stored securely in the <code className="bg-slate-900 px-1 rounded">.env</code> file.
                Edit the <code className="bg-slate-900 px-1 rounded">SERVERS</code> variable and restart the server to make changes.
                Sensitive fields (username, password) are not shown here.
              </p>
            </div>
            <div className="space-y-2">
              {servers.length === 0 && (
                <p className="text-slate-500 text-sm text-center py-4">No servers configured in .env</p>
              )}
              {servers.map(s => (
                <div key={s.name} className="p-3 bg-slate-900/30 rounded-xl border border-slate-700/50">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-white">{s.name}</span>
                        <Badge variant={s.status === "enabled" ? "success" : "danger"}>{s.status}</Badge>
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5">{s.ip}:{s.port} | Inbound: {s.inbound_id}</div>
                    </div>
                    <button
                      onClick={() => handleTestServer(s.name)}
                      disabled={testingServer === s.name}
                      className="flex items-center gap-1 px-2 py-1 text-xs bg-blue-500/20 text-blue-400 rounded-lg hover:bg-blue-500/30 transition-colors disabled:opacity-50"
                    >
                      {testingServer === s.name ? (
                        <span className="w-3 h-3 border border-blue-400 border-t-transparent rounded-full animate-spin" />
                      ) : <FiZap size={12} />}
                      Test
                    </button>
                  </div>
                  {serverTestResult?.name === s.name && (
                    <div className={`mt-2 p-2 rounded-lg text-xs ${serverTestResult.status === 'success' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                      {serverTestResult.status === 'success'
                        ? `✓ Connected | Inbounds: ${serverTestResult.inbounds_count}`
                        : `✗ Failed: ${serverTestResult.error}`}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <SectionHeader title="Clean IPs" icon={FiCheck} onAdd={() => setShowIpForm(!showIpForm)} />
            {showIpForm && (
              <form onSubmit={handleIpSubmit} className="mb-6 p-4 bg-slate-900/50 rounded-xl border border-slate-700 animate-in zoom-in-95 duration-200">
                <Select label="ISP Name" value={ipForm.isp_name} onChange={e => setIpForm({...ipForm, isp_name: e.target.value})} options={["MCI", "MTN", "TUN"]} />
                <Input label="IP Address" value={ipForm.ip_address} onChange={e => setIpForm({...ipForm, ip_address: e.target.value})} required />
                <div className="flex gap-2">
                  <Button type="submit" className="flex-1">Add IP</Button>
                  <Button type="button" variant="outline" onClick={() => setShowIpForm(false)}>Cancel</Button>
                </div>
              </form>
            )}
            <div className="grid grid-cols-1 gap-2">
              {cleanIps.map((ip, idx) => (
                <div key={idx} className="p-2 bg-slate-900/30 rounded-lg border border-slate-700/50 flex items-center justify-between group">
                  <div className="flex items-center gap-3">
                    <Badge variant="info">{ip.isp_name}</Badge>
                    <span className="text-xs text-slate-300 font-mono">{ip.ip_address}</span>
                  </div>
                  <button onClick={() => deleteIp(ip.isp_name, ip.ip_address)} className="p-1 hover:bg-rose-500/20 text-rose-400 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity">
                    <FiTrash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {activeTab === "users" && (
        <Card className="animate-in fade-in slide-in-from-bottom-4 duration-500">
          <SectionHeader title="Manage User" icon={FiUsers} />
          <div className="flex gap-2 mb-4">
            <input 
              className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:border-emerald-500 outline-none" 
              placeholder="Search by ID, nickname, @username, phone..." 
              value={userSearch} 
              onChange={e => setUserSearch(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleUserSearch()}
            />
            <Button onClick={handleUserSearch} disabled={loading} icon={loading ? FiRefreshCw : null}>
              {loading ? "" : "Search"}
            </Button>
          </div>
          <p className="text-[10px] text-slate-500 mb-4 italic">Search by Telegram ID, nickname, @username, phone number, or name</p>

          {/* Multi-result list */}
          {foundUsers.length > 1 && !foundUser && (
            <div className="space-y-2 mb-4">
              <div className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">{foundUsers.length} Users Found</div>
              {foundUsers.map(u => (
                <button
                  key={u.telegram_id}
                  onClick={() => loadUserDetails(u)}
                  className="w-full p-3 bg-slate-900/50 rounded-xl border border-slate-700 text-left hover:border-emerald-500/50 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-bold text-white">
                        {u.nickname || u.telegram_info?.first_name || `ID: ${u.telegram_id}`}
                        {u.telegram_info?.username && <span className="text-slate-400 font-normal ml-1">@{u.telegram_info.username}</span>}
                      </div>
                      <div className="text-[10px] text-slate-500">ID: {u.telegram_id} · ${u.wallet_balance_usd?.toFixed(2)} USDT</div>
                    </div>
                    <Badge variant={u.role === "admin" ? "warning" : "info"}>{u.role}</Badge>
                  </div>
                </button>
              ))}
            </div>
          )}

          {foundUser && (
            <div className="space-y-4 animate-in zoom-in-95 duration-300">
              {foundUsers.length > 1 && (
                <button onClick={() => setFoundUser(null)} className="text-xs text-emerald-400 hover:underline">← Back to results</button>
              )}
              <div className="p-4 bg-slate-900 rounded-2xl border border-slate-700">
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-center gap-3">
                    {foundUser.telegram_info?.photo_url && (
                      <img src={foundUser.telegram_info.photo_url} alt="avatar" className="w-10 h-10 rounded-full object-cover border border-slate-600" />
                    )}
                    <div>
                      <div className="text-base font-bold text-white">
                        {foundUser.nickname || foundUser.telegram_info?.first_name || `User ${foundUser.telegram_id}`}
                        {foundUser.telegram_info?.last_name && ` ${foundUser.telegram_info.last_name}`}
                      </div>
                      {foundUser.telegram_info?.username && (
                        <div className="text-xs text-slate-400">@{foundUser.telegram_info.username}</div>
                      )}
                      <div className="text-xs text-slate-500">ID: {foundUser.telegram_id} · Joined: {new Date(foundUser.created_at).toLocaleDateString()}</div>
                    </div>
                  </div>
                  <Badge variant={foundUser.role === "admin" ? "warning" : "info"}>{foundUser.role}</Badge>
                </div>
                
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="p-2 bg-slate-800/50 rounded-lg">
                    <div className="text-slate-500 mb-1">Wallet</div>
                    <div className="text-emerald-400 font-bold">${(foundUser.wallet_balance_usd || 0).toFixed(2)}</div>
                  </div>
                  <div className="p-2 bg-slate-800/50 rounded-lg">
                    <div className="text-slate-500 mb-1">Traffic Balance</div>
                    <div className="text-blue-400 font-bold">{(foundUser.traffic_balance_gb || 0).toFixed(2)} GB</div>
                  </div>
                  <div className="p-2 bg-slate-800/50 rounded-lg">
                    <div className="text-slate-500 mb-1">Unpaid Loans</div>
                    <div className="text-red-400 font-bold">
                      ${userLoans.filter(l => l.status === 'unpaid').reduce((s, l) => s + l.amount_usdt, 0).toFixed(2)}
                    </div>
                  </div>
                  <div className="p-2 bg-slate-800/50 rounded-lg">
                    <div className="text-slate-500 mb-1">Free Trial</div>
                    <div className={foundUser.has_used_free_trial ? "text-rose-400" : "text-emerald-400"}>
                      {foundUser.has_used_free_trial ? "Used" : "Available"}
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="space-y-3">
                <div className="p-4 bg-slate-900/50 rounded-xl border border-slate-700 space-y-3">
                  <div className="text-xs font-medium text-slate-400 uppercase tracking-wide">User Role</div>
                  <Select 
                    label="Change Role" 
                    value={foundUser.role} 
                    onChange={(e) => handleRoleChange(e.target.value)}
                    options={[
                      { value: "user", label: "User" },
                      { value: "support", label: "Support" },
                      { value: "admin", label: "Admin" }
                    ]}
                  />
                </div>

                <div className="p-4 bg-slate-900/50 rounded-xl border border-slate-700">
                  <div className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-3">Add Balance</div>
                  <Input label="Amount ($)" type="number" value={chargeAmount} onChange={e => setChargeAmount(parseFloat(e.target.value))} />
                  <Button onClick={handleCharge} className="w-full" variant="primary">Add Balance</Button>
                </div>

                {/* Loan Allocation */}
                <div className="p-4 bg-slate-900/50 rounded-xl border border-rose-500/30 space-y-3">
                  <div className="text-xs font-medium text-rose-400 uppercase tracking-wide">Allocate USDT Loan</div>
                  <p className="text-[10px] text-slate-500">Loan amount will be added to user's wallet balance immediately.</p>
                  <Input label="Loan Amount (USDT)" type="number" value={loanAmount} onChange={e => setLoanAmount(e.target.value)} placeholder="e.g. 10" />
                  <Input label="Note (optional)" value={loanNote} onChange={e => setLoanNote(e.target.value)} placeholder="Reason for loan..." />
                  <Button onClick={handleAllocateLoan} disabled={allocatingLoan || !loanAmount} variant="danger" className="w-full">
                    {allocatingLoan ? 'Allocating...' : 'Allocate Loan'}
                  </Button>
                </div>

                {/* Loans list */}
                {userLoans.length > 0 && (
                  <div className="p-4 bg-slate-900/50 rounded-xl border border-slate-700 space-y-2">
                    <div className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">Loans ({userLoans.length})</div>
                    {userLoans.map(loan => (
                      <div key={loan.loan_id} className={`p-3 rounded-lg border ${loan.status === 'settled' ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-red-500/10 border-red-500/30'}`}>
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-white">${loan.amount_usdt?.toFixed(2)} USDT</span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${loan.status === 'settled' ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' : 'text-red-400 border-red-500/30 bg-red-500/10'}`}>
                            {loan.status === 'settled' ? '✓ Settled' : 'Unpaid'}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-500 mt-1">
                          {new Date(loan.created_at).toLocaleDateString()}
                          {loan.note && ` · ${loan.note}`}
                          {loan.settled_at && ` · Settled ${new Date(loan.settled_at).toLocaleDateString()}`}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {userTickets.length > 0 && (
                  <div className="p-4 bg-slate-900/50 rounded-xl border border-slate-700 space-y-2">
                    <div className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">User Tickets ({userTickets.length})</div>
                    {userTickets.map(ticket => (
                      <div key={ticket.ticket_id} className="p-3 bg-slate-800/50 rounded-lg border border-slate-700/50">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-medium text-white">{ticket.title || `Ticket #${ticket.ticket_id.slice(0, 8)}`}</span>
                          <Badge variant={ticket.status === 'open' ? 'danger' : ticket.status === 'closed' ? 'info' : 'warning'}>
                            {ticket.status}
                          </Badge>
                        </div>
                        <div className="text-[10px] text-slate-500">
                          Category: {ticket.category} | Created: {new Date(ticket.created_at).toLocaleDateString()}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </Card>
      )}

      {activeTab === "pricing" && (
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <Card>
            <SectionHeader title="Plans" icon={FiTag} onAdd={() => { setShowPlanForm(!showPlanForm); setEditingPlan(null); setPlanForm({ plan_name: "", traffic_gb: 10, price_usd: 5 }); }} />
            {showPlanForm && (
              <form onSubmit={handlePlanSubmit} className="mb-6 p-4 bg-slate-900/50 rounded-xl border border-slate-700 animate-in zoom-in-95 duration-200">
                <Input label="Plan Name" value={planForm.plan_name} onChange={e => setPlanForm({...planForm, plan_name: e.target.value})} required disabled={!!editingPlan} />
                <div className="grid grid-cols-2 gap-3">
                  <Input label="Traffic (GB)" type="number" value={planForm.traffic_gb} onChange={e => setPlanForm({...planForm, traffic_gb: parseFloat(e.target.value)})} required />
                  <Input label="Price ($)" type="number" value={planForm.price_usd} onChange={e => setPlanForm({...planForm, price_usd: parseFloat(e.target.value)})} required />
                </div>
                <div className="flex gap-2 mt-3">
                  <Button type="submit" className="flex-1">{editingPlan ? "Update" : "Create"} Plan</Button>
                  <Button type="button" variant="outline" onClick={() => setShowPlanForm(false)}>Cancel</Button>
                </div>
              </form>
            )}
            <div className="space-y-2">
              {plans.map(p => (
                <div key={p.plan_name} className="p-3 bg-slate-900/30 rounded-xl border border-slate-700/50 flex items-center justify-between group">
                  <div>
                    <div className="text-sm font-bold text-white">{p.plan_name}</div>
                    <div className="text-[10px] text-slate-500">{p.traffic_gb} GB | ${p.price_usd}</div>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => { setEditingPlan(p.plan_name); setPlanForm({ plan_name: p.plan_name, traffic_gb: p.traffic_gb, price_usd: p.price_usd }); setShowPlanForm(true); }} className="p-1.5 hover:bg-emerald-500/20 text-emerald-400 rounded-lg"><FiEdit2 size={14} /></button>
                    <button onClick={() => deletePlan(p.plan_name)} className="p-1.5 hover:bg-rose-500/20 text-rose-400 rounded-lg"><FiTrash2 size={14} /></button>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <SectionHeader title="Discounts" icon={FiTag} onAdd={() => { setShowDiscountForm(!showDiscountForm); setEditingDiscount(null); }} />
            {showDiscountForm && (
              <form onSubmit={handleDiscountSubmit} className="mb-6 p-4 bg-slate-900/50 rounded-xl border border-slate-700 animate-in zoom-in-95 duration-200">
                <Input label="Code" value={discountForm.code} onChange={e => setDiscountForm({...discountForm, code: e.target.value})} required disabled={!!editingDiscount} />
                <Input label="Percent (%)" type="number" value={discountForm.discount_percent} onChange={e => setDiscountForm({...discountForm, discount_percent: parseFloat(e.target.value)})} required />
                <div className="flex gap-2">
                  <Button type="submit" className="flex-1">{editingDiscount ? "Update" : "Create"} Discount</Button>
                  <Button type="button" variant="outline" onClick={() => setShowDiscountForm(false)}>Cancel</Button>
                </div>
              </form>
            )}
            <div className="space-y-2">
              {discounts.map(d => (
                <div key={d.code} className="p-3 bg-slate-900/30 rounded-xl border border-slate-700/50 flex items-center justify-between group">
                  <div>
                    <div className="text-sm font-bold text-white">{d.code}</div>
                    <div className="text-[10px] text-slate-500">{d.discount_percent}% Off</div>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => { setEditingDiscount(d.code); setDiscountForm(d); setShowDiscountForm(true); }} className="p-1.5 hover:bg-emerald-500/20 text-emerald-400 rounded-lg"><FiEdit2 size={14} /></button>
                    <button onClick={() => deleteDiscount(d.code)} className="p-1.5 hover:bg-rose-500/20 text-rose-400 rounded-lg"><FiTrash2 size={14} /></button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
