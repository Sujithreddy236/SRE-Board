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
    architectureDetailView: "",
    selectedIssueKey: "",
    query: ""
  };

  const statusOrder = ["Open", "In Progress", "Blocked", "Done"];
  const priorityOrder = ["Top3", "P2", "P3", "P4"];
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
    source.architectureIssues = payload.architectureIssues || source.architectureIssues || [];
    source.architectureStoryIssues = payload.architectureStoryIssues || source.architectureStoryIssues || [];
    source.architectureBugIssues = payload.architectureBugIssues || source.architectureBugIssues || [];
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
    const architectureTeam = source.teams.find((team) => team.id === "architecture");
    if (architectureTeam && payload.architectureMetrics) {
      architectureTeam.metrics = {
        ...architectureTeam.metrics,
        ...payload.architectureMetrics
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
        details: "SRE, Architecture, and Releases synced from Jira"
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

  function getArchitectureIssues() {
    return (source.architectureIssues || [])
      .filter((issue) => state.status === "All" || issue.status === state.status)
      .filter((issue) => state.priority === "All" || issue.priority === state.priority)
      .filter((issue) => {
        const query = state.query.trim().toLowerCase();
        if (!query) return true;
        return [issue.key, issue.summary, issue.assignee, issue.type, issue.status, issue.priority]
          .join(" ")
          .toLowerCase()
          .includes(query);
      });
  }

  function getAssignees(items) {
    return [...new Set(items.map((issue) => issue.assignee).filter(Boolean))].sort();
  }

  function getStoredReleases() {
    try {
      return JSON.parse(localStorage.getItem(customReleaseStorageKey) || "[]").map((release) => ({
        ...normalizeRelease(release),
        custom: true
      }));
    } catch {
      return [];
    }
  }

  function saveStoredReleases(releases) {
    localStorage.setItem(customReleaseStorageKey, JSON.stringify(releases.map((release) => ({
      ...normalizeRelease(release),
      custom: true
    }))));
  }

  function normalizeRelease(release) {
    const filterId = extractFilterId(release.filterId);
    return {
      name: String(release.name || "").trim(),
      buildVersion: String(release.buildVersion || release.name || "").trim(),
      releaseDate: String(release.releaseDate || "").trim(),
      filterId,
      type: String(release.type || "patch").trim(),
      totalTickets: Number(release.totalTickets || 0),
      sourceUrl: release.sourceUrl || `https://wdtablesystems.atlassian.net/issues/?filter=${filterId}`,
      custom: Boolean(release.custom)
    };
  }

  function extractFilterId(value) {
    const text = String(value || "").trim();
    const urlMatch = text.match(/[?&]filter=(\d+)/i);
    if (urlMatch) return urlMatch[1];
    return /^\d+$/.test(text) ? text : "";
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
    const priorityCounts = { Top3: 0, P2: 0, P3: 0, P4: 0 };
    issues.forEach((issue) => {
      statusCounts[sreStatusBucket(issue)] += 1;
      const priority = priorityBucket(issue);
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

  function snapshotArchitectureMetrics() {
    const issues = source.architectureIssues || [];
    const storyIssues = source.architectureStoryIssues || [];
    const bugIssues = source.architectureBugIssues || [];
    const inactiveStatuses = new Set(["open", "to do", "canceled", "cancelled"]);
    const excludedActiveStatuses = new Set(["open", "to do", "released", "canceled", "cancelled", "deferred"]);
    const epics = issues.filter((issue) => issueTypeIs(issue, "Epic"));
    const stories = storyIssues.filter((issue) => issueTypeIs(issue, "Story"));
    const bugs = bugIssues.filter((issue) => issueTypeIs(issue, "Bug"));
    return {
      activeProjects: epics.filter((issue) => !excludedActiveStatuses.has(String(issue.status || "").toLowerCase())).length,
      inactiveProjects: epics.filter((issue) => inactiveStatuses.has(String(issue.status || "").toLowerCase())).length,
      totalProjects: epics.length,
      storyStatusCounts: countStatuses(stories),
      bugStatusCounts: countStatuses(bugs),
      totalStories: stories.length,
      totalBugs: bugs.length,
      total: issues.length + storyIssues.length + bugIssues.length
    };
  }

  function isActiveArchitectureProject(issue) {
    const excludedActiveStatuses = new Set(["open", "to do", "released", "canceled", "cancelled", "deferred"]);
    return issueTypeIs(issue, "Epic") && !excludedActiveStatuses.has(String(issue.status || "").toLowerCase());
  }

  function isInactiveArchitectureProject(issue) {
    const inactiveStatuses = new Set(["open", "to do", "canceled", "cancelled"]);
    return issueTypeIs(issue, "Epic") && inactiveStatuses.has(String(issue.status || "").toLowerCase());
  }

  function issueTypeIs(issue, expected) {
    return String(issue.type || "").toLowerCase() === expected.toLowerCase();
  }

  function countStatuses(issues) {
    return issues.reduce((counts, issue) => {
      const status = issue.status || "Unknown";
      counts[status] = (counts[status] || 0) + 1;
      return counts;
    }, {});
  }

  function getPriorityCounts(team, fallbackIssues) {
    const counts = team.metrics?.priorityCounts;
    if (counts) {
      return priorityOrder.map((value) => ({ value, count: counts[value] || 0 }));
    }
    return groupCount(fallbackIssues, "priority", priorityOrder);
  }

  function priorityBucket(issue) {
    const labels = Array.isArray(issue.labels) ? issue.labels : [];
    if (labels.some((label) => String(label).toLowerCase() === "top3")) return "Top3";

    const priority = String(issue.priority || "").toUpperCase();
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
    if (team.id === "architecture" && liveStatus.mode !== "live") {
      team.metrics = { ...team.metrics, ...snapshotArchitectureMetrics() };
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
    const dashboardContent = team.id === "architecture"
      ? renderArchitectureDashboard(team)
      : `
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
        `;

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

          ${dashboardContent}
        </main>
      </div>
    `;

    bindEvents();
  }

  function renderArchitectureDashboard(team) {
    const metrics = team.metrics || snapshotArchitectureMetrics();
    const architectureIssues = source.architectureIssues || [];
    const activeProjects = architectureIssues.filter(isActiveArchitectureProject);
    const inactiveProjects = architectureIssues.filter(isInactiveArchitectureProject);
    const activeDetail = renderArchitectureProjectDetails("Active Projects", activeProjects);
    const inactiveDetail = renderArchitectureProjectDetails("Inactive Projects", inactiveProjects);
    const storyDetail = statusTablePanel("Story Status", metrics.storyStatusCounts || {}, metrics.totalStories || 0);
    const bugDetail = statusTablePanel("Bug Status", metrics.bugStatusCounts || {}, metrics.totalBugs || 0);

    return `
      <section class="architecture-card-grid" aria-label="Architecture metrics">
        ${architectureSummaryCard("active", "Active Projects", metrics.activeProjects || 0)}
        ${architectureSummaryCard("inactive", "Inactive Projects", metrics.inactiveProjects || 0)}
        ${renderArchitectureDropdown("active", activeDetail)}
        ${renderArchitectureDropdown("inactive", inactiveDetail)}
        ${architectureSummaryCard("stories", "Story Status", metrics.totalStories || 0)}
        ${architectureSummaryCard("bugs", "Bug Status", metrics.totalBugs || 0)}
        ${renderArchitectureDropdown("stories", storyDetail)}
        ${renderArchitectureDropdown("bugs", bugDetail)}
      </section>
    `;
  }

  function architectureSummaryCard(view, label, value) {
    return `
      <button class="metric-card architecture-summary-card ${state.architectureDetailView === view ? "active" : ""}" data-architecture-detail-view="${view}">
        <span>${label}</span>
        <strong>${value}</strong>
      </button>
    `;
  }

  function renderArchitectureDropdown(view, content) {
    if (state.architectureDetailView !== view) return "";
    return `
      <div class="architecture-dropdown">
        ${content}
      </div>
    `;
  }

  function statusTablePanel(title, counts, total) {
    const rows = Object.entries(counts).sort(([a], [b]) => a.localeCompare(b));
    return `
      <div class="panel status-table-panel">
        <div class="panel-heading">
          <h3>${title}</h3>
          <span>${total} total</span>
        </div>
        <table class="status-count-table">
          <thead>
            <tr>
              <th>Status</th>
              <th>Count</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(([status, count]) => `
              <tr>
                <td>${escapeHtml(status)}</td>
                <td><strong>${count}</strong></td>
              </tr>
            `).join("") || `<tr><td colspan="2" class="empty">No issues found</td></tr>`}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderArchitectureProjectDetails(title, issues) {
    return `
      <section class="work-area architecture-detail-area">
        <div class="jira-strip">
          <div>
            <strong>${title}</strong>
          </div>
        </div>
        <div class="table-shell">
          <table>
            <thead>
              <tr>
                <th>Jira Id</th>
                <th>Summary</th>
                <th>Type</th>
                <th>Status</th>
                <th>Priority</th>
                <th>Assignee</th>
                <th>End Date</th>
              </tr>
            </thead>
            <tbody>
              ${issues.map(architectureIssueRow).join("") || `<tr><td colspan="7" class="empty">No matching projects</td></tr>`}
            </tbody>
          </table>
        </div>
      </section>
    `;
  }

  function architectureIssueRow(issue) {
    return `
      <tr>
        <td>
          <a class="jira-link" href="${issue.url}" target="_blank" rel="noreferrer">${escapeHtml(issue.key)}</a>
        </td>
        <td>${escapeHtml(issue.summary)}</td>
        <td>${escapeHtml(issue.type)}</td>
        <td><span class="pill status-${slug(issue.status)}">${escapeHtml(issue.status)}</span></td>
        <td>${escapeHtml(issue.priority)}</td>
        <td>${escapeHtml(issue.assignee)}</td>
        <td>${formatEndDate(issue.endDate)}</td>
      </tr>
    `;
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
            <span>Build version</span>
            <input id="buildVersionInput" required placeholder="2.6.4.2.21_2" />
          </label>
          <label>
            <span>Release type</span>
            <select id="releaseTypeInput">
              ${releaseTypes.map((type) => `<option value="${type.id}">${type.label}</option>`).join("")}
            </select>
          </label>
          <label>
            <span>Jira filter link or ID</span>
            <input id="releaseFilterInput" required placeholder="59503 or Jira filter URL" />
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
                <th>Build Version</th>
                <th>Release Date</th>
                <th>Total Tickets</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              ${visibleReleases.map(releaseRow).join("") || `<tr><td colspan="5" class="empty">No ${releaseTypeLabel(state.releaseType)} releases configured yet</td></tr>`}
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
        <td>${escapeHtml(release.buildVersion || release.name)}</td>
        <td>${formatReleaseDate(release.releaseDate)}</td>
        <td><strong>${release.totalTickets ?? 0}</strong></td>
        <td>
          ${release.custom ? `
            <button class="delete-release-button" data-release-key="${escapeHtml(releaseKey(release))}">
              Delete
            </button>
          ` : `<span class="locked-release">Built-in</span>`}
        </td>
      </tr>
    `;
  }

  function formatReleaseDate(value) {
    if (!value) return "";
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) return escapeHtml(value);
    return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  }

  function formatUpdatedDate(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return escapeHtml(value);
    return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  }

  function formatEndDate(value) {
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
        state.architectureDetailView = "";
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

    document.querySelectorAll("[data-architecture-detail-view]").forEach((button) => {
      button.addEventListener("click", () => {
        state.architectureDetailView = state.architectureDetailView === button.dataset.architectureDetailView
          ? ""
          : button.dataset.architectureDetailView;
        render();
      });
    });

    document.getElementById("releaseForm")?.addEventListener("submit", handleReleaseSubmit);

    document.querySelectorAll("[data-release-key]").forEach((button) => {
      button.addEventListener("click", () => {
        deleteStoredRelease(button.dataset.releaseKey);
      });
    });

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
      buildVersion: document.getElementById("buildVersionInput").value,
      type: document.getElementById("releaseTypeInput").value,
      filterId: document.getElementById("releaseFilterInput").value,
      releaseDate: document.getElementById("releaseDateInput").value
    });
    if (!release.filterId) {
      alert("Enter a numeric Jira filter ID or a Jira URL containing ?filter=ID.");
      return;
    }

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

  function deleteStoredRelease(key) {
    const stored = getStoredReleases().filter((release) => releaseKey(release) !== key);
    saveStoredReleases(stored);
    source.releases = mergeReleases(
      (source.releases || []).filter((release) => !release.custom || releaseKey(release) !== key),
      stored
    );
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
    const exportIssues = team.id === "architecture" ? getArchitectureExportIssues() : getFilteredIssues();
    const payload = {
      team: team.name,
      exportedAt: new Date().toISOString(),
      issues: exportIssues
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${team.id}-dashboard.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function getArchitectureExportIssues() {
    if (state.architectureDetailView === "inactive") {
      return (source.architectureIssues || []).filter(isInactiveArchitectureProject);
    }
    if (state.architectureDetailView === "stories") return source.architectureStoryIssues || [];
    if (state.architectureDetailView === "bugs") return source.architectureBugIssues || [];
    return (source.architectureIssues || []).filter(isActiveArchitectureProject);
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
  setInterval(refreshLiveData, 20 * 60 * 1000);
})();
