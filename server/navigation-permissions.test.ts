import { describe, expect, it } from "vitest";
import { navigationForUser } from "../shared/navigation";
describe("Navigation uses account grants", () => {
  it("retains all admin tasks", () => expect(navigationForUser({ role: "admin", permissions: ["*"] })).toHaveLength(6));
  it("hides task links after revoking all HR permissions", () => expect(navigationForUser({ role: "hr_admin", permissions: [] }).map(item => item.key)).toEqual(["today"]));
  it("allows independent absence review without schedule access", () => expect(navigationForUser({ role: "hr_admin", permissions: ["leave:read"] }).map(item => item.key)).toEqual(["today", "reviews"]));
  it("routes overtime-only readers to the independent overtime page", () => expect(navigationForUser({ role: "hr_admin", permissions: ["overtime:read"] }).map(item => item.path)).toEqual(["/dashboard", "/overtime"]));
  it("honors an explicit overtime grant independently of the role template", () => expect(navigationForUser({ role: "financial_reviewer", permissions: ["overtime:read"] }).map(item => item.key)).toEqual(["today", "overtime"]));
  it("preserves worker self-service without links to all workers", () => expect(navigationForUser({ role: "worker", permissions: ["workers:read:self"] }).map(item => item.key)).toEqual(["today"]));
});
