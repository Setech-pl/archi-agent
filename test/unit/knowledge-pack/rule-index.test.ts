import { describe, expect, it } from "vitest";
import { RuleIndex } from "../../../src/core/knowledge-pack/index/rule-index.js";
import type { RuleRecord } from "../../../src/core/knowledge-pack/knowledge-pack.schema.js";
import { ruleRecord } from "../../doubles/knowledge-pack-fixture.js";

const accentedReason = "Keep " + String.fromCodePoint(0x017c, 0x00f3, 0x0142, 0x0107) + " as declared";

function rules(): RuleRecord[] {
  return [
    ruleRecord("forbid", "operator", "relay", "Commands pass validation first", 3),
    ruleRecord("require", "service", "queue", accentedReason, 4),
    ruleRecord("require", "operator", "relay", "Index keeps both rules of a pair", 5)
  ];
}

describe("RuleIndex", () => {
  it("answers forbid and require checks", () => {
    const index = RuleIndex.from(rules());
    expect(index.isForbidden("operator", "relay")).toBe(true);
    expect(index.isRequired("service", "queue")).toBe(true);
    expect(index.isForbidden("service", "queue")).toBe(false);
    expect(index.forbidden().map((record) => record.location.line)).toEqual([3]);
    expect(index.required().map((record) => record.location.line)).toEqual([5, 4]);
  });

  it("is directional", () => {
    const index = RuleIndex.from(rules());
    expect(index.isForbidden("relay", "operator")).toBe(false);
    expect(index.isRequired("queue", "service")).toBe(false);
    expect(index.find("relay", "operator")).toEqual([]);
  });

  it("returns nothing for an unknown pair", () => {
    const index = RuleIndex.from(rules());
    expect(index.find("ghost", "other")).toEqual([]);
    expect(index.isForbidden("ghost", "other")).toBe(false);
    expect(index.isRequired("ghost", "other")).toBe(false);
    expect(index.reason("ghost", "other", "forbid")).toBeUndefined();
  });

  it("returns rule types and keeps reasons exactly as declared", () => {
    const index = RuleIndex.from(rules());
    expect(index.find("operator", "relay").map((record) => record.rule)).toEqual(["forbid", "require"]);
    expect(index.reason("operator", "relay", "forbid")).toBe("Commands pass validation first");
    expect(index.reason("service", "queue", "require")).toBe(accentedReason);
    expect(index.reason("service", "queue", "forbid")).toBeUndefined();
  });

  it("is deterministic regardless of input order", () => {
    const forward = RuleIndex.from(rules());
    const backward = RuleIndex.from([...rules()].reverse());
    expect(backward.all()).toEqual(forward.all());
    expect(backward.find("operator", "relay")).toEqual(forward.find("operator", "relay"));
    expect(forward.all().map((record) => [record.fromId, record.rule])).toEqual([
      ["operator", "forbid"],
      ["operator", "require"],
      ["service", "require"]
    ]);
  });

  it("protects its state from changes to results and to the input", () => {
    const input = rules();
    const index = RuleIndex.from(input);
    const found = index.find("operator", "relay");
    expect(() => (found as RuleRecord[]).pop()).toThrow(TypeError);
    expect(() => {
      (found[0] as { rule: string }).rule = "require";
    }).toThrow(TypeError);
    expect(() => (index.forbidden() as RuleRecord[]).push(ruleRecord("forbid", "x", "y"))).toThrow(TypeError);

    (input[0] as { reason: string }).reason = "Changed input";
    expect(index.reason("operator", "relay", "forbid")).toBe("Commands pass validation first");
    expect(index.isForbidden("operator", "relay")).toBe(true);
    expect(index.size).toBe(3);
  });
});
