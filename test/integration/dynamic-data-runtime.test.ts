import assert from "node:assert/strict";
import { describe, test } from "vitest";

import {
  DYNAMIC_DATA_EXTENSION_ID,
  DynamicDataRuntime,
  LARK_CARD_CATALOG_ID,
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
    const header = readRecord(rendered.card.header);

    assert.equal(readRecord(leftElements[0]).content, "L");
    assert.equal(readRecord(rightElements[0]).content, "R");
    assert.equal(config.wide_screen_mode, true);
    assert.equal(grid.background_style, "default");
    assert.equal(wrapper.background_style, "default");
    assert.equal(firstRow.background_style, "default");
    assert.equal(typeof readRecord(header.title).content, "string");
    assert.ok(config.style != null);
  });

  test("renders full-width dashboard boxes inside weighted rows", () => {
    const messages: A2uiRuntimeMessage[] = [
      {
        surfaceUpdate: {
          surfaceId: "dashboard_surface",
          components: [
            {
              id: "root",
              component: {
                Column: {
                  gap: 12,
                  children: {
                    explicitList: ["header", "stats"],
                  },
                },
              },
            },
            {
              id: "header",
              component: {
                Box: {
                  backgroundColor: "#0B57D0",
                  padding: 14,
                  borderRadius: 12,
                  children: {
                    explicitList: ["header_text"],
                  },
                },
              },
            },
            {
              id: "header_text",
              component: {
                Text: {
                  text: {
                    literalString: "# GitHub Dashboard",
                  },
                },
              },
            },
            {
              id: "stats",
              component: {
                Row: {
                  gap: 12,
                  children: {
                    explicitList: ["issues_card", "prs_card"],
                  },
                },
              },
            },
            {
              id: "issues_card",
              component: {
                Box: {
                  backgroundColor: "#EAF2FF",
                  padding: 16,
                  children: {
                    explicitList: ["issues_title", "issues_count"],
                  },
                },
              },
            },
            {
              id: "prs_card",
              component: {
                Box: {
                  backgroundColor: "#FFF3E4",
                  padding: 16,
                  children: {
                    explicitList: ["prs_title", "prs_count"],
                  },
                },
              },
            },
            {
              id: "issues_title",
              component: {
                Text: {
                  text: {
                    literalString: "### Open Issues",
                  },
                },
              },
            },
            {
              id: "issues_count",
              component: {
                Text: {
                  text: {
                    literalString: "# 128",
                  },
                },
              },
            },
            {
              id: "prs_title",
              component: {
                Text: {
                  text: {
                    literalString: "### Open PRs",
                  },
                },
              },
            },
            {
              id: "prs_count",
              component: {
                Text: {
                  text: {
                    literalString: "# 17",
                  },
                },
              },
            },
          ],
        },
      },
      {
        beginRendering: {
          surfaceId: "dashboard_surface",
          catalogId: LARK_CARD_CATALOG_ID,
          root: "root",
        },
      },
    ];
    const validation = validateA2uiMessages(messages);
    assert.deepEqual(validation.issues, []);

    const store = new SurfaceStore();
    store.applyMessages(messages.filter(isCoreServerMessage));
    const rendered = renderSurface(store.getSurface("dashboard_surface"));
    const body = readRecord(rendered.card.body);
    const elements = readArray(body.elements);
    const rootColumnSet = readRecord(elements[0]);
    const rootColumn = readRecord(readArray(rootColumnSet.columns)[0]);
    const rootElements = readArray(rootColumn.elements);
    const headerBox = readRecord(rootElements[0]);
    const headerBoxColumn = readRecord(readArray(headerBox.columns)[0]);
    const statsRow = readRecord(rootElements[1]);
    const statColumns = readArray(statsRow.columns);
    const issuesColumn = readRecord(statColumns[0]);
    const prsColumn = readRecord(statColumns[1]);
    const issuesBox = readRecord(readArray(issuesColumn.elements)[0]);
    const issuesBoxColumn = readRecord(readArray(issuesBox.columns)[0]);
    const prsBox = readRecord(readArray(prsColumn.elements)[0]);
    const prsBoxColumn = readRecord(readArray(prsBox.columns)[0]);
    const config = readRecord(rendered.card.config);
    const style = readRecord(readRecord(config.style).color);

    assert.equal(rootColumn.vertical_spacing, "12px");
    assert.equal(statsRow.horizontal_spacing, "12px");
    assert.equal(issuesColumn.width, "weighted");
    assert.equal(prsColumn.width, "weighted");
    assert.equal(issuesColumn.weight, 1);
    assert.equal(prsColumn.weight, 1);
    assert.equal(headerBoxColumn.padding, "14px");
    assert.equal(issuesBoxColumn.padding, "16px");
    assert.equal(prsBoxColumn.padding, "16px");
    assert.notEqual(headerBoxColumn.background_style, "default");
    assert.notEqual(issuesBoxColumn.background_style, "default");
    assert.notEqual(prsBoxColumn.background_style, "default");
    assert.equal(Object.keys(style).length, 3);
  });

  test("keeps form surfaces flat when Column.gap is set", () => {
    const messages: A2uiRuntimeMessage[] = [
      {
        dataModelUpdate: {
          surfaceId: "choice_form_surface",
          path: "/",
          contents: [
            {
              key: "form",
              valueMap: [
                {
                  key: "answer",
                  valueMap: [{ key: "0", valueString: "a" }],
                },
              ],
            },
          ],
        },
      },
      {
        surfaceUpdate: {
          surfaceId: "choice_form_surface",
          components: [
            {
              id: "root",
              component: {
                Column: {
                  gap: 12,
                  children: {
                    explicitList: ["title", "form"],
                  },
                },
              },
            },
            {
              id: "title",
              component: {
                Text: {
                  text: {
                    literalString: "SBTI choice form",
                  },
                },
              },
            },
            {
              id: "form",
              component: {
                Form: {
                  children: {
                    explicitList: ["question", "answer"],
                  },
                  submit: "submit",
                },
              },
            },
            {
              id: "question",
              component: {
                Text: {
                  text: {
                    literalString: "Choose one answer.",
                  },
                },
              },
            },
            {
              id: "answer",
              component: {
                MultipleChoice: {
                  name: "answer",
                  label: {
                    literalString: "Answer",
                  },
                  selections: {
                    path: "/form/answer",
                  },
                  options: [
                    {
                      label: {
                        literalString: "A",
                      },
                      value: "a",
                    },
                    {
                      label: {
                        literalString: "B",
                      },
                      value: "b",
                    },
                  ],
                  maxAllowedSelections: 1,
                  variant: "select",
                  required: true,
                },
              },
            },
            {
              id: "submit_label",
              component: {
                Text: {
                  text: {
                    literalString: "Submit",
                  },
                },
              },
            },
            {
              id: "submit",
              component: {
                Button: {
                  child: "submit_label",
                  primary: true,
                  action: {
                    name: "submit_choice",
                    context: [],
                  },
                },
              },
            },
          ],
        },
      },
      {
        beginRendering: {
          surfaceId: "choice_form_surface",
          catalogId: LARK_CARD_CATALOG_ID,
          root: "root",
        },
      },
    ];
    const validation = validateA2uiMessages(messages);
    assert.deepEqual(validation.issues, []);

    const store = new SurfaceStore();
    store.applyMessages(messages.filter(isCoreServerMessage));
    const rendered = renderSurface(store.getSurface("choice_form_surface"));
    const body = readRecord(rendered.card.body);
    const elements = readArray(body.elements);
    const formElement = readRecord(elements[1]);
    const formElements = readArray(formElement.elements);

    assert.equal(readRecord(elements[0]).tag, "markdown");
    assert.equal(formElement.tag, "form");
    assert.equal(readRecord(formElements[0]).tag, "markdown");
    assert.equal(readRecord(formElements[1]).tag, "select_static");
    assert.equal(readRecord(formElements[2]).tag, "button");
  });

  test("renders empty pixel Grid cells at the known Lark-visible minimum size", () => {
    const messages: A2uiRuntimeMessage[] = [
      {
        surfaceUpdate: {
          surfaceId: "pixel_grid_surface",
          components: [
            {
              id: "grid",
              component: {
                Grid: {
                  rows: 1,
                  cols: 1,
                  cellSize: 10,
                  gap: 0,
                  backgroundColor: "#ffffff",
                  cellBackgrounds: {
                    path: "/grid/backgrounds",
                  },
                },
              },
            },
          ],
        },
      },
      {
        beginRendering: {
          surfaceId: "pixel_grid_surface",
          catalogId: LARK_CARD_LIVE_CATALOG_ID,
          root: "grid",
        },
      },
    ];
    const validation = validateA2uiMessages(messages, { allowDynamicDataSources: true });
    assert.deepEqual(validation.issues, []);

    const store = new SurfaceStore();
    store.applyMessages(messages.filter(isCoreServerMessage));
    store.updateDataModel("pixel_grid_surface", "/grid/backgrounds", [["#ff0000"]]);
    const rendered = renderSurface(store.getSurface("pixel_grid_surface"));
    const body = readRecord(rendered.card.body);
    const elements = readArray(body.elements);
    const grid = readRecord(elements[0]);
    const gridColumns = readArray(grid.columns);
    const wrapper = readRecord(gridColumns[0]);
    const wrapperElements = readArray(wrapper.elements);
    const firstRow = readRecord(wrapperElements[0]);
    const firstRowColumns = readArray(firstRow.columns);
    const firstCell = readRecord(firstRowColumns[0]);

    assert.equal(wrapper.width, "16px");
    assert.equal(firstCell.width, "16px");
    assert.equal(firstCell.padding, "8px 0px 8px 0px");
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
