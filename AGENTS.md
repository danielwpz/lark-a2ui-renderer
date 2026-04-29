# lark-a2ui-renderer Agent Guide

This directory is an experimental standalone TypeScript package for rendering a
constrained A2UI v0.8 subset into Feishu/Lark interactive card JSON.

## Project Goal

Build a reusable, application-independent renderer library:

1. Accept A2UI v0.8 server messages from an LLM or host application.
2. Validate the supported Lark-card catalog subset.
3. Maintain A2UI surface state.
4. Compile the surface into Feishu/Lark Card JSON 2.0.
5. Inject callback metadata for interactive controls.
6. Normalize callbacks into A2UI `userAction` events.

The package must not own application business logic, LLM calls in production,
message routing, persistence, or authorization decisions.

## Versioning

Follow the official A2UI renderer layout:

- `src/index.ts` re-exports the default supported version.
- `src/v0_8/` contains the current implementation.
- Future protocol versions must go into separate directories such as
  `src/v0_9/`; do not mix protocol implementations.
- Package exports include `.` and `./v0_8`.

Current target:

- A2UI protocol: v0.8 stable.
- Catalog id: `urn:a2ui:catalog:lark-card:v0_8`.
- v0.9 work is intentionally out of scope for now.
- Dynamic data sources and live pixel-grid rendering are custom experimental
  extensions on top of v0.8. Do not describe them as official A2UI v0.8
  behavior. See `docs/dynamic-data-sources.md`.

## Important Local Rules

- Use this package's own TypeScript toolchain. Do not run source through another
  repository's `node_modules`, `tsx`, or test runner.
- Do not commit changes unless explicitly asked.
- Do not invent Feishu/Lark raw callback payload shapes. Use official docs or
  capture real payloads with integration tests.
- Do not print secrets. In particular, avoid SDK logs that include request
  config containing `app_secret`.
- Keep probing scripts out of committed source. Use `.tmp/` or `test/integration`
  only when the probe itself is a deliberate integration test.

## Key Files

- `src/v0_8/types.ts`: A2UI subset and renderer contract types.
- `src/v0_8/surface.ts`: Applies A2UI v0.8 messages to surface state.
- `src/v0_8/render.ts`: Compiles A2UI surfaces into Feishu/Lark Card JSON.
- `src/v0_8/callback.ts`: Extracts Feishu/Lark `card.action.trigger`
  callbacks into normalized callback input and normalizes that into A2UI
  `userAction`.
- `src/v0_8/validate.ts`: Renderer-specific semantic validator.
- `catalogs/lark-card/v0_8/catalog.json`: Current supported A2UI catalog subset.
- `docs/llm-authoring.md`: Instruction sheet for LLM JSON generation tests.
- `docs/dynamic-data-sources.md`: Experimental channel-neutral datasource
  extension design. It must stay separate from Lark-specific CardKit behavior.
- `fixtures/`: Stable semantic fixtures.
- `skills/`: Distributable agent skill for authoring and validating this A2UI
  subset. It must stay usable without the full source repository.
- `scripts/sync-skill-runtime.js`: Copies compiled v0.8 runtime files into
  `skills/runtime/v0_8` for standalone skill distribution.
- `test/support/lark-case-matrix.ts`: Shared generated case matrix for offline
  and real Lark integration tests.
- `.env.integration.example`: Template for real LLM/Lark integration settings.

## Development Commands

Run from this directory:

```bash
pnpm install
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test:unit
pnpm build
```

Before committing, run:

```bash
pnpm precommit
```

`pnpm check` runs lint, format check, build, and unit tests.

`pnpm build` also refreshes the standalone skill runtime under
`skills/runtime/`. If `src/v0_8` changes, run `pnpm build` and commit the
updated runtime files with the source changes.

The skill body should remain user-facing and generic. Put protocol details and
examples under `skills/references/`; put repository maintenance notes here in
`AGENTS.md`, not in `skills/SKILL.md`.

Useful integration commands:

```bash
pnpm test:integration:llm
pnpm test:integration:lark
```

Integration tests load `.env.integration` automatically. Copy the template first:

```bash
cp .env.integration.example .env.integration
```

## LLM Integration

Current local LLM test configuration uses an OpenAI-compatible endpoint:

```env
RUN_A2UI_LLM_INTEGRATION=1
A2UI_LLM_MODEL=google/gemini-3-flash-preview
A2UI_LLM_BASE_URL=https://openrouter.ai/api/v1
```

