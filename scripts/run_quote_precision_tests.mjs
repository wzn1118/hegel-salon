import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { projectRoot, researchDir } from "../src/projectPaths.mjs";

const root = projectRoot;
const apiUrl = process.env.HEGEL_SALON_API_URL || "http://127.0.0.1:3087/api/chat";
const timeoutMs = Number(process.env.HEGEL_SALON_TIMEOUT_MS || 120000);
const limit = Number(process.env.HEGEL_SALON_TEST_LIMIT || 100);
const httpRetries = Number(process.env.HEGEL_SALON_HTTP_RETRIES || 3);
const reportDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Shanghai"
}).format(new Date());

const topics = [
  "Phenomenology Preface on truth as the whole",
  "Phenomenology Preface on substance and subject",
  "Phenomenology Introduction on the path of despair",
  "Phenomenology Introduction on consciousness setting its own criterion",
  "Phenomenology Introduction on determinate negation",
  "Science of Logic Introduction on method not being borrowed from outside",
  "Science of Logic Introduction on pure science and objective thinking",
  "Encyclopaedia Logic on nature as the Idea in its otherness",
  "Philosophy of Right Introduction on the idea of right and freedom",
  "Philosophy of Right on property and personality",
  "Philosophy of Right on the state as the actuality of the ethical Idea",
  "Philosophy of Right criticizing the reduction of the state to civil society",
  "Introduction to the History of Philosophy on philosophy as the history of free thought",
  "Introduction to the History of Philosophy on no philosophy overstepping its own time",
  "Philosophy of History General Introduction on reason governing the world",
  "Philosophy of History General Introduction on progress in the consciousness of freedom",
  "Introduction to the Philosophy of Religion on religion and philosophy sharing one content",
  "Aesthetics Introduction on the work of art addressing the responsive heart",
  "Jena Lectures on the state as the spirit of actuality",
  "System of Ethical Life on the organic principle being freedom"
];

const templates = [
  "Please give me the single most relevant English original sentence, quoted verbatim, and label the work and passage: %TOPIC%",
  "For %TOPIC%, provide one or two exact Hegel quotations with source labels and no paraphrase.",
  "Answer with original wording only and keep commentary minimal: %TOPIC%",
  "If there are multiple related passages, give the two most central exact quotations: %TOPIC%",
  "I am checking citation fidelity. Provide exact wording, source, and a very short note on the meaning: %TOPIC%",
  "Return one verified quotation only, with work and locator: %TOPIC%",
  "Quote Hegel as literally as possible and keep the answer concise: %TOPIC%",
  "Give the exact English line or lines I would cite for this claim: %TOPIC%",
  "If the wording is available, quote it exactly and name the passage: %TOPIC%",
  "I need a source-checked quotation for the following topic: %TOPIC%"
];

function buildCases() {
  const cases = [];
  let id = 1;

  for (const topic of topics) {
    for (const template of templates) {
      cases.push({
        id,
        topic,
        prompt: template.replace("%TOPIC%", topic)
      });
      id += 1;
    }
  }

  return cases.slice(0, limit);
}

async function callApi(prompt) {
  for (let attempt = 1; attempt <= httpRetries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=utf-8"
        },
        body: JSON.stringify({
          messages: [{ role: "user", content: prompt }]
        }),
        signal: controller.signal
      });

      const raw = await response.text();
      let body = {};

      try {
        body = raw ? JSON.parse(raw) : {};
      } catch {
        body = { raw };
      }

      if (!response.ok && attempt < httpRetries) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
        continue;
      }

      return {
        ok: response.ok,
        status: response.status,
        body
      };
    } catch (error) {
      if (attempt >= httpRetries) {
        return {
          ok: false,
          status: 0,
          body: {
            error: error instanceof Error ? error.message : String(error)
          }
        };
      }

      await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    ok: false,
    status: 0,
    body: {
      error: "Exhausted HTTP retries."
    }
  };
}

