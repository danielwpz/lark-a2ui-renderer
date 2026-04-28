import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "vitest";

import { validateA2uiMessages } from "../../src/v0_8/index.js";
import type { A2uiServerMessage } from "../../src/v0_8/index.js";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "../..");

describe("A2UI message validator", () => {
  test("accepts shipped semantic fixtures", () => {
    for (const fixture of ["confirm-button", "form-submit"]) {
      const messages = readJson<A2uiServerMessage[]>(
        join(rootDir, "fixtures", fixture, "a2ui.messages.json"),
      );
      const result = validateA2uiMessages(messages);

      assert.deepEqual(result.issues, []);
      assert.equal(result.ok, true);
      assert.equal(result.renderedSurfaceIds.length, 1);
    }
  });

  test("rejects raw Lark card JSON", () => {
    const result = validateA2uiMessages({
      schema: "2.0",
      body: {
        elements: [],
      },
    });

    assert.equal(result.ok, false);
    assert.match(result.issues[0]?.message ?? "", /JSON array/);
  });

  test("rejects unsupported component types and broken references", () => {
    const result = validateA2uiMessages([
      {
        surfaceUpdate: {
          surfaceId: "bad_surface",
          components: [
            {
              id: "root",
              component: {
                Column: {
                  children: {
                    explicitList: ["missing_child"],
                  },
                },
              },
            },
            {
              id: "image",
              component: {
                Image: {
                  url: "https://example.com/image.png",
                },
              },
            },
          ],
        },
      },
      {
        beginRendering: {
          surfaceId: "bad_surface",
          catalogId: "urn:a2ui:catalog:lark-card:v0_8",
          root: "root",
        },
      },
    ]);

    assert.equal(result.ok, false);
    assert.ok(result.issues.some((issue) => issue.message.includes("Unsupported component type")));
  });
});

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}
