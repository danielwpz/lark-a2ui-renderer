import {
  LARK_CARD_CATALOG_ID,
  normalizeCallback,
  readComponentRef,
  renderSurface,
  SurfaceStore,
  validateA2uiMessages,
} from "../../src/v0_8/index.js";
import type {
  A2uiComponentNode,
  A2uiServerMessage,
  DataEntry,
  NormalizedCallbackInput,
  RenderResult,
  SurfaceState,
} from "../../src/v0_8/index.js";

export interface LarkMatrixCase {
  id: string;
  title: string;
  expectedComponents: string[];
  expectedMinimumBindings: number;
  messages: A2uiServerMessage[];
}

export interface PreparedLarkCase {
  testCase: LarkMatrixCase;
  rendered: RenderResult;
  normalizedFormSubmitCount: number;
}

interface TextLayoutInput {
  id: string;
  title: string;
  dataText?: string;
  text?: string;
  extra?: readonly string[];
  nested?: boolean;
  row?: string;
  divider?: boolean;
  summary?: string;
}

interface ButtonLayoutInput {
  id: string;
  title: string;
  kind?: "default" | "primary" | "danger";
  count?: number;
  literalContext?: boolean;
  pathContext?: boolean;
  pathLabel?: boolean;
  longLabel?: boolean;
  divider?: boolean;
  nested?: boolean;
  cancelConfirm?: boolean;
}

const textLayouts: TextLayoutInput[] = [
  { id: "text_literal", title: "literal text card" },
  { id: "text_path", title: "path-bound text card", dataText: "Path-bound title" },
  { id: "text_markdown", title: "markdown text card", text: "**Markdown** body with _emphasis_." },
  { id: "column_two_texts", title: "column with two texts", extra: ["secondary copy"] },
  { id: "column_nested", title: "nested column", nested: true },
  { id: "row_two_texts_start", title: "row two texts start", row: "start" },
  { id: "row_two_texts_center", title: "row two texts center", row: "center" },
  { id: "row_two_texts_end", title: "row two texts end", row: "end" },
  { id: "divider_text_sections", title: "divider between text sections", divider: true },
  { id: "summary_style", title: "summary style card", summary: "custom summary" },
  {
    id: "mixed_column_row",
    title: "mixed column and row layout",
    row: "center",
    extra: ["row below"],
  },
  {
    id: "long_text",
    title: "long text card",
    text: "This card exercises longer body text so card wrapping and markdown rendering are covered without relying on browser layout.",
  },
] as const;

const buttonLayouts: ButtonLayoutInput[] = [
  { id: "button_default", title: "default button", kind: "default" },
  { id: "button_primary", title: "primary button", kind: "primary" },
  { id: "button_danger", title: "danger button", kind: "danger" },
  { id: "button_two_actions", title: "two action buttons", count: 2 },
  { id: "button_three_actions", title: "three action buttons", count: 3 },
  { id: "button_literal_context", title: "literal context button", literalContext: true },
  { id: "button_path_context", title: "path context button", pathContext: true },
  { id: "button_path_label", title: "path label button", pathLabel: true },
  { id: "button_long_label", title: "long label button", longLabel: true },
  { id: "button_divided_actions", title: "divided action section", divider: true, count: 2 },
  { id: "button_nested_layout", title: "button nested layout", nested: true, count: 2 },
  { id: "button_cancel_confirm", title: "cancel confirm buttons", count: 2, cancelConfirm: true },
] as const;

const textFieldTypes = [
  "shortText",
  "longText",
  "number",
  "obscured",
  "email",
  "shortText_placeholder",
  "longText_max",
  "number_required",
  "email_required",
  "obscured_required",
  "two_text_fields",
  "literal_default_text",
] as const;

const choiceDateCases = [
  "choice_select_normal_high",
  "choice_select_three_options",
  "choice_checkbox_variant",
  "choice_chips_variant",
  "choice_required",
  "date_picker",
  "time_picker",
  "date_time_hint",
  "choice_and_date_form",
  "choice_with_action_row",
  "date_literal_value",
  "choice_bound_array",
] as const;

