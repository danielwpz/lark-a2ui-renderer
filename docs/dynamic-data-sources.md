# Dynamic Data Sources Extension

This document describes an experimental extension on top of A2UI v0.8. It is
not part of the official A2UI v0.8 protocol and must be advertised as a custom
extension by any renderer or host that supports it.

The purpose is not to define a pixel clock. The purpose is to let an A2UI
surface declare where changing data comes from, while keeping components and
renderers independent from the concrete data-producing mechanism.

## Status

- Protocol base: A2UI v0.8.
- Extension id: `urn:a2ui:extension:dynamic-data:v0_1`.
- Current MVP driver target: `bash`.
- Current MVP trigger target: interval polling.
- Security policy fields are placeholders in the first implementation. They
  document intent but do not imply a complete sandbox.

## Mental Model

Dynamic data has three separate concepts:

```text
dataSource
  how fresh data is produced

dataModel
  the latest renderable state snapshot

component binding
  how UI properties read the latest state
```

Components do not call scripts. Components do not subscribe to bash, HTTP,
WebSocket, events, or Lark. Components only bind to paths in the data model.

The runtime is responsible for this loop:

```text
trigger fires
  -> run data source producer
  -> parse producer output
  -> write parsed output into dataModel
  -> notify host that the surface changed
  -> host re-renders and publishes an update
```

This keeps the declaration portable. A card that binds text to `/service/status`
does not care whether that value came from `curl`, `ps`, `date`, a database
query, an MCP tool, or a host-provided function.

## When To Use It

Use a dynamic data source when the UI must refresh without direct user input.

Good examples:

- A deployment status card that refreshes build state every second.
- A queue dashboard that polls pending jobs.
- A server health card that shows CPU, memory, and error rate.
- A countdown or current-time display.
- A task card whose available choices come from a command.
- A market or inventory card that periodically refreshes prices or stock.

Do not use a dynamic data source for static text, ordinary form input, or data
that only changes when the user clicks a button. Use normal `dataModelUpdate`,
forms, and `userAction` for those cases.

## Extension Message

The extension introduces a server-to-renderer message shape:

```json
{
  "dataSourceUpdate": {
    "surfaceId": "service_status",
    "extensionId": "urn:a2ui:extension:dynamic-data:v0_1",
    "sources": [
      {
        "id": "service",
        "driver": "bash",
        "trigger": {
          "type": "interval",
          "everyMs": 1000
        },
        "program": {
          "script": "printf '{\"status\":\"healthy\",\"updatedAt\":\"2026-04-29T10:00:00Z\"}'"
        },
        "output": {
          "format": "json",
          "target": "/service"
        },
        "policy": {
          "timeoutMs": 500,
          "maxOutputBytes": 4096,
          "network": false,
          "writeFs": false
        }
      }
    ]
  }
}
```

`dataSourceUpdate` declares producers. It is intentionally separate from
official v0.8 `dataModelUpdate`. A producer eventually causes data-model changes,
but the declaration itself does not render UI.

## Field Semantics

| Field | Meaning |
| --- | --- |
| `surfaceId` | The surface whose data model will receive updates. |
| `extensionId` | Must be `urn:a2ui:extension:dynamic-data:v0_1` when present. |
| `sources[].id` | Stable name for the data source, unique within the surface. |
| `driver` | Producer type. MVP supports only `bash`. |
| `trigger` | When to run the producer. MVP supports interval polling. |
| `program.script` | Inline bash program for the MVP. |
| `output.format` | Producer stdout format. MVP supports `json`. |
| `output.target` | JSON Pointer where parsed stdout is written in `dataModel`. |
| `policy` | Execution limits and intent. Full sandbox enforcement is future work. |

For interval updates, prefer `everyMs: 1000` unless the UI truly needs a
different cadence. Very frequent updates can hit chat-card platform limits.

## Bash Driver MVP

The first driver supports:

- `driver: "bash"`.
- `trigger.type: "interval"`.
- `program.script` as inline bash.
- stdout containing exactly one JSON value.
- `output.format: "json"`.
- `output.target` as a JSON Pointer.

The script should print the data shape that the UI wants to bind to. Prefer
fully materialized JSON over asking components to perform computation.

Good:

```json
{
  "service": "api",
  "status": "healthy",
  "latencyMs": 42,
  "updatedAt": "2026-04-29T10:00:00Z"
}
```

Avoid stdout that requires ad hoc parsing by the renderer:

```text
api healthy 42ms
```

If the producer fails, times out, or prints invalid JSON, the runtime should log
the error and avoid mutating the data model for that tick.

## Data Modeling Rules

Design the data model around UI bindings, not around how the command happens to
work internally.

Prefer stable object paths:

```json
{
  "service": {
    "name": "api",
    "status": "healthy",
    "latencyMs": 42
  }
}
```

Then bind UI properties with paths:

```json
{ "path": "/service/status" }
```

Use arrays when the UI naturally displays a list or matrix:

```json
{
  "jobs": [
    { "id": "build-1", "state": "running" },
    { "id": "build-2", "state": "queued" }
  ]
}
```

For the current v0.8 renderer subset, dynamic list templates are not implemented
yet. If the number of displayed items must vary, the producer can still write an
array into the data model, but the current renderer needs static components that
bind to known indexes such as `/jobs/0/state`.

## Component Binding Rules

`path` is not a function. It is a JSON Pointer into the latest data model.

