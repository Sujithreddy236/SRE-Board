window.SRE_BOARD_DATA = {
  teams: [
    {
      id: "sre",
      name: "SRE",
      focus: "Reliability, incidents, service health",
      accent: "#0f766e",
      jiraProject: "SRE",
      metrics: {
        open: 18,
        inProgress: 9,
        blocked: 3,
        completed: 42,
        health: 91,
        sla: 96
      }
    },
    {
      id: "architecture",
      name: "Architecture",
      focus: "Design reviews, platform standards",
      accent: "#6d5dfc",
      jiraProject: "ARCH",
      metrics: {
        open: 12,
        inProgress: 6,
        blocked: 2,
        completed: 27,
        health: 86,
        sla: 89
      }
    },
    {
      id: "rnd",
      name: "R&D",
      focus: "Experiments, prototypes, product discovery",
      accent: "#d97706",
      jiraProject: "RND",
      metrics: {
        open: 21,
        inProgress: 11,
        blocked: 4,
        completed: 33,
        health: 78,
        sla: 82
      }
    },
    {
      id: "ai",
      name: "AI Projects",
      focus: "Model work, automations, evaluation",
      accent: "#2563eb",
      jiraProject: "AI",
      metrics: {
        open: 15,
        inProgress: 8,
        blocked: 1,
        completed: 19,
        health: 88,
        sla: 93
      }
    }
  ],
  issues: [
    { key: "SRE-101", team: "sre", type: "Incident", summary: "Reduce alert noise for payment gateway", status: "In Progress", priority: "High", owner: "Priya", due: "2026-06-28", progress: 64, updated: "2026-06-21" },
    { key: "SRE-118", team: "sre", type: "Task", summary: "Automate weekly availability report", status: "Open", priority: "Medium", owner: "Rahul", due: "2026-07-03", progress: 24, updated: "2026-06-19" },
    { key: "SRE-127", team: "sre", type: "Problem", summary: "Root cause review for latency spike", status: "Blocked", priority: "Critical", owner: "Anika", due: "2026-06-25", progress: 45, updated: "2026-06-22" },
    { key: "SRE-135", team: "sre", type: "Story", summary: "Service health score calibration", status: "Done", priority: "Low", owner: "Sujith", due: "2026-06-18", progress: 100, updated: "2026-06-18" },
    { key: "ARCH-204", team: "architecture", type: "Design", summary: "Event streaming reference architecture", status: "In Progress", priority: "High", owner: "Meera", due: "2026-07-05", progress: 58, updated: "2026-06-21" },
    { key: "ARCH-219", team: "architecture", type: "Review", summary: "API governance checklist", status: "Open", priority: "Medium", owner: "Dev", due: "2026-07-10", progress: 12, updated: "2026-06-17" },
    { key: "ARCH-226", team: "architecture", type: "Risk", summary: "Legacy auth migration dependency", status: "Blocked", priority: "High", owner: "Leela", due: "2026-06-30", progress: 37, updated: "2026-06-20" },
    { key: "ARCH-242", team: "architecture", type: "Decision", summary: "Data retention standards", status: "Done", priority: "Medium", owner: "Arjun", due: "2026-06-14", progress: 100, updated: "2026-06-14" },
    { key: "RND-301", team: "rnd", type: "Experiment", summary: "Queue optimization prototype", status: "In Progress", priority: "High", owner: "Kavya", due: "2026-07-02", progress: 73, updated: "2026-06-22" },
    { key: "RND-317", team: "rnd", type: "Spike", summary: "Evaluate browser telemetry capture", status: "Open", priority: "Low", owner: "Nikhil", due: "2026-07-12", progress: 18, updated: "2026-06-16" },
    { key: "RND-322", team: "rnd", type: "Experiment", summary: "Failure prediction data study", status: "Blocked", priority: "Critical", owner: "Tara", due: "2026-06-27", progress: 52, updated: "2026-06-21" },
    { key: "RND-338", team: "rnd", type: "Prototype", summary: "Synthetic load replay tool", status: "Done", priority: "Medium", owner: "Ishan", due: "2026-06-11", progress: 100, updated: "2026-06-11" },
    { key: "AI-401", team: "ai", type: "Model", summary: "Incident summary assistant evaluation", status: "In Progress", priority: "High", owner: "Asha", due: "2026-07-04", progress: 69, updated: "2026-06-22" },
    { key: "AI-414", team: "ai", type: "Automation", summary: "Jira ticket classification workflow", status: "Open", priority: "Medium", owner: "Sujith", due: "2026-07-08", progress: 31, updated: "2026-06-18" },
    { key: "AI-426", team: "ai", type: "Risk", summary: "Prompt regression test coverage", status: "Blocked", priority: "Medium", owner: "Maya", due: "2026-06-29", progress: 41, updated: "2026-06-20" },
    { key: "AI-433", team: "ai", type: "Release", summary: "Knowledge search beta rollout", status: "Done", priority: "High", owner: "Vikram", due: "2026-06-15", progress: 100, updated: "2026-06-15" }
  ]
};