const complexCases = [
  "deployment_review_all_components",
  "incident_triage_all_components",
  "survey_followup_all_components",
  "task_creation_all_components",
  "rollback_request_all_components",
  "bug_report_all_components",
  "meeting_followup_all_components",
  "expense_approval_all_components",
  "access_request_all_components",
  "release_checklist_all_components",
  "support_escalation_all_components",
  "oncall_handoff_all_components",
] as const;

export const larkCaseMatrix: LarkMatrixCase[] = [
  ...textLayouts.map(buildTextLayoutCase),
  ...buttonLayouts.map(buildButtonCase),
  ...textFieldTypes.map(buildTextFieldCase),
  ...choiceDateCases.map(buildChoiceDateCase),
  ...complexCases.map(buildComplexCase),
];

export function prepareLarkCase(testCase: LarkMatrixCase): PreparedLarkCase {
  const validation = validateA2uiMessages(testCase.messages);
  if (!validation.ok) {
    throw new Error(validation.issues.map((issue) => issue.message).join("\n"));
  }
  const store = new SurfaceStore();
  store.applyMessages(testCase.messages);
  const surfaceId = validation.renderedSurfaceIds[0];
  if (surfaceId == null) {
    throw new Error(`Case '${testCase.id}' has no renderable surface`);
  }
  const surface = store.getSurface(surfaceId);
  const rendered = renderSurface(surface);
  if (rendered.warnings.length > 0) {
    throw new Error(
      `Case '${testCase.id}' rendered warnings: ${JSON.stringify(rendered.warnings)}`,
    );
  }
  return {
    testCase,
    rendered,
    normalizedFormSubmitCount: normalizeGeneratedFormSubmits(surface),
  };
}

export function collectCaseComponentTypes(testCase: LarkMatrixCase): Set<string> {
  const types = new Set<string>();
  for (const message of testCase.messages) {
    if (!("surfaceUpdate" in message)) {
      continue;
    }
    for (const node of message.surfaceUpdate.components) {
      for (const type of Object.keys(node.component)) {
        types.add(type);
      }
    }
  }
  return types;
}

function buildTextLayoutCase(input: TextLayoutInput): LarkMatrixCase {
  const surfaceId = `matrix_${input.id}`;
  const components: A2uiComponentNode[] = [];
  const rootChildren = ["title"];
  const data =
    input.dataText == null ? [] : [entryMap("copy", [entryString("title", input.dataText)])];

  components.push(
    column("root", rootChildren),
    text(
      "title",
      input.dataText == null ? (input.text ?? input.title) : undefined,
      "body",
      input.dataText == null ? undefined : "/copy/title",
    ),
  );

  if (input.extra != null) {
    for (const [index, copy] of input.extra.entries()) {
      const id = `extra_${index}`;
      rootChildren.push(id);
      components.push(text(id, copy));
    }
  }
  if (input.nested === true) {
    rootChildren.push("nested_column");
    components.push(
      column("nested_column", ["nested_text"]),
      text("nested_text", "Nested column text"),
    );
  }
  if (input.row != null) {
    rootChildren.push("layout_row");
    components.push(row("layout_row", ["left_text", "right_text"], input.row));
    components.push(text("left_text", "Left"), text("right_text", "Right"));
  }
  if (input.divider === true) {
    rootChildren.push("divider", "after_divider");
    components.push(divider("divider"), text("after_divider", "Section after divider"));
  }

  const options: { summary?: string; expectedComponents: string[] } = {
    expectedComponents:
      input.row != null
        ? ["Text", "Column", "Row"]
        : input.divider === true
          ? ["Text", "Column", "Divider"]
          : ["Text", "Column"],
  };
  if (input.summary != null) {
    options.summary = input.summary;
  }
  return caseFrom(surfaceId, input.title, components, data, options);
}

