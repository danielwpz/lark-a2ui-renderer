export const LARK_CARD_CATALOG_ID = "urn:a2ui:catalog:lark-card:v0_8";
export const CALLBACK_ENVELOPE_VERSION = "v0_8";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export interface BoundValue {
  path?: string;
  literalString?: string;
  literalNumber?: number;
  literalBoolean?: boolean;
  literalArray?: string[];
}

export interface DataEntry {
  key: string;
  valueString?: string;
  valueNumber?: number;
  valueBoolean?: boolean;
  valueMap?: DataEntry[];
}

export interface SurfaceUpdateMessage {
  surfaceUpdate: {
    surfaceId: string;
    components: A2uiComponentNode[];
  };
}

export interface DataModelUpdateMessage {
  dataModelUpdate: {
    surfaceId: string;
    path?: string;
    contents: DataEntry[];
  };
}

export interface BeginRenderingMessage {
  beginRendering: {
    surfaceId: string;
    catalogId?: string;
    root: string;
    styles?: Record<string, unknown>;
  };
}

export interface DeleteSurfaceMessage {
  deleteSurface: {
    surfaceId: string;
  };
}

export type A2uiServerMessage =
  | SurfaceUpdateMessage
  | DataModelUpdateMessage
  | BeginRenderingMessage
  | DeleteSurfaceMessage;

export interface A2uiComponentNode {
  id: string;
  weight?: number;
  component: Record<string, unknown>;
}

export interface ComponentRef<TProps = Record<string, unknown>> {
  id: string;
  type: string;
  props: TProps;
  weight?: number;
}

export interface ChildList {
  explicitList?: string[];
}

export interface ActionContextEntry {
  key: string;
  value: BoundValue;
}

export interface ButtonAction {
  name: string;
  context?: ActionContextEntry[];
}

export interface CallbackEnvelope {
  __a2ui_lark: typeof CALLBACK_ENVELOPE_VERSION;
  surfaceId: string;
  sourceComponentId: string;
  actionName?: string;
  actionId?: string;
}

export interface NormalizedCallbackInput {
  envelope: CallbackEnvelope;
  submittedValues?: Record<string, unknown>;
  timestamp?: string;
  operator?: Record<string, unknown>;
}

export interface A2uiUserActionEvent {
  userAction: {
    name: string;
    surfaceId: string;
    sourceComponentId: string;
    timestamp: string;
    context: Record<string, unknown>;
  };
}

export interface SurfaceState {
  surfaceId: string;
  catalogId?: string;
  root?: string;
  styles: Record<string, unknown>;
  components: Map<string, A2uiComponentNode>;
  dataModel: unknown;
}

export interface RenderWarning {
  code: string;
  message: string;
  componentId?: string;
}

export interface CallbackBinding {
  envelope: CallbackEnvelope;
  actionName: string;
}

export interface RenderResult {
  surfaceId: string;
  card: Record<string, unknown>;
  callbackBindings: CallbackBinding[];
  warnings: RenderWarning[];
}
