import assert from "node:assert/strict";
import { describe, test } from "vitest";
import "./load-integration-env.js";

import {
  DYNAMIC_DATA_EXTENSION_ID,
  DynamicDataRuntime,
  formatValidationIssues,
  LarkLiveCardPublisher,
  SurfaceStore,
  validateA2uiMessages,
} from "../../src/v0_8/index.js";
import type {
  A2uiRuntimeMessage,
  LarkLiveCardKitClient,
  LarkLiveImClient,
} from "../../src/v0_8/index.js";

interface MockCardCreate {
  card: Record<string, unknown>;
}

interface MockMessageCreate {
  content: unknown;
}

interface MockCardUpdate {
  cardId: string;
  sequence: number;
  card: Record<string, unknown>;
  at: number;
}

describe("Lark live dynamic data integration", () => {
  test("mock CardKit path publishes and updates a dynamic card every second", async () => {
    const messages = buildDynamicServiceStatusMessages();
    const validation = validateA2uiMessages(messages, { allowDynamicDataSources: true });
    assert.equal(validation.ok, true, formatValidationIssues(validation.issues));

    const store = new SurfaceStore();
    const mock = createMockLarkClients();
    const runtimeErrors: string[] = [];
    const publisher = new LarkLiveCardPublisher({
      im: mock.im,
      cardkit: mock.cardkit,
      chatId: "mock_chat",
    });
    const runtime = new DynamicDataRuntime(store, {
      onDataModelChange: async (event) => {
        await publisher.updateSurface(store.getSurface(event.surfaceId));
      },
      log: (_level, message) => {
        runtimeErrors.push(message);
      },
    });

    runtime.applyMessages(messages);
    await publisher.publishSurface(store.getSurface("service_status"));
    const disposable = runtime.start("service_status");
    await waitFor(() => mock.updates.length >= 5 || runtimeErrors.length > 0, 7500);
    disposable.dispose();
    assert.deepEqual(runtimeErrors, []);

    assert.equal(mock.creates.length, 1);
    assert.equal(mock.messages.length, 1);
    assert.equal(mock.updates[0]?.sequence, 2);
    assert.equal(mock.updates[1]?.sequence, 3);
    assert.equal(mock.updates[4]?.sequence, 6);
    assert.ok((mock.updates[1]?.at ?? 0) - (mock.updates[0]?.at ?? 0) >= 900);
    assert.match(JSON.stringify(mock.updates.at(-1)?.card), /healthy/);
    assert.match(JSON.stringify(mock.updates.at(-1)?.card), /update \d+ at/);
  }, 5000);
});

test.skipIf(process.env.RUN_LARK_A2UI_DYNAMIC_INTEGRATION !== "1")(
  "sends and updates a dynamic card through real Feishu/Lark CardKit",
  async () => {
    const messages = buildDynamicServiceStatusMessages();
    const validation = validateA2uiMessages(messages, { allowDynamicDataSources: true });
    assert.equal(validation.ok, true, formatValidationIssues(validation.issues));

    const store = new SurfaceStore();
    const { im, cardkit, chatId } = await getRealLarkClients();
    const publisher = new LarkLiveCardPublisher({ im, cardkit, chatId });
    let updateCount = 0;
    const runtime = new DynamicDataRuntime(store, {
      onDataModelChange: async (event) => {
        await publisher.updateSurface(store.getSurface(event.surfaceId));
        updateCount += 1;
      },
    });

    runtime.applyMessages(messages);
    await publisher.publishSurface(store.getSurface("service_status"));
    const disposable = runtime.start("service_status");
    await waitFor(() => updateCount >= 5, 7500);
    disposable.dispose();
  },
  30_000,
);

