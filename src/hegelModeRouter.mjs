function lower(text) {
  return String(text || "").toLowerCase();
}

function has(patterns, text) {
  return patterns.some((pattern) =>
    pattern instanceof RegExp ? pattern.test(text) : lower(text).includes(lower(pattern))
  );
}

const modeConfigs = {
  citation_mode: {
    needed_context: ["corpus evidence", "quote validation", "source status", "same-locator wording"],
    forbidden_behavior: [
      "Do not authenticate a quote by Hegelian style.",
      "Do not place unchecked wording in quotation marks.",
      "Do not convert paraphrase into quotation."
    ],
    required_tools: ["corpus_search", "quote_validation", "self_audit"]
  },
  concept_mode: {
    needed_context: ["concept graph", "dialectical plan", "corpus evidence", "misreading warnings"],
    forbidden_behavior: [
      "Do not merely imitate Hegelian vocabulary.",
      "Do not define concepts as isolated dictionary entries.",
      "Do not skip the internal limit and mediation."
    ],
    required_tools: ["concept_graph", "dialectical_plan", "corpus_search", "self_audit"]
  },
  text_exegesis_mode: {
    needed_context: ["quoted or supplied passage", "corpus evidence", "concept graph", "source status"],
    forbidden_behavior: [
      "Do not leave the passage as ornament.",
      "Do not use nearby works to displace the named passage.",
      "Do not treat translator or editor wording as Hegel's wording."
    ],
    required_tools: ["corpus_search", "concept_graph", "quote_validation", "self_audit"]
  },
  modern_judgment_mode: {
    needed_context: ["concept graph", "dialectical plan", "historical context", "modern boundary control"],
    forbidden_behavior: [
      "Do not imply Hegel directly spoke about the modern object.",
      "Do not hide contemporary inference inside primary doctrine.",
      "Do not use historical analogy as proof by itself."
    ],
    required_tools: ["concept_graph", "dialectical_plan", "historical_context", "self_audit"]
  },
  critique_mode: {
    needed_context: ["target claim", "concept graph", "dialectical plan", "forbidden moves"],
    forbidden_behavior: [
      "Do not criticize by mere negation.",
      "Do not caricature the target view.",
      "Do not make contradiction external if the target's internal limit is available."
    ],
    required_tools: ["concept_graph", "dialectical_plan", "self_audit"]
  },
  writing_mode: {
    needed_context: ["user writing goal", "concept graph", "source discipline", "style constraints"],
    forbidden_behavior: [
      "Do not sacrifice conceptual accuracy for style.",
      "Do not invent source references for rhetorical polish.",
      "Do not turn the answer into generic Hegelian atmosphere."
    ],
    required_tools: ["concept_graph", "dialectical_plan", "self_audit"]
  },
  comparison_mode: {
    needed_context: ["compared objects", "concept graph", "source status", "difference criteria"],
    forbidden_behavior: [
      "Do not compare by loose resemblance.",
      "Do not flatten different works or periods into one doctrine.",
      "Do not skip the criterion of comparison."
    ],
    required_tools: ["concept_graph", "corpus_search", "dialectical_plan", "self_audit"]
  },
  biographical_mode: {
    needed_context: ["chronology", "source status", "historical context", "doctrine boundary"],
    forbidden_behavior: [
      "Do not infer biography from doctrine alone.",
      "Do not turn anecdotes into primary philosophical evidence.",
      "Do not modernize motives without evidence."
    ],
    required_tools: ["historical_context", "corpus_search", "self_audit"]
  },
  translation_mode: {
    needed_context: ["source wording", "translation status", "locator", "concept graph"],
    forbidden_behavior: [
      "Do not present your translation as checked published wording.",
      "Do not mix languages from different locators.",
      "Do not hide uncertainty about German terms."
    ],
    required_tools: ["corpus_search", "quote_validation", "concept_graph", "self_audit"]
  },
  argument_repair_mode: {
    needed_context: ["target argument", "fallacy risks", "dialectical plan", "self-audit"],
    forbidden_behavior: [
      "Do not merely decorate the user's argument with Hegelian terms.",
      "Do not preserve hidden premises.",
      "Do not repair by making the conclusion more dogmatic."
    ],
    required_tools: ["strict_logic_judge", "dialectical_plan", "self_audit"]
  }
};

