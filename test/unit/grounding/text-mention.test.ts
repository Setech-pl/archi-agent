import { describe, expect, it } from "vitest";
import { findLiteralMention, foldMentionText } from "../../../src/core/grounding/text-mention.js";

const fullWidthMission = "\uff2d\uff49\uff53\uff53\uff49\uff4f\uff4e";

function mention(text: string, search: string): string | undefined {
  return findLiteralMention(foldMentionText(text), search);
}

describe("foldMentionText", () => {
  it("keeps the original text and maps every folded character to an original offset", () => {
    const folded = foldMentionText("Ab");
    expect(folded.original).toBe("Ab");
    expect(folded.folded).toBe("ab");
    expect(folded.originalOffsets).toEqual([0, 1]);
    expect(folded.unitStarts).toEqual([true, true]);
  });

  it("folds a length-changing ligature without shifting later offsets", () => {
    const folded = foldMentionText("\ufb01le");
    expect(folded.folded).toBe("file");
    expect(folded.originalOffsets).toEqual([0, 0, 1, 2]);
    expect(folded.unitStarts).toEqual([true, false, true, true]);
  });

  it("treats a base character and its combining mark as one unit", () => {
    const folded = foldMentionText("e\u0301x");
    expect(folded.folded).toBe("\u00e9x");
    expect(folded.originalOffsets).toEqual([0, 2]);
  });
});

describe("findLiteralMention", () => {
  it("returns the verbatim source slice for a case-insensitive whole-word match", () => {
    expect(mention("The Telemetry Gateway forwards frames.", "telemetry gateway")).toBe("Telemetry Gateway");
  });

  it("maps full-width and ligature text back to the original characters", () => {
    expect(mention(`Open ${fullWidthMission} Control now`, "mission control")).toBe(`${fullWidthMission} Control`);
    expect(mention("Pro\ufb01le Service", "profile service")).toBe("Pro\ufb01le Service");
  });

  it("keeps offsets correct for characters outside the basic plane", () => {
    expect(mention("Use \ud835\udc00lpha Service today", "alpha service")).toBe("\ud835\udc00lpha Service");
  });

  it("matches a decomposed accent against the precomposed form", () => {
    expect(mention("Visit the Cafe\u0301 Service", "caf\u00e9 service")).toBe("Cafe\u0301 Service");
  });

  it("requires word boundaries on both sides", () => {
    expect(mention("Several Gateways are listed.", "gateway")).toBeUndefined();
    expect(mention("TelemetryGateway is one word.", "gateway")).toBeUndefined();
    expect(mention("(Gateway)", "gateway")).toBe("Gateway");
  });

  it("does not start a match inside a folded unit", () => {
    expect(mention("\ufb01", "i")).toBeUndefined();
  });

  it("folds case without depending on the host locale", () => {
    expect(mention("IDENTITY SERVICE signs requests", "identity service")).toBe("IDENTITY SERVICE");
  });

  it("returns undefined for an empty search or an absent mention", () => {
    expect(mention("Command Queue", "")).toBeUndefined();
    expect(mention("Command Queue", "spacecraft simulator")).toBeUndefined();
  });

  it("returns the first whole-word occurrence", () => {
    expect(mention("queue, Queue and QUEUE", "queue")).toBe("queue");
  });
});
