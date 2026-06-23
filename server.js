const http = require("http");
const fs = require("fs");
const path = require("path");

const root = __dirname;
loadEnv(path.join(root, ".env"));

const port = Number(process.env.PORT || 4173);
const jiraBaseUrl = process.env.JIRA_BASE_URL || "https://wdtablesystems.atlassian.net";
const jiraFilterId = process.env.JIRA_FILTER_ID || "52237";
const jiraEmail = process.env.JIRA_EMAIL;
const jiraToken = process.env.JIRA_API_TOKEN;
const releaseFilters = [
  {
    name: "2.6.4.2.21_1",
    releaseDate: "2026-06-12",
    filterId: "59503"
  }
];

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml"
};

function send(res, status, body, type = "application/json; charset=utf-8") {
  res.writeHead(status, {
    "Content-Type": type,
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    "Pragma": "no-cache",
    "Expires": "0"
  });
  res.end(body);
}

function authHeader() {
  return `Basic ${Buffer.from(`${jiraEmail}:${jiraToken}`).toString("base64")}`;
}

async function jiraSearch(jql) {
  const url = `${jiraBaseUrl}/rest/api/3/search/jql`;
  const body = {
    jql,
    maxResults: 100,
    fields: ["summary", "assignee", "status", "statusCategory", "priority", "updated", "comment"]
  };
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": authHeader(),
      "Accept": "application/json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Jira returned ${response.status}: ${text.slice(0, 500)}`);
  }

  return response.json();
}

function releaseSourceUrl(filterId) {
  return `${jiraBaseUrl}/issues/?filter=${filterId}`;
}

async function fetchRelease(release) {
  const jql = `filter = ${release.filterId} ORDER BY updated DESC`;
  const result = await jiraSearch(jql);
  return {
    ...release,
    jql,
    sourceUrl: releaseSourceUrl(release.filterId),
    totalTickets: result.total ?? (result.issues || []).length
  };
}

function customerFromSummary(summary) {
  const [customer] = String(summary || "").split("|");
  return customer ? customer.trim() : "Unassigned";
}

function summaryWithoutCustomer(summary) {
  const parts = String(summary || "").split("|");
  return (parts.length > 1 ? parts.slice(1).join("|") : summary).trim();
}

