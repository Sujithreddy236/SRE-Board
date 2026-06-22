(function () {
  const source = window.SRE_BOARD_DATA;
  const app = document.getElementById("app");
  const state = {
    teamId: "sre",
    tab: "overview",
    status: "All",
    priority: "All",
    assignee: "All",
    query: ""
  };

  const statusOrder = ["Open", "In Progress", "Blocked", "Done"];
  const priorityOrder = ["Critical", "High", "Medium", "Low"];

  function getTeam() {
    return source.teams.find((team) => team.id === state.teamId) || source.teams[0];
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
    return source.sreFilterIssues
      .filter((issue) => state.tab !== "in-progress" || issue.status === "L3 in progress")
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

  function getAssignees(items) {
    return [...new Set(items.map((issue) => issue.assignee).filter(Boolean))].sort();
  }

  function groupCount(items, field, values) {
    return values.map((value) => ({
      value,
      count: items.filter((item) => item[field] === value).length
    }));
  }

  function completionRate(items) {
    if (!items.length) return 0;
    const total = items.reduce((sum, issue) => sum + issue.progress, 0);
    return Math.round(total / items.length);
  }

  function render() {
    const team = getTeam();
    const allTeamIssues = source.issues.filter((issue) => issue.team === team.id);
    const issues = getFilteredIssues();
    const sreTabSource = source.sreFilterIssues.filter((issue) => state.tab !== "in-progress" || issue.status === "L3 in progress");
    const sreIssues = getSreIssues();
    const sreInProgressCount = source.sreFilterIssues.filter((issue) => issue.status === "L3 in progress").length;
    const statusCounts = groupCount(allTeamIssues, "status", statusOrder);
    const priorityCounts = groupCount(allTeamIssues, "priority", priorityOrder);
    const rate = completionRate(allTeamIssues);

    app.innerHTML = `
      <div class="shell" style="--accent: ${team.accent}">
        <aside class="sidebar">
          <div class="brand">
            <div class="brand-mark">SB</div>
            <div>
              <h1>SRE Board</h1>
              <p>Jira operations dashboard</p>
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
            <span class="sync-indicator"></span>
            <div>
              <strong>Jira Sync</strong>
              <p>Sample data active</p>
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
              <button class="icon-button" id="refreshButton" title="Refresh">↻</button>
              <button class="primary-button" id="exportButton">Export JSON</button>
            </div>
          </header>

          <section class="metrics-grid" aria-label="Summary metrics">
            ${metricCard("Open", team.metrics.open, "Backlog load")}
            ${metricCard("In Progress", team.metrics.inProgress, "Active execution")}
            ${metricCard("Blocked", team.metrics.blocked, "Needs attention")}
            ${metricCard("Health", `${team.metrics.health}%`, "Service score")}
          </section>

          <section class="insights">
            <div class="panel">
              <div class="panel-heading">
                <h3>Status</h3>
                <span>${allTeamIssues.length} issues</span>
              </div>
              <div class="bar-list">
                ${statusCounts.map((item) => barRow(item.value, item.count, allTeamIssues.length)).join("")}
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
            <div class="panel health-panel">
              <div class="panel-heading">
                <h3>Delivery</h3>
                <span>${team.metrics.sla}% SLA</span>
              </div>
              <div class="gauge" style="--score:${team.metrics.health * 3.6}deg">
                <div>${team.metrics.health}%</div>
              </div>
            </div>
          </section>

          ${team.id === "sre" ? renderTabs(sreInProgressCount) : ""}

          ${team.id === "sre" ? renderSreJiraTab(sreIssues, getAssignees(sreTabSource), sreTabSource) : `
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

  function renderTabs(inProgressCount) {
    return `
      <div class="tabs" role="tablist" aria-label="SRE dashboard tabs">
        <button class="tab-button ${state.tab === "overview" ? "active" : ""}" data-tab="overview" role="tab">
          Overview
        </button>
        <button class="tab-button ${state.tab === "in-progress" ? "active" : ""}" data-tab="in-progress" role="tab">
          In Progress <span>${inProgressCount}</span>
        </button>
      </div>
    `;
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
      <tr>
        <td><a class="jira-link" href="${issue.url}" target="_blank" rel="noreferrer">${issue.key}</a></td>
        <td>${escapeHtml(issue.summary)}</td>
        <td>${escapeHtml(issue.assignee)}</td>
        <td><span class="pill status-in-progress">${escapeHtml(issue.status)}</span></td>
        <td>${escapeHtml(issue.customer)}</td>
      </tr>
    `;
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
    document.querySelectorAll("[data-team]").forEach((button) => {
      button.addEventListener("click", () => {
        state.teamId = button.dataset.team;
        state.tab = "overview";
        state.status = "All";
        state.priority = "All";
        state.assignee = "All";
        state.query = "";
        render();
      });
    });

    document.querySelectorAll("[data-tab]").forEach((button) => {
      button.addEventListener("click", () => {
        state.tab = button.dataset.tab;
        state.assignee = "All";
        state.query = "";
        render();
      });
    });

    document.querySelectorAll("[data-assignee]").forEach((button) => {
      button.addEventListener("click", () => {
        state.assignee = button.dataset.assignee;
        render();
      });
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

    document.getElementById("refreshButton").addEventListener("click", () => render());
    document.getElementById("exportButton").addEventListener("click", exportJson);
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
})();
