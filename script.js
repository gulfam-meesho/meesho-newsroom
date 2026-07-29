const SEV_ORDER = ["critical", "high", "moderate", "watch"];
const SEV_LABEL = { critical: "Critical", high: "High", moderate: "Moderate", watch: "Watch" };
const SEV_COLOR = { critical: "#f43f5e", high: "#f97316", moderate: "#eab308", watch: "#38bdf8" };
const REGION_LABEL = {
  "north": "NORTH (DELHI-NCR · UP · UTTARAKHAND · HP · J&K)",
  "west": "WEST (RAJASTHAN · MAHARASHTRA · GOA)",
  "south": "SOUTH (TN · KARNATAKA · KERALA · AP · TELANGANA)",
  "east": "EAST / NORTHEAST (ASSAM · NAGALAND)",
  "pan-india": "PAN-INDIA"
};

let DATA = { alerts: [], upcomingEvents: [] };
let activeCategory = "all";
let activeSeverity = "all";

function fmtDate(d) {
  const dt = new Date(d + "T00:00:00");
  return dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function startClock() {
  const el = document.getElementById("clock");
  function tick() {
    const now = new Date();
    el.textContent = now.toLocaleString("en-IN", {
      weekday: "short", day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true, timeZone: "Asia/Kolkata"
    }) + " IST";
  }
  tick();
  setInterval(tick, 1000);
}

async function loadData() {
  try {
    const res = await fetch("data/alerts.json", { cache: "no-store" });
    DATA = await res.json();
  } catch (e) {
    console.error("Failed to load alerts.json", e);
    DATA = { alerts: [], upcomingEvents: [], note: "Could not load data/alerts.json" };
  }
  render();
}

function render() {
  renderTicker();
  renderSituationRoom();
  renderSnapshot();
  renderFilters();
  renderRegions();
  renderFeed();
  renderFooter();
}

function renderTicker() {
  const items = [...DATA.alerts.filter(a => a.severity === "critical" || a.severity === "high"), ...DATA.upcomingEvents];
  const track = document.getElementById("ticker");
  if (!items.length) { track.innerHTML = "<span>No breaking alerts.</span>"; return; }
  const html = items.map(i => `<span>${i.icon || "📰"} ${i.title}</span>`).join("");
  track.innerHTML = `<span class="ticker-track">${html}${html}</span>`;
}

function renderSituationRoom() {
  const current = DATA.alerts.filter(a => a.status === "ongoing");
  const upcoming = [...DATA.alerts.filter(a => a.status === "upcoming"), ...DATA.upcomingEvents.map(e => ({
    icon: e.icon, title: e.title, severity: "watch", daysAway: e.daysAway, id: e.id
  }))];

  document.getElementById("currentCount").textContent = current.length;
  document.getElementById("upcomingCount").textContent = upcoming.length;

  const critCount = current.filter(a => a.severity === "critical").length;
  const highCount = current.filter(a => a.severity === "high").length;
  const states = new Set(current.flatMap(a => a.states || []));
  const top = current[0];
  document.getElementById("currentSummary").innerHTML = current.length
    ? `<b>${critCount} critical</b>, <b>${highCount} high</b> — <b>${states.size} states</b> affected. Top priority: <b>${top ? top.title : "—"}</b>.`
    : "No active disruptions right now.";

  const curList = document.getElementById("currentList");
  curList.innerHTML = current.map(a => `
    <div class="situation-item" onclick="jumpTo('${a.id}')">
      <div class="left">
        <span class="sev-dot" style="background:${SEV_COLOR[a.severity]}"></span>
        <span class="title">${a.icon} ${a.title}</span>
      </div>
      <span class="loc">📍 ${(a.states || []).join(", ")}</span>
    </div>`).join("") || "<p class='situation-summary'>Nothing to show.</p>";

  const upList = document.getElementById("upcomingList");
  upList.innerHTML = upcoming.map(a => `
    <div class="situation-item" onclick="jumpTo('${a.id}')">
      <div class="left">
        <span class="title">${a.icon} ${a.title}</span>
      </div>
      <span class="eta">${a.daysAway != null ? a.daysAway + "d" : ""}</span>
    </div>`).join("") || "<p class='situation-summary'>Nothing planned.</p>";
}

function renderSnapshot() {
  const current = DATA.alerts.filter(a => a.status === "ongoing");
  const crit = DATA.alerts.filter(a => a.severity === "critical").length;
  const high = DATA.alerts.filter(a => a.severity === "high").length;
  const states = new Set(DATA.alerts.flatMap(a => a.states || []));
  const nextEvent = DATA.upcomingEvents[0];

  document.getElementById("snapshotDate").textContent = DATA.compiledAt
    ? new Date(DATA.compiledAt).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }) + " · IST"
    : "—";

  const cards = [
    { num: DATA.alerts.length, label: "ACTIVE ALERTS", link: "See full feed →", target: "#feed" },
    { num: crit, label: "CRITICAL (LM/FM STOPPAGE)", link: "Filter critical →", action: () => setSeverity("critical") },
    { num: high, label: "HIGH SEVERITY", link: "Filter high →", action: () => setSeverity("high") },
    { num: states.size, label: "STATES IMPACTED", link: "See regional zones →" },
    { num: nextEvent ? nextEvent.daysAway : "—", label: nextEvent ? "DAYS TO " + nextEvent.title.split("(")[0].trim().toUpperCase() : "NEXT EVENT", link: "See upcoming events →" }
  ];
  document.getElementById("snapshotGrid").innerHTML = cards.map((c, i) => `
    <div class="stat-card">
      <div class="stat-num" style="color:${["#fff", "#f43f5e", "#f97316", "#22d3ee", "#22c55e"][i]}">${c.num}</div>
      <div class="stat-label">${c.label}</div>
      <span class="stat-link">${c.link}</span>
    </div>`).join("");
}

