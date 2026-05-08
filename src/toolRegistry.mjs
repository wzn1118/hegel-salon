function exactPath(path) {
  return {
    match(pathname) {
      return pathname === path ? {} : null;
    }
  };
}

function regexPath(pattern, paramNames = []) {
  return {
    match(pathname) {
      const found = pathname.match(pattern);
      if (!found) {
        return null;
      }

      const params = {};
      paramNames.forEach((name, index) => {
        params[name] = found[index + 1];
      });
      return params;
    }
  };
}

const registry = [
  {
    name: "tools.catalog",
    method: "GET",
    ...exactPath("/api/tools"),
    schema: {
      input: null,
      output: { tools: "ToolDefinition[]" }
    },
    riskLevel: "low",
    readOnly: true,
    destructive: false,
    concurrencySafe: true,
    requiresAuth: true,
    requiresAdmin: false
  },
  {
    name: "chat.ask",
    method: "POST",
    ...exactPath("/api/chat"),
    schema: {
      input: {
        contentTypes: ["application/json", "multipart/form-data"],
        body: {
          styleProfileId: "string",
          optimizerMode: "boolean",
          messages: "ChatMessage[]",
          attachments: "File[]"
        }
      },
      output: {
        reply: "string",
        validation: "object",
        qualityJudge: "object",
        strictLogicJudge: "object",
        historiographyJudge: "object"
      }
    },
    riskLevel: "medium",
    readOnly: false,
    destructive: false,
    concurrencySafe: true,
    requiresAuth: true,
    requiresAdmin: false
  },
  {
    name: "sources.read",
    method: "GET",
    ...exactPath("/api/sources"),
    schema: { input: null, output: { entries: "Record<string,string>" } },
    riskLevel: "low",
    readOnly: true,
    destructive: false,
    concurrencySafe: true,
    requiresAuth: true,
    requiresAdmin: false
  },
  {
    name: "history.read",
    method: "GET",
    ...exactPath("/api/history"),
    schema: { input: { styleProfileId: "string" }, output: { messages: "ChatMessage[]" } },
    riskLevel: "low",
    readOnly: true,
    destructive: false,
    concurrencySafe: true,
    requiresAuth: true,
    requiresAdmin: false
  },
  {
    name: "styles.list",
    method: "GET",
    ...exactPath("/api/styles"),
    schema: { input: { styleProfileId: "string" }, output: { currentStyleId: "string", styles: "StyleProfile[]" } },
    riskLevel: "low",
    readOnly: true,
    destructive: false,
    concurrencySafe: true,
    requiresAuth: true,
    requiresAdmin: false
  },
  {
    name: "styles.create",
    method: "POST",
    ...exactPath("/api/styles"),
    schema: {
      input: { id: "string", styleKey: "string", name: "string", description: "string", userStylePrompt: "string" },
      output: { style: "StyleProfile", styles: "StyleProfile[]" }
    },
    riskLevel: "medium",
    readOnly: false,
    destructive: false,
    concurrencySafe: true,
    requiresAuth: true,
    requiresAdmin: false
  },
  {
    name: "styles.update",
    method: "POST",
    ...regexPath(/^\/api\/styles\/([^/]+)$/, ["styleProfileId"]),
    schema: {
      input: { id: "string", styleKey: "string", name: "string", description: "string", userStylePrompt: "string" },
      output: { style: "StyleProfile", styles: "StyleProfile[]" }
    },
    riskLevel: "medium",
    readOnly: false,
    destructive: false,
    concurrencySafe: true,
    requiresAuth: true,
    requiresAdmin: false
  },
  {
    name: "config.read",
    method: "GET",
    ...exactPath("/api/config"),
    schema: { input: null, output: { projectConfig: "ApiConfig", effectiveConfig: "ApiConfig" } },
    riskLevel: "low",
    readOnly: true,
    destructive: false,
    concurrencySafe: true,
    requiresAuth: true,
    requiresAdmin: false
  },
  {
    name: "config.save",
    method: "POST",
    ...exactPath("/api/config"),
    schema: {
      input: { provider: "string", model: "string", baseURL: "string", apiKey: "string" },
      output: { projectConfig: "ApiConfig" }
    },
    riskLevel: "high",
    readOnly: false,
    destructive: false,
    concurrencySafe: true,
    requiresAuth: true,
    requiresAdmin: false
  },
  {
    name: "training.status",
    method: "GET",
    ...exactPath("/api/training/status"),
    schema: { input: { styleProfileId: "string" }, output: { progress: "TrainingProgress", playbook: "object" } },
    riskLevel: "low",
    readOnly: true,
    destructive: false,
    concurrencySafe: true,
    requiresAuth: true,
    requiresAdmin: false
  },
  {
    name: "training.prompt.save",
    method: "POST",
    ...exactPath("/api/training/prompt"),
    schema: { input: { styleProfileId: "string", judgePrompt: "string" }, output: { judgePrompt: "string" } },
    riskLevel: "medium",
    readOnly: false,
    destructive: false,
    concurrencySafe: true,
    requiresAuth: true,
    requiresAdmin: false
  },
  {
    name: "training.start",
    method: "POST",
    ...exactPath("/api/training/start"),
    schema: {
      input: { styleProfileId: "string", iterations: "number", concurrency: "number", targetScore: "number", timeoutMs: "number" },
      output: { runId: "string", pid: "number" }
    },
    riskLevel: "high",
    readOnly: false,
    destructive: false,
    concurrencySafe: false,
    requiresAuth: true,
    requiresAdmin: false
  },
  {
    name: "computer.state",
    method: "GET",
    ...exactPath("/api/computer/state"),
    schema: { input: null, output: { status: "string", transcript: "string[]" } },
    riskLevel: "medium",
    readOnly: true,
    destructive: false,
    concurrencySafe: true,
    requiresAuth: true,
    requiresAdmin: false
  },
  {
    name: "computer.reset",
    method: "POST",
    ...exactPath("/api/computer/reset"),
    schema: { input: null, output: { state: "ComputerState" } },
    riskLevel: "high",
    readOnly: false,
    destructive: true,
    concurrencySafe: false,
    requiresAuth: true,
    requiresAdmin: false
  },
  {
    name: "computer.task",
    method: "POST",
    ...exactPath("/api/computer/task"),
    schema: { input: { task: "string", startUrl: "string" }, output: { state: "ComputerState" } },
    riskLevel: "high",
    readOnly: false,
    destructive: false,
    concurrencySafe: false,
    requiresAuth: true,
    requiresAdmin: false
  },
  {
    name: "admin.overview",
    method: "GET",
    ...exactPath("/api/admin/overview"),
    schema: { input: null, output: { summary: "object", users: "AdminUserSnapshot[]" } },
    riskLevel: "medium",
    readOnly: true,
    destructive: false,
    concurrencySafe: true,
    requiresAuth: true,
    requiresAdmin: true
  },
  {
    name: "admin.analytics",
    method: "GET",
    ...exactPath("/api/admin/analytics"),
    schema: { input: null, output: { usageTimeline: "UsageDay[]", recentLoginEvents: "LoginEvent[]" } },
    riskLevel: "medium",
    readOnly: true,
    destructive: false,
    concurrencySafe: true,
    requiresAuth: true,
    requiresAdmin: true
  },
  {
    name: "admin.users.list",
    method: "GET",
    ...exactPath("/api/admin/users"),
    schema: { input: null, output: { users: "AdminUserListEntry[]" } },
    riskLevel: "medium",
    readOnly: true,
    destructive: false,
    concurrencySafe: true,
    requiresAuth: true,
    requiresAdmin: true
  },
  {
    name: "admin.database.health",
    method: "GET",
    ...exactPath("/api/admin/database/health"),
    schema: { input: null, output: { integrity: "string", counts: "object", pragmas: "object" } },
    riskLevel: "medium",
    readOnly: true,
    destructive: false,
    concurrencySafe: true,
    requiresAuth: true,
    requiresAdmin: true
  },
  {
    name: "admin.database.backup",
    method: "POST",
    ...exactPath("/api/admin/database/backup"),
    schema: { input: null, output: { backup: "object" } },
    riskLevel: "high",
    readOnly: false,
    destructive: false,
    concurrencySafe: false,
    requiresAuth: true,
    requiresAdmin: true
  },
  {
    name: "admin.mail.config.read",
    method: "GET",
    ...exactPath("/api/admin/mail-config"),
    schema: { input: null, output: { config: "MailConfig" } },
    riskLevel: "medium",
    readOnly: true,
    destructive: false,
    concurrencySafe: true,
    requiresAuth: true,
    requiresAdmin: true
  },
  {
    name: "admin.mail.config.save",
    method: "POST",
    ...exactPath("/api/admin/mail-config"),
    schema: { input: { mode: "string", host: "string", port: "number", secure: "boolean", user: "string", pass: "string", from: "string" }, output: { config: "MailConfig" } },
    riskLevel: "high",
    readOnly: false,
    destructive: false,
    concurrencySafe: false,
    requiresAuth: true,
    requiresAdmin: true
  },
  {
    name: "admin.mail.test",
    method: "POST",
    ...exactPath("/api/admin/mail-test"),
    schema: { input: { to: "string", config: "MailConfig" }, output: { mode: "string" } },
    riskLevel: "high",
    readOnly: false,
    destructive: false,
    concurrencySafe: false,
    requiresAuth: true,
    requiresAdmin: true
  },
  {
    name: "admin.user.data.read",
    method: "GET",
    ...regexPath(/^\/api\/admin\/users\/([^/]+)\/data$/, ["userId"]),
    schema: { input: { userId: "uuid" }, output: { userId: "uuid", styleBuckets: "AdminStyleBucket[]" } },
    riskLevel: "high",
    readOnly: true,
    destructive: false,
    concurrencySafe: true,
    requiresAuth: true,
    requiresAdmin: true
  },
  {
    name: "admin.user.disable",
    method: "POST",
    ...regexPath(/^\/api\/admin\/users\/([^/]+)\/set-disabled$/, ["userId"]),
    schema: { input: { userId: "uuid", disabled: "boolean" }, output: { user: "User" } },
    riskLevel: "critical",
    readOnly: false,
    destructive: true,
    concurrencySafe: false,
    requiresAuth: true,
    requiresAdmin: true
  },
  {
    name: "admin.user.revoke_sessions",
    method: "POST",
    ...regexPath(/^\/api\/admin\/users\/([^/]+)\/revoke-sessions$/, ["userId"]),
    schema: { input: { userId: "uuid" }, output: { revoked: "number" } },
    riskLevel: "high",
    readOnly: false,
    destructive: true,
    concurrencySafe: false,
    requiresAuth: true,
    requiresAdmin: true
  },
  {
    name: "admin.user.clear_data",
    method: "POST",
    ...regexPath(/^\/api\/admin\/users\/([^/]+)\/clear-data$/, ["userId"]),
    schema: { input: { userId: "uuid", targets: "string[]" }, output: { userId: "uuid" } },
    riskLevel: "critical",
    readOnly: false,
    destructive: true,
    concurrencySafe: false,
    requiresAuth: true,
    requiresAdmin: true
  }
];

export function matchRegisteredTool(method, pathname) {
  for (const tool of registry) {
    if (tool.method !== method) {
      continue;
    }
    const params = tool.match(pathname);
    if (params) {
      return {
        tool,
        params
      };
    }
  }

  return null;
}

export function listRegisteredTools({ includeAdmin = false } = {}) {
  return registry
    .filter((tool) => includeAdmin || !tool.requiresAdmin)
    .map((tool) => ({
      name: tool.name,
      schema: tool.schema,
      riskLevel: tool.riskLevel,
      readOnly: tool.readOnly,
      destructive: tool.destructive,
      concurrencySafe: tool.concurrencySafe,
      requiresAuth: tool.requiresAuth,
      requiresAdmin: tool.requiresAdmin
    }));
}
