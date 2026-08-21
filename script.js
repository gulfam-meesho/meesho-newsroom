const SEV_ORDER = ["critical", "high", "moderate", "watch"];
const SEV_LABEL = { critical: "Critical", high: "High", moderate: "Moderate", watch: "Watch" };
const SEV_COLOR = { critical: "#f43f5e", high: "#f97316", moderate: "#eab308", watch: "#38bdf8" };
const REGION_LABEL = {
  "north": "NORTH (DELHI-NCR · PUNJAB · HARYANA · UP · UTTARAKHAND · HP · J&K)",
  "west": "WEST (RAJASTHAN · GUJARAT · MAHARASHTRA · GOA)",
  "south": "SOUTH (TN · KARNATAKA · KERALA · AP · TELANGANA · PUDUCHERRY)",
  "east": "EAST / NORTHEAST (ASSAM · NAGALAND · WEST BENGAL)",
  "pan-india": "PAN-INDIA"
};

let DATA = { alerts: [], upcomingEvents: [] };
let activeCategory = "all";
let activeSeverity = "all";
let calendarViewDate = null; // month cursor for the community festival calendar widget; lazily set to today's month
const STALE_DAYS = 14; // ongoing alerts older than this many days are auto-hidden
const UPCOMING_WINDOW_DAYS = 15; // festivals/events only enter the Upcoming panel once within this many days
const REFRESH_INTERVAL_MS = 5 * 60 * 1000; // re-check for fresh data every 5 minutes while the tab is open

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

function daysSince(dateStr) {
  const then = new Date(dateStr + "T00:00:00");
  const now = new Date();
  return Math.floor((now - then) / (1000 * 60 * 60 * 24));
}

// Date-only day difference (ignores time-of-day so the number is stable all
// day, not just at the instant loadData() runs). Positive = in the future.
function daysUntil(dateStr) {
  const target = new Date(dateStr + "T00:00:00");
  const now = new Date();
  const todayOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target - todayOnly) / (1000 * 60 * 60 * 24));
}

function pruneStaleAlerts(alerts) {
  // Keep everything that's upcoming (future-looking); auto-remove ongoing
  // alerts once they're older than STALE_DAYS so the feed doesn't accumulate
  // dead news between refreshes.
  return (alerts || []).filter(a => a.status === "upcoming" || daysSince(a.date) <= STALE_DAYS);
}

// The full festival/observance calendar (all communities — Hindu, Muslim,
// Christian, Sikh, Jain, and more) lives in data/alerts.json year-round.
// This computes, purely from each event's real calendar date, which ones are
// currently within the "Upcoming Events" horizon — so an event automatically
// appears once it's UPCOMING_WINDOW_DAYS away and disappears once it's over,
// with no daily manual editing required. Multi-day events (date -> endDate)
// stay visible for their whole span.
function computeUpcomingWindow(events) {
  return (events || [])
    .map(e => {
      const startAway = daysUntil(e.date);
      const endAway = e.endDate ? daysUntil(e.endDate) : startAway;
      return Object.assign({}, e, { startAway, endAway });
    })
    .filter(e => e.startAway <= UPCOMING_WINDOW_DAYS && e.endAway >= 0)
    .sort((a, b) => a.startAway - b.startAway);
}

function etaLabel(e) {
  if (e.startAway == null) return "";
  if (e.startAway < 0) return "ongoing";
  if (e.startAway === 0) return "today";
  if (e.startAway === 1) return "tomorrow";
  return `in ${e.startAway}d`;
}

async function loadData(isBackgroundRefresh) {
  try {
    const res = await fetch("data/alerts.json?ts=" + Date.now(), { cache: "no-store" });
    const fresh = await res.json();
    fresh.alerts = pruneStaleAlerts(fresh.alerts);
    fresh.allUpcomingEvents = fresh.upcomingEvents || [];
    fresh.upcomingEvents = computeUpcomingWindow(fresh.allUpcomingEvents);
    DATA = fresh;
  } catch (e) {
    console.error("Failed to load alerts.json", e);
    if (!isBackgroundRefresh) DATA = { alerts: [], upcomingEvents: [], allUpcomingEvents: [], note: "Could not load data/alerts.json" };
  }
  render();
}

function startAutoRefresh() {
  // Re-fetch periodically so a dashboard left open in a browser tab picks up
  // newly-published alerts without needing a manual reload.
  setInterval(() => loadData(true), REFRESH_INTERVAL_MS);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") loadData(true);
  });
}

function render() {
  renderTicker();
  renderSituationRoom();
  renderCalendar();
  renderSnapshot();
  renderFilters();
  renderRegions();
  renderFeed();
  renderFooter();
}