function buildDynamicServiceStatusMessages(): A2uiRuntimeMessage[] {
  return [
    {
      dataSourceUpdate: {
        surfaceId: "service_status",
        extensionId: DYNAMIC_DATA_EXTENSION_ID,
        sources: [
          {
            id: "service",
            driver: "bash",
            trigger: {
              type: "interval",
              everyMs: 1000,
            },
            program: {
              script: buildAppendLogScript(),
            },
            output: {
              format: "json",
              target: "/service",
            },
            policy: {
              timeoutMs: 2000,
              maxOutputBytes: 4096,
            },
          },
        ],
      },
    },
    {
      dataModelUpdate: {
        surfaceId: "service_status",
        path: "/service",
        contents: [
          {
            key: "status",
            valueString: "loading",
          },
          {
            key: "latencyMs",
            valueNumber: 0,
          },
          {
            key: "updatedAt",
            valueString: "pending",
          },
          {
            key: "log",
            valueString: "waiting for updates",
          },
        ],
      },
    },
    {
      surfaceUpdate: {
        surfaceId: "service_status",
        components: [
          {
            id: "root",
            component: {
              Column: {
                children: {
                  explicitList: ["title", "status", "latency", "updated_at", "log"],
                },
              },
            },
          },
          {
            id: "title",
            component: {
              Text: {
                text: {
                  literalString: "Service status",
                },
              },
            },
          },
          {
            id: "status",
            component: {
              Text: {
                text: {
                  path: "/service/status",
                },
              },
            },
          },
          {
            id: "latency",
            component: {
              Text: {
                text: {
                  path: "/service/latencyMs",
                },
              },
            },
          },
          {
            id: "updated_at",
            component: {
              Text: {
                text: {
                  path: "/service/updatedAt",
                },
              },
            },
          },
          {
            id: "log",
            component: {
              Text: {
                text: {
                  path: "/service/log",
                },
              },
            },
          },
        ],
      },
    },
    {
      beginRendering: {
        surfaceId: "service_status",
        catalogId: "urn:a2ui:catalog:lark-card:v0_8",
        root: "root",
      },
    },
  ];
}

function buildAppendLogScript(): string {
  const js = [
    'const fs = require("node:fs");',
    'const path = ".tmp/lark-live-dynamic-service-status.log";',
    'fs.mkdirSync(".tmp", { recursive: true });',
    'const now = new Intl.DateTimeFormat("en-US", { hour12: false, timeZone: "Asia/Shanghai", hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date());',
    'const previous = fs.existsSync(path) ? fs.readFileSync(path, "utf8").split(/\\r?\\n/).filter(Boolean) : [];',
    "const next = previous.length + 1;",
    "const lines = [...previous, `update ${next} at ${now}`];",
    'fs.writeFileSync(path, `${lines.join("\\n")}\\n`);',
    'console.log(JSON.stringify({ status: "healthy", latencyMs: 40 + next, updatedAt: `last update at ${now}`, log: lines.slice(-8).join("\\n") }));',
  ].join("\n");
  return `node -e ${shellQuote(js)}`;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function createMockLarkClients(): {
  im: LarkLiveImClient;
  cardkit: LarkLiveCardKitClient;
  creates: MockCardCreate[];
  messages: MockMessageCreate[];
  updates: MockCardUpdate[];
} {
  const creates: MockCardCreate[] = [];
  const messages: MockMessageCreate[] = [];
  const updates: MockCardUpdate[] = [];
  return {
    creates,
    messages,
    updates,
    cardkit: {
      async create(input) {
        creates.push({
          card: JSON.parse(input.data.data) as Record<string, unknown>,
        });
        return {
          data: {
            card_id: "mock_card_id",
          },
        };
      },
      async update(input) {
        updates.push({
          cardId: input.path.card_id,
          sequence: input.data.sequence,
          card: JSON.parse(input.data.card.data) as Record<string, unknown>,
          at: Date.now(),
        });
        return {
          code: 0,
        };
      },
    },
    im: {
      message: {
        async create(input) {
          messages.push({
            content: JSON.parse(input.data.content) as unknown,
          });
          return {
            data: {
              message_id: "mock_message_id",
            },
          };
        },
      },
    },
  };
}

async function getRealLarkClients(): Promise<{
  im: LarkLiveImClient;
  cardkit: LarkLiveCardKitClient;
  chatId: string;
}> {
  const Lark = (await import(
    process.env.LARK_NODE_SDK_MODULE ?? "@larksuiteoapi/node-sdk"
  )) as unknown as {
    Client: new (options: {
      appId: string;
      appSecret: string;
      logger?: unknown;
      loggerLevel?: unknown;
    }) => {
      im: LarkLiveImClient;
      cardkit?: {
        v1?: {
          card?: LarkLiveCardKitClient;
        };
      };
    };
    LoggerLevel?: {
      error?: unknown;
    };
  };
  const client = new Lark.Client({
    appId: requireEnv("LARK_APP_ID"),
    appSecret: requireEnv("LARK_APP_SECRET"),
    logger: {
      debug() {},
      error() {},
      info() {},
      trace() {},
      warn() {},
    },
    loggerLevel: Lark.LoggerLevel?.error,
  });
  const cardkit = client.cardkit?.v1?.card;
  if (cardkit == null) {
    throw new Error("Lark CardKit client is not available");
  }
  return {
    im: client.im,
    cardkit,
    chatId: requireEnv("LARK_CHAT_ID"),
  };
}

async function waitFor(predicate: () => boolean, timeoutMs: number): Promise<void> {
  const startedAt = Date.now();
  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error("Timed out waiting for predicate");
    }
    await sleep(20);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value == null || value.length === 0) {
    throw new Error(`${name} is required`);
  }
  return value;
}
