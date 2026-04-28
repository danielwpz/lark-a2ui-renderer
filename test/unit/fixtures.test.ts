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
