import { describe, expect, test } from "bun:test";
import { toSlug } from "@helix/shared-kernel";
import fc from "fast-check";

describe("Workspace slug generation", () => {
  test("slug output is lowercase and URL-safe", async () => {
    await fc.assert(
      fc.asyncProperty(fc.string(), async (input) => {
        const slug = toSlug(input);
        expect(slug.length).toBeGreaterThan(0);
        expect(slug.length).toBeLessThanOrEqual(80);
        expect(slug).toMatch(/^[a-z0-9-]+$/);
      }),
    );
  });
});