function unique(values) {
  return [...new Set((Array.isArray(values) ? values : []).filter(Boolean).map(String))];
}

export function routeHegelMode(userMessage) {
  const raw = String(userMessage || "");
  const text = lower(raw);
  const modeScores = new Map();
  const reasons = [];

  function addMode(mode, reason, score = 1) {
    modeScores.set(mode, (modeScores.get(mode) || 0) + score);
    reasons.push(reason);
  }

  if (
    has(
      [
        /quote|quotation|citation|source|出处|原话|引文|原文|引用/i,
        /这句话.*(黑格尔|hegel).*说/i,
        /是不是.*(黑格尔|hegel).*说/i
      ],
      raw
    )
  ) {
    addMode("citation_mode", "quote-authenticity or source request", 5);
  }

  if (has([/解释.*(这段|这句|原文|文本)/i, /逐句|细读|文本阐释|exegesis|close reading|interpret this passage/i], raw)) {
    addMode("text_exegesis_mode", "text exegesis request", 6);
  }

  if (has([/ai|人工智能|算法|社交媒体|平台|互联网|现代|当代|今天|如今|现在|资本|媒体|technology/i], raw)) {
    addMode("modern_judgment_mode", "modern object requires bounded extension", 4);
  }

  if (has([/批评|反驳|驳斥|审计|修订|漏洞|问题在哪|critique|criticize|refute|audit/i], raw)) {
    addMode("critique_mode", "critique or argument-audit request", 3);
  }

  if (has([/写|改写|润色|草稿|文章|演讲|摘要|提纲|仿写|compose|write|rewrite|draft/i], raw)) {
    addMode("writing_mode", "writing or rewriting request", 3);
  }

  if (has([/比较|区别|差异|相同|异同|compare|difference|versus|vs\./i], raw)) {
    addMode("comparison_mode", "comparison request", 4);
  }

  if (has([/生平|传记|哪一年|什么时候|青年|柏林|耶拿|biograph|chronology|life of/i], raw)) {
    addMode("biographical_mode", "biographical or chronology request", 4);
  }

  if (has([/翻译|译法|德文|原词|术语|怎么说|translate|translation|German term/i], raw)) {
    addMode("translation_mode", "translation or terminology request", 4);
  }

  if (has([/修复论证|改进论证|逻辑漏洞|前提|推理|argument repair|hidden premise|fallacy/i], raw)) {
    addMode("argument_repair_mode", "argument repair request", 4);
  }

  if (
    has(
      [
        /quote|quotation|citation|source|出处|原话|引文|原文|引用/i,
        /这句话.*(黑格尔|hegel).*说/i,
        /是不是.*(黑格尔|hegel).*说/i
      ],
      raw
    )
  ) {
    addMode("citation_mode", "quote-authenticity or source request", 5);
  }

  if (
    has(
      [/解释.*(这段|这句|原文|文本)/i, /逐句|细读|exegesis|close reading|interpret this passage/i],
      raw
    )
  ) {
    addMode("text_exegesis_mode", "text exegesis request", 5);
  }

  if (
    has(
      [/ai|人工智能|算法|社交媒体|平台|互联网|现代|当代|今天|如今|现在|资本|媒体|technology/i],
      raw
    )
  ) {
    addMode("modern_judgment_mode", "modern object requires bounded extension", 4);
  }

  if (has([/批评|反驳|驳斥|审计|修订|漏洞|问题在哪|critique|criticize|refute|audit/i], raw)) {
    addMode("critique_mode", "critique or argument-audit request", 3);
  }

  if (has([/写|改写|润色|草稿|文章|演讲|摘要|提纲|仿写|compose|write|rewrite|draft/i], raw)) {
    addMode("writing_mode", "writing or rewriting request", 3);
  }

  if (has([/比较|区别|差异|相同|异同|compare|difference|versus|vs\./i], raw)) {
    addMode("comparison_mode", "comparison request", 4);
  }

  if (has([/生平|传记|哪一年|什么时候|青年|柏林|耶拿|biograph|chronology|life of/i], raw)) {
    addMode("biographical_mode", "biographical or chronology request", 4);
  }

  if (has([/翻译|译法|德文|原词|术语|怎么译|translate|translation|German term/i], raw)) {
    addMode("translation_mode", "translation or terminology request", 4);
  }

  if (has([/修复论证|改进论证|逻辑漏洞|前提|推理|argument repair|hidden premise|fallacy/i], raw)) {
    addMode("argument_repair_mode", "argument repair request", 4);
  }

  if (!modeScores.size) {
    addMode("concept_mode", "default conceptual question", 1);
  }

  const rankedModes = [...modeScores.entries()]
    .sort((left, right) => right[1] - left[1])
    .map(([mode]) => mode);
  const primaryMode = rankedModes[0] || "concept_mode";
  if (!rankedModes.includes("concept_mode") && primaryMode !== "writing_mode") {
    rankedModes.push("concept_mode");
  }

  const mergedConfigs = rankedModes.map((mode) => modeConfigs[mode]).filter(Boolean);
  const secondaryModes = rankedModes.filter((mode) => mode !== primaryMode);
  const riskFlags = unique([
    rankedModes.includes("citation_mode") ? "quote_sensitive" : "",
    rankedModes.includes("modern_judgment_mode") ? "modern_extension_sensitive" : "",
    rankedModes.includes("biographical_mode") ? "chronology_sensitive" : "",
    rankedModes.includes("translation_mode") ? "translation_sensitive" : "",
    rankedModes.includes("argument_repair_mode") ? "argument_repair_sensitive" : ""
  ]);

  return {
    mode: primaryMode,
    primary_mode: primaryMode,
    secondary_modes: secondaryModes,
    reasons: unique(reasons),
    risk_flags: riskFlags,
    needed_context: unique(mergedConfigs.flatMap((config) => config.needed_context)),
    forbidden_behavior: unique(mergedConfigs.flatMap((config) => config.forbidden_behavior)),
    required_tools: unique(mergedConfigs.flatMap((config) => config.required_tools)),
    answer_layers_required: [
      "primary_text_evidence",
      "interpretive_paraphrase",
      "modern_extension",
      "system_generated_summary"
    ],
    text_profile: {
      language_hint: /[\u4e00-\u9fff]/u.test(raw) ? "zh" : "user-language",
      direct_quote_sensitive:
        rankedModes.includes("citation_mode") ||
        /quote|原文|引文|引用|quotation|citation/i.test(text),
      modern_boundary_sensitive: rankedModes.includes("modern_judgment_mode")
    }
  };
}

export function renderModeRouterContext(route) {
  const resolved = route || routeHegelMode("");
  return [
    `Mode: ${resolved.mode}`,
    `Primary mode: ${resolved.primary_mode || resolved.mode}`,
    `Secondary modes: ${(resolved.secondary_modes || []).join(", ") || "none"}`,
    `Risk flags: ${(resolved.risk_flags || []).join(", ") || "none"}`,
    `Reasons: ${(resolved.reasons || []).join("; ") || "none"}`,
    `Needed context: ${(resolved.needed_context || []).join(", ")}`,
    `Required tools: ${(resolved.required_tools || []).join(", ")}`,
    "Forbidden behavior:",
    ...(resolved.forbidden_behavior || []).map((item) => `- ${item}`),
    `Required answer layers: ${(resolved.answer_layers_required || []).join(", ")}`
  ].join("\n");
}
