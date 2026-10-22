(() => {
  "use strict";

  const OWNER = "lordshadow-code";
  const REPO = "PHANTOM-LEAGUE";
  const BRANCH = "main";
  const API_BASE = `https://api.github.com/repos/${OWNER}/${REPO}/contents/`;
  const state = {
    teams: [],
    matches: [],
    matchFilter: "all"
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  function announce(message, type = "") {
    const status = $("#page-status");
    if (!status) return;
    status.textContent = message;
    status.className = `page-status show ${type}`;
    window.clearTimeout(announce.timer);
    announce.timer = window.setTimeout(() => status.classList.remove("show"), 3500);
  }

  function decodeBase64Utf8(value) {
    const binary = atob(value.replace(/\s/g, ""));
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    return new TextDecoder("utf-8").decode(bytes);
  }

  async function readRepositoryJson(filename) {
    const response = await fetch(`${API_BASE}${encodeURIComponent(filename)}?ref=${encodeURIComponent(BRANCH)}`, {
      headers: { Accept: "application/vnd.github+json" },
      cache: "no-store"
    });
    if (!response.ok) {
      if (response.status === 404) throw new Error(`${filename} no existe en la rama ${BRANCH}.`);
      if (response.status === 403) throw new Error("GitHub limitó temporalmente las consultas. Inténtalo más tarde.");
      throw new Error(`No se pudo leer ${filename} (HTTP ${response.status}).`);
    }
    const file = await response.json();
    if (file.encoding !== "base64" || typeof file.content !== "string") {
      throw new Error(`La respuesta para ${filename} no contiene Base64 válido.`);
    }
    try {
      return JSON.parse(decodeBase64Utf8(file.content));
    } catch (error) {
      if (error instanceof SyntaxError) throw new Error(`${filename} no contiene JSON válido.`);
      throw error;
    }
  }

  function validateTeamsFile(value) {
    if (!value || value.version !== 1 || !Array.isArray(value.teams)) {
      throw new Error("equipos.json debe conservar version: 1 y un arreglo teams.");
    }
    const ids = new Set();
    value.teams.forEach((team, index) => {
      if (!team || typeof team !== "object" || typeof team.id !== "string" || !team.id.trim() ||
          typeof team.name !== "string" || !team.name.trim() || typeof team.captain !== "string" ||
          !Array.isArray(team.members) || !team.members.length || team.members.length > 100 ||
          !team.members.every(member => typeof member === "string" && member.trim()) ||
          new Set(team.members.map(member => member.trim().toLowerCase())).size !== team.members.length ||
          !team.members.some(member => member.trim().toLowerCase() === team.captain.trim().toLowerCase())) {
        throw new Error(`El equipo ${index + 1} de equipos.json tiene campos obligatorios inválidos. El capitán debe figurar entre los integrantes.`);
      }
      if (ids.has(team.id)) throw new Error(`El ID de equipo "${team.id}" está duplicado.`);
      ids.add(team.id);
      if (team.active !== undefined && typeof team.active !== "boolean") {
        throw new Error(`active del equipo "${team.name}" debe ser true o false.`);
      }
      if (team.trackers !== undefined && (!team.trackers || typeof team.trackers !== "object" || Array.isArray(team.trackers))) {
        throw new Error(`trackers de "${team.name}" debe ser un objeto.`);
      }
      if (team.trackers) {
        Object.entries(team.trackers).forEach(([member, tracker]) => {
          let url;
          try { url = new URL(tracker); } catch { url = null; }
          if (!team.members.includes(member) || !url || !["http:", "https:"].includes(url.protocol)) {
            throw new Error(`El Tracker de "${member}" en "${team.name}" no es válido.`);
          }
        });
      }
    });
    return value.teams;
  }

  function validateMatchesFile(value, teams) {
    if (!value || value.version !== 1 || !Array.isArray(value.matches)) {
      throw new Error("partidos.json debe conservar version: 1 y un arreglo matches.");
    }
    const ids = new Set();
    const knownTeamIds = new Set(teams.map(team => team.id));
    value.matches.forEach((match, index) => {
      const label = `El partido ${index + 1} de partidos.json`;
      if (!match || typeof match !== "object" || typeof match.id !== "string" || !match.id.trim() ||
          typeof match.homeTeamId !== "string" || typeof match.awayTeamId !== "string" ||
          match.homeTeamId === match.awayTeamId || !knownTeamIds.has(match.homeTeamId) ||
          !knownTeamIds.has(match.awayTeamId) || typeof match.date !== "string" ||
          !/^\d{4}-\d{2}-\d{2}$/.test(match.date)) {
        throw new Error(`${label} tiene IDs, equipos o fecha inválidos.`);
      }
      if (ids.has(match.id)) throw new Error(`El ID de partido "${match.id}" está duplicado.`);
      ids.add(match.id);
      const pending = match.homeMaps === null && match.awayMaps === null;
      const complete = Number.isSafeInteger(match.homeMaps) && match.homeMaps >= 0 && match.homeMaps <= 99 &&
        Number.isSafeInteger(match.awayMaps) && match.awayMaps >= 0 && match.awayMaps <= 99;
      if (!pending && !complete) throw new Error(`${label}: los dos marcadores deben ser enteros de 0 a 99 o ambos null.`);
    });
    return value.matches;
  }

  function completedMatches(matches = state.matches) {
    return matches.filter(match => match.homeMaps !== null && match.awayMaps !== null);
  }

  function calculateStandings(teams = state.teams, matches = state.matches) {
    const activeTeams = teams.filter(team => team.active !== false);
    const stats = new Map(activeTeams.map(team => [team.id, {
      id: team.id, name: team.name, team, played: 0, wins: 0, draws: 0, losses: 0,
      mapsFor: 0, mapsAgainst: 0, points: 0
    }]));
    const completed = completedMatches(matches);
    completed.forEach(match => {
      const home = stats.get(match.homeTeamId);
      const away = stats.get(match.awayTeamId);
      if (!home || !away) return;
      home.played++; away.played++;
      home.mapsFor += match.homeMaps; home.mapsAgainst += match.awayMaps;
      away.mapsFor += match.awayMaps; away.mapsAgainst += match.homeMaps;
      if (match.homeMaps > match.awayMaps) { home.wins++; home.points += 3; away.losses++; }
      else if (match.homeMaps < match.awayMaps) { away.wins++; away.points += 3; home.losses++; }
      else { home.draws++; away.draws++; home.points++; away.points++; }
    });
    const rows = [...stats.values()].map(row => ({ ...row, mapDifference: row.mapsFor - row.mapsAgainst }));
    rows.sort((a, b) => b.points - a.points || b.mapDifference - a.mapDifference || a.name.localeCompare(b.name, "es"));
    const standings = [];
    for (let start = 0; start < rows.length;) {
      let end = start + 1;
      while (end < rows.length && rows[end].points === rows[start].points &&
             rows[end].mapDifference === rows[start].mapDifference) end++;
      const tied = rows.slice(start, end);
      if (tied.length > 1) {
        const tiedIds = new Set(tied.map(team => team.id));
        const h2h = new Map(tied.map(team => [team.id, { points: 0, diff: 0 }]));
        completed.forEach(match => {
          if (!tiedIds.has(match.homeTeamId) || !tiedIds.has(match.awayTeamId)) return;
          const home = h2h.get(match.homeTeamId), away = h2h.get(match.awayTeamId);
          home.diff += match.homeMaps - match.awayMaps;
          away.diff += match.awayMaps - match.homeMaps;
          if (match.homeMaps > match.awayMaps) home.points += 3;
          else if (match.homeMaps < match.awayMaps) away.points += 3;
          else { home.points++; away.points++; }
        });
        tied.sort((a, b) => h2h.get(b.id).points - h2h.get(a.id).points ||
          h2h.get(b.id).diff - h2h.get(a.id).diff || a.name.localeCompare(b.name, "es"));
      }
      standings.push(...tied);
      start = end;
    }
    return {
      standings: standings.map((row, index) => ({ ...row, position: index + 1 })),
      played: completed.length
    };
  }

  function initials(name) {
    return String(name || "?").trim().split(/\s+/).slice(0, 2).map(part => part[0] || "").join("").toUpperCase();
  }

  function safePublicUrl(value) {
    if (typeof value !== "string" || !value.trim()) return "";
    try {
      const url = new URL(value, window.location.href);
      return ["http:", "https:"].includes(url.protocol) ? url.href : "";
    } catch { return ""; }
  }

  function makeTeamMark(team, className = "team-mini-logo") {
    const mark = document.createElement("span");
    mark.className = className;
    const logoUrl = safePublicUrl(team.logo);
    if (logoUrl) {
      const image = document.createElement("img");
      image.src = logoUrl;
      image.alt = "";
      image.loading = "lazy";
      image.onerror = () => { mark.replaceChildren(document.createTextNode(initials(team.name))); };
      mark.append(image);
    } else mark.textContent = initials(team.name);
    return mark;
  }

  function renderStandings() {
    const body = $("#standings-body");
    body.replaceChildren();
    const { standings } = calculateStandings();
    if (!standings.length) {
      body.innerHTML = '<tr><td colspan="9" class="empty-state">Todavía no hay equipos activos. Registra equipos en equipos.json.</td></tr>';
      return;
    }
    standings.forEach(team => {
      const row = document.createElement("tr");
      if (team.position <= 3) row.className = "top-rank";
      const rank = document.createElement("td");
      const rankBadge = document.createElement("span");
      rankBadge.className = "rank-number";
      rankBadge.textContent = String(team.position).padStart(2, "0");
      rank.append(rankBadge);
      const nameCell = document.createElement("td");
      const name = document.createElement("div");
      name.className = "table-team";
      name.append(makeTeamMark(team.team));
      const label = document.createElement("span");
      label.textContent = team.name;
      name.append(label); nameCell.append(name);
      const values = [team.played, team.wins, team.draws, team.losses, `${team.mapsFor}–${team.mapsAgainst}`, `${team.mapDifference > 0 ? "+" : ""}${team.mapDifference}`, team.points];
      row.append(rank, nameCell);
      values.forEach((value, index) => {
        const cell = document.createElement("td");
        cell.textContent = value;
        if (index === 5) cell.className = team.mapDifference > 0 ? "positive" : team.mapDifference < 0 ? "negative" : "";
        if (index === 6) cell.className = "points-cell";
        row.append(cell);
      });
      body.append(row);
    });
  }

  function formatDate(dateString) {
    const date = new Date(`${dateString}T12:00:00`);
    if (Number.isNaN(date.getTime())) return dateString;
    return date.toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" });
  }

  function renderMatches() {
    const container = $("#matches-list");
    container.replaceChildren();
    const teamsById = new Map(state.teams.map(team => [team.id, team]));
    const matches = [...state.matches].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    const filtered = matches.filter(match => state.matchFilter === "all" ||
      (state.matchFilter === "upcoming" ? match.homeMaps === null : match.homeMaps !== null));
    if (!filtered.length) {
      const message = document.createElement("p");
      message.className = "empty-state";
      message.textContent = matches.length ? "No hay partidos en este filtro." : "Todavía no hay partidos registrados.";
      container.append(message);
      return;
    }
    filtered.forEach(match => {
      const home = teamsById.get(match.homeTeamId), away = teamsById.get(match.awayTeamId);
      if (!home || !away) return;
      const done = match.homeMaps !== null;
      const card = document.createElement("article");
      card.className = "match-card";
      const meta = document.createElement("div"); meta.className = "match-meta";
      const date = document.createElement("span"); date.textContent = formatDate(match.date);
      const status = document.createElement("span"); status.className = `match-state${done ? " final" : ""}`; status.textContent = done ? "● FINALIZADO" : "◷ PENDIENTE";
      meta.append(date, status);
      const versus = document.createElement("div"); versus.className = "match-versus";
      const homeSide = document.createElement("div"); homeSide.className = "match-side";
      homeSide.append(makeTeamMark(home, "match-logo"));
      const homeName = document.createElement("span"); homeName.className = "match-team-name"; homeName.textContent = home.name; homeSide.append(homeName);
      const awaySide = document.createElement("div"); awaySide.className = "match-side away";
      const awayName = document.createElement("span"); awayName.className = "match-team-name"; awayName.textContent = away.name; awaySide.append(awayName, makeTeamMark(away, "match-logo"));
      const score = document.createElement("div"); score.className = `match-score${done ? "" : " pending"}`;
      if (done) {
        const h = document.createElement("span"); h.textContent = match.homeMaps;
        const colon = document.createElement("span"); colon.className = "colon"; colon.textContent = ":";
        const a = document.createElement("span"); a.textContent = match.awayMaps;
        score.append(h, colon, a);
      } else score.textContent = "VS";
      versus.append(homeSide, score, awaySide);
      const footer = document.createElement("div"); footer.className = "match-card-footer";
      const id = document.createElement("span"); id.textContent = match.id;
      const type = document.createElement("span"); type.textContent = done ? "RESULTADO OFICIAL" : "PRÓXIMO ENCUENTRO";
      footer.append(id, type);
      card.append(meta, versus, footer); container.append(card);
    });
  }

  function renderTeams() {
    const list = $("#team-list");
    list.replaceChildren();
    const query = ($("#team-search")?.value || "").trim().toLocaleLowerCase("es");
    const activeTeams = state.teams.filter(team => team.active !== false && [
      team.name, team.captain, team.playerName, team.rank, ...(team.members || [])
    ].some(value => String(value || "").toLocaleLowerCase("es").includes(query)));
    if (!activeTeams.length) {
      const empty = document.createElement("p"); empty.className = "empty-state";
      empty.textContent = query ? "No encontramos equipos que coincidan con la búsqueda." : "Todavía no hay equipos activos registrados.";
      list.append(empty); return;
    }
    activeTeams.forEach(team => {
      const card = document.createElement("article"); card.className = "team-card";
      const heading = document.createElement("div"); heading.className = "team-card-heading";
      heading.append(makeTeamMark(team, "team-logo"));
      const titleWrap = document.createElement("div");
      const title = document.createElement("h3"); title.textContent = team.name;
      const id = document.createElement("p"); id.className = "team-id"; id.textContent = `SQUAD / ${team.id}`;
      titleWrap.append(title, id); heading.append(titleWrap); card.append(heading);
      const captain = document.createElement("p"); captain.className = "team-detail";
      captain.textContent = `Capitán: ${team.captain}`; card.append(captain);
      if (team.playerName) { const p = document.createElement("p"); p.className = "team-detail"; p.textContent = `Nombre en juego: ${team.playerName}`; card.append(p); }
      if (team.rank) { const p = document.createElement("p"); p.className = "team-detail"; p.textContent = `Rango: ${team.rank}`; card.append(p); }
      const members = document.createElement("div"); members.className = "team-members";
      (team.members || []).forEach(member => { const chip = document.createElement("span"); chip.className = "member-chip"; chip.textContent = member; members.append(chip); });
      card.append(members);
      if (team.trackers && typeof team.trackers === "object") {
        Object.entries(team.trackers).forEach(([member, value]) => {
          const url = safePublicUrl(value);
          if (!url || !team.members.includes(member)) return;
          const link = document.createElement("a"); link.className = "team-tracker"; link.href = url; link.target = "_blank"; link.rel = "noopener noreferrer"; link.textContent = `Tracker de ${member} ↗`; card.append(link);
        });
      }
      list.append(card);
    });
  }

  function renderStats() {
    const active = state.teams.filter(team => team.active !== false);
    const completed = completedMatches();
    const pending = state.matches.length - completed.length;
    const { standings } = calculateStandings();
    const totalMaps = completed.reduce((sum, match) => sum + match.homeMaps + match.awayMaps, 0);
    const draws = completed.filter(match => match.homeMaps === match.awayMaps).length;
    $("#hero-team-count").textContent = $("#stat-teams").textContent = active.length;
    $("#hero-played-count").textContent = $("#stat-played").textContent = completed.length;
    $("#hero-upcoming-count").textContent = $("#insight-upcoming").textContent = pending;
    $("#stat-maps").textContent = totalMaps;
    $("#stat-average").textContent = completed.length ? (totalMaps / completed.length).toFixed(1) : "0.0";
    $("#stat-completion").textContent = `${state.matches.length ? Math.round(completed.length / state.matches.length * 100) : 0}% de encuentros programados`;
    $("#insight-draws").textContent = draws;
    $("#insight-leader").textContent = standings[0]?.name || "Sin clasificar";
    const chart = $("#points-chart"); chart.replaceChildren();
    const top = standings.slice(0, 5);
    if (!top.length) {
      const empty = document.createElement("p"); empty.className = "empty-state"; empty.textContent = "Las estadísticas aparecerán cuando se registren equipos y resultados."; chart.append(empty); return;
    }
    const max = Math.max(1, ...top.map(team => team.points));
    top.forEach(team => {
      const row = document.createElement("div"); row.className = "chart-row";
      const name = document.createElement("span"); name.className = "chart-name"; name.textContent = team.name;
      const track = document.createElement("div"); track.className = "chart-track";
      const fill = document.createElement("div"); fill.className = "chart-fill"; fill.style.width = `${Math.max(0, team.points / max * 100)}%`; track.append(fill);
      const value = document.createElement("span"); value.className = "chart-value"; value.textContent = team.points;
      row.append(name, track, value); chart.append(row);
    });
  }

  async function loadLeague() {
    try {
      const [teamsFile, matchesFile] = await Promise.all([readRepositoryJson("equipos.json"), readRepositoryJson("partidos.json")]);
      const teams = validateTeamsFile(teamsFile);
      const matches = validateMatchesFile(matchesFile, teams);
      state.teams = teams;
      state.matches = matches;
      renderStandings(); renderMatches(); renderTeams(); renderStats();
    } catch (error) {
      $("#standings-body").innerHTML = `<tr><td colspan="9" class="empty-state">${escapeHtml(error.message)}</td></tr>`;
      $("#matches-list").textContent = `No se pudieron cargar los partidos: ${error.message}`;
      $("#team-list").textContent = `No se pudieron cargar los equipos: ${error.message}`;
      console.error("PHANTOM LEAGUE: error cargando datos", error);
      announce("No se pudieron cargar los datos de GitHub.");
    }
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  }

  function setupNavigation() {
    const toggle = $("#nav-toggle"), nav = $("#main-nav");
    toggle.addEventListener("click", () => {
      const open = nav.classList.toggle("open");
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", open ? "Cerrar menú" : "Abrir menú");
      toggle.textContent = open ? "×" : "☰";
    });
    $$("#main-nav a").forEach(link => link.addEventListener("click", () => {
      nav.classList.remove("open"); toggle.setAttribute("aria-expanded", "false"); toggle.textContent = "☰";
    }));
    $$(".filter-button").forEach(button => button.addEventListener("click", () => {
      $$(".filter-button").forEach(item => item.classList.toggle("active", item === button));
      state.matchFilter = button.dataset.matchFilter;
      renderMatches();
    }));
    $("#team-search").addEventListener("input", renderTeams);
    $("#current-year").textContent = new Date().getFullYear();
  }

  document.addEventListener("DOMContentLoaded", () => {
    setupNavigation();
    loadLeague();
  });
})();
