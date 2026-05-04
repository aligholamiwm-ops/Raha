import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import client from '../api/client';
import { 
  FiServer, FiUsers, FiTag, FiBarChart2, FiPlus, FiTrash2, 
  FiEdit2, FiRefreshCw, FiChevronDown, FiChevronUp, FiCheck, FiX, FiInfo 
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
  
  // Forms
  const [showServerForm, setShowServerForm] = useState(false);
  const [serverForm, setServerForm] = useState({ server_name: "", ip_address: "", panel_port: 2053, username: "", password: "", inbound_id: 1, status: "enabled" });
  const [editingServer, setEditingServer] = useState(null);

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
  const [chargeAmount, setChargeAmount] = useState(0);
  const [inboundLogs, setInboundLogs] = useState(null);

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

  const handleServerSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingServer) {
        await client.put(`/api/v1/admin/servers/${editingServer}`, serverForm);
        alert("Server updated!");
      } else {
        await client.post("/api/v1/admin/servers/", serverForm);
        alert("Server added!");
      }
      setServerForm({ server_name: "", ip_address: "", panel_port: 2053, username: "", password: "", inbound_id: 1, status: "enabled" });
      setEditingServer(null);
      setShowServerForm(false);
      fetchServers();
    } catch (err) { alert("Error: " + (err.response?.data?.detail || err.message)); }
  };

  const handleRegenerateCookie = async (serverName) => {
    setLoading(true);
    try {
      const res = await client.post(`/api/v1/admin/servers/${serverName}/regenerate-cookie`);
      setInboundLogs(res.data.inbound_info);
      alert("Cookie regenerated successfully!");
    } catch (err) { 
      alert("Error: " + (err.response?.data?.detail || err.message));
      setInboundLogs({ error: err.response?.data?.detail || err.message });
    }
    setLoading(false);
  };

  const toggleServerStatus = async (server) => {
    try {
      const newStatus = server.status === "enabled" ? "disabled" : "enabled";
      await client.put(`/api/v1/admin/servers/${server.server_name}`, { status: newStatus });
      fetchServers();
    } catch (err) { alert("Error toggling status"); }
  };

  const deleteServer = async (name) => {
    if (!window.confirm("Delete server?")) return;
    try {
      await client.delete(`/api/v1/admin/servers/${name}`);
      fetchServers();
    } catch (err) { alert("Error deleting server"); }
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
    try {
      const res = await client.get(`/api/v1/users/${userSearch}`);
      setFoundUser(res.data);
    } catch (err) { alert("User not found"); setFoundUser(null); }
    setLoading(false);
  };

  const handleCharge = async () => {
    try {
      await client.post(`/api/v1/users/${foundUser.telegram_id}/add_balance?amount=${chargeAmount}`);
      alert("Balance added!");
      handleUserSearch();
    } catch (err) { alert("Error charging user"); }
  };

  const handleRoleChange = async (newRole) => {
    try {
      await client.put(`/api/v1/admin/users/${foundUser.telegram_id}/role`, { role: newRole });
      alert("Role updated!");
      handleUserSearch();
    } catch (err) { alert("Error updating role"); }
  };

  const handlePlanSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingPlan) {
        await client.put(`/api/v1/plans/${editingPlan}`, planForm);
      } else {
        await client.post("/api/v1/plans/", planForm);
      }
      alert("Plan saved!");
      setPlanForm({ plan_name: "", traffic_gb: 10, price_usd: 5 });
      setEditingPlan(null);
      setShowPlanForm(false);
      fetchPlans();
    } catch (err) { alert("Error saving plan"); }
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
            <Button onClick={() => client.post("/api/v1/admin/sync-configs").then(() => alert("Sync started!"))} className="w-full" icon={FiRefreshCw}>Sync All Configs</Button>
            <p className="text-[10px] text-slate-500 mt-2 text-center italic">
              * Sync All Configs updates usage and status for all users from all connected XUI panels.
            </p>
          </div>
        </div>
      )}

      {activeTab === "servers" && (
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <Card>
            <SectionHeader 
              title="Servers" 
              icon={FiServer} 
              onAdd={() => { setShowServerForm(!showServerForm); setEditingServer(null); }} 
            />
            
            {showServerForm && (
              <form onSubmit={handleServerSubmit} className="mb-6 p-4 bg-slate-900/50 rounded-xl border border-slate-700 animate-in zoom-in-95 duration-200">
                <Input label="Server Name" value={serverForm.server_name} onChange={e => setServerForm({...serverForm, server_name: e.target.value})} required disabled={!!editingServer} />
                <Input label="IP Address" value={serverForm.ip_address} onChange={e => setServerForm({...serverForm, ip_address: e.target.value})} required />
                <div className="grid grid-cols-2 gap-3">
                  <Input label="Panel Port" type="number" value={serverForm.panel_port} onChange={e => setServerForm({...serverForm, panel_port: parseInt(e.target.value)})} required />
                  <Input label="Inbound ID" type="number" value={serverForm.inbound_id} onChange={e => setServerForm({...serverForm, inbound_id: parseInt(e.target.value)})} required />
                </div>
                <Input label="Username" value={serverForm.username} onChange={e => setServerForm({...serverForm, username: e.target.value})} required />
                <Input label="Password" type="password" value={serverForm.password} onChange={e => setServerForm({...serverForm, password: e.target.value})} required />
                <Select label="Status" value={serverForm.status} onChange={e => setServerForm({...serverForm, status: e.target.value})} options={["enabled", "disabled"]} />
                <div className="flex gap-2">
                  <Button type="submit" className="flex-1">{editingServer ? "Update" : "Add"} Server</Button>
                  <Button type="button" variant="outline" onClick={() => setShowServerForm(false)}>Cancel</Button>
                </div>
              </form>
            )}

            <div className="space-y-2">
              {servers.map(s => (
                <div key={s.server_name} className="p-3 bg-slate-900/30 rounded-xl border border-slate-700/50 flex items-center justify-between group">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-white">{s.server_name}</span>
                      <Badge variant={s.status === "enabled" ? "success" : "danger"}>{s.status}</Badge>
                    </div>
                    <div className="text-[10px] text-slate-500">{s.ip_address}:{s.panel_port} | Inbound: {s.inbound_id}</div>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => handleRegenerateCookie(s.server_name)} className="p-1.5 hover:bg-blue-500/20 text-blue-400 rounded-lg" title="Regenerate Cookie"><FiRefreshCw size={14} /></button>
                    <button onClick={() => { setEditingServer(s.server_name); setServerForm(s); setShowServerForm(true); }} className="p-1.5 hover:bg-emerald-500/20 text-emerald-400 rounded-lg"><FiEdit2 size={14} /></button>
                    <button onClick={() => toggleServerStatus(s)} className="p-1.5 hover:bg-amber-500/20 text-amber-400 rounded-lg">{s.status === "enabled" ? <FiX size={14} /> : <FiCheck size={14} />}</button>
                    <button onClick={() => deleteServer(s.server_name)} className="p-1.5 hover:bg-rose-500/20 text-rose-400 rounded-lg"><FiTrash2 size={14} /></button>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {inboundLogs && (
            <Card className="border-blue-500/30 bg-blue-500/5">
              <SectionHeader title="Inbound Info / Logs" icon={FiInfo} />
              <pre className="text-[10px] text-blue-300 overflow-x-auto p-2 bg-slate-950 rounded-lg max-h-40">
                {JSON.stringify(inboundLogs, null, 2)}
              </pre>
              <Button variant="outline" size="sm" onClick={() => setInboundLogs(null)} className="mt-2 w-full">Clear Logs</Button>
            </Card>
          )}

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
          <div className="flex gap-2 mb-6">
            <input 
              className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:border-emerald-500 outline-none" 
              placeholder="Enter Telegram ID..." 
              value={userSearch} 
              onChange={e => setUserSearch(e.target.value)} 
            />
            <Button onClick={handleUserSearch} disabled={loading} icon={loading ? FiRefreshCw : null}>
              {loading ? "" : "Search"}
            </Button>
          </div>

          {foundUser && (
            <div className="space-y-6 animate-in zoom-in-95 duration-300">
              <div className="p-4 bg-slate-900 rounded-2xl border border-slate-700">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <div className="text-lg font-bold text-white">ID: {foundUser.telegram_id}</div>
                    <div className="text-xs text-slate-500 italic">Joined: {new Date(foundUser.created_at).toLocaleDateString()}</div>
                  </div>
                  <Badge variant={foundUser.role === "admin" ? "warning" : "info"}>{foundUser.role}</Badge>
                </div>
                
                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div className="p-2 bg-slate-800/50 rounded-lg">
                    <div className="text-slate-500 mb-1">Balance</div>
                    <div className="text-emerald-400 font-bold">${foundUser.wallet_balance_usd}</div>
                  </div>
                  <div className="p-2 bg-slate-800/50 rounded-lg">
                    <div className="text-slate-500 mb-1">Free Trial</div>
                    <div className={foundUser.has_used_free_trial ? "text-rose-400" : "text-emerald-400"}>
                      {foundUser.has_used_free_trial ? "Used" : "Available"}
                    </div>
                  </div>
                  <div className="p-2 bg-slate-800/50 rounded-lg">
                    <div className="text-slate-500 mb-1">Referrer ID</div>
                    <div className="text-white">{foundUser.referrer_id || "None"}</div>
                  </div>
                  <div className="p-2 bg-slate-800/50 rounded-lg">
                    <div className="text-slate-500 mb-1">Total Purchased</div>
                    <div className="text-blue-400 font-bold">{foundUser.total_referred_gb_purchased.toFixed(2)} GB</div>
                  </div>
                </div>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-2">Quick Actions</label>
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="outline" onClick={() => handleRoleChange("admin")} disabled={foundUser.role === "admin"}>Set as Admin</Button>
                    <Button variant="outline" onClick={() => handleRoleChange("user")} disabled={foundUser.role === "user"}>Set as User</Button>
                  </div>
                </div>

                <div className="p-4 bg-slate-900/50 rounded-xl border border-slate-700">
                  <Input label="Add Balance ($)" type="number" value={chargeAmount} onChange={e => setChargeAmount(parseFloat(e.target.value))} />
                  <Button onClick={handleCharge} className="w-full" variant="primary">Add Balance</Button>
                </div>
              </div>
            </div>
          )}
        </Card>
      )}

      {activeTab === "pricing" && (
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <Card>
            <SectionHeader title="Plans" icon={FiTag} onAdd={() => { setShowPlanForm(!showPlanForm); setEditingPlan(null); }} />
            {showPlanForm && (
              <form onSubmit={handlePlanSubmit} className="mb-6 p-4 bg-slate-900/50 rounded-xl border border-slate-700 animate-in zoom-in-95 duration-200">
                <Input label="Plan Name" value={planForm.plan_name} onChange={e => setPlanForm({...planForm, plan_name: e.target.value})} required disabled={!!editingPlan} />
                <div className="grid grid-cols-2 gap-3">
                  <Input label="Traffic (GB)" type="number" value={planForm.traffic_gb} onChange={e => setPlanForm({...planForm, traffic_gb: parseFloat(e.target.value)})} required />
                  <Input label="Price ($)" type="number" value={planForm.price_usd} onChange={e => setPlanForm({...planForm, price_usd: parseFloat(e.target.value)})} required />
                </div>
                <div className="flex gap-2">
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
                    <button onClick={() => { setEditingPlan(p.plan_name); setPlanForm(p); setShowPlanForm(true); }} className="p-1.5 hover:bg-emerald-500/20 text-emerald-400 rounded-lg"><FiEdit2 size={14} /></button>
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
