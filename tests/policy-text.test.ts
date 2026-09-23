import { describe, expect, it } from "vitest";
import { policyFromText, policyToText } from "@/lib/policy-text";

describe("policy text", () => {
  it("round-trips titled sections and paragraphs", () => {
    const sections = [{ heading: "Collection", paragraphs: ["We collect contact details.", "We do not collect card details."] }, { heading: "Contact", paragraphs: ["Call the restaurant."] }];
    expect(policyFromText(policyToText(sections), "Privacy")).toEqual(sections);
  });

  it("accepts a plain policy as one section", () => {
    expect(policyFromText("A complete plain-language policy.", "Ordering and pickup")).toEqual([{ heading: "Ordering and pickup", paragraphs: ["A complete plain-language policy."] }]);
  });
});
