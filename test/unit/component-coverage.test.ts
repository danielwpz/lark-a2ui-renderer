import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "vitest";

import { LARK_CARD_COMPONENT_TYPES, validateA2uiMessages } from "../../src/v0_8/index.js";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "../..");

describe("catalog component coverage", () => {
  test("component-coverage fixture exercises every supported component type", () => {
    const messages = readJson(
      join(rootDir, "fixtures", "component-coverage", "a2ui.messages.json"),
    );
    const validation = validateA2uiMessages(messages);
    const observed = collectComponentTypes(messages);

    assert.equal(validation.ok, true);
    assert.deepEqual(
      [...observed].sort(),
      [...LARK_CARD_COMPONENT_TYPES].sort(),
      "The component-coverage fixture must include every supported catalog component",
    );
  });
});

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

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8")) as unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value != null && !Array.isArray(value);
}
