import { isRecord } from "./json.js";
import { renderSurface } from "./render.js";
import { SurfaceStore, readComponentRef } from "./surface.js";
import { LARK_CARD_CATALOG_ID } from "./types.js";
import type { A2uiServerMessage, SurfaceState } from "./types.js";

export const LARK_CARD_COMPONENT_TYPES = [
  "Text",
  "Column",
  "Row",
  "Divider",
  "Button",
  "Form",
  "TextField",
  "MultipleChoice",
  "DateTimeInput",
] as const;

export type LarkCardComponentType = (typeof LARK_CARD_COMPONENT_TYPES)[number];

export interface ValidationIssue {
  path: string;
  message: string;
  severity: "error" | "warning";
}

export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
  renderedSurfaceIds: string[];
}

export interface ValidationOptions {
  requireBeginRendering?: boolean;
  requireCatalogId?: boolean;
  treatRenderWarningsAsErrors?: boolean;
}

const COMPONENT_TYPE_SET = new Set<string>(LARK_CARD_COMPONENT_TYPES);
const MESSAGE_KEYS = ["surfaceUpdate", "dataModelUpdate", "beginRendering", "deleteSurface"];

export function validateA2uiMessages(
  input: unknown,
  options: ValidationOptions = {},
): ValidationResult {
  const requireBeginRendering = options.requireBeginRendering ?? true;
  const requireCatalogId = options.requireCatalogId ?? true;
  const treatRenderWarningsAsErrors = options.treatRenderWarningsAsErrors ?? true;
  const issues: ValidationIssue[] = [];

  if (!Array.isArray(input)) {
    return {
      ok: false,
      issues: [
        {
          path: "$",
          severity: "error",
          message: "A2UI output must be a JSON array of v0.8 server messages",
        },
      ],
      renderedSurfaceIds: [],
    };
  }

  const beginSurfaceIds = new Set<string>();
  const componentIdsBySurface = new Map<string, Set<string>>();
  for (const [index, message] of input.entries()) {
    validateMessage(message, index, issues, beginSurfaceIds, componentIdsBySurface, {
      requireCatalogId,
    });
  }

  if (requireBeginRendering && beginSurfaceIds.size === 0) {
    addError(issues, "$", "At least one beginRendering message is required");
  }

  const renderedSurfaceIds: string[] = [];
  if (!hasErrors(issues)) {
    try {
      const store = new SurfaceStore();
      store.applyMessages(input as A2uiServerMessage[]);
      for (const surfaceId of beginSurfaceIds) {
        const surface = store.getSurface(surfaceId);
        validateRenderedSurface(surface, issues);
        const rendered = renderSurface(surface);
        renderedSurfaceIds.push(rendered.surfaceId);
        for (const warning of rendered.warnings) {
          issues.push({
            path: warning.componentId == null ? "$" : `$.component(${warning.componentId})`,
            severity: treatRenderWarningsAsErrors ? "error" : "warning",
            message: warning.message,
          });
        }
      }
    } catch (error) {
      addError(issues, "$", error instanceof Error ? error.message : String(error));
    }
  }

  return {
    ok: !hasErrors(issues),
    issues,
    renderedSurfaceIds,
  };
}

export function assertValidA2uiMessages(
  input: unknown,
  options: ValidationOptions = {},
): asserts input is A2uiServerMessage[] {
  const result = validateA2uiMessages(input, options);
  if (!result.ok) {
    throw new Error(formatValidationIssues(result.issues));
  }
}

export function formatValidationIssues(issues: ValidationIssue[]): string {
  return issues
    .map((issue) => `${issue.severity.toUpperCase()} ${issue.path}: ${issue.message}`)
    .join("\n");
}

