# SRE Board

A dynamic team dashboard for SRE, Architecture, R&D, and AI project tracking.

The initial version is a zero-dependency web app with sample data and a Jira-ready data shape. It can be opened directly in a browser and later connected to Jira once team-specific fields, filters, and reporting rules are provided.

## Run Snapshot

Open `index.html` in a browser.

## Run With Live Jira Data

Create `.env` from `.env.example`, then set:

- `JIRA_EMAIL`
- `JIRA_API_TOKEN`

Start the local API and dashboard:

```powershell
node server.js
```

Open:

```text
http://localhost:4173
```

The dashboard calls `/api/sre` for live Jira data on every page load, manual refresh, and every 20 minutes while open, then falls back to the checked-in snapshot if credentials are not configured.

## Current Scope

- Team-specific dashboards for SRE, Architecture, R&D, and AI Projects
- Summary metrics, status breakdowns, priority views, and issue tables
- Search and filtering by status and priority
- Live Jira ingestion through `server.js`
- Fresh Jira sync for every configured JQL filter on page load, manual refresh, and every 20 minutes
- SRE `Overview` and `In Progress` tabs sourced from Jira filter `52237`
- Architecture workspace sourced from Jira filter `59446`
- SRE `Releases` tab sourced from configured release Jira filters, grouped by Patch and Hotfix
- SRE summary cards show only Open and In Progress
- Priority uses Jira-derived Top3, P2, P3, and P4 buckets. Top3 is based on the Jira issue label `Top3`.

## Jira Integration Plan

The dashboard currently reads from `src/data.js`. A future Jira connector can map Jira issues into the same structure:

```js
{
  key: "SRE-101",
  summary: "Incident automation",
  team: "sre",
  status: "In Progress",
  priority: "High",
  owner: "Team Member",
  due: "2026-07-01",
  progress: 68,
  updated: "2026-06-20",
  type: "Story"
}
```

When you provide requirements for each team, the board can be updated with the exact Jira projects, JQL filters, fields, and metrics.

## SRE Jira Tabs

The SRE `Overview` tab uses:

```jql
filter = 52237 ORDER BY updated DESC
```

The SRE `In Progress` tab uses the same filter narrowed to:

```jql
filter = 52237 AND status = "L3 in progress" ORDER BY updated DESC
```

Columns:

- Jira Id
- Summary
- Assignee
- Status
- Customer

Both tabs include clickable assignee filters below the search bar.

Jira Id interaction:

- Single click shows the latest two captured comments below the table
- Double click opens the issue in Jira

## SRE Releases

The SRE `Releases` tab is grouped into `Patch` and `Hotfix`.

The `Patch` tab currently includes:

| Release | Release date | Jira filter |
| --- | --- | --- |
| 2.6.4.2.21_1 | 2026-06-12 | 59503 |

The `Hotfix` tab is ready for hotfix release filters when they are provided.

The live API fetches each configured release filter and displays the total Jira ticket count for that release.
New releases can also be added from the dashboard form by entering release name, build version, type, Jira filter ID or Jira filter link, and release date. Browser-added releases are saved locally and merged into the Releases tab on refresh.
Browser-added releases can be removed from the Releases table with the `Delete` action. Built-in releases remain read-only.

## Architecture Jira Board

The Architecture workspace uses:

```jql
filter = 59446 ORDER BY updated DESC
```

Project cards are counted from Jira Epics:

- Active Projects: Epic status is not `Open`, `To Do`, `Released`, `Canceled`, or `Deferred`
- Inactive Projects: Epic status is `Open`, `To Do`, or `Canceled`

The board also shows Story and Bug status-count tables when those issue types are returned by the filter. The `Search` tab keeps a searchable Jira issue table for the same filter.
