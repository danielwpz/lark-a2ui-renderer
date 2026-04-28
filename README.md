# lark-a2ui-renderer

Experimental notes and catalog definition for a generic A2UI v0.8 renderer that
compiles A2UI surfaces into Feishu/Lark interactive cards.

This directory is intentionally documentation-first. The goal is to settle the
protocol boundary before writing a reusable package.

## Target

- A2UI protocol: v0.8 stable.
- Render target: Feishu/Lark Card JSON 2.0 interactive cards.
- Catalog: a constrained custom catalog for chat-card UI, not the full A2UI
  standard catalog.

## Versioned Entry Points

This package follows the same versioned source layout as the official React
renderer:

```ts
import { SurfaceStore, renderSurface } from "lark-a2ui-renderer/v0_8";
```

The root export currently re-exports `v0_8` for compatibility. New protocol
work should go under a separate directory such as `src/v0_9/` instead of mixing
versions.

## Scope

The renderer library should own:

- Validation of the supported A2UI v0.8 subset.
- Surface state: components, data model, begin-rendering root, and catalog id.
- Compilation from A2UI component graph to Feishu/Lark card JSON.
- Injection of callback metadata into buttons and form submit controls.
- Parsing Feishu/Lark card callbacks into A2UI v0.8 `userAction` events.

The renderer library should not own:

- Sending or updating Feishu/Lark messages through the OpenAPI.
- Calling an LLM.
- Application-specific routing, persistence, or business decisions.
- Directly forwarding raw Feishu/Lark callback payloads to the LLM.

## Catalog ID

For the local experiment the catalog uses:

```text
urn:a2ui:catalog:lark-card:v0_8
```

Before publishing a public library, replace this with a stable URI in the same
style as A2UI catalogs, for example a GitHub or owned-domain URL pointing at the
catalog file. The URI is an identifier for negotiation; it does not imply
runtime fetching.

## Files

- [catalogs/lark-card/v0_8/catalog.json](catalogs/lark-card/v0_8/catalog.json)
  defines the first A2UI v0.8 subset.
- [src/v0_8](src/v0_8) contains the v0.8 implementation. [src/index.ts](src/index.ts)
  only re-exports the default supported version.
- [docs/architecture.md](docs/architecture.md) defines library boundaries and
  the render pipeline.
- [docs/callbacks.md](docs/callbacks.md) defines callback normalization.
- [docs/catalog.md](docs/catalog.md) explains the catalog shape and component
  mapping.
- [docs/contracts.md](docs/contracts.md) defines the language-neutral API
  contract.
- [docs/llm-authoring.md](docs/llm-authoring.md) is the instruction sheet used
  by LLM integration tests to generate valid A2UI v0.8 JSON.
- [fixtures](fixtures) contains semantic fixtures shared by future language
  implementations.
- [schemas](schemas) contains library-owned JSON schemas for callback metadata.
- [docs/open-questions.md](docs/open-questions.md) lists items that need real
  Feishu/Lark docs or payloads before implementation.

## Development

This is a standalone TypeScript package. Use this directory's own toolchain.

```bash
pnpm install
pnpm typecheck
pnpm test:unit
pnpm build
```

Do not run this package with another repository's `node_modules` or test runner.

## LLM Integration Test

The LLM integration test checks whether a real model can follow the authoring
guide and generate valid A2UI v0.8 messages for this renderer. It is skipped
unless explicitly enabled and uses an OpenAI-compatible chat completions
endpoint.

Copy the example env file and fill in real values:

```bash
cp .env.integration.example .env.integration
```

Then set `RUN_A2UI_LLM_INTEGRATION=1` in `.env.integration` and run:

```bash
pnpm test:integration:llm
```

Optional endpoint configuration:

```bash
A2UI_LLM_MODEL=google/gemini-3-flash-preview
A2UI_LLM_BASE_URL=https://openrouter.ai/api/v1
A2UI_LLM_CHAT_COMPLETIONS_URL=https://openrouter.ai/api/v1/chat/completions
```

The test sends [docs/llm-authoring.md](docs/llm-authoring.md), the catalog JSON,
and scenario prompts to the model. It then parses the returned JSON, validates
the A2UI subset, applies it to a surface, renders it, and checks that expected
callback bindings exist.

## Feishu/Lark Integration Test

The Feishu/Lark integration test is interactive and skipped unless explicitly
enabled:

Set `RUN_LARK_A2UI_INTEGRATION=1` plus `LARK_APP_ID`, `LARK_APP_SECRET`, and
`LARK_CHAT_ID` in `.env.integration`, then run:

```bash
pnpm test:integration:lark
```

By default this sends the `confirm-button` fixture. To send another fixture:

```bash
LARK_A2UI_FIXTURE=form-submit
```

To keep the socket open and log a raw `card.action.trigger` callback after the
card is sent:

```bash
LARK_A2UI_LISTEN_CALLBACKS=1
```

Useful options:

```bash
LARK_A2UI_PRINT_CARD_JSON=1
LARK_A2UI_CALLBACK_TIMEOUT_MS=180000
LARK_A2UI_SURFACE_ID=request_form
```

Integration tests load `.env.integration` automatically. To use a different
file, set `A2UI_INTEGRATION_ENV_FILE` in the shell before running the test.

The current callback test intentionally prints the real raw Feishu/Lark payload
instead of normalizing it with guessed field paths. Once we have real payloads
from this test, the raw-payload extractor can be implemented and asserted
against the normalized callback fixtures.

## Basic Flow

```text
LLM emits A2UI v0.8 messages
  -> renderer applies messages to a surface
  -> renderer compiles the surface to Feishu/Lark Card JSON
  -> host app sends or updates the card
  -> user interacts with the card
  -> host app receives Feishu/Lark callback
  -> renderer normalizes callback into A2UI userAction
  -> host app routes the userAction to application logic or the LLM
```

The normalized event is the stable cross-platform contract:

```json
{
  "userAction": {
    "name": "confirm",
    "surfaceId": "confirm_order",
    "sourceComponentId": "confirm_button",
    "timestamp": "2026-04-28T12:00:00.000Z",
    "context": {
      "confirmed": true
    }
  }
}
```

## Current Open Point

This draft does not define the exact Feishu/Lark raw callback payload shape.
That should be added only after testing against official callback examples or
real application payloads. Until then, fixtures use the library's normalized
callback input shape rather than invented raw platform payloads.
