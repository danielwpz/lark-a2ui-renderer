import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "vitest";
import "./load-integration-env.js";

import {
  formatValidationIssues,
  LARK_CARD_COMPONENT_TYPES,
  normalizeCallback,
  readComponentRef,
  renderSurface,
  SurfaceStore,
  validateA2uiMessages,
} from "../../src/v0_8/index.js";
import type {
  A2uiServerMessage,
  NormalizedCallbackInput,
  SurfaceState,
} from "../../src/v0_8/index.js";

const shouldRun = process.env.RUN_A2UI_LLM_INTEGRATION === "1";
const rootDir = join(dirname(fileURLToPath(import.meta.url)), "../..");

interface LlmScenario {
  name: string;
  prompt: string;
  requiredComponents: string[];
  expectedMinimumBindings: number;
  requiresFormCallback?: boolean;
}

interface ScenarioRunResult {
  componentTypes: Set<string>;
}

const scenarios: LlmScenario[] = [
  {
    name: "confirmation card",
    prompt:
      "Generate a compact confirmation card for approving a production deployment. It needs a title, concise body text, and two buttons: Approve and Reject. Include action context that tells the host whether the deployment was approved.",
    requiredComponents: ["Text", "Column", "Row", "Button"],
    expectedMinimumBindings: 2,
  },
  {
    name: "complete component coverage review form",
    prompt:
      "Generate one complex review card that intentionally uses every supported component: Text, Column, Row, Divider, Button, Form, TextField, MultipleChoice, and DateTimeInput. The card should review a deployment request. It must include a data model with a ticket id and form fields, title/body text, at least one divider, a form with a required long-text reason field, a single-select priority field with normal/high/urgent options, a required target date field, a primary submit button whose action context includes all submitted form values via data-model paths, and a secondary row with Cancel and Escalate buttons with useful action contexts.",
    requiredComponents: [...LARK_CARD_COMPONENT_TYPES],
    expectedMinimumBindings: 3,
    requiresFormCallback: true,
  },
  {
    name: "incident triage workflow",
    prompt:
      "Generate a complex incident triage card for an IM chat. It should show incident summary text, separate sections with dividers, ask the user for an owner email or note using TextField, ask severity using MultipleChoice, ask an ETA using DateTimeInput, and provide Submit, Snooze, and Close buttons. Use Column for the root layout, Row for grouped actions, Form for the submitted inputs, and bind submitted fields through the data model so the submit action context can be sent back to the host.",
    requiredComponents: [
      "Text",
      "Column",
      "Row",
      "Divider",
      "Button",
      "Form",
      "TextField",
      "MultipleChoice",
      "DateTimeInput",
    ],
    expectedMinimumBindings: 3,
    requiresFormCallback: true,
  },
];

describe.skipIf(!shouldRun)("LLM A2UI generation integration", () => {
  const scenarioResults = new Map<string, ScenarioRunResult>();

  for (const scenario of scenarios) {
    test(`scenario: ${scenario.name}`, async () => {
      const result = await runScenario(scenario);
      scenarioResults.set(scenario.name, result);
    }, 120_000);
  }

  test("coverage: all scenarios cover every supported component", async () => {
    const observedComponentTypes = new Set<string>();
    for (const scenario of scenarios) {
      const result = scenarioResults.get(scenario.name) ?? (await runScenario(scenario));
      scenarioResults.set(scenario.name, result);
      for (const type of result.componentTypes) {
        observedComponentTypes.add(type);
      }
    }
    assert.deepEqual(
      [...observedComponentTypes].sort(),
      [...LARK_CARD_COMPONENT_TYPES].sort(),
      "LLM scenarios must cover every supported component type",
    );
  }, 240_000);
});

