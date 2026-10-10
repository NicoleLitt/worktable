import { test } from "node:test";
import assert from "node:assert/strict";
import {
  makeSeed,
  validateState,
  dates,
  dayInfo,
  conflicts,
  minutes,
  copy,
  syncHabits,
  planSignature,
  interviewProposal,
  acceptProposal,
  undoProposal,
  replanProposal,
  mergeStates,
  stamp,
} from "../shared/model.js";
test("21天种子：预算、独立提交确认、未知工时与重复习惯", () => {
  const s = makeSeed();
  validateState(s);
  assert.equal(dates(s.settings.start, s.settings.end).length, 21);
  const reports = s.tasks.filter((t) => t.projectId === "reports");
  assert.equal(reports.length, 6);
  assert.equal(
    reports.reduce((n, t) => n + t.estimatedMinutes, 0),
    1080,
  );
  assert.equal(
    s.tasks
      .filter((t) => t.projectId === "data")
      .reduce((n, t) => n + t.estimatedMinutes, 0),
    1200,
  );
  assert.equal(
    s.projects.find((p) => p.id === "review").estimatedMinutes,
    null,
  );
  assert.equal(
    s.tasks.find((t) => t.id === "plan-matrix").estimatedMinutes,
    null,
  );
  assert.equal(s.settings.planDue, "2026-10-14");
  assert.equal(s.settings.experimentStart, "2026-10-19");
  assert.equal(s.settings.reviewDue, "2026-10-31");
  s.tasks.find((t) => t.id === "plan-submit").status = "done";
  assert.equal(s.tasks.find((t) => t.id === "plan-confirm").status, "blocked");
  assert.equal(s.habits.filter((h) => h.status !== "exempt").length, 18);
  assert.equal(
    s.habits
      .filter((h) => h.status !== "exempt")
      .reduce((n, h) => n + h.target, 0),
    90,
  );
  syncHabits(s);
  syncHabits(s);
  assert.equal(s.habits.length, 21);
});
test("每周3次3小时健身、一次组会预留、一天休息；实验不伪造每天执行", () => {
  const s = makeSeed();
  for (let w = 0; w < 3; w++) {
    const ds = dates(s.settings.start, s.settings.end).slice(w * 7, w * 7 + 7);
    const gym = s.blocks.filter((b) => b.kind === "gym" && ds.includes(b.date));
    assert.equal(gym.length, 3);
    assert.ok(gym.every((b) => minutes(b.end) - minutes(b.start) === 180));
    assert.equal(
      s.reservations.filter((r) => r.kind === "meeting" && ds.includes(r.date))
        .length,
      1,
    );
    assert.equal(ds.filter((d) => s.settings.restDays[d] === "full").length, 1);
  }
  assert.equal(s.blocks.filter((b) => b.kind === "experiment").length, 0);
  assert.equal(s.events.length, 0);
  assert.equal(s.reservations.filter((r) => r.kind === "experiment").length, 4);
});
test("所有初始工作块不冲突，休息日不工作，容量与间隔不双计", () => {
  const s = makeSeed();
  for (const d of dates(s.settings.start, s.settings.end)) {
    const info = dayInfo(s, d);
    assert.ok(info.planned <= info.limit, d);
    assert.equal(
      info.buffer,
      Math.ceil(Math.max(0, info.raw - info.reserved) * 0.15),
    );
    const work = s.blocks.filter((b) => b.date === d && b.kind === "work");
    assert.ok(new Set(work.map((b) => b.taskId)).size <= 3);
    for (const b of work) {
      assert.ok(minutes(b.end) - minutes(b.start) <= 120);
      assert.deepEqual(conflicts(s, b), []);
    }
    if (s.settings.restDays[d] === "full") assert.equal(work.length, 0);
  }
});
test("面试4小时准备与独立时长；预览、取消无计划变化，接受可撤销", () => {
  const s = makeSeed(),
    sig = planSignature(s);
  const p = interviewProposal(s, {
    title: "技术面试",
    date: "2026-10-16",
    start: "14:00",
    duration: 60,
    prepDate: "2026-10-15",
    prepBefore: "2026-10-16",
    prepMinutes: 240,
    commute: 30,
  });
  assert.equal(planSignature(s), sig);
  assert.equal(
    p.after.blocks
      .filter((b) => b.kind === "prep")
      .reduce((n, b) => n + minutes(b.end) - minutes(b.start), 0),
    240,
  );
  assert.equal(
    p.after.events
      .filter((e) => e.kind === "interview")
      .reduce((n, b) => n + minutes(b.end) - minutes(b.start), 0),
    60,
  );
  assert.equal(p.after.events.filter((e) => e.kind === "commute").length, 2);
  acceptProposal(s, p.id);
  assert.notEqual(planSignature(s), sig);
  undoProposal(s, p.id);
  assert.equal(planSignature(s), sig);
  const q = interviewProposal(s, {
    date: "2026-10-16",
    start: "14:00",
    duration: 60,
    prepDate: "2026-10-15",
    prepBefore: "2026-10-16",
    prepMinutes: 240,
  });
  q.status = "cancelled";
  assert.equal(planSignature(s), sig);
});
test("方案保护导致面试容量不足时不能确认；受保护块不移动", () => {
  const s = makeSeed(),
    sig = planSignature(s);
  const p = interviewProposal(s, {
    date: "2026-10-13",
    start: "14:00",
    duration: 60,
    prepDate: "2026-10-12",
    prepBefore: "2026-10-13",
    prepMinutes: 240,
  });
  assert.ok(p.risks.some((r) => r.includes("容量不足")));
  assert.throws(() => acceptProposal(s, p.id), /容量不足/);
  assert.equal(planSignature(s), sig);
  for (const b of s.blocks.filter((b) => b.taskId?.startsWith("plan-")))
    assert.deepEqual(
      p.after.blocks.find((x) => x.id === b.id),
      b,
    );
});
test("重排保护完成/锁定和历史；实验选择释放该周候选预留", () => {
  const s = makeSeed(),
    b = s.blocks.find((b) => b.kind === "work");
  b.status = "done";
  b.completedSnapshot = copy(b);
  const locked = s.blocks.find((x) => x.kind === "work" && x.id !== b.id);
  locked.locked = true;
  const p = replanProposal(s, "2026-10-19", {
    ...copy(s.settings),
    experimentDates: ["2026-10-20"],
  });
  assert.deepEqual(
    p.after.blocks.find((x) => x.id === b.id),
    b,
  );
  assert.deepEqual(
    p.after.blocks.find((x) => x.id === locked.id),
    locked,
  );
  assert.equal(p.after.blocks.filter((b) => b.kind === "experiment").length, 1);
  assert.equal(
    p.after.blocks.find((b) => b.kind === "experiment").locked,
    true,
  );
  assert.equal(
    p.after.reservations.filter(
      (r) => r.kind === "experiment" && r.date < "2026-10-25",
    ).length,
    0,
  );
  const d = { ...s, ...p.after };
  assert.equal(
    dayInfo(d, "2026-10-20").work,
    dayInfo(d, "2026-10-20").planned - 75,
  );
});
test("休息日修改重新计算目标；占位预算改动真实影响排程", () => {
  const s = makeSeed(),
    st = copy(s.settings);
  st.restDays["2026-10-13"] = "full";
  st.planPlaceholder = 720;
  const p = replanProposal(s, s.settings.start, st);
  assert.equal(
    p.after.blocks.filter((b) => b.date === "2026-10-13" && b.kind === "work")
      .length,
    0,
  );
  assert.ok(p.after.taskUpdates.length);
  const d = { ...s, ...p.after };
  syncHabits(d);
  assert.equal(d.habits.filter((h) => h.status !== "exempt").length, 17);
});
test("安全等待不重复计量；监测等待不能与操作或深度工作并行", () => {
  const s = makeSeed(),
    before = dayInfo(s, "2026-10-16");
  const b = {
    id: "safe",
    date: "2026-10-16",
    start: "08:00",
    end: "12:00",
    title: "安全等待",
    kind: "wait-free",
    status: "todo",
  };
  s.events.push(b);
  assert.deepEqual(dayInfo(s, b.date), before);
  assert.deepEqual(conflicts(s, b), []);
  b.kind = "wait-monitor";
  assert.ok(dayInfo(s, b.date).raw < before.raw);
  assert.ok(
    s.blocks
      .filter((x) => x.date === b.date)
      .some((x) => conflicts(s, x).length),
  );
});
test("JSON往返与无效结构拒绝；记录级并发合并", () => {
  const base = makeSeed();
  assert.deepEqual(validateState(JSON.parse(JSON.stringify(base))), base);
  const bad = copy(base);
  bad.habits.push(copy(bad.habits[0]));
  assert.throws(() => validateState(bad));
  const local = copy(base),
    remote = copy(base);
  local.tasks[0].title = "本机标题";
  remote.tasks[1].title = "服务器标题";
  const a = mergeStates(base, local, remote);
  assert.equal(a.conflicts.length, 0);
  assert.equal(a.state.tasks[0].title, "本机标题");
  assert.equal(a.state.tasks[1].title, "服务器标题");
  remote.tasks[0].title = "另一标题";
  const b = mergeStates(base, local, remote);
  assert.equal(b.conflicts.length, 1);
  const c = mergeStates(base, local, remote, {
    ["tasks:" + local.tasks[0].id]: "local",
  });
  assert.equal(c.state.tasks[0].title, "本机标题");
});

