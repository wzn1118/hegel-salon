function normalizeArray(values) {
  return Array.isArray(values) ? values.filter(Boolean).map(String) : [];
}

function conceptIds(detectedConcepts = []) {
  return normalizeArray(
    detectedConcepts.map((item) => (typeof item === "string" ? item : item?.id))
  );
}

function firstConcept(detectedConcepts = []) {
  return detectedConcepts.find(Boolean) || null;
}

function conceptLabel(concept) {
  if (!concept) return "the user's object";
  if (typeof concept === "string") return concept;
  return `${concept.id}${concept.zh ? ` (${concept.zh})` : ""}`;
}

function inferObject(userMessage, detectedConcepts = []) {
  const prompt = String(userMessage || "").trim();
  const quoted = prompt.match(/[“"「](.+?)[”"」]/u)?.[1];
  if (quoted) return quoted.slice(0, 120);

  const leadConcept = firstConcept(detectedConcepts);
  if (leadConcept) return conceptLabel(leadConcept);

  return prompt.length > 120 ? `${prompt.slice(0, 120)}...` : prompt || "the question";
}

function corpusRequirement(corpusHits = [], detectedConcepts = []) {
  const ids = conceptIds(detectedConcepts);
  const available = (Array.isArray(corpusHits) ? corpusHits : []).slice(0, 6).map((hit) => ({
    work: String(hit?.workTitle || hit?.workId || "unknown work"),
    locator: String(hit?.pageTitle || hit?.url || "unknown locator"),
    authority: String(hit?.authority || "unknown"),
    concept_relevance: ids.filter((id) =>
      `${hit?.workTitle || ""} ${hit?.pageTitle || ""} ${hit?.content || ""}`
        .toLowerCase()
        .includes(id.replace(/_/g, " "))
    )
  }));

  return {
    available,
    sufficient: available.length > 0,
    gaps: available.length
      ? []
      : [
          "No ranked corpus hit was available for the requested object; answer must mark source limits and avoid direct quotation."
        ]
  };
}

function buildSourceAnchorRequirements(detectedConcepts = []) {
  return (Array.isArray(detectedConcepts) ? detectedConcepts : []).slice(0, 8).map((item) => ({
    concept: typeof item === "string" ? item : item?.id,
    domain: typeof item === "string" ? "" : item?.domain || "",
    required_source_families: typeof item === "string" ? [] : item?.required_source_families || [],
    source_queries: typeof item === "string" ? [] : item?.source_queries || []
  })).filter((item) => item.concept);
}

function buildConceptTransitionChain(detectedConcepts = []) {
  const ids = conceptIds(detectedConcepts);
  const chain = [];
  if (ids.includes("freedom")) chain.push("will", "right", "morality", "ethical_life");
  if (ids.includes("state")) chain.push("family", "civil_society", "state");
  if (ids.includes("master_slave")) chain.push("self_consciousness", "recognition", "labor", "freedom");
  if (ids.includes("actuality")) chain.push("essence", "condition", "necessity", "actuality");
  if (ids.includes("concept")) chain.push("universality", "particularity", "individuality");
  if (ids.includes("art")) chain.push("art", "religion", "philosophy");
  if (ids.includes("religion")) chain.push("representation", "religion", "philosophy");
  if (ids.includes("ai")) chain.push("cognition", "objective_spirit", "technology", "modern_extension_boundary");

  return [...new Set(chain.length ? chain : ids.slice(0, 6))];
}

function buildObjectionToAnswer({ userMessage = "", detectedConcepts = [] } = {}) {
  const ids = conceptIds(detectedConcepts);
  if (ids.includes("freedom")) {
    return {
      objection: "If freedom requires objective form, does that make law or institutions automatically free?",
      answer: "No. Objective form is necessary for freedom, but empirical institutions must still be judged by whether they actualize rational freedom."
    };
  }
  if (ids.includes("actuality") || ids.includes("rationality")) {
    return {
      objection: "Does rational actuality justify whatever happens to exist?",
      answer: "No. Actuality in the strong sense is existence adequate to its concept, not mere factual presence."
    };
  }
  if (ids.includes("master_slave")) {
    return {
      objection: "Is lordship and bondage simply a later class-struggle thesis?",
      answer: "No. Class struggle can be a later extension, but the immediate Hegelian structure is defective recognition."
    };
  }
  if (/ai|artificial intelligence|人工智能|算法|社交媒体/i.test(userMessage)) {
    return {
      objection: "Can we speak as if Hegel directly judged the modern object?",
      answer: "No. The answer must mark a bounded extension from doctrine to contemporary institutions."
    };
  }
  return {
    objection: "Why is the first formulation insufficient?",
    answer: "Because it treats one determination as self-standing; the answer must show its internal limit and mediated richer form."
  };
}