async function runScenario(scenario: LlmScenario): Promise<ScenarioRunResult> {
  const guide = readFileSync(join(rootDir, "docs", "llm-authoring.md"), "utf8");
  const catalog = readFileSync(
    join(rootDir, "catalogs", "lark-card", "v0_8", "catalog.json"),
    "utf8",
  );
  const content = await generateWithLlm({
    system: [
      "You generate valid A2UI v0.8 JSON for the lark-card catalog.",
      "Follow the authoring guide exactly.",
      "Return JSON only.",
      "",
      guide,
      "",
      "Catalog JSON:",
      catalog,
    ].join("\n"),
    user: [
      scenario.prompt,
      "",
      `Required components for this scenario: ${scenario.requiredComponents.join(", ")}.`,
      "The output must validate against the renderer subset and must not use unsupported fields.",
    ].join("\n"),
  });
  const messages = extractJson(content);
  const validation = validateA2uiMessages(messages);
  const scenarioComponentTypes = collectComponentTypes(messages);

  console.log(`LLM scenario: ${scenario.name}`);
  console.log(JSON.stringify(messages, null, 2));
  console.log(`component types: ${[...scenarioComponentTypes].sort().join(", ")}`);

  assert.equal(validation.ok, true, formatValidationIssues(validation.issues));
  assertRequiredComponents(scenario.name, scenario.requiredComponents, scenarioComponentTypes);

  const store = new SurfaceStore();
  store.applyMessages(messages as A2uiServerMessage[]);
  let callbackBindingCount = 0;
  let normalizedFormCallbacks = 0;
  for (const surfaceId of validation.renderedSurfaceIds) {
    const surface = store.getSurface(surfaceId);
    const rendered = renderSurface(surface);
    callbackBindingCount += rendered.callbackBindings.length;
    console.log(`rendered ${surfaceId}: ${rendered.callbackBindings.length} callback binding(s)`);
    assert.equal(rendered.warnings.length, 0);
    if (scenario.requiresFormCallback === true) {
      normalizedFormCallbacks += normalizeGeneratedFormSubmits(surface);
    }
  }

  assert.ok(
    callbackBindingCount >= scenario.expectedMinimumBindings,
    `${scenario.name} expected at least ${scenario.expectedMinimumBindings} callback bindings, got ${callbackBindingCount}`,
  );
  if (scenario.requiresFormCallback === true) {
    assert.ok(
      normalizedFormCallbacks > 0,
      `${scenario.name} expected at least one form submit callback to normalize`,
    );
  }

  return {
    componentTypes: scenarioComponentTypes,
  };
}

async function generateWithLlm(input: { system: string; user: string }): Promise<string> {
  const apiKey = requireEnv("A2UI_LLM_API_KEY");
  const model = requireEnv("A2UI_LLM_MODEL");
  const endpoint =
    process.env.A2UI_LLM_CHAT_COMPLETIONS_URL ??
    `${(process.env.A2UI_LLM_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, "")}/chat/completions`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      messages: [
        {
          role: "system",
          content: input.system,
        },
        {
          role: "user",
          content: input.user,
        },
      ],
    }),
  });

  const body = (await response.json()) as unknown;
  if (!response.ok) {
    throw new Error(`LLM request failed with ${response.status}: ${JSON.stringify(body)}`);
  }

  const content = readChatCompletionContent(body);
  if (content == null || content.trim().length === 0) {
    throw new Error(`LLM response did not contain message content: ${JSON.stringify(body)}`);
  }
  return content;
}

function readChatCompletionContent(value: unknown): string | null {
  if (!isRecord(value) || !Array.isArray(value.choices)) {
    return null;
  }
  const choice = value.choices[0];
  if (!isRecord(choice) || !isRecord(choice.message)) {
    return null;
  }
  const content = choice.message.content;
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((part) => (isRecord(part) && typeof part.text === "string" ? part.text : ""))
      .join("");
  }
  return null;
}