function commentText(comment) {
  return String(comment.body || "")
    .replace(/<custom[^>]*>/g, "")
    .replace(/<\/custom>/g, "")
    .replace(/!\[\]\([^)]*\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function mapIssue(issue) {
  const fields = issue.fields || {};
  const comments = fields.comment?.comments || [];
  const recentComments = [...comments]
    .sort((a, b) => new Date(b.updated || b.created) - new Date(a.updated || a.created))
    .slice(0, 2)
    .map((comment) => ({
      author: comment.author?.displayName || "Unknown",
      created: formatDate(comment.updated || comment.created),
      body: commentText(comment)
    }));

  return {
    key: issue.key,
    summary: summaryWithoutCustomer(fields.summary),
    assignee: fields.assignee?.displayName || "Unassigned",
    status: fields.status?.name || "Unknown",
    statusCategory: fields.status?.statusCategory?.name || fields.statusCategory?.name || "Unknown",
    priority: fields.priority?.name || "Unspecified",
    customer: customerFromSummary(fields.summary),
    updated: fields.updated || "",
    url: `${jiraBaseUrl}/browse/${issue.key}`,
    comments: recentComments
  };
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-IN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
}

function statusBucket(issue) {
  const status = issue.status.toLowerCase();
  const category = issue.statusCategory.toLowerCase();
  if (status === "awaiting engineering l3") return "Open";
  if (status === "l3 in progress") return "In Progress";
  if (category === "done") return "Done";
  if (category === "to do") return "Open";
  if (status.includes("block") || status.includes("hold") || status.includes("waiting")) return "Blocked";
  return "In Progress";
}

function computeMetrics(issues) {
  const total = issues.length;
  const statusCounts = { Open: 0, "In Progress": 0, Blocked: 0, Done: 0 };
  const priorityCounts = { P1: 0, P2: 0, P3: 0, P4: 0 };
  const now = Date.now();

  for (const issue of issues) {
    statusCounts[statusBucket(issue)] += 1;
    const priority = priorityBucket(issue.priority);
    priorityCounts[priority] += 1;
  }

  const recentlyUpdated = issues.filter((issue) => {
    const updated = new Date(issue.updated).getTime();
    return Number.isFinite(updated) && now - updated <= 7 * 24 * 60 * 60 * 1000;
  }).length;

  const health = total ? Math.round(((total - statusCounts.Blocked) / total) * 100) : 100;
  const sla = total ? Math.round((recentlyUpdated / total) * 100) : 100;
  const completedWeight = total ? Math.round(((statusCounts.Done + statusCounts["In Progress"] * 0.6) / total) * 100) : 0;

  return {
    open: statusCounts.Open,
    inProgress: statusCounts["In Progress"],
    blocked: statusCounts.Blocked,
    completed: statusCounts.Done,
    health,
    sla,
    progress: completedWeight,
    statusCounts,
    priorityCounts,
    total
  };
}

function priorityBucket(priorityName) {
  const priority = String(priorityName || "").toUpperCase();
  if (priority.includes("P1") || priority.includes("CRITICAL") || priority.includes("HIGHEST")) return "P1";
  if (priority.includes("P2") || priority.includes("HIGH")) return "P2";
  if (priority.includes("P3") || priority.includes("MEDIUM")) return "P3";
  if (priority.includes("P4") || priority.includes("LOW") || priority.includes("LOWEST")) return "P4";
  return "P4";
}

function configuredJiraSyncs() {
  const allJql = `filter = ${jiraFilterId} ORDER BY updated DESC`;
  const l3Jql = `filter = ${jiraFilterId} AND status = "L3 in progress" ORDER BY updated DESC`;
  return {
    overview: {
      filterId: jiraFilterId,
      jql: allJql,
      sourceUrl: `${jiraBaseUrl}/issues/?filter=${jiraFilterId}`
    },
    inProgress: {
      filterId: jiraFilterId,
      jql: l3Jql,
      sourceUrl: `${jiraBaseUrl}/issues/?filter=${jiraFilterId}`
    },
    releases: releaseFilters.map((release) => ({
      ...release,
      jql: `filter = ${release.filterId} ORDER BY updated DESC`,
      sourceUrl: releaseSourceUrl(release.filterId)
    }))
  };
}

async function handleSreApi(res) {
  if (!jiraEmail || !jiraToken || jiraToken === "replace-with-your-atlassian-api-token") {
    send(res, 503, JSON.stringify({
      error: "Jira credentials are not configured.",
      requiredEnv: ["JIRA_EMAIL", "JIRA_API_TOKEN"],
      syncMode: "blocked",
      jiraSyncs: configuredJiraSyncs()
    }, null, 2));
    return;
  }

  const syncs = configuredJiraSyncs();
  const allJql = syncs.overview.jql;
  const l3Jql = syncs.inProgress.jql;
  const [allResult, l3Result, releases] = await Promise.all([
    jiraSearch(allJql),
    jiraSearch(l3Jql),
    Promise.all(releaseFilters.map(fetchRelease))
  ]);
  const issues = (allResult.issues || []).map(mapIssue);
  const l3Issues = (l3Result.issues || []).map(mapIssue);

  send(res, 200, JSON.stringify({
    fetchedAt: new Date().toISOString(),
    syncMode: "fresh",
    jiraSyncs: syncs,
    jiraFilters: {
      sreInProgress: {
        cloudUrl: jiraBaseUrl,
        filterId: jiraFilterId,
        jql: allJql,
        inProgressJql: l3Jql,
        sourceUrl: `${jiraBaseUrl}/issues/?filter=${jiraFilterId}`
      },
      sreReleases: releaseFilters.map((release) => ({
        ...release,
        jql: `filter = ${release.filterId} ORDER BY updated DESC`,
        sourceUrl: releaseSourceUrl(release.filterId)
      }))
    },
    metrics: computeMetrics(issues),
    sreFilterIssues: issues,
    sreL3Issues: l3Issues,
    releases
  }));
}

function serveStatic(req, res) {
  const urlPath = decodeURIComponent(new URL(req.url, `http://localhost:${port}`).pathname);
  const requestedPath = urlPath === "/" ? "/index.html" : urlPath;
  const filePath = path.normalize(path.join(root, requestedPath));

  if (!filePath.startsWith(root)) {
    send(res, 403, "Forbidden", "text/plain; charset=utf-8");
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      send(res, 404, "Not found", "text/plain; charset=utf-8");
      return;
    }
    send(res, 200, data, mimeTypes[path.extname(filePath)] || "application/octet-stream");
  });
}

http.createServer(async (req, res) => {
  try {
    if (req.url.startsWith("/api/sre")) {
      await handleSreApi(res);
      return;
    }
    serveStatic(req, res);
  } catch (error) {
    send(res, 500, JSON.stringify({ error: error.message }, null, 2));
  }
}).listen(port, () => {
  console.log(`SRE Board running at http://localhost:${port}`);
});