function buildButtonCase(input: ButtonLayoutInput): LarkMatrixCase {
  const surfaceId = `matrix_${input.id}`;
  const components: A2uiComponentNode[] = [column("root", ["title"])];
  const root = components[0];
  if (root == null) {
    throw new Error("Button case root was not initialized");
  }
  const rootChildren = readChildren(root);
  const data =
    input.pathContext === true || input.pathLabel === true
      ? [entryMap("request", [entryString("id", "REQ-42"), entryString("label", "Path Label")])]
      : [];

  components.push(text("title", input.title));
  if (input.divider === true) {
    rootChildren.push("divider");
    components.push(divider("divider"));
  }
  if (input.nested === true) {
    rootChildren.push("nested_column");
    components.push(column("nested_column", ["actions"]));
  } else {
    rootChildren.push("actions");
  }

  const actionCount = input.count ?? 1;
  const actionIds: string[] = [];
  for (let index = 0; index < actionCount; index += 1) {
    const labelId = `button_${index}_label`;
    const buttonId = `button_${index}`;
    actionIds.push(buttonId);
    components.push(
      text(
        labelId,
        input.longLabel === true
          ? "Confirm this unusually long operation label"
          : input.cancelConfirm === true && index === 0
            ? "Cancel"
            : input.pathLabel === true
              ? undefined
              : `Action ${index + 1}`,
        undefined,
        input.pathLabel === true ? "/request/label" : undefined,
      ),
      button(buttonId, labelId, `action_${index + 1}`, {
        primary: input.kind === "primary" || index === 0,
        danger: input.kind === "danger" || (input.cancelConfirm === true && index === 0),
        context:
          input.pathContext === true
            ? [{ key: "requestId", value: { path: "/request/id" } }]
            : input.literalContext === true
              ? [
                  { key: "literalString", value: { literalString: "ok" } },
                  { key: "literalNumber", value: { literalNumber: 7 } },
                  { key: "literalBoolean", value: { literalBoolean: true } },
                ]
              : [{ key: "buttonIndex", value: { literalNumber: index } }],
      }),
    );
  }
  components.push(row("actions", actionIds, "end"));

  return caseFrom(surfaceId, input.title, components, data, {
    expectedBindings: actionCount,
    expectedComponents: ["Text", "Column", "Row", "Button"],
  });
}

function buildTextFieldCase(input: (typeof textFieldTypes)[number]): LarkMatrixCase {
  const surfaceId = `matrix_${input}`;
  const fieldSpecs =
    input === "two_text_fields"
      ? [
          { id: "field_0", name: "summary", type: "shortText", path: "/form/summary" },
          { id: "field_1", name: "details", type: "longText", path: "/form/details" },
        ]
      : [
          {
            id: "field_0",
            name: "value",
            type: normalizeTextFieldType(input),
            path: "/form/value",
          },
        ];
  const children = fieldSpecs.map((field) => field.id);
  const components: A2uiComponentNode[] = [
    column("root", ["title", "form"]),
    text("title", `TextField case ${input}`),
    form("form", children, "submit_button"),
    text("submit_label", "Submit"),
    button("submit_button", "submit_label", "submit_text_field", {
      primary: true,
      context: fieldSpecs.map((field) => ({ key: field.name, value: { path: field.path } })),
    }),
  ];
  for (const field of fieldSpecs) {
    const options: {
      textFieldType: string;
      required: boolean;
      placeholder?: string;
      maxLength?: number;
      literalText?: string;
    } = {
      textFieldType: field.type,
      required: input.includes("required"),
    };
    if (input.includes("placeholder")) {
      options.placeholder = "Enter a value";
    }
    if (input.includes("max")) {
      options.maxLength = 500;
    }
    if (input === "literal_default_text") {
      options.literalText = "literal default";
    }
    components.push(textField(field.id, field.name, field.name, field.path, options));
  }
  return caseFrom(surfaceId, `TextField ${input}`, components, formData(fieldSpecs), {
    expectedBindings: 1,
    expectedComponents: ["Text", "Column", "Form", "TextField", "Button"],
  });
}