function extractJson(content: string): unknown {
  const trimmed = content.trim();
  const parsed = tryParseJson(trimmed);
  if (parsed.ok) {
    return parsed.value;
  }

  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  if (fenced?.[1] != null) {
    const fencedParsed = tryParseJson(fenced[1].trim());
    if (fencedParsed.ok) {
      return fencedParsed.value;
    }
  }

  const start = trimmed.indexOf("[");
  const end = trimmed.lastIndexOf("]");
  if (start >= 0 && end > start) {
    const slicedParsed = tryParseJson(trimmed.slice(start, end + 1));
    if (slicedParsed.ok) {
      return slicedParsed.value;
    }
  }

  throw new Error(`Could not extract JSON array from LLM output:\n${content}`);
}

function tryParseJson(input: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return {
      ok: true,
      value: JSON.parse(input),
    };
  } catch {
    return {
      ok: false,
    };
  }
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value == null || value.length === 0) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function collectComponentTypes(messages: unknown): Set<string> {
  const types = new Set<string>();
  if (!Array.isArray(messages)) {
    return types;
  }
  for (const message of messages) {
    if (!isRecord(message) || !isRecord(message.surfaceUpdate)) {
      continue;
    }
    const components = message.surfaceUpdate.components;
    if (!Array.isArray(components)) {
      continue;
    }
    for (const node of components) {
      if (!isRecord(node) || !isRecord(node.component)) {
        continue;
      }
      for (const type of Object.keys(node.component)) {
        types.add(type);
      }
    }
  }
  return types;
}

function assertRequiredComponents(
  scenarioName: string,
  requiredComponents: string[],
  observedComponents: Set<string>,
): void {
  const missing = requiredComponents.filter((type) => !observedComponents.has(type));
  assert.deepEqual(missing, [], `${scenarioName} did not include required components`);
}

function normalizeGeneratedFormSubmits(surface: SurfaceState): number {
  let normalized = 0;
  for (const node of surface.components.values()) {
    const form = readComponentRef(surface, node.id);
    if (form.type !== "Form") {
      continue;
    }
    const submitId = typeof form.props.submit === "string" ? form.props.submit : null;
    if (submitId == null) {
      continue;
    }
    const submit = readComponentRef(surface, submitId);
    if (submit.type !== "Button") {
      continue;
    }
    const action = isRecord(submit.props.action) ? submit.props.action : null;
    const actionName = typeof action?.name === "string" ? action.name : null;
    if (actionName == null) {
      continue;
    }
    const callbackInput: NormalizedCallbackInput = {
      envelope: {
        __a2ui_lark: "v0_8",
        surfaceId: surface.surfaceId,
        sourceComponentId: submitId,
        actionName,
      },
      submittedValues: buildSubmittedValues(surface),
      timestamp: "2026-04-28T12:00:00.000Z",
    };
    const actionEvent = normalizeCallback(surface, callbackInput);
    assert.equal(actionEvent.userAction.sourceComponentId, submitId);
    assert.ok(Object.keys(actionEvent.userAction.context).length > 0);
    normalized += 1;
  }
  return normalized;
}

function buildSubmittedValues(surface: SurfaceState): Record<string, unknown> {
  const submittedValues: Record<string, unknown> = {};
  for (const node of surface.components.values()) {
    const component = readComponentRef(surface, node.id);
    if (
      component.type !== "TextField" &&
      component.type !== "MultipleChoice" &&
      component.type !== "DateTimeInput"
    ) {
      continue;
    }
    const name = typeof component.props.name === "string" ? component.props.name : null;
    if (name == null) {
      continue;
    }
    if (component.type === "MultipleChoice") {
      submittedValues[name] = readFirstOptionValue(component.props.options) ?? "normal";
      continue;
    }
    if (component.type === "DateTimeInput") {
      submittedValues[name] =
        component.props.enableTime === true && component.props.enableDate !== true
          ? "12:00"
          : "2026-05-07";
      continue;
    }
    submittedValues[name] = component.props.textFieldType === "number" ? "7" : "sample value";
  }
  return submittedValues;
}

function readFirstOptionValue(options: unknown): string | null {
  if (!Array.isArray(options)) {
    return null;
  }
  const first = options.find(isRecord);
  return first != null && typeof first.value === "string" ? first.value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value != null && !Array.isArray(value);
}
