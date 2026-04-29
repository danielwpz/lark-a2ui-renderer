import assert from "node:assert/strict";
import { describe, test } from "vitest";

import {
  DYNAMIC_DATA_EXTENSION_ID,
  DynamicDataRuntime,
  LARK_CARD_LIVE_CATALOG_ID,
  renderSurface,
  SurfaceStore,
  validateA2uiMessages,
} from "../../src/v0_8/index.js";
import type { A2uiRuntimeMessage, A2uiServerMessage } from "../../src/v0_8/index.js";

describe("dynamic data source extension", () => {
  test("runs a bash data source once and updates the surface data model", async () => {
    const store = new SurfaceStore();
    const runtime = new DynamicDataRuntime(store);
    runtime.applyMessages([
      dataSourceMessage("dynamic_text", 'printf \'{"value":"hello from bash"}\''),
      {
        surfaceUpdate: {
          surfaceId: "dynamic_text",
          components: [
            {
              id: "root",
              component: {
                Text: {
                  text: {
                    path: "/result/value",
                  },
                },
              },
            },
          ],
        },
      },
      {
        beginRendering: {
          surfaceId: "dynamic_text",
          catalogId: "urn:a2ui:catalog:lark-card:v0_8",
          root: "root",
        },
      },
    ]);

    const event = await runtime.runSourceOnce("dynamic_text", "producer");
    const rendered = renderSurface(store.getSurface("dynamic_text"));
    const body = readRecord(rendered.card.body);
    const elements = readArray(body.elements);
    const textElement = readRecord(elements[0]);

    assert.deepEqual(event, {
      surfaceId: "dynamic_text",
      path: "/result",
      value: { value: "hello from bash" },
      sourceId: "producer",
    });
    assert.equal(textElement.content, "hello from bash");
  });

  test("starts and stops interval data sources", async () => {
    const store = new SurfaceStore();
    let changeCount = 0;
    const runtime = new DynamicDataRuntime(store, {
      onDataModelChange: () => {
        changeCount += 1;
      },
    });
    runtime.applyMessages(dataSourceMessage("interval_surface", "printf '{\"tick\":true}'", 20));

    const disposable = runtime.start("interval_surface");
    await waitFor(() => changeCount >= 2);
    disposable.dispose();
    const stoppedAt = changeCount;
    await sleep(60);

    assert.equal(changeCount, stoppedAt);
  });

  test("validates and renders Grid as a layout container with optional cell backgrounds", () => {
    const messages: A2uiRuntimeMessage[] = [
      {
        surfaceUpdate: {
          surfaceId: "grid_surface",
          components: [
            {
              id: "grid",
              component: {
                Grid: {
                  rows: 1,
                  cols: 2,
                  cellSize: 12,
                  gap: 0,
                  backgroundColor: "#ffffff",
                  cellBackgrounds: {
                    path: "/grid/backgrounds",
                  },
                  children: {
                    explicitList: ["left", "right"],
                  },
                },
              },
            },
            {
              id: "left",
              component: {
                Text: {
                  text: {
                    literalString: "L",
                  },
                },
              },
            },
            {
              id: "right",
              component: {
                Text: {
                  text: {
                    literalString: "R",
                  },
                },
              },
            },
          ],
        },
      },
      {
        beginRendering: {
          surfaceId: "grid_surface",
          catalogId: LARK_CARD_LIVE_CATALOG_ID,
          root: "grid",
        },
      },
    ];
    const validation = validateA2uiMessages(messages, { allowDynamicDataSources: true });
    assert.deepEqual(validation.issues, []);

    const store = new SurfaceStore();
    store.applyMessages(messages.filter(isCoreServerMessage));
    store.updateDataModel("grid_surface", "/grid/backgrounds", [["#ff0000", "#00ff00"]]);
    const rendered = renderSurface(store.getSurface("grid_surface"));
    const body = readRecord(rendered.card.body);
    const elements = readArray(body.elements);
    const grid = readRecord(elements[0]);
    const gridColumns = readArray(grid.columns);
    const wrapper = readRecord(gridColumns[0]);
    const wrapperElements = readArray(wrapper.elements);
    const firstRow = readRecord(wrapperElements[0]);
    const firstRowColumns = readArray(firstRow.columns);
    const leftCell = readRecord(firstRowColumns[0]);
    const rightCell = readRecord(firstRowColumns[1]);
    const leftElements = readArray(leftCell.elements);
    const rightElements = readArray(rightCell.elements);
    const config = readRecord(rendered.card.config);

    assert.equal(readRecord(leftElements[0]).content, "L");
    assert.equal(readRecord(rightElements[0]).content, "R");
    assert.ok(config.style != null);
  });
});

function dataSourceMessage(surfaceId: string, script: string, everyMs = 1000): A2uiRuntimeMessage {
  return {
    dataSourceUpdate: {
      surfaceId,
      extensionId: DYNAMIC_DATA_EXTENSION_ID,
      sources: [
        {
          id: "producer",
          driver: "bash",
          trigger: {
            type: "interval",
            everyMs,
          },
          program: {
            script,
          },
          output: {
            format: "json",
            target: "/result",
          },
          policy: {
            timeoutMs: 500,
            maxOutputBytes: 4096,
          },
        },
      ],
    },
  };
}

async function waitFor(predicate: () => boolean): Promise<void> {
  const startedAt = Date.now();
  while (!predicate()) {
    if (Date.now() - startedAt > 1000) {
      throw new Error("Timed out waiting for predicate");
    }
    await sleep(10);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isCoreServerMessage(message: A2uiRuntimeMessage): message is A2uiServerMessage {
  return !("dataSourceUpdate" in message);
}

function readRecord(value: unknown): Record<string, unknown> {
  assert.equal(typeof value, "object");
  assert.notEqual(value, null);
  assert.equal(Array.isArray(value), false);
  return value as Record<string, unknown>;
}

function readArray(value: unknown): unknown[] {
  assert.ok(Array.isArray(value));
  return value;
}
