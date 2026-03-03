export class DomainError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

export const nowIso = (): string => new Date().toISOString();

export const toSlug = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80) || "project";

export const randomId = (prefix: string): string =>
  `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