function validateMessage(
  message: unknown,
  index: number,
  issues: ValidationIssue[],
  beginSurfaceIds: Set<string>,
  componentIdsBySurface: Map<string, Set<string>>,
  options: { requireCatalogId: boolean },
): void {
  const path = `$[${index}]`;
  if (!isRecord(message)) {
    addError(issues, path, "Message must be an object");
    return;
  }

  const presentKeys = MESSAGE_KEYS.filter((key) => key in message);
  if (presentKeys.length !== 1) {
    addError(issues, path, "Message must contain exactly one A2UI v0.8 message key");
    return;
  }

  const key = presentKeys[0];
  if (key === "surfaceUpdate") {
    validateSurfaceUpdate(
      message.surfaceUpdate,
      `${path}.surfaceUpdate`,
      issues,
      componentIdsBySurface,
    );
    return;
  }
  if (key === "dataModelUpdate") {
    validateDataModelUpdate(message.dataModelUpdate, `${path}.dataModelUpdate`, issues);
    return;
  }
  if (key === "beginRendering") {
    validateBeginRendering(
      message.beginRendering,
      `${path}.beginRendering`,
      issues,
      beginSurfaceIds,
      options,
    );
    return;
  }
  validateDeleteSurface(message.deleteSurface, `${path}.deleteSurface`, issues);
}

function validateSurfaceUpdate(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
  componentIdsBySurface: Map<string, Set<string>>,
): void {
  if (!isRecord(value)) {
    addError(issues, path, "surfaceUpdate must be an object");
    return;
  }
  const surfaceId = readString(value.surfaceId);
  if (surfaceId == null) {
    addError(issues, `${path}.surfaceId`, "surfaceId is required");
  }
  if (!Array.isArray(value.components)) {
    addError(issues, `${path}.components`, "components must be an array");
    return;
  }

  const seenIds =
    surfaceId == null ? new Set<string>() : ensureComponentSet(componentIdsBySurface, surfaceId);
  for (const [index, component] of value.components.entries()) {
    validateComponentNode(component, `${path}.components[${index}]`, issues, seenIds);
  }
}

function validateDataModelUpdate(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (!isRecord(value)) {
    addError(issues, path, "dataModelUpdate must be an object");
    return;
  }
  if (readString(value.surfaceId) == null) {
    addError(issues, `${path}.surfaceId`, "surfaceId is required");
  }
  if (value.path !== undefined && readString(value.path) == null) {
    addError(issues, `${path}.path`, "path must be a JSON pointer string when provided");
  }
  if (!Array.isArray(value.contents)) {
    addError(issues, `${path}.contents`, "contents must be an array");
    return;
  }
  value.contents.forEach((entry, index) => {
    validateDataEntry(entry, `${path}.contents[${index}]`, issues);
  });
}

function validateBeginRendering(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
  beginSurfaceIds: Set<string>,
  options: { requireCatalogId: boolean },
): void {
  if (!isRecord(value)) {
    addError(issues, path, "beginRendering must be an object");
    return;
  }
  const surfaceId = readString(value.surfaceId);
  if (surfaceId == null) {
    addError(issues, `${path}.surfaceId`, "surfaceId is required");
  } else {
    beginSurfaceIds.add(surfaceId);
  }
  if (readString(value.root) == null) {
    addError(issues, `${path}.root`, "root component id is required");
  }
  if (options.requireCatalogId && readString(value.catalogId) == null) {
    addError(issues, `${path}.catalogId`, "catalogId is required for Lark card generation");
  }
  if (value.catalogId !== undefined && value.catalogId !== LARK_CARD_CATALOG_ID) {
    addError(
      issues,
      `${path}.catalogId`,
      `catalogId must be '${LARK_CARD_CATALOG_ID}' for this renderer`,
    );
  }
}

function validateDeleteSurface(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (!isRecord(value)) {
    addError(issues, path, "deleteSurface must be an object");
    return;
  }
  if (readString(value.surfaceId) == null) {
    addError(issues, `${path}.surfaceId`, "surfaceId is required");
  }
}