function buildChoiceDateCase(input: (typeof choiceDateCases)[number]): LarkMatrixCase {
  const surfaceId = `matrix_${input}`;
  const fields: A2uiComponentNode[] = [];
  const fieldIds: string[] = [];
  const context = [];
  const dataEntries: DataEntry[] = [];

  if (input.startsWith("choice") || input === "choice_and_date_form") {
    fieldIds.push("choice_field");
    context.push({ key: "choice", value: { path: "/form/choice" } });
    dataEntries.push(entryMap("choice", [entryString("0", "normal")]));
    fields.push(
      multipleChoice("choice_field", "choice", "Choice", "/form/choice", {
        variant: input.includes("checkbox")
          ? "checkbox"
          : input.includes("chips")
            ? "chips"
            : "select",
        required: input.includes("required"),
        options:
          input.includes("three") || input === "choice_and_date_form"
            ? ["normal", "high", "urgent"]
            : ["normal", "high"],
      }),
    );
  }
  if (input.includes("date") || input.includes("time")) {
    fieldIds.push("date_field");
    context.push({ key: "date", value: { path: "/form/date" } });
    dataEntries.push(entryString("date", input === "time_picker" ? "12:00" : "2026-05-07"));
    const dateOptions: { enableDate: boolean; enableTime: boolean; literalValue?: string } = {
      enableDate: input !== "time_picker",
      enableTime: input === "time_picker" || input === "date_time_hint",
    };
    if (input === "date_literal_value") {
      dateOptions.literalValue = "2026-05-09";
    }
    fields.push(dateTimeInput("date_field", "date", "Date", "/form/date", dateOptions));
  }

  const rootChildren =
    input === "choice_with_action_row" ? ["title", "form", "actions"] : ["title", "form"];
  const components: A2uiComponentNode[] = [
    column("root", rootChildren),
    text("title", `Choice/date case ${input}`),
    form("form", fieldIds, "submit_button"),
    ...fields,
    text("submit_label", "Submit"),
    button("submit_button", "submit_label", "submit_choice_date", {
      primary: true,
      context,
    }),
  ];
  if (input === "choice_with_action_row") {
    components.push(
      row("actions", ["secondary_button"], "end"),
      text("secondary_label", "Secondary"),
      button("secondary_button", "secondary_label", "secondary_choice_action", {
        context: [{ key: "secondary", value: { literalBoolean: true } }],
      }),
    );
  }

  return caseFrom(surfaceId, `Choice/date ${input}`, components, [entryMap("form", dataEntries)], {
    expectedBindings: input === "choice_with_action_row" ? 2 : 1,
    expectedComponents: [
      "Text",
      "Column",
      ...(input === "choice_with_action_row" ? ["Row"] : []),
      "Form",
      "Button",
      ...(fields.some((field) => "MultipleChoice" in field.component) ? ["MultipleChoice"] : []),
      ...(fields.some((field) => "DateTimeInput" in field.component) ? ["DateTimeInput"] : []),
    ],
  });
}

function buildComplexCase(input: (typeof complexCases)[number]): LarkMatrixCase {
  const surfaceId = `matrix_${input}`;
  const title = input.replace(/_/g, " ");
  const components: A2uiComponentNode[] = [
    column("root", ["title", "body", "divider_1", "review_form", "divider_2", "actions"]),
    text("title", title),
    text("body", "Complete the required fields and choose an action."),
    divider("divider_1"),
    form("review_form", ["reason_field", "priority_field", "date_field"], "submit_button"),
    textField("reason_field", "reason", "Reason", "/form/reason", {
      textFieldType: "longText",
      required: true,
      placeholder: "Explain the decision",
      maxLength: 1000,
    }),
    multipleChoice("priority_field", "priority", "Priority", "/form/priority", {
      options: ["normal", "high", "urgent"],
      variant: "select",
      required: true,
    }),
    dateTimeInput("date_field", "date", "Target date", "/form/date", {
      enableDate: true,
      enableTime: input.includes("handoff"),
    }),
    text("submit_label", "Submit"),
    button("submit_button", "submit_label", "submit_complex", {
      primary: true,
      context: [
        { key: "reason", value: { path: "/form/reason" } },
        { key: "priority", value: { path: "/form/priority" } },
        { key: "date", value: { path: "/form/date" } },
        { key: "caseId", value: { path: "/case/id" } },
      ],
    }),
    divider("divider_2"),
    row("actions", ["cancel_button", "escalate_button"], "end"),
    text("cancel_label", "Cancel"),
    button("cancel_button", "cancel_label", "cancel_complex", {
      danger: true,
      context: [{ key: "cancelled", value: { literalBoolean: true } }],
    }),
    text("escalate_label", "Escalate"),
    button("escalate_button", "escalate_label", "escalate_complex", {
      context: [
        { key: "escalate", value: { literalBoolean: true } },
        { key: "caseId", value: { path: "/case/id" } },
      ],
    }),
  ];
  return caseFrom(
    surfaceId,
    title,
    components,
    [
      entryMap("case", [entryString("id", input)]),
      entryMap("form", [
        entryString("reason", ""),
        entryMap("priority", [entryString("0", "normal")]),
        entryString("date", "2026-05-07"),
      ]),
    ],
    {
      expectedBindings: 3,
      expectedComponents: [
        "Text",
        "Column",
        "Row",
        "Divider",
        "Button",
        "Form",
        "TextField",
        "MultipleChoice",
        "DateTimeInput",
      ],
    },
  );
}