function buildQuotePolicy({ corpusHits = [], detectedConcepts = [] } = {}) {
  const requiredFamilies = [
    ...new Set(
      (Array.isArray(detectedConcepts) ? detectedConcepts : [])
        .flatMap((item) => item?.required_source_families || [])
        .filter(Boolean)
    )
  ];
  return {
    direct_quotes_allowed: Array.isArray(corpusHits) && corpusHits.length > 0,
    required_source_families: requiredFamilies,
    rule: corpusHits?.length
      ? "Direct quotation may use only exact retrieved or aligned wording."
      : "Do not use direct quotation; mark source limits and answer by paraphrase."
  };
}

function buildModernBoundaryPolicy({ userMessage = "", detectedConcepts = [] } = {}) {
  const ids = conceptIds(detectedConcepts);
  const modern =
    ids.some((id) => ["ai", "technology", "social_media", "algorithmic_mediation", "market_society"].includes(id)) ||
    /ai|artificial intelligence|人工智能|算法|社交媒体|平台|现代|当代|今天|资本/i.test(userMessage);

  return {
    required: modern,
    rule: modern
      ? "State explicitly which claim is Hegelian doctrine, which is interpretive reconstruction, and which is bounded modern extension."
      : "No special modern extension boundary is required beyond ordinary source discipline.",
    forbidden: modern
      ? [
          "Do not claim Hegel directly addressed the contemporary object.",
          "Do not make analogy do the work of evidence."
        ]
      : []
  };
}

export function identifyImmediateDefinition({ userMessage = "", detectedConcepts = [] } = {}) {
  const lead = firstConcept(detectedConcepts);
  if (!lead) {
    return "Define the user's object in its own terms before importing Hegelian vocabulary.";
  }

  return `Begin with ${conceptLabel(lead)} as the immediate determination requested by the question, using its graph definition only as a conceptual aid.`;
}

export function identifyInternalLimit({ userMessage = "", detectedConcepts = [] } = {}) {
  const ids = conceptIds(detectedConcepts);
  if (ids.includes("freedom")) {
    return "Freedom appears first as choice or inward will, but this is limited if it remains arbitrary and lacks objective rational form.";
  }
  if (ids.includes("actuality") || ids.includes("rationality")) {
    return "The formula about actuality becomes false if actuality is flattened into whatever merely exists.";
  }
  if (ids.includes("state")) {
    return "The state becomes one-sided if treated either as mere coercion or as automatically rational empirical power.";
  }
  if (ids.includes("master_slave")) {
    return "Asymmetrical recognition fails because one side does not receive recognition from an equal other.";
  }
  if (ids.includes("sublation") || ids.includes("negation")) {
    return "Negation remains abstract if it only rejects and does not preserve and raise a determinate content.";
  }
  if (ids.includes("civil_society")) {
    return "Civil society mediates particular needs, but its market and administrative interdependence is not yet the full universal ethical form.";
  }
  if (/ai|人工智能|社交媒体|平台|现代|当代/i.test(userMessage)) {
    return "A modern object cannot be treated as if Hegel directly named it; the limit is the gap between doctrine and contemporary extension.";
  }

  return "Identify the one-sided abstraction in the user's initial formulation and show why it cannot stand by itself.";
}

export function identifyContradiction({ userMessage = "", detectedConcepts = [] } = {}) {
  const ids = conceptIds(detectedConcepts);
  if (ids.includes("freedom")) {
    return "The contradiction is that arbitrary choice claims independence while remaining dependent on contingent desires and external options.";
  }
  if (ids.includes("actuality") || ids.includes("rationality")) {
    return "The contradiction is between rational actuality and the merely existent fact that may fail its own concept.";
  }
  if (ids.includes("state")) {
    return "The contradiction is between individual freedom needing objective institutions and empirical institutions that can fail freedom's concept.";
  }
  if (ids.includes("master_slave")) {
    return "The contradiction is that lordship seeks independent self-certainty through a dependent consciousness whose recognition is thereby defective.";
  }
  if (ids.includes("sublation")) {
    return "The contradiction is that simple negation destroys the content it would need in order to become a higher determination.";
  }

  return "State the immanent tension in the object rather than inventing an external enemy for rhetorical drama.";
}

export function identifyMediation({ userMessage = "", detectedConcepts = [], corpusHits = [] } = {}) {
  const ids = conceptIds(detectedConcepts);
  const sourceLine = corpusHits?.length
    ? "Use retrieved corpus evidence as the mediating textual control."
    : "Because corpus evidence is thin, mark the mediation as interpretive and do not quote.";

  if (ids.includes("freedom")) {
    return `Mediate through will, right, morality, and ethical life. ${sourceLine}`;
  }
  if (ids.includes("state")) {
    return `Mediate through family, civil society, and ethical life before judging the state. ${sourceLine}`;
  }
  if (ids.includes("master_slave")) {
    return `Mediate through recognition, fear, labor, and formation. ${sourceLine}`;
  }
  if (ids.includes("actuality") || ids.includes("rationality")) {
    return `Mediate through the distinction between mere existence and actuality adequate to the concept. ${sourceLine}`;
  }
  if (/ai|人工智能|社交媒体|平台|现代|当代/i.test(userMessage)) {
    return `Mediate through objective spirit, technology as institutional medium, and modern extension boundaries. ${sourceLine}`;
  }

  return `Use concept relations and retrieved evidence to connect the first definition to a richer determination. ${sourceLine}`;
}