function validateComponentNode(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
  seenIds: Set<string>,
): void {
  if (!isRecord(value)) {
    addError(issues, path, "Component node must be an object");
    return;
  }
  const id = readString(value.id);
  if (id == null) {
    addError(issues, `${path}.id`, "Component id is required");
  } else if (seenIds.has(id)) {
    addError(issues, `${path}.id`, `Duplicate component id '${id}'`);
  } else {
    seenIds.add(id);
  }

  if (!isRecord(value.component)) {
    addError(issues, `${path}.component`, "component must be an object with one component type");
    return;
  }
  const entries = Object.entries(value.component);
  if (entries.length !== 1) {
    addError(issues, `${path}.component`, "component must contain exactly one component type");
    return;
  }
  const [type, props] = entries[0] as [string, unknown];
  if (!COMPONENT_TYPE_SET.has(type)) {
    addError(issues, `${path}.component.${type}`, `Unsupported component type '${type}'`);
    return;
  }
  if (!isRecord(props)) {
    addError(issues, `${path}.component.${type}`, "Component properties must be an object");
    return;
  }
  validateComponentProps(type as LarkCardComponentType, props, `${path}.component.${type}`, issues);
}

function validateComponentProps(
  type: LarkCardComponentType,
  props: Record<string, unknown>,
  path: string,
  issues: ValidationIssue[],
): void {
  switch (type) {
    case "Text":
      validateBoundString(props.text, `${path}.text`, issues);
      return;
    case "Column":
    case "Row":
      validateChildren(props.children, `${path}.children`, issues);
      return;
    case "Divider":
      return;
    case "Button":
      if (readString(props.child) == null) {
        addError(issues, `${path}.child`, "Button.child must reference a Text component id");
      }
      validateAction(props.action, `${path}.action`, issues);
      return;
    case "Form":
      validateChildren(props.children, `${path}.children`, issues);
      if (readString(props.submit) == null) {
        addError(issues, `${path}.submit`, "Form.submit must reference a Button component id");
      }
      return;
    case "TextField":
      if (readString(props.name) == null) {
        addError(issues, `${path}.name`, "TextField.name is required");
      }
      validateBoundString(props.label, `${path}.label`, issues);
      if (props.text !== undefined) {
        validateBoundString(props.text, `${path}.text`, issues);
      }
      return;
    case "MultipleChoice":
      if (readString(props.name) == null) {
        addError(issues, `${path}.name`, "MultipleChoice.name is required");
      }
      validateBoundString(props.label, `${path}.label`, issues);
      if (!isRecord(props.selections)) {
        addError(issues, `${path}.selections`, "MultipleChoice.selections is required");
      }
      if (!Array.isArray(props.options) || props.options.length === 0) {
        addError(issues, `${path}.options`, "MultipleChoice.options must be a non-empty array");
      }
      return;
    case "DateTimeInput":
      if (readString(props.name) == null) {
        addError(issues, `${path}.name`, "DateTimeInput.name is required");
      }
      validateBoundString(props.value, `${path}.value`, issues);
      return;
  }
}

function validateRenderedSurface(surface: SurfaceState, issues: ValidationIssue[]): void {
  const inputNames = new Set<string>();
  for (const node of surface.components.values()) {
    const component = readComponentRef(surface, node.id);
    if (component.type === "Column" || component.type === "Row") {
      validateChildReferences(surface, component.props.children, node.id, issues);
    }
    if (component.type === "Form") {
      validateChildReferences(surface, component.props.children, node.id, issues);
      const submitId = readString(component.props.submit);
      if (submitId != null) {
        assertReferencedType(surface, submitId, "Button", node.id, "Form.submit", issues);
      }
    }
    if (component.type === "Button") {
      const childId = readString(component.props.child);
      if (childId != null) {
        assertReferencedType(surface, childId, "Text", node.id, "Button.child", issues);
      }
    }
    if (
      component.type === "TextField" ||
      component.type === "MultipleChoice" ||
      component.type === "DateTimeInput"
    ) {
      const name = readString(component.props.name);
      if (name == null) {
        continue;
      }
      if (inputNames.has(name)) {
        addError(
          issues,
          `$.surface(${surface.surfaceId}).component(${node.id}).name`,
          `Duplicate form field name '${name}'`,
        );
      }
      inputNames.add(name);
    }
  }
}

