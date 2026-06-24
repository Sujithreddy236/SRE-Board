(function () {
  const source = window.SRE_BOARD_DATA;
  const app = document.getElementById("app");
  let liveStatus = {
    mode: "snapshot",
    message: "Snapshot data active",
    fetchedAt: "",
    details: ""
  };
  const state = {
    teamId: "sre",
    tab: "overview",
    status: "All",
    priority: "All",
    assignee: "All",
    releaseType: "patch",
    selectedIssueKey: "",
    query: ""
  };

  const statusOrder = ["Open", "In Progress", "Blocked", "Done"];
  const priorityOrder = ["P1", "P2", "P3", "P4"];
  const releaseTypes = [
    { id: "patch", label: "Patch" },
    { id: "hotfix", label: "Hotfix" }
  ];
  const customReleaseStorageKey = "sre-board-custom-releases";

  source.releases = mergeReleases(source.releases || [], getStoredReleases());

  function getTeam() {
    return source.teams.find((team) => team.id === state.teamId) || source.teams[0];
  }

  function applyLiveSreData(payload) {
    if (!payload || !Array.isArray(payload.sreFilterIssues)) return;
    source.sreFilterIssues = payload.sreFilterIssues;
    source.sreL3Issues = payload.sreL3Issues || payload.sreFilterIssues.filter((issue) => issue.status === "L3 in progress");
    source.releases = mergeReleases(payload.releases || [], getStoredReleases());
    source.jiraFilters = { ...source.jiraFilters, ...payload.jiraFilters };
    const sreTeam = source.teams.find((team) => team.id === "sre");
    if (sreTeam && payload.metrics) {
      sreTeam.metrics = {
        ...sreTeam.metrics,
        open: payload.metrics.open,
        inProgress: payload.metrics.inProgress,
        blocked: payload.metrics.blocked,
        completed: payload.metrics.completed,
        health: payload.metrics.health,
        sla: payload.metrics.sla,
        progress: payload.metrics.progress,
        statusCounts: payload.metrics.statusCounts,
        priorityCounts: payload.metrics.priorityCounts,
        total: payload.metrics.total
      };
    }
  }

  async function refreshLiveData() {
    liveStatus = { mode: "loading", message: "Refreshing Jira data", fetchedAt: liveStatus.fetchedAt };
    render();
    try {
      const syncId = Date.now();
      const response = await fetch(`/api/sre?sync=${syncId}`, {
        cache: "no-store",
        headers: {
          "Cache-Control": "no-cache",
          "Pragma": "no-cache"
        }
      });
      const payload = await response.json();
      if (!response.ok) {
        const error = new Error(payload.error || `Jira API unavailable (${response.status})`);
        error.payload = payload;
        error.status = response.status;
        throw error;
      }
      applyLiveSreData(payload);
      liveStatus = {
        mode: "live",
        message: "Live Jira data",
        fetchedAt: payload.fetchedAt || new Date().toISOString(),
        details: "Overview, In Progress, and Releases synced from Jira"
      };
    } catch (error) {
      const missingToken = error.payload?.requiredEnv?.includes("JIRA_API_TOKEN");
      liveStatus = {
        mode: missingToken ? "error" : "snapshot",
        message: missingToken ? "Live sync blocked: set JIRA_API_TOKEN" : `${error.message}; using snapshot`,
        fetchedAt: "",
        details: missingToken ? "Showing fallback data until Jira credentials are configured" : ""
      };
    }
    render();
  }

  function getFilteredIssues() {
    return source.issues
      .filter((issue) => issue.team === state.teamId)
      .filter((issue) => state.status === "All" || issue.status === state.status)
      .filter((issue) => state.priority === "All" || issue.priority === state.priority)
      .filter((issue) => {
        const query = state.query.trim().toLowerCase();
        if (!query) return true;
        return [issue.key, issue.summary, issue.owner, issue.type, issue.status, issue.priority]
          .join(" ")
          .toLowerCase()
          .includes(query);
      });
  }

  function getSreIssues() {
    return getSreTabSource()
      .filter((issue) => state.assignee === "All" || issue.assignee === state.assignee)
      .filter((issue) => {
      const query = state.query.trim().toLowerCase();
      if (!query) return true;
      return [issue.key, issue.summary, issue.assignee, issue.status, issue.customer]
        .join(" ")
        .toLowerCase()
        .includes(query);
      });
  }

  function getSreTabSource() {
    if (state.tab === "in-progress") {
      return source.sreL3Issues || source.sreFilterIssues.filter((issue) => issue.status === "L3 in progress");
    }
    return source.sreFilterIssues;
  }

  function getAssignees(items) {
    return [...new Set(items.map((issue) => issue.assignee).filter(Boolean))].sort();
  }

  function getStoredReleases() {
    try {
      return JSON.parse(localStorage.getItem(customReleaseStorageKey) || "[]").map(normalizeRelease);
    } catch {
      return [];
    }
  }

  function saveStoredReleases(releases) {
    localStorage.setItem(customReleaseStorageKey, JSON.stringify(releases.map(normalizeRelease)));
  }

  function normalizeRelease(release) {
    return {
      name: String(release.name || "").trim(),
      releaseDate: String(release.releaseDate || "").trim(),
      filterId: String(release.filterId || "").trim(),
      type: String(release.type || "patch").trim(),
      totalTickets: Number(release.totalTickets || 0),
      sourceUrl: release.sourceUrl || `https://wdtablesystems.atlassian.net/issues/?filter=${release.filterId}`
    };
  }

  function releaseKey(release) {
    return `${release.type || "patch"}:${release.filterId}:${release.name}`;
  }

  function mergeReleases(baseReleases, customReleases) {
    const map = new Map();
    [...baseReleases, ...customReleases].map(normalizeRelease).forEach((release) => {
      if (release.name && release.filterId) map.set(releaseKey(release), release);
    });
    return [...map.values()].sort((a, b) => new Date(b.releaseDate) - new Date(a.releaseDate));
  }

  function groupCount(items, field, values) {
    return values.map((value) => ({
      value,
      count: items.filter((item) => item[field] === value).length
    }));
  }

  function metricValue(team, name, fallback) {
    return team.metrics?.[name] ?? fallback;
  }

  function getStatusCounts(team, fallbackIssues) {
    const counts = team.metrics?.statusCounts;
    if (counts) {
      return statusOrder.map((value) => ({ value, count: counts[value] || 0 }));
    }
    return groupCount(fallbackIssues, "status", statusOrder);
  }

  function sreStatusBucket(issue) {
    const status = String(issue.status || "").toLowerCase();
    const category = String(issue.statusCategory || "").toLowerCase();
    if (status === "awaiting engineering l3") return "Open";
    if (status === "l3 in progress") return "In Progress";
    if (category === "done") return "Done";
    if (category === "to do") return "Open";
    if (status.includes("block") || status.includes("hold") || status.includes("waiting")) return "Blocked";
    return "In Progress";
  }

  function snapshotSreMetrics() {
    const issues = source.sreFilterIssues || [];
    const statusCounts = { Open: 0, "In Progress": 0, Blocked: 0, Done: 0 };
    const priorityCounts = { P1: 0, P2: 0, P3: 0, P4: 0 };
    issues.forEach((issue) => {
      statusCounts[sreStatusBucket(issue)] += 1;
      const priority = priorityBucket(issue.priority);
      priorityCounts[priority] += 1;
    });
    const total = issues.length;
    const progress = total ? Math.round(((statusCounts.Done + statusCounts["In Progress"] * 0.6) / total) * 100) : 0;
    return {
      open: statusCounts.Open,
      inProgress: statusCounts["In Progress"],
      completed: statusCounts.Done,
      progress,
      statusCounts,
      priorityCounts,
      total
    };
  }

  function getPriorityCounts(team, fallbackIssues) {
    const counts = team.metrics?.priorityCounts;
    if (counts) {
      return priorityOrder.map((value) => ({ value, count: counts[value] || 0 }));
    }
    return groupCount(fallbackIssues, "priority", priorityOrder);
  }

  function priorityBucket(priorityName) {
    const priority = String(priorityName || "").toUpperCase();
    if (priority.includes("P1") || priority.includes("CRITICAL") || priority.includes("HIGHEST")) return "P1";
    if (priority.includes("P2") || priority.includes("HIGH")) return "P2";
    if (priority.includes("P3") || priority.includes("MEDIUM")) return "P3";
    if (priority.includes("P4") || priority.includes("LOW") || priority.includes("LOWEST")) return "P4";
    return "P4";
  }

  function completionRate(items) {
    if (!items.length) return 0;
    const total = items.reduce((sum, issue) => sum + issue.progress, 0);
    return Math.round(total / items.length);
  }

  function render() {
    const team = getTeam();
    if (team.id === "sre" && liveStatus.mode !== "live") {
      team.metrics = { ...team.metrics, ...snapshotSreMetrics() };
    }
    const allTeamIssues = source.issues.filter((issue) => issue.team === team.id);
    const issues = getFilteredIssues();
    const sreTabSource = getSreTabSource();
    const sreIssues = getSreIssues();
    const releases = source.releases || [];
    const sreInProgressCount = (source.sreL3Issues || source.sreFilterIssues.filter((issue) => issue.status === "L3 in progress")).length;
    const statusCounts = team.id === "sre" ? getStatusCounts(team, allTeamIssues) : groupCount(allTeamIssues, "status", statusOrder);
    const priorityCounts = team.id === "sre" ? getPriorityCounts(team, allTeamIssues) : groupCount(allTeamIssues, "priority", priorityOrder);
    const totalIssues = team.id === "sre" ? metricValue(team, "total", source.sreFilterIssues.length) : allTeamIssues.length;
    const rate = team.id === "sre" ? metricValue(team, "progress", completionRate(allTeamIssues)) : completionRate(allTeamIssues);

    app.innerHTML = `
      <div class="shell" style="--accent: ${team.accent}">
        <aside class="sidebar">
          <div class="brand">
            <div class="brand-mark">
              <img src="https://wdtablesystems.com/wp-content/uploads/2024/09/logo-wdts.jpg" alt="WDTS" />
            </div>
            <div>
              <h1>Operations Dashboard</h1>
              <p>Walker Digital Table Systems</p>
            </div>
          </div>
          <nav class="team-nav" aria-label="Teams">
            ${source.teams.map((item) => `
              <button class="team-button ${item.id === team.id ? "active" : ""}" data-team="${item.id}">
                <span class="team-dot" style="background:${item.accent}"></span>
                <span>${item.name}</span>
              </button>
            `).join("")}
          </nav>
          <div class="sync-panel">
            <span class="sync-indicator sync-${liveStatus.mode}"></span>
            <div>
              <strong>Jira Sync</strong>
              <p>${escapeHtml(liveStatus.message)}</p>
              ${liveStatus.details ? `<p>${escapeHtml(liveStatus.details)}</p>` : ""}
            </div>
          </div>
        </aside>

        <main class="main">
          <header class="topbar">
            <div>
              <p class="eyebrow">${team.jiraProject} workspace</p>
              <h2>${team.name}</h2>
              <p class="focus">${team.focus}</p>
            </div>
            <div class="top-actions">
              <button class="icon-button" id="refreshButton" title="Refresh">Refresh</button>
              <button class="primary-button" id="exportButton">Export JSON</button>
            </div>
          </header>

          <section class="metrics-grid" aria-label="Summary metrics">
            ${metricCard("Open", metricValue(team, "open", 0), "Backlog load")}
            ${metricCard("In Progress", metricValue(team, "inProgress", 0), "Active execution")}
          </section>

          <section class="insights">
            <div class="panel">
              <div class="panel-heading">
                <h3>Status</h3>
                <span>${totalIssues} issues</span>
              </div>
              <div class="bar-list">
                ${statusCounts.map((item) => barRow(item.value, item.count, totalIssues)).join("")}
              </div>
            </div>
            <div class="panel">
              <div class="panel-heading">
                <h3>Priority</h3>
                <span>${rate}% progress</span>
              </div>
              <div class="priority-grid">
                ${priorityCounts.map((item) => `
                  <div class="priority-cell priority-${item.value.toLowerCase()}">
                    <span>${item.value}</span>
                    <strong>${item.count}</strong>
                  </div>
                `).join("")}
              </div>
            </div>
          </section>

          ${team.id === "sre" ? renderTabs(sreInProgressCount, releases.length) : ""}

          ${team.id === "sre" ? (state.tab === "releases" ? renderReleaseTab(releases) : renderSreJiraTab(sreIssues, getAssignees(sreTabSource), sreTabSource)) : `
          <section class="work-area">
            <div class="filters">
              <label>
                <span>Search</span>
                <input id="searchInput" value="${escapeHtml(state.query)}" placeholder="Issue, owner, type" />
              </label>
              ${selectControl("statusFilter", "Status", ["All", ...statusOrder], state.status)}
              ${selectControl("priorityFilter", "Priority", ["All", ...priorityOrder], state.priority)}
            </div>

            <div class="table-shell">
              <table>
                <thead>
                  <tr>
                    <th>Key</th>
                    <th>Summary</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Priority</th>
                    <th>Owner</th>
                    <th>Due</th>
                    <th>Progress</th>
                  </tr>
                </thead>
                <tbody>
                  ${issues.map(issueRow).join("") || `<tr><td colspan="8" class="empty">No matching issues</td></tr>`}
                </tbody>
              </table>
            </div>
          </section>
          `}
        </main>
      </div>
    `;

    bindEvents();
  }

  function metricCard(label, value, caption) {
    return `
      <div class="metric-card">
        <span>${label}</span>
        <strong>${value}</strong>
        <p>${caption}</p>
      </div>
    `;
  }

  function barRow(label, count, total) {
    const width = total ? Math.round((count / total) * 100) : 0;
    return `
      <div class="bar-row">
        <div class="bar-label"><span>${label}</span><strong>${count}</strong></div>
        <div class="bar-track"><div class="bar-fill" style="width:${width}%"></div></div>
      </div>
    `;
  }

  function selectControl(id, label, options, selected) {
    return `
      <label>
        <span>${label}</span>
        <select id="${id}">
          ${options.map((option) => `<option ${option === selected ? "selected" : ""}>${option}</option>`).join("")}
        </select>
      </label>
    `;
  }

  function renderTabs(inProgressCount, releaseCount) {
    return `
      <div class="tabs" role="tablist" aria-label="SRE dashboard tabs">
        <button class="tab-button ${state.tab === "overview" ? "active" : ""}" data-tab="overview" role="tab">
          Overview
        </button>
        <button class="tab-button ${state.tab === "in-progress" ? "active" : ""}" data-tab="in-progress" role="tab">
          In Progress <span>${inProgressCount}</span>
        </button>
        <button class="tab-button ${state.tab === "releases" ? "active" : ""}" data-tab="releases" role="tab">
          Releases <span>${releaseCount}</span>
        </button>
      </div>
    `;
  }

  function renderReleaseTab(releases) {
    const visibleReleases = releases.filter((release) => (release.type || "patch") === state.releaseType);
    return `
      <section class="work-area">
        <div class="jira-strip">
          <div>
            <strong>Releases</strong>
            <p>Release ticket totals from configured Jira filters</p>
          </div>
        </div>
        <form class="release-form" id="releaseForm">
          <label>
            <span>Release name</span>
            <input id="releaseNameInput" required placeholder="2.6.4.2.21_2" />
          </label>
          <label>
            <span>Release type</span>
            <select id="releaseTypeInput">
              ${releaseTypes.map((type) => `<option value="${type.id}">${type.label}</option>`).join("")}
            </select>
          </label>
          <label>
            <span>Jira filter</span>
            <input id="releaseFilterInput" required inputmode="numeric" pattern="[0-9]+" placeholder="59503" />
          </label>
          <label>
            <span>Release date</span>
            <input id="releaseDateInput" required type="date" />
          </label>
          <button class="primary-button release-submit" type="submit">Add Release</button>
        </form>
        <div class="release-type-tabs" role="tablist" aria-label="Release types">
          ${releaseTypes.map((type) => {
            const count = releases.filter((release) => (release.type || "patch") === type.id).length;
            return `
              <button class="release-type-button ${state.releaseType === type.id ? "active" : ""}" data-release-type="${type.id}" role="tab">
                ${type.label} <span>${count}</span>
              </button>
            `;
          }).join("")}
        </div>
        <div class="table-shell">
          <table class="release-table">
            <thead>
              <tr>
                <th>Release Name</th>
                <th>Release Date</th>
                <th>Total Tickets</th>
              </tr>
            </thead>
            <tbody>
              ${visibleReleases.map(releaseRow).join("") || `<tr><td colspan="3" class="empty">No ${releaseTypeLabel(state.releaseType)} releases configured yet</td></tr>`}
            </tbody>
          </table>
        </div>
      </section>
    `;
  }

  function releaseTypeLabel(typeId) {
    return releaseTypes.find((type) => type.id === typeId)?.label || "matching";
  }

  function releaseRow(release) {
    return `
      <tr>
        <td>
          <a class="jira-link" href="${release.sourceUrl}" target="_blank" rel="noreferrer">
            ${escapeHtml(release.name)}
          </a>
        </td>
        <td>${formatReleaseDate(release.releaseDate)}</td>
        <td><strong>${release.totalTickets ?? 0}</strong></td>
      </tr>
    `;
  }

  function formatReleaseDate(value) {
    if (!value) return "";
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) return escapeHtml(value);
    return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  }

  function renderSreJiraTab(issues, assignees, tabIssues) {
    const filter = source.jiraFilters.sreInProgress;
    const title = state.tab === "in-progress" ? "L3 in progress" : `Jira filter ${filter.filterId}`;
    const jql = state.tab === "in-progress"
      ? `filter = ${filter.filterId} AND status = "L3 in progress" ORDER BY updated DESC`
      : `filter = ${filter.filterId} ORDER BY updated DESC`;
    return `
      <section class="work-area">
        <div class="jira-strip">
          <div>
            <strong>${title}</strong>
            <p>${jql}</p>
          </div>
          <a href="${filter.sourceUrl}" target="_blank" rel="noreferrer">Open in Jira</a>
        </div>
        <div class="filters single-filter">
          <label>
            <span>Search</span>
            <input id="searchInput" value="${escapeHtml(state.query)}" placeholder="Jira Id, customer, assignee" />
          </label>
        </div>
        ${renderAssigneeChips(assignees, tabIssues)}
        <div class="table-shell">
          <table class="sre-progress-table">
            <thead>
              <tr>
                <th>Jira Id</th>
                <th>Summary</th>
                <th>Assignee</th>
                <th>Status</th>
                <th>Customer</th>
              </tr>
            </thead>
            <tbody>
              ${issues.map(sreProgressRow).join("") || `<tr><td colspan="5" class="empty">No matching Jira issues</td></tr>`}
            </tbody>
          </table>
        </div>
        ${renderRecentComments(issues)}
      </section>
    `;
  }

  function renderAssigneeChips(assignees, visibleScope) {
    return `
      <div class="assignee-strip" aria-label="Assignee filters">
        <button class="assignee-chip ${state.assignee === "All" ? "active" : ""}" data-assignee="All">
          All <span>${visibleScope.length}</span>
        </button>
        ${assignees.map((assignee) => `
          <button class="assignee-chip ${state.assignee === assignee ? "active" : ""}" data-assignee="${escapeHtml(assignee)}">
            ${escapeHtml(assignee)} <span>${visibleScope.filter((issue) => issue.assignee === assignee).length}</span>
          </button>
        `).join("")}
      </div>
    `;
  }

  function sreProgressRow(issue) {
    return `
      <tr class="${state.selectedIssueKey === issue.key ? "selected-row" : ""}">
        <td>
          <button class="jira-link issue-button" data-issue-key="${issue.key}" data-issue-url="${issue.url}" title="Single click for comments, double click to open Jira">
            ${issue.key}
          </button>
        </td>
        <td>${escapeHtml(issue.summary)}</td>
        <td>${escapeHtml(issue.assignee)}</td>
        <td><span class="pill status-in-progress">${escapeHtml(issue.status)}</span></td>
        <td>${escapeHtml(issue.customer)}</td>
      </tr>
    `;
  }

  function renderRecentComments(visibleIssues) {
    const issue = visibleIssues.find((item) => item.key === state.selectedIssueKey);
    if (!issue) return "";
    const comments = (issue.comments || []).slice(0, 2);

    return `
      <aside class="comment-panel" aria-live="polite">
        <div class="comment-heading">
          <div>
            <strong>${issue.key}</strong>
            <span>${escapeHtml(issue.summary)}</span>
          </div>
          <button class="close-comments" id="closeComments" title="Close comments">x</button>
        </div>
        <div class="comment-list">
          ${comments.length ? comments.map(commentCard).join("") : `<p class="empty-comments">No recent comments captured for this issue yet.</p>`}
        </div>
      </aside>
    `;
  }

  function commentCard(comment) {
    return `
      <article class="comment-card">
        <div>
          <strong>${escapeHtml(comment.author)}</strong>
          <span>${escapeHtml(comment.created)}</span>
        </div>
        <p>${escapeHtml(cleanComment(comment.body))}</p>
      </article>
    `;
  }

  function cleanComment(value) {
    return String(value)
      .replace(/<custom[^>]*>/g, "")
      .replace(/<\/custom>/g, "")
      .replace(/!\[\]\([^)]*\)/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function issueRow(issue) {
    return `
      <tr>
        <td><strong>${issue.key}</strong></td>
        <td>${escapeHtml(issue.summary)}</td>
        <td>${issue.type}</td>
        <td><span class="pill status-${slug(issue.status)}">${issue.status}</span></td>
        <td><span class="priority-text priority-text-${issue.priority.toLowerCase()}">${issue.priority}</span></td>
        <td>${issue.owner}</td>
        <td>${issue.due}</td>
        <td>
          <div class="progress-cell">
            <span>${issue.progress}%</span>
            <div class="mini-track"><div style="width:${issue.progress}%"></div></div>
          </div>
        </td>
      </tr>
    `;
  }

  function bindEvents() {
    let issueClickTimer;

    document.querySelectorAll("[data-team]").forEach((button) => {
      button.addEventListener("click", () => {
        state.teamId = button.dataset.team;
        state.tab = "overview";
        state.status = "All";
        state.priority = "All";
        state.assignee = "All";
        state.releaseType = "patch";
        state.selectedIssueKey = "";
        state.query = "";
        render();
      });
    });

    document.querySelectorAll("[data-tab]").forEach((button) => {
      button.addEventListener("click", () => {
        state.tab = button.dataset.tab;
        state.assignee = "All";
        state.selectedIssueKey = "";
        state.query = "";
        render();
      });
    });

    document.querySelectorAll("[data-assignee]").forEach((button) => {
      button.addEventListener("click", () => {
        state.assignee = button.dataset.assignee;
        state.selectedIssueKey = "";
        render();
      });
    });

    document.querySelectorAll("[data-release-type]").forEach((button) => {
      button.addEventListener("click", () => {
        state.releaseType = button.dataset.releaseType;
        render();
      });
    });

    document.getElementById("releaseForm")?.addEventListener("submit", handleReleaseSubmit);

    document.querySelectorAll("[data-issue-key]").forEach((button) => {
      button.addEventListener("click", () => {
        clearTimeout(issueClickTimer);
        issueClickTimer = setTimeout(() => {
          state.selectedIssueKey = button.dataset.issueKey;
          render();
        }, 220);
      });

      button.addEventListener("dblclick", () => {
        clearTimeout(issueClickTimer);
        window.open(button.dataset.issueUrl, "_blank", "noopener");
      });
    });

    document.getElementById("closeComments")?.addEventListener("click", () => {
      state.selectedIssueKey = "";
      render();
    });

    document.getElementById("searchInput")?.addEventListener("input", (event) => {
      state.query = event.target.value;
      render();
    });

    document.getElementById("statusFilter")?.addEventListener("change", (event) => {
      state.status = event.target.value;
      render();
    });

    document.getElementById("priorityFilter")?.addEventListener("change", (event) => {
      state.priority = event.target.value;
      render();
    });

    document.getElementById("refreshButton").addEventListener("click", () => refreshLiveData());
    document.getElementById("exportButton").addEventListener("click", exportJson);
  }

  async function handleReleaseSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const release = normalizeRelease({
      name: document.getElementById("releaseNameInput").value,
      type: document.getElementById("releaseTypeInput").value,
      filterId: document.getElementById("releaseFilterInput").value,
      releaseDate: document.getElementById("releaseDateInput").value
    });

    const button = form.querySelector("button[type='submit']");
    button.disabled = true;
    button.textContent = "Adding...";

    try {
      const count = await fetchReleaseTicketCount(release.filterId);
      release.totalTickets = count.totalTickets;
      release.sourceUrl = count.sourceUrl || release.sourceUrl;
    } catch {
      release.totalTickets = 0;
    }

    const stored = getStoredReleases().filter((item) => releaseKey(item) !== releaseKey(release));
    stored.push(release);
    saveStoredReleases(stored);
    source.releases = mergeReleases(source.releases || [], stored);
    state.releaseType = release.type;
    form.reset();
    render();
  }

  async function fetchReleaseTicketCount(filterId) {
    const response = await fetch(`/api/release-count?filterId=${encodeURIComponent(filterId)}&sync=${Date.now()}`, {
      cache: "no-store",
      headers: {
        "Cache-Control": "no-cache",
        "Pragma": "no-cache"
      }
    });
    if (!response.ok) throw new Error(`Release count unavailable (${response.status})`);
    return response.json();
  }

  function exportJson() {
    const team = getTeam();
    const payload = {
      team: team.name,
      exportedAt: new Date().toISOString(),
      issues: getFilteredIssues()
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${team.id}-dashboard.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function slug(value) {
    return value.toLowerCase().replace(/\s+/g, "-");
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  render();
  refreshLiveData();
})();
