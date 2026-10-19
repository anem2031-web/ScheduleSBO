import { describe, expect, it } from "vitest";
import { chronologicalPeriodOrder, directPeriod, periodClockRange, periodDestinationText, periodTimeLabel, type DestinationCatalog } from "../../../client/src/components/schedules/period-destination";
import { reconcileRosterModel, rosterCellKey, type BoardWorker, type BoardAssignment } from "../../../client/src/components/schedules/weekly-board-model";

const catalog: DestinationCatalog = {
  centers: [{id:1,nameAr:"الإدارة"},{id:2,nameAr:"المطاعم"}],
  locations: [{id:11,nameAr:"المكتب"},{id:22,nameAr:"المطعم"}],
  departments: [{id:111,nameAr:"الخدمات"},{id:222,nameAr:"الكاشير"}],
  jobTitles: [{id:1111,titleAr:"بوفيه",departmentId:111},{id:2222,titleAr:"كاشير",departmentId:222}],
  branchLocations: [{branchId:1,locationId:11},{branchId:2,locationId:22}],
  locationDepartments: [{locationId:11,departmentId:111},{locationId:22,departmentId:222}],
};
const worker = {
  id:7,employeeId:"QA7",name:"عامل مشترك",costCenterId:1,costCenter:"الإدارة",locationId:11,locationName:"المكتب",
  departmentId:111,departmentName:"الخدمات",jobTitleId:1111,jobTitleName:"بوفيه",requiredDailyMinutes:540,weeklyRestDay:6,
  supervisors:[],permissions:[],calendar:[],
} as BoardWorker;
const shift = {
  id:1,workerId:7,supervisorId:12,workDate:"2026-10-18",startTime:"06:00",endTime:"10:00",breakMinutes:0,
  plannedMinutes:240,crossesMidnight:false,status:"planned",costCenterId:1,locationId:11,departmentId:111,jobTitleId:1111,
  costCenter:"الإدارة",locationName:"المكتب",departmentName:"الخدمات",jobTitleName:"بوفيه",supervisorName:"مشرف المكتب",
} as BoardAssignment;

describe("per-period work destination in the incremental roster", () => {
  it("retains all destination IDs for editing and copying, and excludes labels from the write payload", () => {
    expect(directPeriod(shift)).toEqual({startTime:"06:00",endTime:"10:00",breakMinutes:0,costCenterId:1,locationId:11,departmentId:111,jobTitleId:1111});
    expect(directPeriod({...shift,jobTitleId:null})).toHaveProperty("jobTitleId",null);
  });
  it("describes the actual evening restaurant task instead of the usual office task", () => {
    expect(periodDestinationText({costCenterId:2,locationId:22,departmentId:222,jobTitleId:2222},worker,catalog)).toBe("المطاعم · المطعم · الكاشير · كاشير");
    expect(periodDestinationText({},worker,catalog)).toBe("الإدارة · المكتب · الخدمات · بوفيه");
  });
  it("rebuilds only the edited cell on destination change while preserving the unified work total", () => {
    const dates=["2026-10-18","2026-10-19"];
    const base={workers:[worker],dates,assignments:[shift],drafts:{},ownerId:12};
    const original=reconcileRosterModel(undefined,base);
    const key=rosterCellKey(7,dates[0]);
    const next=reconcileRosterModel(original,{...base,drafts:{[key]:{workerId:7,workDate:dates[0],intervals:[{...directPeriod(shift),costCenterId:2,locationId:22,departmentId:222,jobTitleId:2222}]}}});
    expect(next.model.get(7)!.cells.get(dates[0])!.mine[0].jobTitleId).toBe(2222);
    expect(next.model.get(7)!.planned).toBe(240);
    expect(next.model.get(7)!.cells.get(dates[1])).toBe(original.model.get(7)!.cells.get(dates[1]));
    expect(next.stats.recalculatedCells).toBe(1);
  });
  it("refreshes a saved task-only change and retains IDs after refetch", () => {
    const base={workers:[worker],dates:["2026-10-18"],assignments:[shift],drafts:{},ownerId:12};
    const original=reconcileRosterModel(undefined,base);
    const next=reconcileRosterModel(original,{...base,assignments:[{...shift,jobTitleId:2222,jobTitleName:"كاشير"}]});
    expect(next.model.get(7)!.cells.get("2026-10-18")!.mine[0].jobTitleId).toBe(2222);
    expect(next.model.get(7)!.planned).toBe(original.model.get(7)!.planned);
    expect(next.stats.recalculatedCells).toBe(1);
  });
  it("labels periods by their actual clock and distinguishes starts after midnight", () => {
    expect(periodTimeLabel("06:00")).toBe("صباحًا");
    expect(periodTimeLabel("16:00")).toBe("مساءً");
    expect(periodTimeLabel("00:30")).toBe("ليلاً");
    expect(periodTimeLabel("04:29")).toBe("ليلاً");
    expect(periodTimeLabel("04:30")).toBe("صباحًا");
    expect(periodClockRange("00:30", "02:00")).toBe("00:30 (+1)–02:00 (+1)");
    expect(periodClockRange("16:00", "01:30")).toBe("16:00–01:30 (+1)");
    expect(periodClockRange("04:29", "04:30")).toBe("04:29 (+1)–04:30 (+1)");
  });
  it("keeps morning before evening regardless of the selected supervisor, and overnight last", () => {
    expect(chronologicalPeriodOrder([{startTime:"16:00"},{startTime:"00:30"}],[{startTime:"06:00"}]).map(({kind,index}) => [kind,index]))
      .toEqual([["other",0],["mine",0],["mine",1]]);
  });
});