function caseFrom(
  surfaceId: string,
  title: string,
  components: A2uiComponentNode[],
  dataEntries: DataEntry[],
  options: { expectedBindings?: number; expectedComponents: string[]; summary?: string },
): LarkMatrixCase {
  return {
    id: surfaceId.replace(/^matrix_/, ""),
    title,
    expectedComponents: options.expectedComponents,
    expectedMinimumBindings: options.expectedBindings ?? 0,
    messages: [
      ...(dataEntries.length > 0
        ? [
            {
              dataModelUpdate: {
                surfaceId,
                path: "/",
                contents: dataEntries,
              },
            } satisfies A2uiServerMessage,
          ]
        : []),
      {
        surfaceUpdate: {
          surfaceId,
          components,
        },
      },
      {
        beginRendering: {
          surfaceId,
          catalogId: LARK_CARD_CATALOG_ID,
          root: "root",
          styles: {
            summary: options.summary ?? title,
          },
        },
      },
    ],
  };
}

function column(id: string, children: string[]): A2uiComponentNode {
  return { id, component: { Column: { children: { explicitList: children } } } };
}

function row(id: string, children: string[], distribution = "end"): A2uiComponentNode {
  return { id, component: { Row: { children: { explicitList: children }, distribution } } };
}

function text(
  id: string,
  literalString?: string,
  usageHint?: string,
  path?: string,
): A2uiComponentNode {
  return {
    id,
    component: {
      Text: {
        text: path == null ? { literalString: literalString ?? "" } : { path },
        ...(usageHint == null ? {} : { usageHint }),
      },
    },
  };
}

function divider(id: string): A2uiComponentNode {
  return { id, component: { Divider: { axis: "horizontal" } } };
}

function button(
  id: string,
  child: string,
  actionName: string,
  options: {
    primary?: boolean;
    danger?: boolean;
    context?: Array<{ key: string; value: Record<string, unknown> }>;
  } = {},
): A2uiComponentNode {
  return {
    id,
    component: {
      Button: {
        child,
        ...(options.primary === true ? { primary: true } : {}),
        ...(options.danger === true ? { danger: true } : {}),
        action: {
          name: actionName,
          context: options.context ?? [],
        },
      },
    },
  };
}

function form(id: string, children: string[], submit: string): A2uiComponentNode {
  return { id, component: { Form: { children: { explicitList: children }, submit } } };
}

function textField(
  id: string,
  name: string,
  label: string,
  path: string,
  options: {
    textFieldType?: string;
    required?: boolean;
    placeholder?: string;
    maxLength?: number;
    literalText?: string;
  } = {},
): A2uiComponentNode {
  return {
    id,
    component: {
      TextField: {
        name,
        label: { literalString: label },
        text: options.literalText == null ? { path } : { literalString: options.literalText },
        textFieldType: options.textFieldType ?? "shortText",
        ...(options.placeholder == null
          ? {}
          : { placeholder: { literalString: options.placeholder } }),
        ...(options.required === true ? { required: true } : {}),
        ...(options.maxLength == null ? {} : { maxLength: options.maxLength }),
      },
    },
  };
}

function multipleChoice(
  id: string,
  name: string,
  label: string,
  path: string,
  options: { options: string[]; variant?: string; required?: boolean },
): A2uiComponentNode {
  return {
    id,
    component: {
      MultipleChoice: {
        name,
        label: { literalString: label },
        selections: { path },
        options: options.options.map((value) => ({
          label: { literalString: value[0]?.toUpperCase() + value.slice(1) },
          value,
        })),
        maxAllowedSelections: 1,
        variant: options.variant ?? "select",
        ...(options.required === true ? { required: true } : {}),
      },
    },
  };
}

