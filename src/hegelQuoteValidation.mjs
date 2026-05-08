function normalizeQuoteText(text) {
  return String(text || "")
    .replace(/\r/g, "")
    .replace(/[\u201c\u201d\u201e\u201f\u00ab\u00bb]/g, '"')
    .replace(/[\u2018\u2019\u201a\u201b]/g, "'")
    .replace(/\u2026/g, "...")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function trimQuoteBoundaries(text) {
  return String(text || "")
    .replace(/^[\s"'.,;:!?()[\]{}<>-]+/g, "")
    .replace(/[\s"'.,;:!?()[\]{}<>-]+$/g, "")
    .trim();
}

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function countLatinLetters(text) {
  return (String(text).match(/[A-Za-z\u00c0-\u024f]/g) || []).length;
}

function countCjkChars(text) {
  return (String(text).match(/[\u3400-\u9fff\uf900-\ufaff]/gu) || []).length;
}

function isQuoteCandidate(text) {
  const trimmed = trimQuoteBoundaries(text);
  if (trimmed.length < 8) {
    return false;
  }

  if (countLatinLetters(trimmed) >= 6) {
    return true;
  }

  if (countCjkChars(trimmed) >= 6) {
    return true;
  }

  return /[\u00a7\u6402]/.test(trimmed);
}

function extractQuotedSegments(reply) {
  const patterns = [
    /"([^"]{1,800})"/gs,
    /\u201c([^\u201d]{1,800})\u201d/gs,
    /\u300c([^\u300d]{1,800})\u300d/gs
  ];
  const segments = [];
  const seen = new Set();

  for (const pattern of patterns) {
    for (const match of String(reply || "").matchAll(pattern)) {
      const text = trimQuoteBoundaries(match[1]);
      if (!text) {
        continue;
      }

      const key = normalizeQuoteText(text);
      if (!key || seen.has(key)) {
        continue;
      }

      seen.add(key);
      segments.push(text);
    }
  }

  const lines = String(reply || "").split(/\r?\n/);
  const inlineLabelPattern =
    /^(?:German|English|Chinese|German original|English translation|Chinese translation|Chinese original|German source|English source|Chinese source|\u5fb7\u6587\u539f\u53e5|\u5fb7\u6587\u539f\u6587|\u82f1\u6587\u539f\u53e5|\u82f1\u6587\u539f\u6587|\u82f1\u8bd1|\u82f1\u8bd1\u539f\u6587|\u82f1\u6587\u6821\u52d8\u8bd1\u6587|\u4e2d\u6587|\u4e2d\u6587\u539f\u53e5|\u4e2d\u6587\u539f\u6587|\u4e2d\u8bd1|\u4e2d\u6587\u8bd1\u6587)\s*[:\uff1a]?\s*(.+)$/i;
  const labelOnlyPattern =
    /^(?:German|English|Chinese|German original|English translation|Chinese translation|Chinese original|German source|English source|Chinese source|\u5fb7\u6587\u539f\u53e5|\u5fb7\u6587\u539f\u6587|\u82f1\u6587\u539f\u53e5|\u82f1\u6587\u539f\u6587|\u82f1\u8bd1|\u82f1\u8bd1\u539f\u6587|\u82f1\u6587\u6821\u52d8\u8bd1\u6587|\u4e2d\u6587|\u4e2d\u6587\u539f\u53e5|\u4e2d\u6587\u539f\u6587|\u4e2d\u8bd1|\u4e2d\u6587\u8bd1\u6587)\s*[:\uff1a]?\s*$/i;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    const inlineMatch = line.match(inlineLabelPattern);
    if (inlineMatch) {
      const text = trimQuoteBoundaries(inlineMatch[1]);
      const key = normalizeQuoteText(text);
      if (text && key && !seen.has(key)) {
        seen.add(key);
        segments.push(text);
      }
      continue;
    }

    if (!labelOnlyPattern.test(line)) {
      continue;
    }

    const block = [];
    for (let offset = 1; offset <= 6; offset += 1) {
      const candidate = trimQuoteBoundaries(lines[index + offset] || "");
      if (!candidate) {
        break;
      }

      if (inlineLabelPattern.test(candidate) || labelOnlyPattern.test(candidate)) {
        break;
      }

      block.push(candidate);
    }

    const nextLine = block.join(" ").trim();
    const key = normalizeQuoteText(nextLine);
    if (nextLine && key && !seen.has(key)) {
      seen.add(key);
      segments.push(nextLine);
    }
  }

  return segments;
}

function collectEvidenceTexts(corpusContext) {
  const values = [];

  for (const hit of corpusContext?.hits || []) {
    if (hit?.content) values.push(hit.content);
  }

  for (const entry of corpusContext?.parallelHits || []) {
    if (entry?.germanText) values.push(entry.germanText);
    if (entry?.englishText) values.push(entry.englishText);
    if (entry?.chineseText) values.push(entry.chineseText);
  }

  for (const hit of corpusContext?.chinese?.localHits || []) {
    if (hit?.content) values.push(hit.content);
  }

  for (const hit of corpusContext?.chinese?.generatedHits || []) {
    if (hit?.content) values.push(hit.content);
  }

  return values
    .map((value) => normalizeQuoteText(value))
    .filter(Boolean);
}

export function validateReplyQuotes(reply, corpusContext) {
  const quotedSegments = extractQuotedSegments(reply);
  const candidateSegments = quotedSegments.filter(isQuoteCandidate);
  const evidenceTexts = collectEvidenceTexts(corpusContext);

  const validQuotedSegments = [];
  const invalidQuotedSegments = [];

  for (const segment of candidateSegments) {
    const normalizedSegment = normalizeQuoteText(segment);
    const matched = evidenceTexts.some((evidence) =>
      evidence.includes(normalizedSegment)
    );

    if (matched) {
      validQuotedSegments.push(segment);
    } else {
      invalidQuotedSegments.push(segment);
    }
  }

  return {
    quotedSegments,
    candidateSegments,
    validQuotedSegments,
    invalidQuotedSegments,
    passed: invalidQuotedSegments.length === 0
  };
}

export function stripInvalidDirectQuotes(reply, invalidQuotedSegments) {
  let nextReply = String(reply || "");

  for (const segment of invalidQuotedSegments || []) {
    const escaped = escapeRegExp(segment);
    nextReply = nextReply
      .replace(new RegExp(`"${escaped}"`, "g"), segment)
      .replace(new RegExp(`\u201c${escaped}\u201d`, "g"), segment)
      .replace(new RegExp(`\u300c${escaped}\u300d`, "g"), segment);
  }

  return nextReply;
}
