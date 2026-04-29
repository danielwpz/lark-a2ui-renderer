import { dataEntriesToValue, isRecord, setJsonPointer } from "./json.js";
import type {
  A2uiComponentNode,
  A2uiServerMessage,
  BeginRenderingMessage,
  ComponentRef,
  DataModelUpdateMessage,
  DeleteSurfaceMessage,
  SurfaceState,
  SurfaceUpdateMessage,
} from "./types.js";

export class SurfaceStore {
  readonly surfaces = new Map<string, SurfaceState>();

  applyMessages(messages: A2uiServerMessage | A2uiServerMessage[]): void {
    const list = Array.isArray(messages) ? messages : [messages];
    for (const message of list) {
      this.applyMessage(message);
    }
  }

  updateDataModel(surfaceId: string, path: string, value: unknown): void {
    const surface = this.ensureSurface(surfaceId);
    surface.dataModel = setJsonPointer(surface.dataModel, path, value);
  }

  getSurface(surfaceId: string): SurfaceState {
    const surface = this.surfaces.get(surfaceId);
    if (surface == null) {
      throw new Error(`Unknown surface: ${surfaceId}`);
    }
    return surface;
  }

  private applyMessage(message: A2uiServerMessage): void {
    if ("surfaceUpdate" in message) {
      this.applySurfaceUpdate(message);
      return;
    }
    if ("dataModelUpdate" in message) {
      this.applyDataModelUpdate(message);
      return;
    }
    if ("beginRendering" in message) {
      this.applyBeginRendering(message);
      return;
    }
    if ("deleteSurface" in message) {
      this.applyDeleteSurface(message);
      return;
    }
  }

  private applySurfaceUpdate(message: SurfaceUpdateMessage): void {
    const surface = this.ensureSurface(message.surfaceUpdate.surfaceId);
    for (const component of message.surfaceUpdate.components) {
      validateComponentNode(component);
      surface.components.set(component.id, component);
    }
  }

  private applyDataModelUpdate(message: DataModelUpdateMessage): void {
    const update = message.dataModelUpdate;
    const value = dataEntriesToValue(update.contents);
    this.updateDataModel(update.surfaceId, update.path ?? "/", value);
  }

  private applyBeginRendering(message: BeginRenderingMessage): void {
    const begin = message.beginRendering;
    const surface = this.ensureSurface(begin.surfaceId);
    surface.root = begin.root;
    if (begin.catalogId === undefined) {
      delete surface.catalogId;
    } else {
      surface.catalogId = begin.catalogId;
    }
    surface.styles = begin.styles ?? {};
  }

  private applyDeleteSurface(message: DeleteSurfaceMessage): void {
    this.surfaces.delete(message.deleteSurface.surfaceId);
  }

  private ensureSurface(surfaceId: string): SurfaceState {
    const existing = this.surfaces.get(surfaceId);
    if (existing != null) {
      return existing;
    }
    const created: SurfaceState = {
      surfaceId,
      components: new Map(),
      dataModel: {},
      styles: {},
    };
    this.surfaces.set(surfaceId, created);
    return created;
  }
}

export function readComponentRef<TProps = Record<string, unknown>>(
  surface: SurfaceState,
  componentId: string,
): ComponentRef<TProps> {
  const node = surface.components.get(componentId);
  if (node == null) {
    throw new Error(`Unknown component '${componentId}' in surface '${surface.surfaceId}'`);
  }
  const entries = Object.entries(node.component);
  if (entries.length !== 1) {
    throw new Error(`Component '${componentId}' must contain exactly one component type`);
  }
  const [type, props] = entries[0] as [string, unknown];
  if (!isRecord(props)) {
    throw new Error(`Component '${componentId}' properties must be an object`);
  }
  return {
    id: node.id,
    type,
    props: props as TProps,
    ...(node.weight === undefined ? {} : { weight: node.weight }),
  };
}

function validateComponentNode(component: A2uiComponentNode): void {
  if (typeof component.id !== "string" || component.id.length === 0) {
    throw new Error("A2UI component id is required");
  }
  if (!isRecord(component.component)) {
    throw new Error(`A2UI component '${component.id}' must have a component object`);
  }
}
