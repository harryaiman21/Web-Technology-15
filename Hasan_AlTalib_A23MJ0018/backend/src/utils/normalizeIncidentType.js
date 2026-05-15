export const CANONICAL_TYPES = [
  "late_delivery",
  "damaged_parcel",
  "missing_parcel",
  "address_error",
  "system_error",
  "wrong_item",
  "other",
];

const ALIASES = {
  ["customer" + "_complaint"]: "other",
  ["customs" + "_hold"]: "other",
  ["wrong" + "_address"]: "address_error",
  delivery_delay: "late_delivery",
  parcel_damage: "damaged_parcel",
  lost_parcel: "missing_parcel",
  misplaced_parcel: "missing_parcel",
  delayed_delivery: "late_delivery",
  wrong_item_delivered: "wrong_item",
};

export function normalizeIncidentType(raw) {
  if (!raw) return "other";

  const lower = String(raw).toLowerCase().trim();

  if (CANONICAL_TYPES.includes(lower)) return lower;
  if (ALIASES[lower]) return ALIASES[lower];

  return "other";
}
