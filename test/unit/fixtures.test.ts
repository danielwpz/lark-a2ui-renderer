import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "vitest";

import { normalizeCallback, renderSurface, SurfaceStore } from "../../src/v0_8/index.js";
import type { A2uiServerMessage, NormalizedCallbackInput } from "../../src/v0_8/index.js";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "../..");

describe("semantic fixtures", () => {
  test("confirm button callback normalizes to A2UI userAction", () => {
    const { store, callbackInput, expected } = loadFixture("confirm-button");
    const surface = store.getSurface("confirm_order");
    const rendered = renderSurface(surface);

    assert.equal(rendered.surfaceId, "confirm_order");
    assert.equal(rendered.callbackBindings.length, 1);
    assert.deepEqual(rendered.callbackBindings[0]?.envelope, callbackInput.envelope);
    assert.deepEqual(normalizeCallback(surface, callbackInput), expected);
  });

  test("form submit updates bound fields before resolving action context", () => {
    const { store, callbackInput, expected } = loadFixture("form-submit");
    const surface = store.getSurface("request_form");
    const rendered = renderSurface(surface);

    assert.equal(rendered.surfaceId, "request_form");
    assert.equal(rendered.callbackBindings.length, 1);
    assert.deepEqual(rendered.callbackBindings[0]?.envelope, callbackInput.envelope);
    assert.deepEqual(normalizeCallback(surface, callbackInput), expected);
  });

  test("component coverage fixture renders and normalizes complex form submit", () => {
    const { store, callbackInput, expected } = loadFixture("component-coverage");
    const surface = store.getSurface("component_coverage");
    const rendered = renderSurface(surface);

    assert.equal(rendered.surfaceId, "component_coverage");
    assert.equal(rendered.warnings.length, 0);
    assert.equal(rendered.callbackBindings.length, 3);
    assert.deepEqual(rendered.callbackBindings[0]?.envelope, callbackInput.envelope);
    assert.deepEqual(normalizeCallback(surface, callbackInput), expected);
  });

  test("renders MultipleChoice as multi-select when multiple selections are allowed", () => {
    const store = new SurfaceStore();
    store.applyMessages([
      {
        surfaceUpdate: {
          surfaceId: "multi_choice",
          components: [
            {
              id: "root",
              component: {
                Column: {
                  children: { explicitList: ["tags"] },
                },
              },
            },
            {
              id: "tags",
              component: {
                MultipleChoice: {
                  name: "tags",
                  label: { literalString: "Tags" },
                  selections: { path: "/form/tags" },
                  options: [
                    { label: { literalString: "A" }, value: "a" },
                    { label: { literalString: "B" }, value: "b" },
                  ],
                  maxAllowedSelections: 2,
                  variant: "checkbox",
                },
              },
            },
          ],
        },
      },
      {
        beginRendering: {
          surfaceId: "multi_choice",
          catalogId: "urn:a2ui:catalog:lark-card:v0_8",
          root: "root",
        },
      },
    ]);

    const rendered = renderSurface(store.getSurface("multi_choice"));

    assert.match(JSON.stringify(rendered.card), /"tag":"multi_select_static"/);
  });

  test("keeps radio MultipleChoice as single-select even with a higher max selection hint", () => {
    const store = new SurfaceStore();
    store.applyMessages([
      {
        surfaceUpdate: {
          surfaceId: "radio_choice",
          components: [
            {
              id: "root",
              component: {
                Column: {
                  children: { explicitList: ["priority"] },
                },
              },
            },
            {
              id: "priority",
              component: {
                MultipleChoice: {
                  name: "priority",
                  label: { literalString: "Priority" },
                  selections: { path: "/form/priority" },
                  options: [
                    { label: { literalString: "Normal" }, value: "normal" },
                    { label: { literalString: "High" }, value: "high" },
                  ],
                  maxAllowedSelections: 2,
                  variant: "radio",
                },
              },
            },
          ],
        },
      },
      {
        beginRendering: {
          surfaceId: "radio_choice",
          catalogId: "urn:a2ui:catalog:lark-card:v0_8",
          root: "root",
        },
      },
    ]);

    const rendered = renderSurface(store.getSurface("radio_choice"));

    assert.match(JSON.stringify(rendered.card), /"tag":"select_static"/);
    assert.doesNotMatch(JSON.stringify(rendered.card), /"tag":"multi_select_static"/);
  });
});

function loadFixture(name: string): {
  store: SurfaceStore;
  callbackInput: NormalizedCallbackInput;
  expected: unknown;
} {
  const fixtureDir = join(rootDir, "fixtures", name);
  const messages = readJson<A2uiServerMessage[]>(join(fixtureDir, "a2ui.messages.json"));
  const callbackInput = readJson<NormalizedCallbackInput>(
    join(fixtureDir, "normalized-callback-input.json"),
  );
  const expected = readJson<unknown>(join(fixtureDir, "expected-user-action.json"));
  const store = new SurfaceStore();
  store.applyMessages(messages);
  return { store, callbackInput, expected };
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}
