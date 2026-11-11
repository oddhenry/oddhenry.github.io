(() => {
  "use strict";

  const KEY = "ukjentfarvann.v1";
  const DAY = 864e5;
  const TAGS = window.TAGS;
  const SITES = window.SITES.map(([url, name, desc, tags, repeat]) => ({
    url, name, desc, tags: tags.split(" "), repeat: !!repeat
  }));
  const BY_URL = new Map(SITES.map(s => [s.url, s]));

  // Sannsynlighet for å styre ut i ukjent farvann, per trinn på kursvelgeren.
  const EXPLORE = [0.1, 0.25, 0.45, 0.7, 0.92];
  const COURSE_TEXT = [
    "Nesten bare temaer du allerede liker.",
    "Mest temaer du liker, med en og annen avstikker.",
    "Omtrent halvt om halvt mellom kjent og ukjent.",
    "Mest ukjent farvann, innom en trygg havn av og til.",
    "Rett til havs. Nesten bare temaer du ikke har prøvd."
  ];

  // ── Tilstand ────────────────────────────────────────────────
  // sites[url] = { s: "like" | "dislike" | "known" | "skip", t: tidsstempel }
  // manual[tag] = egne justeringer (+/-) fra Interesser-siden
  const fresh = () => ({ v: 1, sites: {}, manual: {}, course: 2, current: null, last: null });
  let state = load();

  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY));
      if (raw && raw.v === 1) return Object.assign(fresh(), raw);
    } catch (e) { /* tom eller utilgjengelig lagring */ }
    return fresh();
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* privat modus */ }
  }

  // ── Hva har vi lært? ────────────────────────────────────────
  function tagStats() {
    const st = {};
    for (const t in TAGS) st[t] = { l: 0, d: 0 };
    for (const url in state.sites) {
      const site = BY_URL.get(url), e = state.sites[url];
      if (!site) continue;
      if (e.s === "like") site.tags.forEach(t => st[t].l++);
      if (e.s === "dislike") site.tags.forEach(t => st[t].d++);
    }
    for (const t in state.manual) {
      if (!st[t]) continue;
      const m = state.manual[t];
      if (m > 0) st[t].l += m; else st[t].d -= m;
    }
    return st;
  }
  const affinity = s => (s.l + 1) / (s.l + s.d + 2);   // 0..1, 0.5 er nøytralt
  const evidence = s => s.l + s.d;

  function eligible(now) {
    return SITES.filter(site => {
      const e = state.sites[site.url];
      if (!e) return true;
      if (e.s === "skip") return now - e.t > 7 * DAY;
      if (site.repeat && e.s !== "dislike") return now - e.t > 2 * DAY;
      return false;
    });
  }

  const gauss = () => {
    let u = 0, v = 0;
    while (!u) u = Math.random();
    while (!v) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  const mean = a => a.reduce((x, y) => x + y, 0) / a.length;

  function pickNext() {
    const cands = eligible(Date.now());
    if (!cands.length) return null;
    const st = tagStats();
    const lastTags = new Set((BY_URL.get(state.last) || { tags: [] }).tags);
    const hasPrefs = Object.values(st).some(s => s.l > 0);
    const explore = !hasPrefs || Math.random() < EXPLORE[state.course];

    let best = null, bestScore = -Infinity;
    for (const site of cands) {
      const ss = site.tags.map(t => st[t]);
      let score;
      if (explore) {
        // Nyhetsverdi: temaer vi vet lite om. Styr likevel unna det som tydelig mislikes.
        score = mean(ss.map(s => 1 / (1 + evidence(s)))) + Math.random() * 0.4;
        if (Math.min(...ss.map(affinity)) < 0.26) score -= 0.6;
      } else {
        score = mean(ss.map(affinity)) + gauss() * 0.07;
        if (site.repeat) score -= 0.15;
      }
      if (site.tags.some(t => lastTags.has(t))) score -= explore ? 0.25 : 0.05;
      if (score > bestScore) { bestScore = score; best = site; }
    }

    let mode, why;
    if (!hasPrefs) {
      mode = "Første tokt";
      why = "lik noe, så lærer kompasset retningen";
    } else if (explore) {
      const t = best.tags.slice().sort((a, b) => evidence(st[a]) - evidence(st[b]))[0];
      mode = "Ukjent farvann";
      why = evidence(st[t]) === 0 ? `du har ikke vært innom ${TAGS[t]} ennå` : `litt utenfor de vante rutene: ${TAGS[t]}`;
    } else {
      const t = best.tags.slice().sort((a, b) => affinity(st[b]) - affinity(st[a]))[0];
      if (affinity(st[t]) > 0.5) { mode = "Kjent kyst"; why = `fordi du liker ${TAGS[t]}`; }
      else { mode = "Ukjent farvann"; why = "ingen kjente havner igjen i nærheten"; }
    }
    return { url: best.url, mode, why, visited: false };
  }

  // ── Handlinger ──────────────────────────────────────────────
  function advance() {
    if (state.current) state.last = state.current.url;
    state.current = pickNext();
    save();
    renderCard(true);
  }
  function judge(verdict) {
    const c = state.current;
    if (!c) return;
    state.sites[c.url] = { s: verdict, t: Date.now() };
    advance();
  }
  function next() {
    const c = state.current;
    if (!c) return;
    // Besøkt uten dom: regnes som kjent. Ellers: hopp over en ukes tid.
    judge(c.visited ? "known" : "skip");
  }
  function visited() {
    if (!state.current || state.current.visited) return;
    state.current.visited = true;
    save();
  }

  // ── Visning: kortet ─────────────────────────────────────────
  const $ = id => document.getElementById(id);
  const el = (tag, attrs, ...kids) => {
    const n = document.createElement(tag);
    for (const k in attrs || {}) {
      if (k === "class") n.className = attrs[k];
      else if (k.startsWith("on")) n.addEventListener(k.slice(2), attrs[k]);
      else n.setAttribute(k, attrs[k]);
    }
    kids.flat().forEach(c => c != null && n.append(c));
    return n;
  };

  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
    return h >>> 0;
  }
  // Pyntekoordinater: hvert nettsted får sin faste posisjon på kartet.
  function position(url) {
    const h = hash(url), lat = (h % 18000) / 100 - 90, lon = ((h >>> 8) % 36000) / 100 - 180;
    const f = (x, pos, neg) => {
      const a = Math.abs(x), d = Math.floor(a), m = Math.floor((a - d) * 60);
      return `${String(d).padStart(2, "0")}°${String(m).padStart(2, "0")}′${x >= 0 ? pos : neg}`;
    };
    return { text: `${f(lat, "N", "S")} ${f(lon, "Ø", "V")}`, bearing: h % 360 };
  }

  function renderCard(animate) {
    const card = $("card"), c = state.current, site = c && BY_URL.get(c.url);
    card.replaceChildren();
    card.classList.remove("enter", "empty");

    if (!site) {
      card.classList.add("empty");
      const skipped = Object.values(state.sites).filter(e => e.s === "skip").length;
      card.append(
        el("p", { class: "eyebrow" }, el("b", null, "Kartet er tegnet")),
        el("h2", null, "Du har seilt hele katalogen."),
        el("p", { class: "desc" }, skipped
          ? `${skipped} steder hoppet du over. De dukker opp igjen om noen dager, eller du kan hente dem frem nå.`
          : "Flaskepostene kommer tilbake om et par dager og sender deg til nye, tilfeldige steder."),
        skipped ? el("button", { type: "button", class: "like", onclick: unskip }, "Hent frem de jeg hoppet over") : null
      );
      updateProgress();
      return;
    }

    const pos = position(site.url);
    let host = site.url;
    try { host = new URL(site.url).hostname.replace(/^www\./, ""); } catch (e) {}

    card.append(
      el("p", { class: "eyebrow" },
        el("b", null, c.mode), el("span", null, c.why), el("span", { class: "pos" }, pos.text)),
      el("h2", null, site.name),
      el("p", { class: "domain" }, host),
      el("p", { class: "desc" }, site.desc),
      el("ul", { class: "chips" }, site.tags.map(t => el("li", null, TAGS[t]))),
      el("a", { class: "go", id: "go", href: site.url, target: "_blank", rel: "noopener noreferrer", onclick: visited },
        site.repeat ? "Kast flaskeposten" : "Sett kursen dit", el("span", { "aria-hidden": "true" }, "↗")),
      el("div", { class: "verdict" },
        el("p", { id: "ask", class: c.visited ? "back" : "" }, c.visited ? "Velkommen tilbake. Hva syntes du?" : "Hva synes du?"),
        el("div", { class: "actions" },
          el("button", { type: "button", class: "like", onclick: () => judge("like") }, "Liker"),
          el("button", { type: "button", onclick: () => judge("dislike") }, "Liker ikke"),
          el("button", { type: "button", onclick: () => judge("known") }, "Kjenner den fra før"),
          el("button", { type: "button", class: "quiet", onclick: next }, "Neste →")))
    );
    if (animate) { void card.offsetWidth; card.classList.add("enter"); }
    $("needle").style.transform = `rotate(${pos.bearing}deg)`;
    updateProgress();
  }

  function unskip() {
    for (const url in state.sites) if (state.sites[url].s === "skip") delete state.sites[url];
    advance();
  }

  function counts() {
    const c = { like: 0, dislike: 0, known: 0, skip: 0 };
    for (const url in state.sites) if (BY_URL.has(url)) c[state.sites[url].s]++;
    return c;
  }
  function updateProgress() {
    const c = counts();
    $("progress").textContent = `${c.like + c.dislike + c.known} av ${SITES.length} steder kartlagt · ${c.like} likt`;
  }

  // ── Visning: interesser ─────────────────────────────────────
  function renderTags() {
    const st = tagStats();
    const rows = Object.keys(TAGS)
      .sort((a, b) => affinity(st[b]) - affinity(st[a]) || evidence(st[b]) - evidence(st[a]) || TAGS[a].localeCompare(TAGS[b], "nb"))
      .map(t => {
        const s = st[t], a = affinity(s) - 0.5; // -0.5..0.5
        const bar = el("i", { class: a >= 0 ? "pos" : "neg" });
        bar.style.width = `${Math.abs(a) * 100}%`;
        const note = evidence(s) ? `${s.l} for · ${s.d} mot` : "ukjent farvann";
        return el("li", null,
          el("span", { class: "name" }, TAGS[t], el("span", { class: "count" }, note)),
          el("span", { class: "meter" }, bar),
          el("span", { class: "adjust" },
            el("button", { type: "button", "aria-label": `Mindre ${TAGS[t]}`, onclick: () => adjust(t, -1) }, "Mindre"),
            el("button", { type: "button", "aria-label": `Mer ${TAGS[t]}`, onclick: () => adjust(t, 1) }, "Mer")));
      });
    $("tags-list").replaceChildren(...rows);
  }
  function adjust(tag, by) {
    state.manual[tag] = (state.manual[tag] || 0) + by;
    if (!state.manual[tag]) delete state.manual[tag];
    save();
    renderTags();
  }

  // ── Visning: loggbok ────────────────────────────────────────
  const SVG = "http://www.w3.org/2000/svg";
  function renderChart() {
    const svg = $("chart"), tags = Object.keys(TAGS), cols = 7;
    const rows = Math.ceil(tags.length / cols), cw = 1000 / cols, rh = 640 / rows;
    svg.replaceChildren();
    const centre = {};
    tags.forEach((t, i) => {
      const h = hash(t);
      centre[t] = {
        x: (i % cols + 0.5) * cw + (h % 30) - 15,
        y: (Math.floor(i / cols) + 0.42) * rh + ((h >>> 6) % 20) - 10
      };
      const label = document.createElementNS(SVG, "text");
      label.setAttribute("x", centre[t].x);
      label.setAttribute("y", centre[t].y + rh * 0.47);
      label.textContent = TAGS[t];
      svg.append(label);
    });
    const cls = { like: "liked", dislike: "disliked", known: "known" };
    for (const site of SITES) {
      const h = hash(site.url), c = centre[site.tags[0]];
      const ang = (h % 360) * Math.PI / 180, r = 8 + ((h >>> 9) % 1000) / 1000 * 36;
      const dot = document.createElementNS(SVG, "circle");
      dot.setAttribute("cx", (c.x + Math.cos(ang) * r * 1.35).toFixed(1));
      dot.setAttribute("cy", (c.y + Math.sin(ang) * r).toFixed(1));
      dot.setAttribute("r", 5);
      const e = state.sites[site.url];
      if (e && cls[e.s]) {
        dot.setAttribute("class", cls[e.s]);
        const title = document.createElementNS(SVG, "title");
        title.textContent = site.name;
        dot.append(title);
      }
      svg.append(dot);
    }
  }

  const fmt = new Intl.DateTimeFormat("nb-NO", { day: "numeric", month: "short" });
  function renderLog() {
    const c = counts(), done = c.like + c.dislike + c.known;
    $("log-summary").textContent = done
      ? `Du har kartlagt ${done} av ${SITES.length} steder: ${c.like} likt, ${c.dislike} mislikt og ${c.known} besøkt eller kjent fra før.`
      : "Her havner alt du har vært innom. Foreløpig er kartet blankt.";
    renderChart();

    const groups = [["like", "Likt"], ["known", "Besøkt eller kjent fra før"], ["dislike", "Mislikt"]];
    const out = [];
    for (const [s, title] of groups) {
      const items = Object.entries(state.sites)
        .filter(([url, e]) => e.s === s && BY_URL.has(url))
        .sort((a, b) => b[1].t - a[1].t);
      if (!items.length) continue;
      out.push(el("h2", null, `${title} (${items.length})`),
        el("ul", { class: "log" }, items.map(([url, e]) => {
          const site = BY_URL.get(url);
          return el("li", null,
            el("a", { href: url, target: "_blank", rel: "noopener noreferrer" }, site.name),
            el("span", { class: "when" }, fmt.format(e.t)),
            el("button", { type: "button", "aria-label": `Glem ${site.name}`, title: "Fjern fra loggboken, så kan stedet foreslås igjen",
              onclick: () => { delete state.sites[url]; save(); renderLog(); } }, "Glem"));
        })));
    }
    $("log-lists").replaceChildren(...out);
  }

  // ── Eksport / import ────────────────────────────────────────
  $("export").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const a = el("a", { href: URL.createObjectURL(blob), download: "ukjent-farvann-loggbok.json" });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  $("import").addEventListener("click", () => $("import-file").click());
  $("import-file").addEventListener("change", async ev => {
    const file = ev.target.files[0];
    ev.target.value = "";
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!data || data.v !== 1 || typeof data.sites !== "object") throw new Error();
      if (!confirm("Erstatte loggboken i denne nettleseren med innholdet i filen?")) return;
      state = Object.assign(fresh(), data);
      save();
      route();
    } catch (e) { alert("Fant ingen gyldig loggbok i den filen."); }
  });
  $("reset").addEventListener("click", () => {
    if (!confirm("Slette alt siden har lært om deg? Dette kan ikke angres.")) return;
    state = fresh();
    save();
    route();
  });

  // ── Kurs, ruting, tastatur ──────────────────────────────────
  const course = $("course");
  const showCourse = () => { $("course-text").textContent = COURSE_TEXT[state.course]; };
  course.addEventListener("input", () => { state.course = +course.value; save(); showCourse(); });

  function route() {
    const view = ["utforsk", "interesser", "loggbok"].includes(location.hash.slice(1)) ? location.hash.slice(1) : "utforsk";
    document.querySelectorAll(".view").forEach(v => { v.hidden = v.id !== `view-${view}`; });
    document.querySelectorAll("nav a").forEach(a => {
      if (a.dataset.view === view) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
    if (view === "utforsk") {
      course.value = state.course;
      showCourse();
      if (!state.current || !BY_URL.has(state.current.url) || rated(state.current.url)) { state.current = pickNext(); save(); }
      renderCard(false);
    } else if (view === "interesser") renderTags();
    else renderLog();
  }
  // Et kort som er «glemt» eller vurdert et annet sted skal ikke bli stående.
  function rated(url) {
    const e = state.sites[url];
    return !!e && e.s !== "skip" && !(BY_URL.get(url).repeat && e.s !== "dislike");
  }
  window.addEventListener("hashchange", route);

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && state.current && state.current.visited && $("ask")) {
      $("ask").textContent = "Velkommen tilbake. Hva syntes du?";
      $("ask").className = "back";
    }
  });

  document.addEventListener("keydown", ev => {
    if (ev.metaKey || ev.ctrlKey || ev.altKey || $("view-utforsk").hidden || !state.current) return;
    if (/^(INPUT|BUTTON|A|TEXTAREA|SELECT)$/.test(ev.target.tagName) && ev.key === "Enter") return;
    if (ev.target.tagName === "INPUT") return;
    const k = ev.key.toLowerCase();
    if (k === "l") judge("like");
    else if (k === "d") judge("dislike");
    else if (k === "k") judge("known");
    else if (k === "n") next();
    else if (k === "enter" && $("go")) $("go").click();
    else return;
    ev.preventDefault();
  });

  route();
})();