Correct:

```json
{
  "Text": {
    "text": {
      "path": "/service/status"
    }
  }
}
```

Incorrect:

```json
{
  "Text": {
    "text": {
      "path": "bash:uptime"
    }
  }
}
```

If computation is needed, put it in the data source producer for the MVP. Future
versions may add explicit computed bindings, but this extension does not define
them yet.

## General Example: Service Status

This example refreshes a text card every second. It is intentionally not a pixel
display.

```json
[
  {
    "dataSourceUpdate": {
      "surfaceId": "service_status",
      "extensionId": "urn:a2ui:extension:dynamic-data:v0_1",
      "sources": [
        {
          "id": "service",
          "driver": "bash",
          "trigger": {
            "type": "interval",
            "everyMs": 1000
          },
          "program": {
            "script": "printf '{\"status\":\"healthy\",\"latencyMs\":42}'"
          },
          "output": {
            "format": "json",
            "target": "/service"
          },
          "policy": {
            "timeoutMs": 500,
            "maxOutputBytes": 4096
          }
        }
      ]
    }
  },
  {
    "dataModelUpdate": {
      "surfaceId": "service_status",
      "path": "/service",
      "contents": [
        {
          "key": "status",
          "valueString": "loading"
        },
        {
          "key": "latencyMs",
          "valueNumber": 0
        }
      ]
    }
  },
  {
    "surfaceUpdate": {
      "surfaceId": "service_status",
      "components": [
        {
          "id": "root",
          "component": {
            "Column": {
              "children": {
                "explicitList": ["title", "status", "latency"]
              }
            }
          }
        },
        {
          "id": "title",
          "component": {
            "Text": {
              "text": {
                "literalString": "Service status"
              }
            }
          }
        },
        {
          "id": "status",
          "component": {
            "Text": {
              "text": {
                "path": "/service/status"
              }
            }
          }
        },
        {
          "id": "latency",
          "component": {
            "Text": {
              "text": {
                "path": "/service/latencyMs"
              }
            }
          }
        }
      ]
    }
  },
  {
    "beginRendering": {
      "surfaceId": "service_status",
      "catalogId": "urn:a2ui:catalog:lark-card:v0_8",
      "root": "root"
    }
  }
]
```

## General Example: Static Dashboard Slots

Until dynamic child templates exist, use a fixed number of display slots and
bind them to stable indexes.

```json
{
  "dataSourceUpdate": {
    "surfaceId": "job_dashboard",
    "extensionId": "urn:a2ui:extension:dynamic-data:v0_1",
    "sources": [
      {
        "id": "jobs",
        "driver": "bash",
        "trigger": {
          "type": "interval",
          "everyMs": 1000
        },
        "program": {
          "script": "printf '{\"items\":[{\"label\":\"build\",\"state\":\"running\"},{\"label\":\"test\",\"state\":\"queued\"}]}'"
        },
        "output": {
          "format": "json",
          "target": "/jobs"
        }
      }
    ]
  }
}
```

Components can then bind to `/jobs/items/0/label`,
`/jobs/items/0/state`, `/jobs/items/1/label`, and so on.

## Specialized Example: Pixel Clock

Pixel displays are a special use case of dynamic data. The data source should
return the matrix directly:

```json
{
  "time": "09:46:23",
  "pixels": [
    ["#ffffff", "#ff4d4f", "#ff4d4f"],
    ["#ffffff", "#52c41a", "#ffffff"]
  ]
}
```

The `Grid` component reads the matrix through `cellBackgrounds`:

```json
{
  "Grid": {
    "rows": 7,
    "cols": 27,
    "cellSize": 16,
    "gap": 0,
    "backgroundColor": "#ffffff",
    "cellBackgrounds": {
      "path": "/clock/pixels"
    }
  }
}
```

`Grid` remains a layout container. Pixel display is only a use case.

## Runtime Contract

A channel-independent runtime can expose this small contract:

```ts
interface DynamicDataRuntime {
  applyDataSourceUpdate(update: DataSourceUpdate): void;
  start(surfaceId: string): void;
  stop(surfaceId: string): void;
}

interface DataSourceDriver {
  start(source: DataSourceDeclaration, ctx: DataSourceContext): Disposable;
}

interface DataSourceContext {
  updateDataModel(path: string, value: unknown): void;
  log(level: "debug" | "info" | "warn" | "error", message: string): void;
}

interface Disposable {
  dispose(): void;
}
```

The runtime owns data source lifecycles. The renderer remains a pure function
from current surface state to rendered channel output.

## Future Computed Bindings

Future versions may add computed bindings such as:

```json
{
  "text": {
    "call": "formatLatency",
    "args": {
      "value": {
        "path": "/service/latencyMs"
      }
    }
  }
}
```

That is intentionally out of scope for the first MVP. The first implementation
should prefer data producers that return fully materialized render data.

## Channel Responsibilities

The dynamic data extension does not define how a channel publishes updates.

For Feishu/Lark, the channel adapter is expected to:

1. Render the current surface to Lark Card JSON.
2. Create a CardKit card and send a message referencing `card_id`.
3. On data model changes, re-render the card.
4. Call CardKit `card.update` with a monotonically increasing sequence.

Lark-specific details such as `column_set`, `background_style`, Card JSON 2.0,
CardKit, and the observed card element budget belong to the Lark renderer or
adapter, not to this extension.
