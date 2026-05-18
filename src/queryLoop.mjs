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

function clipText(text = "", maxLength = 4000) {
  const normalized = normalizeWhitespace(text);
  const limit = Math.max(200, Number(maxLength || 4000));
  return normalized.length > limit ? `${normalized.slice(0, limit).trim()}...` : normalized;
}

function trimAttachmentForPrompt(attachment = {}) {
  return {
    ...attachment,
    excerpt: attachment?.excerpt ? clipText(attachment.excerpt, 1800) : attachment?.excerpt
  };
}

function trimMessageForPrompt(message = {}, maxContentLength = 6000) {
  return {
    ...message,
    role: message?.role === "assistant" ? "assistant" : "user",
    content: clipText(message?.content || "", maxContentLength),
    attachments: Array.isArray(message?.attachments)
      ? message.attachments.slice(0, 6).map(trimAttachmentForPrompt)
      : []
  };
}

function estimatePromptMessageChars(message = {}) {
  const attachmentChars = Array.isArray(message.attachments)
    ? message.attachments.reduce((sum, attachment) =>
        sum
          + String(attachment?.name || "").length
          + String(attachment?.excerpt || "").length
          + String(attachment?.imageUrl || "").length,
      0)
    : 0;
  return String(message.content || "").length + attachmentChars + 32;
}

function fitRecentMessagesToBudget(messages = [], options = {}) {
  return selectRecentMessagesForPrompt(messages, options).recentMessages;
}

function selectRecentMessagesForPrompt(messages = [], options = {}, sourceOffset = 0) {
  const maxRecentChars = Math.max(4000, Number(options.maxRecentChars || 32000));
  const maxMessageChars = Math.max(600, Number(options.maxMessageChars || 6000));
  const trimmed = messages.map((message, index) => ({
    ...trimMessageForPrompt(message, maxMessageChars),
    __sourceIndex: sourceOffset + index
  }));
  let total = trimmed.reduce((sum, message) => sum + estimatePromptMessageChars(message), 0);

  while (trimmed.length > 4 && total > maxRecentChars) {
    const [removed] = trimmed.splice(0, 1);
    total -= estimatePromptMessageChars(removed);
  }

  const startIndex = trimmed.length ? trimmed[0].__sourceIndex : sourceOffset + messages.length;
  return {
    startIndex,
    recentMessages: trimmed.map(({ __sourceIndex, ...message }) => message)
  };
}

function clipSummaryLines(lines = [], maxSummaryChars = 4200) {
  const limit = Math.max(1000, Number(maxSummaryChars || 4200));
  const kept = [];
  let total = 0;

  for (const line of [...lines].reverse()) {
    const size = String(line || "").length + 1;
    if (kept.length && total + size > limit) {
      break;
    }
    kept.push(line);
    total += size;
  }

  return kept.reverse().join("\n");
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
  const requestedKeepRecent = Number(options.keepRecent ?? 8);
  const maxSummaryChars = Math.max(1000, Number(options.maxSummaryChars || 4200));
  const normalizedHistory = Array.isArray(history) ? history.filter(Boolean) : [];
  const keepRecent = Number.isFinite(requestedKeepRecent)
    ? Math.min(normalizedHistory.length, Math.max(4, requestedKeepRecent))
    : normalizedHistory.length;

  if (!normalizedHistory.length) {
    return {
      recentMessages: [],
      summaryText: ""
    };
  }

  const candidateStart = Math.max(0, normalizedHistory.length - keepRecent);
  const recentSelection = selectRecentMessagesForPrompt(
    normalizedHistory.slice(candidateStart),
    options,
    candidateStart
  );
  const olderMessages = normalizedHistory.slice(0, recentSelection.startIndex);
  const recentMessages = recentSelection.recentMessages;
  const summaryLines = [];

  const instructionSignals = olderMessages
    .filter((message) => /记住|偏好|默认|优先|不要|必须|请用|风格|训练|附件/u.test(String(message?.content || "")))
    .map(summarizeMessage)
    .filter(Boolean);

  if (instructionSignals.length) {
    summaryLines.push("Earlier session instructions and preference signals:");
    instructionSignals.forEach((item) => summaryLines.push(`- ${item}`));
  }

  const olderTurns = olderMessages
    .map(summarizeMessage)
    .filter(Boolean);

  if (olderTurns.length) {
    summaryLines.push("Compressed earlier current-session turns:");
    olderTurns.forEach((item) => summaryLines.push(`- ${item}`));
  }

  return {
    recentMessages,
    summaryText: clipSummaryLines(summaryLines, maxSummaryChars)
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