function dateTimeInput(
  id: string,
  name: string,
  label: string,
  path: string,
  options: { enableDate?: boolean; enableTime?: boolean; literalValue?: string } = {},
): A2uiComponentNode {
  return {
    id,
    component: {
      DateTimeInput: {
        name,
        label: { literalString: label },
        value: options.literalValue == null ? { path } : { literalString: options.literalValue },
        enableDate: options.enableDate ?? true,
        enableTime: options.enableTime ?? false,
        required: true,
      },
    },
  };
}

function entryString(key: string, value: string): DataEntry {
  return { key, valueString: value };
}

function entryMap(key: string, valueMap: DataEntry[]): DataEntry {
  return { key, valueMap };
}

function formData(fields: Array<{ name: string; path: string; type: string }>): DataEntry[] {
  const entries = fields.map((field) =>
    entryString(field.path.split("/").at(-1) ?? field.name, field.type === "number" ? "0" : ""),
  );
  return [entryMap("form", entries)];
}

function normalizeTextFieldType(value: string): string {
  if (value.startsWith("longText")) {
    return "longText";
  }
  if (value.startsWith("number")) {
    return "number";
  }
  if (value.startsWith("obscured")) {
    return "obscured";
  }
  if (value.startsWith("email")) {
    return "email";
  }
  return "shortText";
}

function readChildren(node: A2uiComponentNode): string[] {
  const columnNode = node.component.Column as { children: { explicitList: string[] } };
  return columnNode.children.explicitList;
}

function normalizeGeneratedFormSubmits(surface: SurfaceState): number {
  let normalized = 0;
  for (const node of surface.components.values()) {
    const formRef = readComponentRef(surface, node.id);
    if (formRef.type !== "Form") {
      continue;
    }
    const submitId = typeof formRef.props.submit === "string" ? formRef.props.submit : null;
    if (submitId == null) {
      continue;
    }
    const submit = readComponentRef(surface, submitId);
    if (submit.type !== "Button") {
      continue;
    }
    const action = isRecord(submit.props.action) ? submit.props.action : null;
    const actionName = typeof action?.name === "string" ? action.name : null;
    if (actionName == null) {
      continue;
    }
    const callbackInput: NormalizedCallbackInput = {
      envelope: {
        __a2ui_lark: "v0_8",
        surfaceId: surface.surfaceId,
        sourceComponentId: submitId,
        actionName,
      },
      submittedValues: buildSubmittedValues(surface),
      timestamp: "2026-04-28T12:00:00.000Z",
    };
    const actionEvent = normalizeCallback(surface, callbackInput);
    if (Object.keys(actionEvent.userAction.context).length === 0) {
      throw new Error(`Form submit '${submitId}' normalized with empty context`);
    }
    normalized += 1;
  }
  return normalized;
}

function buildSubmittedValues(surface: SurfaceState): Record<string, unknown> {
  const submittedValues: Record<string, unknown> = {};
  for (const node of surface.components.values()) {
    const component = readComponentRef(surface, node.id);
    if (
      component.type !== "TextField" &&
      component.type !== "MultipleChoice" &&
      component.type !== "DateTimeInput"
    ) {
      continue;
    }
    const name = typeof component.props.name === "string" ? component.props.name : null;
    if (name == null) {
      continue;
    }
    if (component.type === "MultipleChoice") {
      submittedValues[name] = readFirstOptionValue(component.props.options) ?? "normal";
    } else if (component.type === "DateTimeInput") {
      submittedValues[name] =
        component.props.enableTime === true && component.props.enableDate !== true
          ? "12:00"
          : "2026-05-07";
    } else {
      submittedValues[name] = component.props.textFieldType === "number" ? "7" : "sample value";
    }
  }
  return submittedValues;
}

function readFirstOptionValue(options: unknown): string | null {
  if (!Array.isArray(options)) {
    return null;
  }
  const first = options.find(isRecord);
  return first != null && typeof first.value === "string" ? first.value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value != null && !Array.isArray(value);
}
