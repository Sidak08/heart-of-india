import type { RestaurantSettings } from "@/lib/operations";

type PolicySections = NonNullable<RestaurantSettings["privacyPolicy"]>;

export function policyToText(sections: PolicySections | null) {
  return sections?.map((section) => `## ${section.heading}\n${section.paragraphs.join("\n\n")}`).join("\n\n") ?? "";
}

export function policyFromText(value: string, fallbackHeading: string): PolicySections {
  const sections: PolicySections = [];
  let heading = fallbackHeading;
  let lines: string[] = [];

  const flush = () => {
    const paragraphs = lines.join("\n").trim().split(/\n\s*\n/).map((paragraph) => paragraph.replace(/\s*\n\s*/g, " ").trim()).filter(Boolean);
    if (paragraphs.length) sections.push({ heading, paragraphs });
    lines = [];
  };

  for (const line of value.replace(/\r\n?/g, "\n").trim().split("\n")) {
    const title = line.match(/^##\s+(.+?)\s*$/);
    if (title) { flush(); heading = title[1]; }
    else lines.push(line);
  }
  flush();
  return sections.length ? sections : [{ heading: fallbackHeading, paragraphs: [value.trim()] }];
}