function validateChildReferences(
  surface: SurfaceState,
  value: unknown,
  ownerId: string,
  issues: ValidationIssue[],
): void {
  const childIds = readChildIds(value);
  if (childIds == null) {
    return;
  }
  for (const childId of childIds) {
    if (!surface.components.has(childId)) {
      addError(
        issues,
        `$.surface(${surface.surfaceId}).component(${ownerId}).children`,
        `Unknown child component '${childId}'`,
      );
    }
  }
}

function assertReferencedType(
  surface: SurfaceState,
  componentId: string,
  expectedType: string,
  ownerId: string,
  field: string,
  issues: ValidationIssue[],
): void {
  if (!surface.components.has(componentId)) {
    addError(
      issues,
      `$.surface(${surface.surfaceId}).component(${ownerId}).${field}`,
      `Unknown referenced component '${componentId}'`,
    );
    return;
  }
  const ref = readComponentRef(surface, componentId);
  if (ref.type !== expectedType) {
    addError(
      issues,
      `$.surface(${surface.surfaceId}).component(${ownerId}).${field}`,
      `${field} must reference a ${expectedType} component, got ${ref.type}`,
    );
  }
}

function validateChildren(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (!isRecord(value) || !Array.isArray(value.explicitList)) {
    addError(issues, path, "children.explicitList is required");
    return;
  }
  for (const [index, child] of value.explicitList.entries()) {
    if (readString(child) == null) {
      addError(issues, `${path}.explicitList[${index}]`, "Child id must be a string");
    }
  }
}

function validateAction(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (!isRecord(value)) {
    addError(issues, path, "Button.action is required");
    return;
  }
  if (readString(value.name) == null) {
    addError(issues, `${path}.name`, "Button.action.name is required");
  }
  if (value.context !== undefined && !Array.isArray(value.context)) {
    addError(issues, `${path}.context`, "Button.action.context must be an array when provided");
  }
}

function validateBoundString(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (!isRecord(value)) {
    addError(issues, path, "Bound string value is required");
    return;
  }
  const hasLiteral = typeof value.literalString === "string";
  const hasPath = typeof value.path === "string";
  if (!hasLiteral && !hasPath) {
    addError(issues, path, "Use literalString for fixed text or path for data-model text");
  }
}

function validateDataEntry(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (!isRecord(value)) {
    addError(issues, path, "Data entry must be an object");
    return;
  }
  if (readString(value.key) == null) {
    addError(issues, `${path}.key`, "Data entry key is required");
  }
  const valueFields = ["valueString", "valueNumber", "valueBoolean", "valueMap"].filter(
    (field) => field in value,
  );
  if (valueFields.length !== 1) {
    addError(issues, path, "Data entry must contain exactly one value* field");
  }
  if (Array.isArray(value.valueMap)) {
    value.valueMap.forEach((entry, index) => {
      validateDataEntry(entry, `${path}.valueMap[${index}]`, issues);
    });
  }
}

function readChildIds(value: unknown): string[] | null {
  if (!isRecord(value) || !Array.isArray(value.explicitList)) {
    return null;
  }
  return value.explicitList.filter((entry): entry is string => typeof entry === "string");
}

function ensureComponentSet(map: Map<string, Set<string>>, surfaceId: string): Set<string> {
  const existing = map.get(surfaceId);
  if (existing != null) {
    return existing;
  }
  const created = new Set<string>();
  map.set(surfaceId, created);
  return created;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function addError(issues: ValidationIssue[], path: string, message: string): void {
  issues.push({ path, message, severity: "error" });
}

function hasErrors(issues: ValidationIssue[]): boolean {
  return issues.some((issue) => issue.severity === "error");
}