The test sends `docs/llm-authoring.md` plus the catalog JSON, validates model
output, renders it, and checks callback bindings and component coverage.

## Feishu/Lark Integration

Real Lark integration tests send interactive cards to `LARK_CHAT_ID` from
`.env.integration`.

Relevant env:

```env
RUN_LARK_A2UI_INTEGRATION=1
LARK_APP_ID=
LARK_APP_SECRET=
LARK_CHAT_ID=
LARK_A2UI_MATRIX_FILTER=
LARK_A2UI_SEND_DELAY_MS=100
LARK_A2UI_LISTEN_CALLBACKS=0
```

`LARK_A2UI_MATRIX_FILTER` is a regex for rerunning one case or a subset:

```bash
LARK_A2UI_MATRIX_FILTER=deployment pnpm test:integration:lark
```

Useful fixture and callback options:

```env
LARK_A2UI_FIXTURE=form-submit
LARK_A2UI_SURFACE_ID=request_form
LARK_A2UI_PRINT_CARD_JSON=1
LARK_A2UI_LISTEN_CALLBACKS=1
LARK_A2UI_CALLBACK_TIMEOUT_MS=180000
LARK_A2UI_CALLBACK_OUTPUT=.tmp/lark-callback-result.json
A2UI_INTEGRATION_ENV_FILE=.env.integration
```

Network access to `open.feishu.cn` may need to run outside the sandbox.

## Runtime Flow

```text
LLM or host emits A2UI v0.8 messages
  -> SurfaceStore applies messages to a surface
  -> renderSurface compiles the surface to Lark Card JSON
  -> host app sends or updates the card
  -> user interacts with the card
  -> host app receives Lark card.action.trigger
  -> extractLarkCallback produces NormalizedCallbackInput
  -> normalizeCallback returns A2UI userAction
  -> host app routes userAction to business logic or an LLM
```

## Official Feishu/Lark Docs

Use the official LLM documentation index first:

- https://open.feishu.cn/llms.txt

Relevant entries:

- Feishu cards: https://open.feishu.cn/llms-docs/zh-CN/llms-feishu-card.txt
- Messaging: https://open.feishu.cn/llms-docs/zh-CN/llms-messaging.txt
- Events and callbacks: https://open.feishu.cn/llms-docs/zh-CN/llms-events-and-callbacks.txt
- Server-side SDK: https://open.feishu.cn/llms-docs/zh-CN/llms-server-side-sdk.txt
- Authentication and authorization: https://open.feishu.cn/llms-docs/zh-CN/llms-authenticate-and-authorize.txt

When a Feishu card component fails in real integration, check these docs before
changing renderer behavior.

## Known Lark Findings From Real Tests

These are observed against real Feishu/Lark APIs and must be respected until
official docs or later tests prove otherwise:

- A Lark Card JSON `form` element requires a non-empty `name`.
- The attempted `time_picker` tag was rejected by the real card API as
  unsupported.
- The real card API rejected `input_type: "number"` and `input_type: "email"`
  in the current form/input mapping with `invalid input type`. Keep the A2UI
  `TextField.textFieldType` semantics, but render those two as Lark
  `input_type: "text"` until official docs or later real tests prove a better
  mapping.
- Lark requires interactive component `name` values to be unique across the
  card. Do not render the same submit button both inside a `form` and again in
  an external action row.
- Node SDK message/event long connection works for bot DM messages and exposes
  `message.chat_id` in `im.message.receive_v1`.
- The current test DM chat id was discovered from a real message event; do not
  hard-code it into source code.

## Test Expectations

Offline unit tests must remain deterministic and fast:

- Validate every fixture.
- Validate the generated Lark case matrix.
- Assert at least 50 Lark matrix cases.
- Assert every supported catalog component is covered.
- Assert generated form submits can normalize into A2UI `userAction`.

Real Lark integration tests must exercise the same matrix by sending real cards.
If a matrix case fails against the Lark API, treat it as useful feedback about
the renderer mapping or catalog subset, not as noise to hide.

## Callback Boundary

The renderer-owned callback boundary is:

1. Renderer embeds a callback envelope in rendered button values.
2. `extractLarkCallback` converts official `card.action.trigger` payloads or
   SDK-unwrapped event objects into `NormalizedCallbackInput`.
3. `normalizeCallback` returns A2UI v0.8 `userAction`.

Do not pass raw Lark callbacks directly to the LLM. The LLM-facing object is the
normalized A2UI `userAction`.
