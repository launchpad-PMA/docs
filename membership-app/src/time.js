export function nowIso() {
  return new Date().toISOString();
}

export function formatChicago(iso) {
  const value = iso instanceof Date ? iso : new Date(iso);
  const formatted = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    dateStyle: "long",
    timeStyle: "short",
  }).format(value);
  return `${formatted} CT`;
}

export function chicagoYear(iso = new Date()) {
  const value = iso instanceof Date ? iso : new Date(iso);
  return Number(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", year: "numeric" }).format(value),
  );
}
