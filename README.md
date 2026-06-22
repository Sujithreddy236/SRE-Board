# SRE Board

A dynamic team dashboard for SRE, Architecture, R&D, and AI project tracking.

The initial version is a zero-dependency web app with sample data and a Jira-ready data shape. It can be opened directly in a browser and later connected to Jira once team-specific fields, filters, and reporting rules are provided.

## Run

Open `index.html` in a browser.

## Current Scope

- Team-specific dashboards for SRE, Architecture, R&D, and AI Projects
- Summary metrics, status breakdowns, priority views, and issue tables
- Search and filtering by status and priority
- Data model designed for Jira issue ingestion
- SRE `Overview` and `In Progress` tabs sourced from Jira filter `52237`

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
