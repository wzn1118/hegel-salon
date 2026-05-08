function normalizeWhitespace(text) {
  return String(text || "")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function summarizeAttachments(attachments = []) {
  return (Array.isArray(attachments) ? attachments : [])
    .map((attachment) => {
      const name = String(attachment?.name || "attachment");
      const kind = String(attachment?.kind || "file");
      const excerpt = normalizeWhitespace(attachment?.excerpt || "");

      if (excerpt) {
        const clipped = excerpt.length > 1200 ? `${excerpt.slice(0, 1200)}…` : excerpt;
        return `[${kind}] ${name}\n${clipped}`;
      }

      if (attachment?.imageUrl) {
        return `[image] ${name}\nImage attached and directly visible to the model.`;
      }

      return `[${kind}] ${name}`;
    })
    .filter(Boolean);
}

function summarizeMessage(message) {
  const content = normalizeWhitespace(message?.content || "");
  const attachments = summarizeAttachments(message?.attachments || []);
  const role = message?.role === "assistant" ? "assistant" : "user";
  const parts = [];

  if (content) {
    parts.push(content.length > 220 ? `${content.slice(0, 220)}…` : content);
  }

  if (attachments.length) {
    parts.push(`attachments: ${attachments.map((item) => item.split("\n")[0]).join("; ")}`);
  }

  if (!parts.length) {
    return "";
  }

  return `${role}: ${parts.join(" | ")}`;
}

export function buildPromptBlock(title, content) {
  const normalizedContent = normalizeWhitespace(content || "");
  if (!normalizedContent) {
    return "";
  }

  return `${String(title || "Block").trim()}:\n${normalizedContent}`;
}

export function joinPromptBlocks(staticBlocks = [], dynamicBlocks = []) {
  return [...staticBlocks, ...dynamicBlocks]
    .map((block) => normalizeWhitespace(block))
    .filter(Boolean)
    .join("\n\n");
}

export function compactConversationHistoryForPrompt(history = [], options = {}) {
  const keepRecent = Math.max(4, Number(options.keepRecent || 8));
  const normalizedHistory = Array.isArray(history) ? history.filter(Boolean) : [];

  if (normalizedHistory.length <= keepRecent) {
    return {
      recentMessages: normalizedHistory,
      summaryText: ""
    };
  }

  const olderMessages = normalizedHistory.slice(0, -keepRecent);
  const recentMessages = normalizedHistory.slice(-keepRecent);
  const summaryLines = [];

  const instructionSignals = olderMessages
    .filter((message) => /记住|偏好|默认|优先|不要|必须|请用|风格|训练|附件/u.test(String(message?.content || "")))
    .map(summarizeMessage)
    .filter(Boolean);

  if (instructionSignals.length) {
    summaryLines.push("Earlier session instructions and preference signals:");
    instructionSignals.slice(-6).forEach((item) => summaryLines.push(`- ${item}`));
  }

  const olderTurns = olderMessages
    .map(summarizeMessage)
    .filter(Boolean)
    .slice(-8);

  if (olderTurns.length) {
    summaryLines.push("Compressed earlier current-session turns:");
    olderTurns.forEach((item) => summaryLines.push(`- ${item}`));
  }

  return {
    recentMessages,
    summaryText: summaryLines.join("\n")
  };
}

export function buildAttachmentExtractionSummary(history = []) {
  const messages = Array.isArray(history) ? history : [];
  const lines = [];

  for (const message of messages) {
    const attachments = summarizeAttachments(message?.attachments || []);
    if (!attachments.length) {
      continue;
    }

    const role = message?.role === "assistant" ? "assistant" : "user";
    lines.push(`${role} attachments:`);
    attachments.slice(0, 4).forEach((item) => lines.push(item));
  }

  return lines.join("\n\n");
}

export async function runQueryLoop(initialState, steps = []) {
  let state = {
    ...initialState,
    phase: "init",
    phaseLog: [{ phase: "init", at: new Date().toISOString() }]
  };

  for (const step of steps) {
    if (!step || typeof step.run !== "function") {
      continue;
    }

    if (typeof step.when === "function" && !step.when(state)) {
      continue;
    }

    state = {
      ...state,
      phase: step.name || "unknown"
    };

    const patch = await step.run(state);
    if (patch && typeof patch === "object") {
      state = {
        ...state,
        ...patch
      };
    }

    state.phaseLog = [
      ...(Array.isArray(state.phaseLog) ? state.phaseLog : []),
      {
        phase: step.name || "unknown",
        at: new Date().toISOString()
      }
    ];

    if (state.result) {
      break;
    }
  }

  return state;
}
