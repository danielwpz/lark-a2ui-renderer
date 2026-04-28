import assert from "node:assert/strict";
import { describe, test } from "vitest";

import { LARK_CARD_COMPONENT_TYPES } from "../../src/v0_8/index.js";
import {
  collectCaseComponentTypes,
  larkCaseMatrix,
  prepareLarkCase,
} from "../support/lark-case-matrix.js";

describe("Lark integration case matrix", () => {
  test("contains at least 50 cases", () => {
    assert.ok(
      larkCaseMatrix.length >= 50,
      `expected at least 50 cases, got ${larkCaseMatrix.length}`,
    );
  });

  test("covers every supported component type", () => {
    const observed = new Set<string>();
    for (const testCase of larkCaseMatrix) {
      for (const type of collectCaseComponentTypes(testCase)) {
        observed.add(type);
      }
    }
    assert.deepEqual([...observed].sort(), [...LARK_CARD_COMPONENT_TYPES].sort());
  });

  test.each(
    larkCaseMatrix,
  )("$id validates, renders, and normalizes generated form submits", (testCase) => {
    const prepared = prepareLarkCase(testCase);
    const observedComponents = collectCaseComponentTypes(testCase);

    assert.equal(prepared.rendered.warnings.length, 0);
    assert.ok(
      prepared.rendered.callbackBindings.length >= testCase.expectedMinimumBindings,
      `expected at least ${testCase.expectedMinimumBindings} bindings, got ${prepared.rendered.callbackBindings.length}`,
    );
    for (const componentType of testCase.expectedComponents) {
      assert.ok(observedComponents.has(componentType), `${testCase.id} missing ${componentType}`);
    }
  });
});
