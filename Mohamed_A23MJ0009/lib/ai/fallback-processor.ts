import type { AiDraftResult } from "./types";

const LOGISTICS_KEYWORDS = [
  "shipping", "delivery", "warehouse", "tracking", "customs",
  "freight", "logistics", "parcel", "dispatch", "inventory",
  "packaging", "route", "manifest", "shipment", "return",
  "handling", "transport", "pickup", "scanning", "sorting",
  "label", "pallet", "container", "hub", "depot",
];

export function fallbackProcess(text: string): AiDraftResult {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const title = deriveTitle(lines);
  const summary = deriveSummary(lines);
  const steps = deriveSteps(lines);
  const tags = deriveTags(text);

  return { title, summary, steps, tags };
}

function deriveTitle(lines: string[]): string {
  for (const line of lines.slice(0, 5)) {
    const clean = line.replace(/^#+\s*/, "").replace(/[*_]/g, "").trim();
    if (clean.length >= 10 && clean.length <= 120) {
      return clean.endsWith(".") ? clean.slice(0, -1) : clean;
    }
  }
  const first = lines[0] || "Untitled Document";
  return first.length > 80 ? first.slice(0, 77) + "..." : first;
}

function deriveSummary(lines: string[]): string {
  const candidates = lines.filter((l) => l.length > 30).slice(0, 4);
  if (candidates.length === 0) return lines.slice(0, 2).join(" ");
  return candidates.join(" ").slice(0, 300);
}

function deriveSteps(lines: string[]): string[] {
  const stepPatterns = [
    /^\d+[\.\)]\s+/,        // "1. Do something" or "1) Do something"
    /^[-•*]\s+/,            // "- Do something"
    /^step\s*\d/i,          // "Step 1:"
  ];

  const listItems = lines.filter((l) =>
    stepPatterns.some((p) => p.test(l))
  );

  if (listItems.length >= 2) {
    return listItems
      .slice(0, 15)
      .map((s) => s.replace(/^\d+[\.\)]\s+/, "").replace(/^[-•*]\s+/, "").replace(/^step\s*\d+[:\.\)]\s*/i, "").trim());
  }

  const imperative = lines.filter((l) => {
    const words = l.split(" ");
    if (words.length < 3 || words.length > 40) return false;
    const first = words[0].toLowerCase();
    return [
      "check", "verify", "ensure", "open", "go", "click", "select",
      "enter", "confirm", "update", "send", "scan", "attach", "review",
      "submit", "create", "add", "remove", "set", "log", "record",
      "place", "move", "transfer", "load", "unload", "sort", "pack",
    ].includes(first);
  });

  if (imperative.length >= 2) {
    return imperative.slice(0, 15);
  }

  return lines
    .filter((l) => l.length > 15 && l.length < 200)
    .slice(0, 5)
    .map((l) => (l.length > 120 ? l.slice(0, 117) + "..." : l));
}

function deriveTags(text: string): string[] {
  const lower = text.toLowerCase();
  const found = LOGISTICS_KEYWORDS.filter((kw) => lower.includes(kw));

  const words = lower.replace(/[^a-z0-9\s]/g, "").split(/\s+/);
  const freq: Record<string, number> = {};
  for (const w of words) {
    if (w.length >= 4) freq[w] = (freq[w] || 0) + 1;
  }

  const topFreq = Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([w]) => w);

  const merged = [...new Set([...found, ...topFreq])];
  return merged.slice(0, 8);
}
