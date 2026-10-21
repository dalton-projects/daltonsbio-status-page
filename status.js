(() => {
  const REPO = "dalton-projects/daltonsbio-status";
  const RAW = `https://raw.githubusercontent.com/${REPO}/master`;
  const DAYS = 90;
  const DAY = 24 * 60 * 60 * 1000;
  // Drawn in SVG units, not CSS pixels: 90 boxes rarely divide the row's width
  // into whole pixels, and the browser then rounds some boxes a pixel wider.
  const BAR = 5, GAP = 2;
  const PARTS = [
    { slug: "website", name: "Website", what: "The school's pages and blog", trouble: "The website is having problems" },
    { slug: "signing-in", name: "Signing in", what: "Your account, dashboard and progress", trouble: "Signing in is having problems" },
    { slug: "buying-a-course", name: "Buying a course", what: "Checkout and payments", trouble: "Buying a course is having problems" },
    { slug: "lessons", name: "Lessons", what: "Course videos, audio and downloads", trouble: "Lessons are having problems" },
  ];

  const $ = (id) => document.getElementById(id);
  $("year").textContent = new Date().getFullYear();
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const dayKey = (d) => d.toISOString().slice(0, 10);
  const longDate = (d) => d.toLocaleDateString("en-CA", { day: "numeric", month: "long", year: "numeric" });
  const stamp = (d) => d.toLocaleString("en-CA", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZoneName: "short" });
  const localKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const HISTORY_DAYS = 14;
  // Checks are kept per part; the history pages need them after the first load.
  const data = { bySlug: {}, starts: {} };

  function ago(date) {
    const mins = Math.round((Date.now() - date.getTime()) / 60000);
    if (mins < 1) return "less than a minute ago";
    if (mins === 1) return "1 minute ago";
    if (mins < 60) return `${mins} minutes ago`;
    const hours = Math.round(mins / 60);
    return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
  }

  function list(words) {
    return words.length < 2 ? words.join("") : `${words.slice(0, -1).join(", ")} and ${words.at(-1)}`;
  }

  async function text(path) {
    const r = await fetch(`${RAW}/${path}?t=${Math.floor(Date.now() / 60000)}`);
    if (!r.ok) throw new Error(path);
    return r.text();
  }

  function field(yaml, name) {
    const m = new RegExp(`^${name}:\\s*(.+)$`, "m").exec(yaml);
    return m ? m[1].trim() : null;
  }

  function bars(start, minutesDown) {
    const today = new Date(); today.setUTCHours(0, 0, 0, 0);
    const first = new Date(start); first.setUTCHours(0, 0, 0, 0);
    let html = "", downDays = 0, checkedDays = 0;
    for (let i = DAYS - 1; i >= 0; i--) {
      const day = new Date(today.getTime() - i * DAY);
      const key = dayKey(day);
      let state = "none", label = `${longDate(day)}: not checked yet`;
      if (day >= first) {
        checkedDays++;
        const mins = Number(minutesDown[key] || 0);
        if (mins === 0) { state = "ok"; label = `${longDate(day)}: no problems`; }
        else {
          downDays++;
          state = mins >= 60 ? "bad" : "some";
          label = `${longDate(day)}: down for ${mins} minute${mins === 1 ? "" : "s"}`;
        }
      }
      const x = (DAYS - 1 - i) * (BAR + GAP);
      html += `<rect x="${x}" width="${BAR}" height="30" rx="1.5" data-day="${state}"><title>${esc(label)}</title></rect>`;
    }
    return { html, downDays, checkedDays };
  }

  function partHtml(p, row, history) {
    const state = row ? row.status : "unknown";
    const word = state === "up" ? "Working" : state === "down" ? "Down" : "Not checked yet";
    const start = field(history, "startTime") || new Date().toISOString();
    const b = bars(start, (row && row.dailyMinutesDown) || {});
    const summary = b.checkedDays === 0 ? "No checks yet"
      : b.downDays === 0 ? (b.checkedDays === 1 ? "No problems today" : `No problems in the last ${b.checkedDays} days`)
      : b.checkedDays === 1 ? "Problems today"
      : `Problems on ${b.downDays} of the last ${b.checkedDays} days`;
    return `<article class="part">
      <div class="part-head">
        <div><h2>${esc(p.name)}</h2><p class="what">${esc(p.what)}</p></div>
        <span class="state" data-state="${state}">${word}</span>
      </div>
      <svg class="bars" viewBox="0 0 ${DAYS * (BAR + GAP) - GAP} 30" preserveAspectRatio="none" role="img" aria-label="${esc(p.name)}, last ${DAYS} days: ${esc(summary)}">${b.html}</svg>
      <div class="bar-scale" aria-hidden="true"><span>${DAYS} days ago</span><span>Today</span></div>
      <p class="bar-summary">${esc(summary)}</p>
    </article>`;
  }

  async function loadParts() {
    const [summary, ...histories] = await Promise.all([
      text("history/summary.json").then(JSON.parse),
      ...PARTS.map((p) => text(`history/${p.slug}.yml`).catch(() => "")),
    ]);
    const bySlug = Object.fromEntries(summary.map((r) => [r.slug, r]));
    data.bySlug = bySlug;
    PARTS.forEach((p, i) => { data.starts[p.slug] = new Date(field(histories[i], "startTime") || Date.now()); });
    renderUptime();
    $("parts").innerHTML = PARTS.map((p, i) => partHtml(p, bySlug[p.slug], histories[i])).join("");

    const down = PARTS.filter((p) => bySlug[p.slug] && bySlug[p.slug].status === "down");
    document.body.dataset.overall = down.length ? "down" : "ok";
    $("headline").textContent = down.length === 0 ? "Everything is working"
      : down.length === PARTS.length ? "The school's website is down"
      : down.length === 1 ? down[0].trouble
      : `${list(down.map((p) => p.name.toLowerCase())).replace(/^./, (c) => c.toUpperCase())} are having problems`;

    // The history files only change when a part goes up or down, so the time of
    // the last check comes from the checking job itself.
    const last = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/uptime.yml/runs?status=success&per_page=1`, { headers: { Accept: "application/vnd.github+json" } })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => (j && j.workflow_runs && j.workflow_runs[0] ? new Date(j.workflow_runs[0].updated_at) : null))
      .catch(() => null);
    // GitHub runs scheduled checks a little late at busy times; only an hour of
    // silence is worth telling people about.
    const late = last && Date.now() - last.getTime() > 60 * 60000;
    const when = !last ? "" : late ? ` Last checked ${ago(last)}, so these results may be out of date.` : ` Last checked ${ago(last)}.`;
    $("checked").textContent = down.length === 0
      ? `We check the website, sign in, checkout and lessons around the clock.${when}`
      : `We know about it and are working on it. Updates appear below.${when}`;
  }

  // The checker titles its issues "Lessons is down"; say it the way a person would.
  const plainTitle = (t, auto) => {
    const clean = t.replace(/^[^\p{L}\p{N}]+/u, "").trim();
    const part = auto && PARTS.find((p) => clean.toLowerCase().startsWith(p.name.toLowerCase()));
    return part ? `${part.name} stopped working` : clean;
  };
  // The checker's repository is public, so anyone can open an issue or comment
  // there. Only the school's own people are shown.
  const trusted = (x) => ["OWNER", "MEMBER", "COLLABORATOR"].includes(x.author_association);
  // The checker files its incidents with the school's own token, so they are
  // told apart by Upptime's "status" label and its automatic comments.
  const isAuto = (issue) => (issue.labels || []).some((l) => (l.name || l) === "status");
  const isAutoComment = (c) => /^\*\*Resolved:\*\*/.test(c.body || "") || /upptime/i.test(c.body || "");

  // An update can start with the stage it reports, "Identified: ..." and so on.
  const STAGES = ["Investigating", "Identified", "Update", "Monitoring", "Resolved"];
  function step(body, at) {
    const m = new RegExp(`^\\s*\\**(${STAGES.join("|")})\\**\\s*[:\\-\u2013\u2014]\\s*`, "i").exec(body);
    const stage = m ? STAGES.find((x) => x.toLowerCase() === m[1].toLowerCase()) : "Update";
    return { stage, text: m ? body.slice(m[0].length) : body, at: new Date(at) };
  }

  function incidentHtml(i, steps) {
    const all = [...steps];
    const auto = isAuto(i);
    const part = auto && PARTS.find((p) => plainTitle(i.title, true).startsWith(p.name));
    if (!all.length || auto) {
      all.unshift({ stage: "Investigating", at: new Date(i.created_at),
        text: part ? `Our checks found that ${part.name.toLowerCase()} stopped working. We are looking into it.` : "We are looking into it." });
    }
    if (i.state === "closed" && !all.some((x) => x.stage === "Resolved")) {
      all.push({ stage: "Resolved", at: new Date(i.closed_at), text: "This is fixed and working normally again." });
    }
    all.sort((x, y) => y.at - x.at);
    return `<article class="incident"${i.state === "open" ? " data-open" : ""}>
      <h4>${esc(plainTitle(i.title, auto))}</h4>
      ${all.map((x) => `<div class="step"><p><strong>${esc(x.stage)}</strong> - ${esc(x.text)}</p><time datetime="${esc(x.at.toISOString())}">${esc(stamp(x.at))}</time></div>`).join("")}
    </article>`;
  }

  async function loadProblems() {
    const since = new Date(Date.now() - HISTORY_DAYS * DAY).toISOString();
    const r = await fetch(`https://api.github.com/repos/${REPO}/issues?state=all&since=${since}&per_page=30`, { headers: { Accept: "application/vnd.github+json" } });
    if (!r.ok) throw new Error("issues");
    const issues = (await r.json()).filter((i) => !i.pull_request && trusted(i));
    const withSteps = await Promise.all(issues.map(async (i) => {
      let comments = [];
      if (i.comments > 0) {
        const c = await fetch(i.comments_url, { headers: { Accept: "application/vnd.github+json" } }).then((x) => (x.ok ? x.json() : [])).catch(() => []);
        comments = c.filter((u) => trusted(u) && !isAutoComment(u));
      }
      const note = !isAuto(i) && i.body ? [step(i.body, i.created_at)] : [];
      return { i, steps: [...note, ...comments.map((u) => step(u.body || "", u.created_at))] };
    }));

    // One heading per day, newest first, back to the day the checks began.
    const began = new Date(Math.min(...Object.values(data.starts).map(Number), Date.now()));
    const firstDay = new Date(Math.max(began.getTime(), Date.now() - (HISTORY_DAYS - 1) * DAY));
    firstDay.setHours(0, 0, 0, 0);
    const days = [];
    for (let d = new Date(); d >= firstDay; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1)) days.push(d);
    const todayKey = localKey(new Date());
    $("problem-list").innerHTML = days.map((d) => {
      const key = localKey(d);
      const here = withSteps.filter(({ i }) => localKey(new Date(i.created_at)) === key);
      const label = d.toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" });
      return `<section class="day"><h3>${esc(label)}</h3>${here.length
        ? here.map(({ i, steps }) => incidentHtml(i, steps)).join("")
        : `<p class="none">${key === todayKey ? "No problems reported today." : "No problems reported."}</p>`}</section>`;
    }).join("") + (began > new Date(Date.now() - HISTORY_DAYS * DAY)
      ? `<p class="since">Checks began on ${esc(longDate(began))}.</p>` : "");
  }

  // Uptime: three months at a time for one part, like a calendar.
  let monthOffset = 0;
  // As many months as fit side by side: one on a phone, two on a tablet, three wider.
  const narrow = matchMedia("(max-width: 34rem)"), middle = matchMedia("(max-width: 44rem)");
  const perView = () => (narrow.matches ? 1 : middle.matches ? 2 : 3);
  function monthHtml(year, month, slug) {
    const start = data.starts[slug];
    const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const mins = (data.bySlug[slug] && data.bySlug[slug].dailyMinutesDown) || {};
    const first = new Date(year, month, 1);
    const count = new Date(year, month + 1, 0).getDate();
    let cells = "", checked = 0, down = 0;
    for (let k = 0; k < first.getDay(); k++) cells += `<span data-day="pad"></span>`;
    for (let n = 1; n <= count; n++) {
      const d = new Date(year, month, n);
      let state = "none", label = `${longDate(d)}: not checked`;
      if (d >= startDay && d <= today) {
        const m = Math.min(Number(mins[dayKey(new Date(Date.UTC(year, month, n)))] || 0), 1440);
        checked++; down += m;
        state = m === 0 ? "ok" : m >= 60 ? "bad" : "some";
        label = m === 0 ? `${longDate(d)}: no problems` : `${longDate(d)}: down for ${m} minute${m === 1 ? "" : "s"}`;
      }
      cells += `<span data-day="${state}" title="${esc(label)}"></span>`;
    }
    const name = first.toLocaleDateString("en-CA", { month: "long", year: "numeric" });
    const pct = checked ? `${(100 * (1 - down / (checked * 1440))).toFixed(2)}%` : "No data";
    return `<div class="month"><div class="month-head"><h3>${esc(name)}</h3><span class="pct">${pct}</span></div>
      <div class="cal" role="img" aria-label="${esc(name)}: ${checked ? `${pct} uptime` : "not checked"}">${cells}</div></div>`;
  }

  function renderUptime() {
    const select = $("uptime-part");
    if (!select.options.length) select.innerHTML = PARTS.map((p) => `<option value="${p.slug}">${esc(p.name)}</option>`).join("");
    const slug = select.value;
    const now = new Date();
    const count = perView();
    const months = Array.from({ length: count }, (_, k) => new Date(now.getFullYear(), now.getMonth() - (count - 1 - k) - monthOffset, 1));
    $("uptime-months").innerHTML = months.map((m) => monthHtml(m.getFullYear(), m.getMonth(), slug)).join("");
    const fmt = (m) => m.toLocaleDateString("en-CA", { month: "long", year: "numeric" });
    $("uptime-range").textContent = count === 1 ? fmt(months[0]) : `${fmt(months[0])} to ${fmt(months[count - 1])}`;
    const start = data.starts[slug];
    $("uptime-prev").disabled = !start || months[0] <= new Date(start.getFullYear(), start.getMonth(), 1);
    $("uptime-next").disabled = monthOffset === 0;
  }
  $("uptime-part").addEventListener("change", () => { monthOffset = 0; renderUptime(); });
  $("uptime-prev").addEventListener("click", () => { monthOffset += perView(); renderUptime(); });
  $("uptime-next").addEventListener("click", () => { monthOffset = Math.max(0, monthOffset - perView()); renderUptime(); });
  [narrow, middle].forEach((m) => m.addEventListener("change", () => { monthOffset = 0; if (Object.keys(data.starts).length) renderUptime(); }));

  // Tabs: click, or the arrow keys once a tab has focus. The address keeps the choice.
  const tabs = [...document.querySelectorAll('[role="tab"]')];
  function choose(tab, focus) {
    tabs.forEach((t) => {
      const on = t === tab;
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
      $(t.getAttribute("aria-controls")).hidden = !on;
    });
    if (focus) tab.focus();
    history.replaceState(null, "", tab.id === "tab-uptime" ? "#uptime" : location.pathname);
  }
  tabs.forEach((t, n) => {
    t.addEventListener("click", () => choose(t));
    t.addEventListener("keydown", (e) => {
      const to = e.key === "ArrowRight" ? n + 1 : e.key === "ArrowLeft" ? n - 1 : e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : null;
      if (to === null) return;
      e.preventDefault();
      choose(tabs[(to + tabs.length) % tabs.length], true);
    });
  });
  if (location.hash === "#uptime") choose($("tab-uptime"));

  const parts = loadParts().catch(() => {
    document.body.dataset.overall = "unknown";
    $("headline").textContent = "We could not load the latest checks";
    $("checked").textContent = "Refresh the page in a minute.";
  });
  parts.finally(() => loadProblems().catch(() => {
    $("problem-list").innerHTML = `<p class="none">Past problems could not be loaded. Refresh the page in a minute.</p>`;
  }));
})();