// ---- Community Festival Calendar widget ----
// Self-contained: reads DATA.allUpcomingEvents (the full, unwindowed, all-communities
// calendar) plus any "status": "upcoming" alerts (local/regional advisories announced
// ahead of time), and lets the user crawl month-to-month independently of the main
// 15-day Upcoming Events panel above.

function communityColor(c) {
  if (!c) return "#9aa3c7";
  if (c.startsWith("Hindu")) return "#f97316";
  if (c.startsWith("Muslim")) return "#22d3ee";
  if (c.startsWith("Christian")) return "#a855f7";
  if (c.startsWith("Sikh")) return "#eab308";
  if (c.startsWith("Jain")) return "#38bdf8";
  if (c.startsWith("National")) return "#f43f5e";
  return "#9aa3c7"; // local/regional/other
}

function parseYMD(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function allCalendarEvents() {
  const festivals = DATA.allUpcomingEvents || [];
  const localUpcoming = (DATA.alerts || []).filter(a => a.status === "upcoming").map(a => ({
    id: a.id, icon: a.icon, community: "Local / Regional", title: a.title, date: a.date, sources: a.sources
  }));
  return [...festivals, ...localUpcoming];
}

function eventsOverlappingDate(events, dateObj) {
  return events.filter(e => {
    const start = parseYMD(e.date);
    const end = e.endDate ? parseYMD(e.endDate) : start;
    return dateObj >= start && dateObj <= end;
  });
}

function shiftCalendarMonth(delta) {
  if (!calendarViewDate) calendarViewDate = new Date();
  calendarViewDate = new Date(calendarViewDate.getFullYear(), calendarViewDate.getMonth() + delta, 1);
  renderCalendar();
}

function renderCalendar() {
  const grid = document.getElementById("calendarGrid");
  if (!grid) return; // widget not present on the page
  if (!calendarViewDate) {
    const now = new Date();
    calendarViewDate = new Date(now.getFullYear(), now.getMonth(), 1);
  }

  const events = allCalendarEvents();
  const year = calendarViewDate.getFullYear();
  const month = calendarViewDate.getMonth();
  document.getElementById("calendarMonthLabel").textContent =
    calendarViewDate.toLocaleDateString("en-IN", { month: "long", year: "numeric" });

  const startWeekday = new Date(year, month, 1).getDay();
  const daysInThisMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();
  const today = new Date(); today.setHours(0, 0, 0, 0);

  const cells = [];
  for (let i = 0; i < startWeekday; i++) {
    const dayNum = daysInPrevMonth - startWeekday + 1 + i;
    cells.push({ dayNum, inMonth: false, dateObj: new Date(year, month - 1, dayNum) });
  }
  for (let d = 1; d <= daysInThisMonth; d++) {
    cells.push({ dayNum: d, inMonth: true, dateObj: new Date(year, month, d) });
  }
  let trailingDay = 1;
  while (cells.length % 7 !== 0) {
    cells.push({ dayNum: trailingDay, inMonth: false, dateObj: new Date(year, month + 1, trailingDay) });
    trailingDay++;
  }

  grid.innerHTML = cells.map(c => {
    const dayEvents = eventsOverlappingDate(events, c.dateObj);
    const isToday = c.dateObj.getTime() === today.getTime();
    const cls = ["calendar-cell", c.inMonth ? "in-month" : "", isToday ? "today" : "", dayEvents.length ? "has-event" : ""].filter(Boolean).join(" ");
    const dots = dayEvents.slice(0, 4).map(e => `<span class="cal-dot" style="background:${communityColor(e.community)}"></span>`).join("");
    const titleAttr = dayEvents.length ? ` title="${dayEvents.map(e => e.title).join(" · ").replace(/"/g, "&quot;")}"` : "";
    return `<div class="${cls}"${titleAttr}>${c.dayNum}<span class="cal-dots">${dots}</span></div>`;
  }).join("");

  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 0);
  const monthEvents = events.filter(e => {
    const start = parseYMD(e.date);
    const end = e.endDate ? parseYMD(e.endDate) : start;
    return start <= monthEnd && end >= monthStart;
  }).sort((a, b) => parseYMD(a.date) - parseYMD(b.date));

  const listEl = document.getElementById("calendarMonthEvents");
  const label = calendarViewDate.toLocaleDateString("en-IN", { month: "long", year: "numeric" }).toUpperCase();
  listEl.innerHTML = `<h4>${label} — ${monthEvents.length} EVENT${monthEvents.length === 1 ? "" : "S"}</h4>` +
    (monthEvents.length ? monthEvents.map(e => `
      <div class="calendar-event-row">
        <span class="cal-ev-date">${fmtDate(e.date)}</span>
        <span class="cal-ev-title">${e.icon || "📅"} ${e.title}</span>
        ${firstSourceLink(e.sources)}
      </div>`).join("") : "<p class='situation-summary'>No events this month.</p>");
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
  const upcoming = [
    ...DATA.alerts.filter(a => a.status === "upcoming").map(a => ({
      icon: a.icon, title: a.title, severity: "watch", startAway: daysUntil(a.date), id: a.id, sources: a.sources
    })),
    ...DATA.upcomingEvents.map(e => ({
      icon: e.icon, title: e.title, severity: "watch", startAway: e.startAway, id: e.id, sources: e.sources
    }))
  ].sort((a, b) => a.startAway - b.startAway);

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
      <div class="eta-col">
        <span class="eta">${etaLabel(a)}</span>
        ${firstSourceLink(a.sources)}
      </div>
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
    { num: DATA.alerts.length, label: "ACTIVE ALERTS", link: "See full feed →", onClick: "goToFeed()" },
    { num: crit, label: "CRITICAL (LM/FM STOPPAGE)", link: "Filter critical →", onClick: "setSeverity('critical'); scrollToSection('feedSection');" },
    { num: high, label: "HIGH SEVERITY", link: "Filter high →", onClick: "setSeverity('high'); scrollToSection('feedSection');" },
    { num: states.size, label: "STATES IMPACTED", link: "See regional zones →", onClick: "scrollToSection('regionsSection')" },
    { num: nextEvent ? etaLabel(nextEvent).toUpperCase() : "—", label: nextEvent ? "NEXT: " + nextEvent.title.split("(")[0].trim().toUpperCase() : "NEXT EVENT", link: "See upcoming events →", onClick: "scrollToSection('situationRoom')" }
  ];
  document.getElementById("snapshotGrid").innerHTML = cards.map((c, i) => `
    <div class="stat-card clickable" onclick="${c.onClick}" role="button" tabindex="0">
      <div class="stat-num" style="color:${["#fff", "#f43f5e", "#f97316", "#22d3ee", "#22c55e"][i]}">${c.num}</div>
      <div class="stat-label">${c.label}</div>
      <span class="stat-link">${c.link}</span>
    </div>`).join("");
}