test("逐项修改后重新验证准备总量、面试前期限与锁定历史", () => {
  const s = makeSeed(),
    p = interviewProposal(s, {
      date: "2026-10-16",
      start: "14:00",
      duration: 60,
      prepDate: "2026-10-15",
      prepBefore: "2026-10-16",
      prepMinutes: 240,
    });
  const b = p.after.blocks.find((b) => b.kind === "prep");
  p.after.blocks = p.after.blocks.filter((x) => x.id !== b.id);
  assert.throws(() => acceptProposal(s, p.id), /准备容量不足/);
  p.after.blocks.push({ ...b, date: "2026-10-17" });
  assert.throws(() => acceptProposal(s, p.id), /面试前/);
});
test("扩展范围仅在确认设置时生成重复规则，阶段排程遵循前置完成顺序", () => {
  const s = makeSeed(),
    p = replanProposal(s, s.settings.start, {
      ...copy(s.settings),
      end: "2026-11-07",
    });
  assert.ok(p.after.settings.restDays["2026-11-01"] === "full");
  assert.ok(p.after.settings.gymDates.includes("2026-11-02"));
  const matrix = s.blocks
    .filter((b) => b.taskId === "plan-matrix")
    .sort((a, b) => (a.date + a.end).localeCompare(b.date + b.end))
    .at(-1);
  const steps = s.blocks
    .filter((b) => b.taskId === "plan-steps")
    .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start))[0];
  assert.ok(steps.date + steps.start > matrix.date + matrix.end);
  assert.equal(s.settings.end, "2026-10-31");
});