function renderFilters() {
  const categories = ["all", ...new Set(DATA.alerts.map(a => a.categoryKey))];
  const catLabels = { all: "All Categories" };
  DATA.alerts.forEach(a => catLabels[a.categoryKey] = (a.icon || "") + " " + a.category);

  document.getElementById("categoryFilters").innerHTML = categories.map(c => `
    <button class="pill ${activeCategory === c ? "active" : ""}" onclick="setCategory('${c}')">${catLabels[c]}</button>`).join("");

  const severities = ["all", ...SEV_ORDER];
  const sevLabels = { all: "All Severities", ...SEV_LABEL };
  document.getElementById("severityFilters").innerHTML = severities.map(s => `
    <button class="pill ${activeSeverity === s ? "active" : ""}" onclick="setSeverity('${s}')">${sevLabels[s]}</button>`).join("");
}

function setCategory(c) { activeCategory = c; render(); }
function setSeverity(s) { activeSeverity = s; render(); }

function filteredAlerts() {
  return DATA.alerts.filter(a =>
    (activeCategory === "all" || a.categoryKey === activeCategory) &&
    (activeSeverity === "all" || a.severity === activeSeverity)
  );
}

function renderRegions() {
  const regions = {};
  DATA.alerts.forEach(a => {
    const r = a.region || "pan-india";
    regions[r] = regions[r] || [];
    regions[r].push(a);
  });
  const order = ["north", "west", "south", "east", "pan-india"];
  const grid = document.getElementById("regionGrid");
  grid.innerHTML = order.filter(r => regions[r]).map(r => `
    <div class="region-card">
      <div class="region-title">
        <span>${REGION_LABEL[r] || r.toUpperCase()}</span>
        <span class="region-count">${regions[r].length}</span>
      </div>
      ${regions[r].map(a => `
        <div class="region-row">
          <span class="left"><span class="sev-dot" style="background:${SEV_COLOR[a.severity]}"></span>${(a.states || []).join(", ")}</span>
          <span class="sev-label" style="color:${SEV_COLOR[a.severity]}">${SEV_LABEL[a.severity]}</span>
        </div>`).join("")}
    </div>`).join("");
}

function renderDonut(counts, total) {
  const svg = document.getElementById("donutChart");
  if (!total) { svg.innerHTML = ""; return; }
  let cumulative = 0;
  const radius = 15.9155;
  const circumference = 2 * Math.PI * radius;
  const segments = SEV_ORDER.map(sev => {
    const val = counts[sev] || 0;
    const frac = val / total;
    const dash = frac * circumference;
    const seg = `<circle class="donut-seg" cx="21" cy="21" r="${radius}" fill="transparent"
      stroke="${SEV_COLOR[sev]}" stroke-width="6"
      stroke-dasharray="${dash} ${circumference - dash}"
      stroke-dashoffset="${-cumulative}" />`;
    cumulative += dash;
    return seg;
  }).join("");
  svg.innerHTML = segments;
}

function renderFeed() {
  const list = filteredAlerts();
  document.getElementById("feedCount").textContent = `${list.length} of ${DATA.alerts.length} stories shown`;

  const counts = {};
  DATA.alerts.forEach(a => counts[a.severity] = (counts[a.severity] || 0) + 1);
  renderDonut(counts, DATA.alerts.length);

  document.getElementById("feedList").innerHTML = list.map(a => `
    <div class="alert-card ${a.severity}" id="${a.id}">
      <div class="alert-top">
        <span class="alert-icon">${a.icon}</span>
        <span class="sev-badge ${a.severity}">${SEV_LABEL[a.severity].toUpperCase()}</span>
      </div>
      <div class="alert-title">${a.title}</div>
      <div class="tag-row">
        <span class="tag">📍 ${(a.states || []).join(", ")}</span>
        <span class="tag">${a.icon} ${a.category}</span>
        <span class="tag status-${a.status}">${a.status === "ongoing" ? "🔴 Ongoing" : "🕓 Upcoming"}</span>
        <span class="tag">🗓️ ${a.date}</span>
      </div>
      <div class="alert-summary">${a.summary}</div>
      <div class="impact-box"><b>IMPACT ON MEESHO OPS</b><br/>${a.impact}</div>
      <div class="source-line">📰 ${(a.sources || []).join(" / ")}</div>
    </div>`).join("") || "<p class='situation-summary'>No alerts match the current filters.</p>";
}

function renderFooter() {
  const compiled = DATA.compiledAt
    ? new Date(DATA.compiledAt).toLocaleString("en-IN", { weekday: "long", day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" })
    : "—";
  document.getElementById("footerNote").innerHTML =
    `Snapshot compiled from public news sources on <b>${compiled} IST</b>. ${DATA.note || ""}`;
}

function jumpTo(id) {
  const el = document.getElementById(id);
  if (el) { el.scrollIntoView({ behavior: "smooth", block: "center" }); el.style.outline = "2px solid #ec4899"; setTimeout(() => el.style.outline = "none", 1500); }
}

startClock();
loadData();
