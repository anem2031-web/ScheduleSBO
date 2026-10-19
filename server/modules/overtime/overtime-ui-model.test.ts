import { describe, expect, it } from "vitest";
import {
  clockRange,
  durationParts,
  overtimeNoteRequired,
  overtimePage,
  overtimeRows,
  rowMatchesFilter,
  rowNeedsAction,
  statusLabel,
  type OvertimeList,
} from "../../../client/src/components/overtime/overtime-model";

type Candidate = OvertimeList["candidates"][number];
type Request = OvertimeList["items"][number];
const candidate = (changes: Partial<Candidate> = {}): Candidate => ({
  attendanceId: 5,
  assignmentId: 11,
  workerId: 7,
  name: "أحمد",
  employeeId: "W-7",
  workDate: "2026-10-18",
  plannedEnd: "10:00",
  actualEnd: 690,
  minutes: 90,
  totalMinutes: 90,
  costCenterId: 1,
  costCenterName: "الملقا",
  assignmentStartTime: "06:00",
  assignmentEndTime: "10:00",
  supervisorId: 3,
  supervisorName: "مشرف الصباح",
  canCreate: true,
  canReview: true,
  ...changes,
});
const request = (changes: Partial<Request> = {}): Request => ({
  id: 21,
  workerId: 7,
  name: "أحمد",
  employeeId: "W-7",
  overtimeKind: "actual",
  assignmentId: 11,
  attendanceId: 5,
  requestedBy: 3,
  requestedByName: "مشرف الصباح",
  requestedStartTime: "10:00",
  requestedEndTime: "11:30",
  originalEndTime: "10:00",
  reasonText: "استكمال الصيانة",
  reviewStatus: "approved",
  reviewedBy: 3,
  reviewedByName: "مشرف الصباح",
  reviewedAt: new Date("2026-10-18T09:00:00Z"),
  reviewNote: "استكمال الصيانة",
  decisionNote: null,
  overtimeDate: "2026-10-18",
  hours: "1.50",
  reasonId: 1,
  hourlyRate: "0",
  totalAmount: "0",
  approvedBy: null,
  approvedByName: null,
  approvedAt: null,
  status: "pending",
  createdAt: new Date("2026-10-18T09:00:00Z"),
  costCenterId: 1,
  costCenterName: "الملقا",
  assignmentStartTime: "06:00",
  assignmentEndTime: "10:00",
  supervisorId: 3,
  supervisorName: "مشرف الصباح",
  totalMinutes: 90,
  reopened: false,
  requiresApprovalReason: false,
  canReview: false,
  canDecide: true,
  canReopen: false,
  history: [],
  ...changes,
});
const data = (
  items: Request[] = [],
  candidates: Candidate[] = [],
): OvertimeList => ({
  items,
  candidates,
  centers: [
    { id: 1, nameAr: "الملقا", nameEn: "Malqa" },
    { id: 2, nameAr: "تولان", nameEn: "Tolan" },
  ],
  canCreate: true,
  canReview: true,
  canApprove: true,
  canReopen: false,
});

describe("overtime page business presentation", () => {
  it("distinguishes the 04:30 opening from the next-day 04:30 closing", () => {
    expect(clockRange("04:30", "10:00")).toBe("04:30 — 10:00");
    expect(clockRange("16:00", "04:30")).toBe("16:00 — 04:30 (+1)");
    expect(clockRange("01:00", "02:00")).toBe("01:00 (+1) — 02:00 (+1)");
  });

  it("uses hours and remaining minutes rather than treating 90 minutes as 1.90 hours", () => {
    expect(durationParts(90)).toEqual({ hours: 1, minutes: 30 });
    expect(durationParts(45)).toEqual({ hours: 0, minutes: 45 });
  });

  it("keeps a shared worker's two periods and destination costs separate", () => {
    const rows = overtimeRows(
      data(
        [],
        [
          candidate(),
          candidate({
            assignmentId: 12,
            attendanceId: 6,
            costCenterId: 2,
            costCenterName: "تولان",
            assignmentStartTime: "16:00",
            assignmentEndTime: "01:00",
            plannedEnd: "01:00",
            actualEnd: 105,
            minutes: 45,
            totalMinutes: 45,
          }),
        ],
      ),
    );
    expect(rows).toHaveLength(2);
    expect(
      rows.map((row) => [row.workerId, row.costCenterId, row.minutes]),
    ).toEqual([
      [7, 1, 90],
      [7, 2, 45],
    ]);
    expect(new Set(rows.map((row) => row.key)).size).toBe(2);
  });

  it("lets a create-only account submit a candidate without pretending to be its reviewer", () => {
    const [row] = overtimeRows(
      data([], [candidate({ canCreate: true, canReview: false })]),
    );
    expect(row.canSubmit).toBe(true);
    expect(row.canReview).toBe(false);
    expect(rowNeedsAction(row)).toBe(true);
    const [readOnly] = overtimeRows(
      data([], [candidate({ canCreate: false, canReview: false })]),
    );
    expect(rowNeedsAction(readOnly)).toBe(false);
  });

  it("requires one supervisor reason, no initial HR approval reason, and a reason for a changed HR decision", () => {
    const [hr] = overtimeRows(data([request()]));
    expect(overtimeNoteRequired(hr, true)).toBe(false);
    expect(overtimeNoteRequired(hr, false)).toBe(true);
    const [supervisor] = overtimeRows(data([], [candidate()]));
    expect(overtimeNoteRequired(supervisor, true)).toBe(true);
    expect(overtimeNoteRequired(supervisor, false)).toBe(true);
    const [reopened] = overtimeRows(
      data([request({ reopened: true, requiresApprovalReason: true })]),
    );
    expect(overtimeNoteRequired(reopened, true)).toBe(true);
    expect(rowMatchesFilter(reopened, "reopened")).toBe(true);
    expect(statusLabel(reopened)).toBe("بانتظار إعادة قرار الشؤون");
  });

  it("does not show a completed reapproval as pending reopening and retains legacy paid totals", () => {
    const [final] = overtimeRows(
      data([
        request({
          status: "paid",
          reopened: true,
          requiresApprovalReason: true,
          canDecide: false,
        }),
      ]),
    );
    expect(final.status).toBe("approved");
    expect(rowMatchesFilter(final, "approved")).toBe(true);
    expect(rowMatchesFilter(final, "reopened")).toBe(false);
    expect(rowNeedsAction(final)).toBe(false);
  });

  it("caps each render page at 32 rows, preserves every row, and clamps after filtering", () => {
    const rows = Array.from({ length: 65 }, (_, index) => index + 1);
    const pages = [1, 2, 3].map((page) => overtimePage(rows, page));
    expect(pages.map((page) => page.items.length)).toEqual([32, 32, 1]);
    expect(pages.flatMap((page) => page.items)).toEqual(rows);
    expect(overtimePage(rows.slice(0, 3), 3)).toMatchObject({
      page: 1,
      totalPages: 1,
      items: [1, 2, 3],
      from: 1,
      to: 3,
    });
    expect(overtimePage([], 10)).toMatchObject({
      page: 1,
      totalPages: 1,
      items: [],
      from: 0,
      to: 0,
    });
  });
});