function summarizeResult(testCase, apiResult) {
  const validation = apiResult.body?.validation || {};
  const validQuotedSegments = validation.validQuotedSegments || [];
  const hasVerifiedDirectQuote = validQuotedSegments.length > 0;
  const passed =
    apiResult.ok &&
    validation.passed === true &&
    hasVerifiedDirectQuote;

  const failureReasons = [];
  if (!apiResult.ok) failureReasons.push("http_error");
  if (validation.passed !== true) failureReasons.push("invalid_direct_quote");
  if (!hasVerifiedDirectQuote) failureReasons.push("no_verified_direct_quote");

  return {
    id: testCase.id,
    topic: testCase.topic,
    prompt: testCase.prompt,
    passed,
    failureReasons,
    status: apiResult.status,
    attempts: apiResult.body?.attempts || 0,
    validation,
    replyPreview: String(apiResult.body?.reply || "").slice(0, 600),
    error: apiResult.body?.error || ""
  };
}

function buildMarkdownReport(results) {
  const total = results.length;
  const passed = results.filter((item) => item.passed).length;
  const failed = total - passed;
  const invalidQuote = results.filter((item) =>
    item.failureReasons.includes("invalid_direct_quote")
  ).length;
  const noVerified = results.filter((item) =>
    item.failureReasons.includes("no_verified_direct_quote")
  ).length;
  const httpErrors = results.filter((item) =>
    item.failureReasons.includes("http_error")
  ).length;

  const lines = [
    "# Quote Precision Test Report",
    "",
    `Date: ${new Date().toISOString()}`,
    `API: ${apiUrl}`,
    `Total: ${total}`,
    `Passed: ${passed}`,
    `Failed: ${failed}`,
    `Invalid direct quote failures: ${invalidQuote}`,
    `No verified direct quote failures: ${noVerified}`,
    `HTTP failures: ${httpErrors}`,
    "",
    "## Failed Cases",
    ""
  ];

  const failures = results.filter((item) => !item.passed);
  if (!failures.length) {
    lines.push("- none");
  } else {
    for (const item of failures) {
      lines.push(`- #${item.id} ${item.topic}`);
      lines.push(`  prompt: ${item.prompt}`);
      lines.push(`  reasons: ${item.failureReasons.join(", ")}`);
      if (item.error) lines.push(`  error: ${item.error}`);
      if (item.replyPreview) lines.push(`  reply: ${item.replyPreview}`);
    }
  }

  return lines.join("\n");
}

async function main() {
  const cases = buildCases();
  const results = [];

  console.log(`Running ${cases.length} quote-precision tests against ${apiUrl}`);

  for (const testCase of cases) {
    console.log(`[${testCase.id}/${cases.length}] ${testCase.topic}`);
    const apiResult = await callApi(testCase.prompt);
    const result = summarizeResult(testCase, apiResult);
    results.push(result);

    console.log(
      `  -> ${result.passed ? "PASS" : "FAIL"} | attempts=${result.attempts} | validQuotes=${result.validation.validQuotedSegments?.length || 0} | invalidQuotes=${result.validation.invalidQuotedSegments?.length || 0}`
    );
  }

  await mkdir(reportDir, { recursive: true });

  const reportStem = `hegel-quote-precision-test-${reportDate}-${cases.length}`;
  const jsonPath = join(reportDir, `${reportStem}.json`);
  const mdPath = join(reportDir, `${reportStem}.md`);

  await writeFile(
    jsonPath,
    JSON.stringify({ apiUrl, timeoutMs, results }, null, 2),
    "utf8"
  );
  await writeFile(mdPath, buildMarkdownReport(results), "utf8");

  const passed = results.filter((item) => item.passed).length;
  const failed = results.length - passed;

  console.log(`Completed. Passed=${passed}, Failed=${failed}`);
  console.log(`JSON report: ${jsonPath}`);
  console.log(`Markdown report: ${mdPath}`);

  if (failed > 0) {
    process.exitCode = 1;
  }
}

await main();
