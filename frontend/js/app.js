// ─── Mock Data ───────────────────────────────────────────────────────────────
const dashboardData = {
  totalGB: 100,
  usedGB: 32,        // so remaining = 68 GB = 68%
  configs: [
    {
      id: 'IR-01',
      usedGB: 32,
      totalGB: 100,
      daysLeft: 30,
      status: 'online',
      lastSeen: 'هماکنون',
      active: true,
    },
    {
      id: 'IR-02',
      usedGB: 60,
      totalGB: 100,
      daysLeft: 18,
      status: 'offline',
      lastSeen: '2 ساعت پیش',
      active: false,
    },
    {
      id: 'IR-03',
      usedGB: 25,
      totalGB: 100,
      daysLeft: 12,
      status: 'offline',
      lastSeen: '1 روز پیش',
      active: false,
    },
    {
      id: 'IR-04',
      usedGB: 80,
      totalGB: 100,
      daysLeft: 7,
      status: 'offline',
      lastSeen: '3 روز پیش',
      active: false,
    },
  ],
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
function remainingPct(used, total) {
  return Math.round(((total - used) / total) * 100);
}

function remainingGB(used, total) {
  return (total - used).toFixed(1);
}

// ─── SVG Icons ───────────────────────────────────────────────────────────────
const Icons = {
  globe: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`,
  chevronDown: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`,
  cart: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>`,
  calendar: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
  qr: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="3" height="3"/><rect x="18" y="14" width="3" height="3"/><rect x="14" y="18" width="3" height="3"/><rect x="18" y="18" width="3" height="3"/><rect x="5" y="5" width="3" height="3" fill="currentColor" stroke="none"/><rect x="16" y="5" width="3" height="3" fill="currentColor" stroke="none"/><rect x="5" y="16" width="3" height="3" fill="currentColor" stroke="none"/></svg>`,
  rotate: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none"/></svg>`,
  plus: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
  grid: `<svg viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="8" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/><rect x="13" y="13" width="8" height="8" rx="1.5"/></svg>`,
  gridSmall: `<svg viewBox="0 0 20 20" fill="currentColor"><rect x="2" y="2" width="7" height="7" rx="1"/><rect x="11" y="2" width="7" height="7" rx="1"/><rect x="2" y="11" width="7" height="7" rx="1"/><rect x="11" y="11" width="7" height="7" rx="1"/></svg>`,
  shop: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>`,
  support: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3z"/><path d="M3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/></svg>`,
  gift: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg>`,
};

// ─── Faucet SVG ───────────────────────────────────────────────────────────────
const faucetSVG = `
<svg viewBox="0 0 80 50" fill="none" xmlns="http://www.w3.org/2000/svg">
  <!-- body -->
  <rect x="14" y="14" width="48" height="22" rx="6"
    fill="url(#faucetBody)" stroke="#8E9BAA" stroke-width="1.5"/>
  <!-- spout -->
  <rect x="32" y="36" width="14" height="8" rx="3"
    fill="url(#faucetBody)" stroke="#8E9BAA" stroke-width="1.5"/>
  <!-- handle -->
  <circle cx="18" cy="25" r="6"
    fill="url(#handleGrad)" stroke="#8E9BAA" stroke-width="1.5"/>
  <circle cx="18" cy="25" r="3"
    fill="#C8D0D8"/>
  <!-- handle bar -->
  <rect x="5" y="23" width="10" height="4" rx="2"
    fill="url(#faucetBody)" stroke="#8E9BAA" stroke-width="1.2"/>
  <!-- shine -->
  <ellipse cx="50" cy="20" rx="6" ry="3"
    fill="rgba(255,255,255,0.45)"/>
  <defs>
    <linearGradient id="faucetBody" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stop-color="#D8E0E8"/>
      <stop offset="50%"  stop-color="#B8C4CE"/>
      <stop offset="100%" stop-color="#8E9BAA"/>
    </linearGradient>
    <linearGradient id="handleGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%"   stop-color="#C8D4DE"/>
      <stop offset="100%" stop-color="#8E9BAA"/>
    </linearGradient>
  </defs>
</svg>`;

// ─── Wave SVG ────────────────────────────────────────────────────────────────
const waveSVG = `
<svg viewBox="0 0 800 30" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M0,15 C50,28 100,2 150,15 C200,28 250,2 300,15 C350,28 400,2 450,15 C500,28 550,2 600,15 C650,28 700,2 750,15 C800,28 800,28 800,28 L800,30 L0,30 Z"
    fill="rgba(93,213,200,0.85)"/>
  <path d="M0,20 C60,8 120,25 180,20 C240,8 300,25 360,20 C420,8 480,25 540,20 C600,8 660,25 720,20 C780,8 800,18 800,18 L800,30 L0,30 Z"
    fill="rgba(72,200,185,0.60)" opacity="0.7"/>
</svg>`;

// ─── Render Tank ─────────────────────────────────────────────────────────────
function renderTank(usedGB, totalGB) {
  const pct = remainingPct(usedGB, totalGB);
  const remGB = remainingGB(usedGB, totalGB);

  const rulerLines = Array.from({ length: 9 }, (_, i) => {
    const cls = i % 4 === 0 ? 'long' : (i % 2 === 0 ? 'short' : '');
    return `<div class="ruler-line ${cls}"></div>`;
  }).join('');

  const bubbles = [
    { size: 8,  bottom: 30, left: 30,  dur: 4.0, delay: 0.0 },
    { size: 6,  bottom: 20, left: 55,  dur: 3.5, delay: 1.2 },
    { size: 10, bottom: 10, left: 45,  dur: 5.0, delay: 0.5 },
    { size: 5,  bottom: 40, left: 70,  dur: 3.8, delay: 2.0 },
    { size: 7,  bottom: 25, left: 20,  dur: 4.5, delay: 1.8 },
  ].map(b => `
    <div class="bubble" style="
      width:${b.size}px; height:${b.size}px;
      bottom:${b.bottom}px; left:${b.left}%;
      --dur:${b.dur}s; --delay:${b.delay}s;
    "></div>
  `).join('');

  return `
    <div class="tank-section">
      <div class="tank-wrapper">
        <div class="tank-glass">
          <div class="tank-inner">
            <div class="tank-ruler">${rulerLines}</div>
            <div class="tank-text">
              <span class="tank-label">حجم باقی‌مانده</span>
              <span class="tank-percentage">${pct}<span class="unit">%</span></span>
              <span class="tank-detail">
                <span class="highlight">${remGB} GB</span> از ${totalGB} GB
              </span>
            </div>
            <div class="water-fill" id="waterFill" style="height:0%">
              <div class="wave-container">
                <!-- viewBox 0 0 1200 30 with 4 full Q-cycles per half → tiles perfectly at -50% translateX -->
                <svg class="wave-svg" viewBox="0 0 1200 30" preserveAspectRatio="none">
                  <path d="M0,15 Q75,0 150,15 Q225,30 300,15 Q375,0 450,15 Q525,30 600,15 Q675,0 750,15 Q825,30 900,15 Q975,0 1050,15 Q1125,30 1200,15 L1200,30 L0,30 Z"
                    fill="rgba(93,213,200,0.88)"/>
                  <path d="M0,18 Q90,5 180,18 Q270,31 360,18 Q450,5 540,18 Q630,31 720,18 Q810,5 900,18 Q990,31 1080,18 Q1170,5 1200,16 L1200,30 L0,30 Z"
                    fill="rgba(60,195,180,0.55)"/>
                </svg>
              </div>
              ${bubbles}
            </div>
            <div class="tank-shine"></div>
            <div class="tank-bottom-line"></div>
          </div>
        </div>
        <div class="faucet-area">
          <div class="faucet-pipe"></div>
          <div class="faucet-svg-wrap">${faucetSVG}</div>
          <div class="water-drop"></div>
        </div>
      </div>
    </div>
  `;
}

// ─── Render Config Card ───────────────────────────────────────────────────────
function renderConfigCard(cfg, idx) {
  const pct = remainingPct(cfg.usedGB, cfg.totalGB);
  const remGB = remainingGB(cfg.usedGB, cfg.totalGB);
  const isOnline = cfg.status === 'online';

  return `
    <div class="config-card" data-id="${cfg.id}">
      <div class="config-card-top">
        <!-- Left: name + progress -->
        <div class="config-name-block">
          <div class="config-name">${cfg.id}</div>
          <div class="usage-bar-wrap">
            <div class="usage-bar-fill" style="width: ${pct}%"></div>
          </div>
          <div class="usage-text">
            <span class="used-pct">${pct}%</span> از ${cfg.totalGB} GB
          </div>
        </div>

        <!-- Expiry -->
        <div class="expiry-block">
          <span class="cal-icon">${Icons.calendar}</span>
          <div class="expiry-days">${cfg.daysLeft} روز</div>
          <div class="expiry-label">تا انفضا</div>
        </div>

        <div class="divider-v"></div>

        <!-- Status -->
        <div class="status-block">
          <div class="status-row">
            <span class="status-dot ${isOnline ? 'online' : 'offline'}"></span>
            <span class="status-label">${isOnline ? 'آنلاین' : 'آفلاین'}</span>
          </div>
          <div class="status-time">${cfg.lastSeen}</div>
        </div>

        <div class="divider-v2"></div>

        <!-- Actions -->
        <div class="config-actions">
          <button class="action-btn" title="QR Code" onclick="handleQR('${cfg.id}')">
            ${Icons.qr}
          </button>
          <button class="action-btn" title="Rotate Key" onclick="handleRotate('${cfg.id}')">
            ${Icons.rotate}
          </button>
          <button class="action-btn circle-btn" title="Add" onclick="handleAdd('${cfg.id}')">
            ${Icons.plus}
          </button>
          <div class="toggle-wrap">
            <input
              type="checkbox"
              class="toggle-input"
              id="toggle-${idx}"
              ${cfg.active ? 'checked' : ''}
              onchange="handleToggle('${cfg.id}', this.checked)"
            >
            <label class="toggle-label" for="toggle-${idx}"></label>
          </div>
        </div>
      </div>
    </div>
  `;
}

// ─── Render Configs Section ───────────────────────────────────────────────────
function renderConfigsSection(configs) {
  const cards = configs.map((cfg, i) => renderConfigCard(cfg, i)).join('');
  return `
    <div class="configs-section">
      <div class="configs-header">
        <span class="configs-title">کانفیگ‌ها</span>
        <div class="configs-count-badge">
          <span>${configs.length}</span>
          ${Icons.gridSmall}
        </div>
      </div>
      <div class="configs-list">
        ${cards}
      </div>
    </div>
  `;
}

// ─── Render Bottom Nav ────────────────────────────────────────────────────────
function renderBottomNav() {
  const items = [
    { key: 'dashboard', icon: Icons.grid,    label: 'داشبورد',      active: true  },
    { key: 'shop',      icon: Icons.shop,    label: 'فروشگاه',      active: false },
    { key: 'support',   icon: Icons.support, label: 'پشتیبانی',     active: false },
    { key: 'invite',    icon: Icons.gift,    label: 'دعوت دوستان',  active: false },
  ];

  const html = items.map(item => `
    <button class="nav-item ${item.active ? 'active' : ''}" onclick="handleNav('${item.key}', this)">
      <div class="nav-icon-wrap">${item.icon}</div>
      <span class="nav-label">${item.label}</span>
    </button>
  `).join('');

  return `<nav class="bottom-nav">${html}</nav>`;
}

// ─── Render Top Bar ───────────────────────────────────────────────────────────
function renderTopBar() {
  return `
    <header class="top-bar">
      <div class="lang-selector">
        <span class="globe-icon">${Icons.globe}</span>
        <span>IR</span>
        <div class="flag">
          <div class="flag-stripe green"></div>
          <div class="flag-stripe white"></div>
          <div class="flag-stripe red"></div>
        </div>
        <span class="chevron-icon">${Icons.chevronDown}</span>
      </div>
      <button class="cart-btn">${Icons.cart}</button>
    </header>
  `;
}

// ─── Full Render ─────────────────────────────────────────────────────────────
function render() {
  const { totalGB, usedGB, configs } = dashboardData;
  const app = document.getElementById('app');

  app.innerHTML = `
    ${renderTopBar()}
    <div class="scroll-content">
      ${renderTank(usedGB, totalGB)}
      ${renderConfigsSection(configs)}
    </div>
    ${renderBottomNav()}
  `;

  // animate water fill after a short delay
  requestAnimationFrame(() => {
    setTimeout(() => {
      const pct = remainingPct(usedGB, totalGB);
      const fill = document.getElementById('waterFill');
      if (fill) fill.style.height = `${pct}%`;
    }, 120);
  });
}

// ─── Event Handlers ───────────────────────────────────────────────────────────
function handleQR(id) {
  alert(`QR Code برای ${id}`);
}

function handleRotate(id) {
  alert(`تجدید کلید ${id}`);
}

function handleAdd(id) {
  alert(`افزودن به ${id}`);
}

function handleToggle(id, checked) {
  const cfg = dashboardData.configs.find(c => c.id === id);
  if (cfg) cfg.active = checked;
  // No full re-render needed – toggle state handled by CSS
}

function handleNav(key, el) {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  el.classList.add('active');
}

// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', render);
