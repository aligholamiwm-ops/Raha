import React, { useState, useEffect } from "react";
import { useApp } from "../context/AppContext";
import client from "../api/client";

const SectionHeader = ({ title }) => (
  <h2 className="text-lg font-bold text-white mb-4 border-b border-slate-700 pb-2">{title}</h2>
);

const Card = ({ children, className = "" }) => (
  <div className={`bg-slate-800 rounded-xl p-4 border border-slate-700 mb-4 ${className}`}>
    {children}
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

const Button = ({ children, variant = "primary", ...props }) => {
  const variants = {
    primary: "bg-emerald-500 hover:bg-emerald-600 text-white",
    secondary: "bg-slate-700 hover:bg-slate-600 text-white",
    danger: "bg-rose-500 hover:bg-rose-600 text-white"
  };
  return (
    <button 
      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${variants[variant]}`}
      {...props}
    >
      {children}
    </button>
  );
};

export default function Admin() {
  const { user } = useApp();
  const [activeTab, setActiveTab] = useState("stats");
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);

  const [serverForm, setServerForm] = useState({ server_name: "", ip_address: "", panel_port: 2053, username: "", password: "", inbound_id: 1 });
  const [ipForm, setIpForm] = useState({ isp_name: "", ip_address: "" });
  const [userSearch, setUserSearch] = useState("");
  const [foundUser, setFoundUser] = useState(null);
  const [chargeAmount, setChargeAmount] = useState(0);
  const [planForm, setPlanForm] = useState({ plan_name: "", traffic_gb: 10, price_usd: 5 });
  const [discountForm, setDiscountForm] = useState({ code: "", discount_percent: 10 });

  useEffect(() => {
    if (activeTab === "stats") fetchStats();
  }, [activeTab]);

  const fetchStats = async () => {
    try {
      const res = await client.get("/admin/stats");
      setStats(res.data);
    } catch (err) { console.error("Failed to fetch stats", err); }
  };

  const handleServerSubmit = async (e) => {
    e.preventDefault();
    try {
      await client.post("/servers/", serverForm);
      alert("Server added successfully!");
      setServerForm({ server_name: "", ip_address: "", panel_port: 2053, username: "", password: "", inbound_id: 1 });
    } catch (err) { alert("Error: " + (err.response?.data?.detail || err.message)); }
  };

  const handleIpSubmit = async (e) => {
    e.preventDefault();
    try {
      await client.post("/clean-ips/", ipForm);
      alert("Clean IP added!");
      setIpForm({ isp_name: "", ip_address: "" });
    } catch (err) { alert("Error: " + (err.response?.data?.detail || err.message)); }
  };

  const handleUserSearch = async () => {
    if (!userSearch) return;
    setLoading(true);
    try {
      const res = await client.get(`/users/${userSearch}`);
      setFoundUser(res.data);
    } catch (err) { alert("User not found"); setFoundUser(null); }
    setLoading(false);
  };

  const handleCharge = async () => {
    try {
      await client.post(`/users/${foundUser.telegram_id}/add_balance?amount=${chargeAmount}`);
      alert("Balance added!");
      handleUserSearch();
    } catch (err) { alert("Error charging user"); }
  };

  const handleRoleChange = async (newRole) => {
    try {
      await client.put(`/admin/users/${foundUser.telegram_id}/role`, { role: newRole });
      alert("Role updated!");
      handleUserSearch();
    } catch (err) { alert("Error updating role"); }
  };

  const handlePlanSubmit = async (e) => {
    e.preventDefault();
    try {
      await client.post("/plans/", planForm);
      alert("Plan created!");
    } catch (err) { alert("Error creating plan"); }
  };

  const handleDiscountSubmit = async (e) => {
    e.preventDefault();
    try {
      await client.post("/discounts/", discountForm);
      alert("Discount created!");
    } catch (err) { alert("Error creating discount"); }
  };

  if (user?.role !== "admin") {
    return <div className="p-8 text-center text-slate-400">Access Denied. Admins only.</div>;
  }

  return (
    <div className="p-4 pb-24">
      <h1 className="text-2xl font-bold text-white mb-6">Admin Panel</h1>
      <div className="flex gap-2 mb-6 overflow-x-auto pb-2 no-scrollbar">
        {["stats", "servers", "users", "pricing"].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-full text-sm font-medium capitalize transition-colors whitespace-nowrap ${
              activeTab === tab ? "bg-emerald-500 text-white" : "bg-slate-800 text-slate-400"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === "stats" && stats && (
        <div className="grid grid-cols-2 gap-4">
          <Card><div className="text-xs text-slate-400">Total Users</div><div className="text-xl font-bold text-white">{stats.total_users}</div></Card>
          <Card><div className="text-xs text-slate-400">Revenue</div><div className="text-xl font-bold text-emerald-400">${stats.total_revenue_usd}</div></Card>
          <Card><div className="text-xs text-slate-400">Active Configs</div><div className="text-xl font-bold text-blue-400">{stats.active_configs}</div></Card>
          <Card><div className="text-xs text-slate-400">Open Tickets</div><div className="text-xl font-bold text-rose-400">{stats.open_tickets}</div></Card>
          <div className="col-span-2">
            <Button onClick={() => client.post("/admin/sync-configs").then(() => alert("Sync started!"))} className="w-full">Sync All Configs</Button>
          </div>
        </div>
      )}

      {activeTab === "servers" && (
        <>
          <Card>
            <SectionHeader title="Add New Server" />
            <form onSubmit={handleServerSubmit}>
              <Input label="Server Name" value={serverForm.server_name} onChange={e => setServerForm({...serverForm, server_name: e.target.value})} required />
              <Input label="IP Address" value={serverForm.ip_address} onChange={e => setServerForm({...serverForm, ip_address: e.target.value})} required />
              <div className="grid grid-cols-2 gap-3">
                <Input label="Panel Port" type="number" value={serverForm.panel_port} onChange={e => setServerForm({...serverForm, panel_port: parseInt(e.target.value)})} required />
                <Input label="Inbound ID" type="number" value={serverForm.inbound_id} onChange={e => setServerForm({...serverForm, inbound_id: parseInt(e.target.value)})} required />
              </div>
              <Input label="Username" value={serverForm.username} onChange={e => setServerForm({...serverForm, username: e.target.value})} required />
              <Input label="Password" type="password" value={serverForm.password} onChange={e => setServerForm({...serverForm, password: e.target.value})} required />
              <Button type="submit" className="w-full">Add Server</Button>
            </form>
          </Card>
          <Card>
            <SectionHeader title="Add Clean IP" />
            <form onSubmit={handleIpSubmit}>
              <Input label="ISP Name (e.g. MCI)" value={ipForm.isp_name} onChange={e => setIpForm({...ipForm, isp_name: e.target.value})} required />
              <Input label="IP Address" value={ipForm.ip_address} onChange={e => setIpForm({...ipForm, ip_address: e.target.value})} required />
              <Button type="submit" className="w-full">Add Clean IP</Button>
            </form>
          </Card>
        </>
      )}

      {activeTab === "users" && (
        <Card>
          <SectionHeader title="Manage User" />
          <div className="flex gap-2 mb-4">
            <input className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm" placeholder="Telegram ID" value={userSearch} onChange={e => setUserSearch(e.target.value)} />
            <Button onClick={handleUserSearch} disabled={loading}>Search</Button>
          </div>
          {foundUser && (
            <div className="space-y-4">
              <div className="p-3 bg-slate-900 rounded-lg border border-slate-700">
                <div className="text-sm text-white font-medium">User: {foundUser.telegram_id}</div>
                <div className="text-xs text-slate-400">Balance: ${foundUser.wallet_balance_usd} | Role: {foundUser.role}</div>
              </div>
              <div>
                <Input label="Charge Amount ($)" type="number" value={chargeAmount} onChange={e => setChargeAmount(parseFloat(e.target.value))} />
                <Button onClick={handleCharge} className="w-full">Add Balance</Button>
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" className="flex-1" onClick={() => handleRoleChange("admin")}>Make Admin</Button>
                <Button variant="secondary" className="flex-1" onClick={() => handleRoleChange("user")}>Make User</Button>
              </div>
            </div>
          )}
        </Card>
      )}

      {activeTab === "pricing" && (
        <>
          <Card>
            <SectionHeader title="Create Plan" />
            <form onSubmit={handlePlanSubmit}>
              <Input label="Plan Name" value={planForm.plan_name} onChange={e => setPlanForm({...planForm, plan_name: e.target.value})} required />
              <div className="grid grid-cols-2 gap-3">
                <Input label="Traffic (GB)" type="number" value={planForm.traffic_gb} onChange={e => setPlanForm({...planForm, traffic_gb: parseFloat(e.target.value)})} required />
                <Input label="Price ($)" type="number" value={planForm.price_usd} onChange={e => setPlanForm({...planForm, price_usd: parseFloat(e.target.value)})} required />
              </div>
              <Button type="submit" className="w-full">Create Plan</Button>
            </form>
          </Card>
          <Card>
            <SectionHeader title="Create Discount" />
            <form onSubmit={handleDiscountSubmit}>
              <Input label="Code" value={discountForm.code} onChange={e => setDiscountForm({...discountForm, code: e.target.value})} required />
              <Input label="Percent (%)" type="number" value={discountForm.discount_percent} onChange={e => setDiscountForm({...discountForm, discount_percent: parseFloat(e.target.value)})} required />
              <Button type="submit" className="w-full">Create Discount</Button>
            </form>
          </Card>
        </>
      )}
    </div>
  );
}