export function identifyHigherDetermination({ userMessage = "", detectedConcepts = [] } = {}) {
  const ids = conceptIds(detectedConcepts);
  if (ids.includes("freedom")) {
    return "Freedom should be determined as rational self-determination actualized in objective forms, not as mere option-selection.";
  }
  if (ids.includes("actuality") || ids.includes("rationality")) {
    return "The higher determination is critical comprehension: only what is adequate to its concept is actual in the strong Hegelian sense.";
  }
  if (ids.includes("state")) {
    return "The higher determination is the rational state as ethical actuality, strictly distinguished from every empirical regime.";
  }
  if (ids.includes("master_slave")) {
    return "The higher determination is the need for reciprocal recognition beyond the defective asymmetry of lordship.";
  }
  if (ids.includes("sublation")) {
    return "The higher determination must say what is cancelled, preserved, and raised.";
  }
  if (/ai|人工智能|社交媒体|平台|现代|当代/i.test(userMessage)) {
    return "The higher determination is a bounded modern judgment: Hegelian doctrine plus clearly marked contemporary extension.";
  }

  return "Conclude with a determinate conceptual judgment that is stronger than the user's initial abstraction.";
}

export function buildForbiddenMoves({ userMessage = "", detectedConcepts = [] } = {}) {
  const ids = conceptIds(detectedConcepts);
  const moves = [
    "Do not treat stylistic resemblance to Hegel as conceptual understanding.",
    "Do not use concept names as prestige tokens without local definition.",
    "Do not present graph definitions as direct Hegel quotations.",
    "Do not force a mechanical thesis-antithesis-synthesis schema."
  ];

  if (ids.includes("freedom")) {
    moves.push("Do not equate freedom with arbitrary choice or desire satisfaction.");
  }
  if (ids.includes("actuality") || ids.includes("rationality")) {
    moves.push("Do not claim that whatever exists is rational or justified.");
  }
  if (ids.includes("state")) {
    moves.push("Do not identify every empirical state with the rational state.");
    moves.push("Do not reduce the state to mere oppression without mediation through ethical life.");
  }
  if (ids.includes("master_slave")) {
    moves.push("Do not collapse lordship and bondage into Marxist class struggle without marking the later extension.");
  }
  if (ids.includes("sublation") || ids.includes("negation")) {
    moves.push("Do not equate sublation with simple cancellation.");
  }
  if (/ai|人工智能|社交媒体|平台|现代|当代/i.test(userMessage)) {
    moves.push("Do not imply Hegel directly addressed the modern object.");
    moves.push("Do not hide contemporary inference inside primary-text doctrine.");
  }
  if (/这句话|quote|citation|原话|引文/i.test(userMessage)) {
    moves.push("Do not place unchecked wording in quotation marks.");
    moves.push("Do not answer a quotation-authenticity question by style alone.");
  }

  return [...new Set(moves)];
}

export function buildDialecticalPlan({ userMessage = "", detectedConcepts = [], corpusHits = [] } = {}) {
  const required_corpus = corpusRequirement(corpusHits, detectedConcepts);
  const forbidden_moves = buildForbiddenMoves({ userMessage, detectedConcepts });

  return {
    object: inferObject(userMessage, detectedConcepts),
    immediate_definition: identifyImmediateDefinition({ userMessage, detectedConcepts }),
    internal_limit: identifyInternalLimit({ userMessage, detectedConcepts }),
    contradiction: identifyContradiction({ userMessage, detectedConcepts }),
    mediation: identifyMediation({ userMessage, detectedConcepts, corpusHits }),
    higher_determination: identifyHigherDetermination({ userMessage, detectedConcepts }),
    concept_transition_chain: buildConceptTransitionChain(detectedConcepts),
    source_anchor_requirements: buildSourceAnchorRequirements(detectedConcepts),
    objection_to_answer: buildObjectionToAnswer({ userMessage, detectedConcepts }),
    quote_policy: buildQuotePolicy({ corpusHits, detectedConcepts }),
    modern_boundary_policy: buildModernBoundaryPolicy({ userMessage, detectedConcepts }),
    required_corpus,
    forbidden_moves,
    answer_constraints: [
      "Use this plan as the logical skeleton, not as wording to quote.",
      "Distinguish: primary-text evidence, interpretive paraphrase, modern extension, and system-generated summary.",
      required_corpus.sufficient
        ? "Anchor doctrinal claims in retrieved corpus evidence where possible."
        : "Say explicitly when corpus evidence is insufficient for direct quotation.",
      "Do not add direct quotations unless quote validation can support the exact wording."
    ]
  };
}