function scrollToSection(id) {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
}

function goToFeed() {
  activeCategory = "all";
  activeSeverity = "all";
  render();
  scrollToSection("feedSection");
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
        <div class="region-row clickable" onclick="jumpTo('${a.id}')">
          <span class="left"><span class="sev-dot" style="background:${SEV_COLOR[a.severity]}"></span>${(a.states || []).join(", ")}</span>
          <span class="sev-label clickable" style="color:${SEV_COLOR[a.severity]}" onclick="event.stopPropagation(); setSeverity('${a.severity}'); scrollToSection('feedSection');">${SEV_LABEL[a.severity]}</span>
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

function renderSources(sources) {
  if (!sources || !sources.length) return "<span>—</span>";
  return sources.map(s => {
    // Support both the new { name, url } shape and legacy plain-string sources.
    if (typeof s === "string") return `<span>${s}</span>`;
    if (s && s.url) return `<a href="${s.url}" target="_blank" rel="noopener noreferrer">${s.name}</a>`;
    return `<span>${s && s.name ? s.name : s}</span>`;
  }).join(" &nbsp;/&nbsp; ");
}

// Compact "Source" link used in the Upcoming Events / situation-room list —
// links out to the first real source for that festival/alert so the date and
// impact claim can be verified. Returns "" (no link) if no source is known.
function firstSourceLink(sources) {
  if (!sources || !sources.length) return "";
  const s = sources[0];
  if (typeof s === "string" || !s || !s.url) return "";
  return `<a class="eta-source" href="${s.url}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()">🔗 Source</a>`;
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
        <span class="sev-badge clickable ${a.severity}" title="Filter by ${SEV_LABEL[a.severity]}" onclick="setSeverity('${a.severity}'); scrollToSection('feedSection');">${SEV_LABEL[a.severity].toUpperCase()}</span>
      </div>
      <div class="alert-title">${a.title}</div>
      <div class="tag-row">
        <span class="tag">📍 ${(a.states || []).join(", ")}</span>
        <span class="tag clickable" title="Filter by ${a.category}" onclick="setCategory('${a.categoryKey}'); scrollToSection('feedSection');">${a.icon} ${a.category}</span>
        <span class="tag status-${a.status}">${a.status === "ongoing" ? "🔴 Ongoing" : "🕓 Upcoming"}</span>
        <span class="tag">🗓️ ${a.date}</span>
      </div>
      <div class="alert-summary">${a.summary}</div>
      <div class="impact-box"><b>IMPACT ON MEESHO OPS</b><br/>${a.impact}</div>
      <div class="source-line"><b>Source:</b> ${renderSources(a.sources)}</div>
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
loadData(false);
startAutoRefresh();
