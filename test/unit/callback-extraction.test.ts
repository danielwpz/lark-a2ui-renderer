import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "vitest";

import { extractLarkCallback, normalizeCallback, SurfaceStore } from "../../src/v0_8/index.js";
import type { A2uiServerMessage, CallbackEnvelope } from "../../src/v0_8/index.js";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "../..");
const callbackTimestamp = "2026-04-28T12:00:00.000Z";

describe("Lark callback extraction", () => {
  test("extracts official wrapper form callback and normalizes to A2UI userAction", () => {
    const surface = loadSurface("form-submit", "request_form");
    const expected = readFixtureJson("form-submit", "expected-user-action.json");
    const envelope: CallbackEnvelope = {
      __a2ui_lark: "v0_8",
      surfaceId: "request_form",
      sourceComponentId: "submit_button",
      actionName: "submit_form",
    };

    const callbackInput = extractLarkCallback({
      schema: "2.0",
      header: {
        create_time: String(Date.parse("2026-04-28T12:05:00.000Z") * 1000),
        event_type: "card.action.trigger",
      },
      event: {
        operator: {
          open_id: "test-open-id",
        },
        action: {
          value: envelope,
          tag: "button",
          name: "submit_button",
          form_value: {
            reason: "Looks good",
            priority: "high",
          },
        },
      },
    });

    assert.deepEqual(callbackInput, {
      envelope,
      submittedValues: {
        reason: "Looks good",
        priority: "high",
      },
      timestamp: "2026-04-28T12:05:00.000Z",
      operator: {
        open_id: "test-open-id",
      },
    });
    assert.deepEqual(normalizeCallback(surface, callbackInput), expected);
  });

  test("extracts SDK-style unwrapped button callback with stringified value", () => {
    const surface = loadSurface("confirm-button", "confirm_order");
    const expected = readFixtureJson("confirm-button", "expected-user-action.json");
    const envelope: CallbackEnvelope = {
      __a2ui_lark: "v0_8",
      surfaceId: "confirm_order",
      sourceComponentId: "confirm_button",
      actionName: "confirm",
    };

    const callbackInput = extractLarkCallback({
      operator: {
        open_id: "test-open-id",
      },
      action: {
        value: JSON.stringify(envelope),
        tag: "button",
        name: "confirm_button",
      },
      create_time: callbackTimestamp,
    });

    assert.deepEqual(callbackInput, {
      envelope,
      timestamp: callbackTimestamp,
      operator: {
        open_id: "test-open-id",
      },
    });
    assert.deepEqual(normalizeCallback(surface, callbackInput), expected);
  });

  test("rejects callbacks without the renderer envelope", () => {
    assert.throws(
      () =>
        extractLarkCallback({
          event: {
            action: {
              value: {
                unrelated: true,
              },
            },
          },
        }),
      /does not contain an A2UI callback envelope/,
    );
  });
});

function loadSurface(fixture: string, surfaceId: string) {
  const messages = readFixtureJson<A2uiServerMessage[]>(fixture, "a2ui.messages.json");
  const store = new SurfaceStore();
  store.applyMessages(messages);
  return store.getSurface(surfaceId);
}

function readFixtureJson<T = unknown>(fixture: string, filename: string): T {
  return JSON.parse(readFileSync(join(rootDir, "fixtures", fixture, filename), "utf8")) as T;
}
