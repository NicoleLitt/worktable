export const SCHEMA = 1;
export const REASONS = [
  "估时不足",
  "临时面试或会议",
  "等待导师/设备",
  "精力不足",
  "任务不够明确",
  "优先级变化",
  "其他",
];
export const STATUS = {
  todo: "未开始",
  doing: "进行中",
  partial: "部分完成",
  done: "完成",
  blocked: "阻塞",
  cancelled: "取消",
};
export const COLLECTIONS = [
  "projects",
  "tasks",
  "blocks",
  "habits",
  "events",
  "reservations",
  "reviews",
  "proposals",
  "logs",
];
export const uid = () => globalThis.crypto.randomUUID();
export const copy = (x) => structuredClone(x);
export const now = () => new Date().toISOString();
export const today = () =>
  new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export function dates(start, end) {
  const out = [];
  for (let d = start; d <= end; d = addDays(d, 1)) {
    out.push(d);
    if (out.length > 366) throw Error("日期范围最多366天");
  }
  return out;
}
export function addDays(d, n) {
  return new Date(Date.parse(d + "T12:00:00Z") + n * 86400000)
    .toISOString()
    .slice(0, 10);
}
export const minutes = (t) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};
export const time = (n) =>
  `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
export const hours = (n) =>
  `${(n / 60).toFixed(2).replace(/0+$/, "").replace(/\.$/, "")}h`;
export function stamp(o) {
  o.version = (o.version || 0) + 1;
  o.updatedAt = now();
  return o;
}
function record(o) {
  return { ...o, version: 1, updatedAt: now() };
}
export const weekIndex = (s, d) =>
  Math.floor(
    (Date.parse(d + "T12:00Z") - Date.parse(s.settings.start + "T12:00Z")) /
      604800000,
  );
export function restType(s, d) {
  return s.settings.restDays[d] || "none";
}
export function blocksFor(s, d) {
  return s.blocks.filter((b) => b.date === d && b.status !== "cancelled");
}
export function taskFor(s, b) {
  return s.tasks.find((t) => t.id === b.taskId);
}
export function priority(s, b) {
  return b.kind === "application" ? 2 : (taskFor(s, b)?.priority ?? 99);
}
export function touch(s) {
  s.updatedAt = now();
}
export function task(title, projectId, opts = {}) {
  return record({
    id: uid(),
    title,
    projectId,
    status: "todo",
    estimatedMinutes: null,
    remainingMinutes: null,
    actualMinutes: 0,
    blockedReason: "",
    dependsOn: [],
    priority: 6,
    progress: null,
    checklist: [],
    ...opts,
  });
}
export function makeSeed() {
  const s = {
    schemaVersion: SCHEMA,
    updatedAt: now(),
    settings: record({
      id: "settings",
      timezone: "Asia/Shanghai",
      start: "2026-10-11",
      end: "2026-10-31",
      wake: "08:00",
      sleep: "00:00",
      workEnd: "23:00",
      lunchStart: "12:00",
      lunchEnd: "13:00",
      dinnerStart: "18:00",
      dinnerEnd: "19:00",
      personalStart: "08:00",
      personalEnd: "08:30",
      windDownStart: "22:00",
      windDownEnd: "23:00",
      dailyLimit: 360,
      bufferRate: 0.15,
      breakMinutes: 15,
      applications: 5,
      applicationEach: 15,
      restDays: {
        "2026-10-11": "full",
        "2026-10-18": "full",
        "2026-10-25": "full",
      },
      exemptDays: [],
      gymDates: [
        "2026-10-12",
        "2026-10-14",
        "2026-10-17",
        "2026-10-19",
        "2026-10-21",
        "2026-10-24",
        "2026-10-26",
        "2026-10-28",
        "2026-10-31",
      ],
      gymStart: "15:30",
      gymEnd: "18:30",
      meetingMinutes: 180,
      meetingCandidates: ["2026-10-15", "2026-10-22", "2026-10-29"],
      experimentStart: "2026-10-19",
      experimentCandidates: [
        "2026-10-20",
        "2026-10-23",
        "2026-10-27",
        "2026-10-30",
      ],
      experimentDates: [],
      experimentTime: "09:00",
      experimentMinutes: 120,
      planDue: "2026-10-14",
      reviewDue: "2026-10-31",
      planPlaceholder: 360,
      reviewPlaceholder: 1500,
      interpretation:
        "“15号之前提交”保守解释为10月14日内部提交目标，10月15日跟进；这是可修改的建议。两份综述报告与投稿综述是不同交付物；实习记录总结归入实习报告。",
    }),
    projects: [],
    tasks: [],
    blocks: [],
    habits: [],
    events: [],
    reservations: [],
    reviews: [],
    proposals: [],
    logs: [],
  };
  const ps = [
    [
      "plan",
      "新实验方案",
      "research",
      "2026-10-14",
      "internal",
      "参数矩阵 → 操作步骤 → 提交与导师确认。阶段工时未知；排程暂用6小时可编辑占位预算。",
    ],
    [
      "execution",
      "实验执行",
      "research",
      null,
      "none",
      "目标10月19日启动，依赖导师确认；执行日未定，每周候选工作日仅预留容量。",
    ],
    [
      "review",
      "投稿文献综述",
      "writing",
      "2026-10-31",
      "user",
      "已有大纲与部分正文，只安排剩余工作。研究题目、剩余工时和导师反馈日期未知；暂用25小时占位预算。",
    ],
    [
      "data",
      "旧实验数据处理",
      "research",
      null,
      "none",
      "20小时已知总预算；10个可重命名的2小时块，不假定LSV/Tafel/EIS比例。",
    ],
    [
      "reports",
      "六份独立报告",
      "writing",
      null,
      "none",
      "6份 × 3小时 = 18小时；弹性安排，容量不足可延期到11月。",
    ],
  ];
  s.projects = ps.map(([id, title, category, due, dueType, description]) =>
    record({
      id,
      title,
      category,
      due,
      dueType,
      description,
      topic: "",
      dependsOn: id === "execution" ? ["plan-confirm"] : [],
      blockedReason: "",
      estimatedMinutes: id === "data" ? 1200 : id === "reports" ? 1080 : null,
      remainingMinutes: id === "data" ? 1200 : id === "reports" ? 1080 : null,
      progress: null,
    }),
  );
  s.tasks.push(
    task("参数矩阵：变量、对照组与实验组合", "plan", {
      id: "plan-matrix",
      priority: 1,
      placeholderMinutes: 180,
      checklist: [
        { title: "梳理变量", done: false },
        { title: "核对对照组", done: false },
        { title: "形成可提交矩阵", done: false },
      ],
    }),
    task("操作步骤：条件、流程、记录与注意事项", "plan", {
      id: "plan-steps",
      priority: 1,
      placeholderMinutes: 120,
      dependsOn: ["plan-matrix"],
    }),
    task("向导师提交实验方案", "plan", {
      id: "plan-submit",
      priority: 1,
      placeholderMinutes: 60,
      dependsOn: ["plan-steps"],
    }),
    task("导师确认：反馈修改并记录确认", "plan", {
      id: "plan-confirm",
      priority: 1,
      status: "blocked",
      blockedReason: "等待提交与导师确认",
      dependsOn: ["plan-submit"],
      followUp: "2026-10-15",
    }),
  );
  s.tasks.push(
    task("完成投稿综述剩余初稿", "review", {
      id: "review-draft",
      priority: 4,
      placeholderMinutes: 900,
      due: "2026-10-21",
      dueType: "internal",
    }),
    task("将综述初稿提交导师", "review", {
      id: "review-send",
      notBefore: "2026-10-22",
      priority: 4,
      placeholderMinutes: 60,
      due: "2026-10-22",
      dueType: "internal",
      dependsOn: ["review-draft"],
    }),
    task("根据导师反馈修改并完成格式检查", "review", {
      id: "review-revise",
      notBefore: "2026-10-25",
      priority: 4,
      placeholderMinutes: 360,
      status: "blocked",
      blockedReason: "导师反馈日期未知",
      dependsOn: ["review-send"],
      due: "2026-10-28",
      dueType: "internal",
      followUp: "2026-10-24",
    }),
    task("投稿准备：期刊、格式、材料检查", "review", {
      id: "review-package",
      notBefore: "2026-10-29",
      priority: 4,
      placeholderMinutes: 120,
      dependsOn: ["review-revise"],
      due: "2026-10-30",
      dueType: "internal",
      checklist: ["选择目标期刊", "格式检查", "材料检查"].map((title) => ({
        title,
        done: false,
      })),
    }),
    task("手工确认已投稿", "review", {
      id: "review-submit",
      notBefore: "2026-10-31",
      priority: 4,
      placeholderMinutes: 60,
      dependsOn: ["review-package"],
      due: "2026-10-31",
      dueType: "user",
    }),
  );
  for (let i = 0; i < 10; i++)
    s.tasks.push(
      task(`数据处理 ${i + 1}：分配LSV / Tafel / EIS或核对导出工作`, "data", {
        id: `data-${i + 1}`,
        priority: 5,
        estimatedMinutes: 120,
        remainingMinutes: 120,
        checklist: ["处理或整理原始数据", "核对结果", "导出图表与结论"].map(
          (title) => ({ title, done: false }),
        ),
      }),
    );
  [
    "综述报告1",
    "综述报告2",
    "讲座报告1",
    "讲座报告2",
    "讲座报告3",
    "实习报告",
  ].forEach((name, i) =>
    s.tasks.push(
      task(`${name}：整理材料、撰写并核对`, "reports", {
        id: `report-${i + 1}`,
        priority: 6,
        estimatedMinutes: 180,
        remainingMinutes: 180,
        checklist: ["材料梳理", "撰写", "核对"].map((title) => ({
          title,
          done: false,
        })),
      }),
    ),
  );
  syncHabits(s);
  s.reservations = baseReservations(s);
  s.blocks = baseGym(s);
  const p = planWork(s, s.settings.start, { initial: true });
  s.blocks.push(...p.add);
  s.settings.initialUnscheduled = p.unplaced;
  s.logs.push(
    record({
      id: uid(),
      at: now(),
      title: "首次初始化21天建议计划",
      detail: "占位预算不是用户估时；导师依赖未通过；未确定事件只预留容量。",
    }),
  );
  return s;
}
export function syncHabits(s) {
  for (const d of dates(s.settings.start, s.settings.end)) {
    let h = s.habits.find((x) => x.date === d);
    if (!h) {
      h = record({
        id: "habit-" + d,
        date: d,
        count: 0,
        actualMinutes: 0,
        note: "",
        status: "todo",
      });
      s.habits.push(h);
    }
    const oldHabit = JSON.stringify(h);
    const exempt =
      restType(s, d) === "full" || s.settings.exemptDays.includes(d);
    if (h.status !== "done" && h.count === 0)
      h.status = exempt ? "exempt" : "todo";
    if (d >= today() && !["done"].includes(h.status)) {
      h.target = s.settings.applications;
      h.estimatedMinutes = h.target * s.settings.applicationEach;
      h.status = exempt
        ? "exempt"
        : h.count >= h.target
          ? "done"
          : h.count
            ? "partial"
            : h.status === "doing"
              ? "doing"
              : "todo";
    } else if (!h.target) {
      h.target = s.settings.applications;
      h.estimatedMinutes = h.target * s.settings.applicationEach;
    }
    if (JSON.stringify(h) !== oldHabit) stamp(h);
  }
}
export function extendRules(previous, settings) {
  if (settings.end <= previous.end) return settings;
  for (const d of dates(addDays(previous.end, 1), settings.end)) {
    const dow = new Date(d + "T12:00Z").getUTCDay();
    if (dow === 0 && !settings.restDays[d]) settings.restDays[d] = "full";
    if ([1, 3, 6].includes(dow) && !settings.gymDates.includes(d))
      settings.gymDates.push(d);
    if (dow === 4 && !settings.meetingCandidates.includes(d))
      settings.meetingCandidates.push(d);
    if (
      [2, 5].includes(dow) &&
      d >= settings.experimentStart &&
      !settings.experimentCandidates.includes(d)
    )
      settings.experimentCandidates.push(d);
  }
  return settings;
}
export function baseGym(s) {
  return s.settings.gymDates
    .filter((d) => d >= s.settings.start && d <= s.settings.end)
    .map((d) =>
      record({
        id: "gym-" + d,
        date: d,
        start: s.settings.gymStart,
        end: s.settings.gymEnd,
        kind: "gym",
        title: "健身（含相关时间3小时，可移动建议）",
        locked: false,
        status: "todo",
        actualMinutes: 0,
        note: "",
      }),
    );
}
export function baseReservations(s) {
  const r = s.settings.meetingCandidates
    .filter((d) => d >= s.settings.start && d <= s.settings.end)
    .map((d) =>
      record({
        id: "meeting-" + d,
        date: d,
        kind: "meeting",
        minutes: s.settings.meetingMinutes,
        title: "待确认组会（本周容量预留）",
      }),
    );
  for (const d of s.settings.experimentCandidates)
    if (
      d >= s.settings.experimentStart &&
      d >= s.settings.start &&
      d <= s.settings.end &&
      !s.settings.experimentDates.some(
        (e) => weekIndex(s, e) === weekIndex(s, d),
      )
    )
      r.push(
        record({
          id: "experiment-" + d,
          date: d,
          kind: "experiment",
          minutes: s.settings.experimentMinutes,
          title: "待确认实验安排（容量预留，非执行日）",
        }),
      );
  return r;
}
function mergeIntervals(intervals) {
  const out = [];
  for (const [a, b] of intervals.sort((a, b) => a[0] - b[0])) {
    if (b <= a) continue;
    const last = out.at(-1);
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out;
}
export function dayInfo(s, d, { ignoreWork = false } = {}) {
  const st = s.settings,
    begin = minutes(st.wake),
    finish = Math.min(
      minutes(st.workEnd),
      st.sleep === "00:00" ? 1440 : minutes(st.sleep),
    );
  let intervals = [
    [minutes(st.lunchStart), minutes(st.lunchEnd)],
    [minutes(st.dinnerStart), minutes(st.dinnerEnd)],
    [minutes(st.personalStart), minutes(st.personalEnd)],
    [minutes(st.windDownStart), minutes(st.windDownEnd)],
  ];
  const rt = restType(s, d);
  if (rt === "full") intervals.push([begin, finish]);
  if (rt === "am") intervals.push([begin, 13 * 60]);
  if (rt === "pm") intervals.push([13 * 60, finish]);
  const active = blocksFor(s, d);
  for (const b of active)
    if (
      b.kind !== "application" &&
      (!ignoreWork ||
        [
          "gym",
          "experiment",
          "interview",
          "commute",
          "fixed",
          "wait-monitor",
        ].includes(b.kind) ||
        b.locked ||
        b.status === "done")
    )
      intervals.push([
        minutes(b.start),
        minutes(b.end) + (b.kind === "work" ? st.breakMinutes : 0),
      ]);
  for (const e of s.events.filter(
    (e) => e.date === d && e.status !== "cancelled" && e.kind !== "wait-free",
  ))
    intervals.push([minutes(e.start), minutes(e.end)]);
  // Explicitly safe waits are informational windows; never add task capacity twice.
  const merged = mergeIntervals(
    intervals.map(([a, b]) => [Math.max(begin, a), Math.min(finish, b)]),
  );
  let free = [],
    cursor = begin;
  for (const [a, b] of merged) {
    if (a > cursor) free.push([cursor, a]);
    cursor = Math.max(cursor, b);
  }
  if (cursor < finish) free.push([cursor, finish]);
  // Capacity uses calendar occupancy once, then deducts uncertain reservations and 15% buffer once.
  let fixed = [
    [minutes(st.lunchStart), minutes(st.lunchEnd)],
    [minutes(st.dinnerStart), minutes(st.dinnerEnd)],
    [minutes(st.personalStart), minutes(st.personalEnd)],
    [minutes(st.windDownStart), minutes(st.windDownEnd)],
  ];
  if (rt === "full") fixed.push([begin, finish]);
  if (rt === "am") fixed.push([begin, 780]);
  if (rt === "pm") fixed.push([780, finish]);
  for (const b of active)
    if (
      ["gym", "interview", "commute", "fixed", "wait-monitor"].includes(b.kind)
    )
      fixed.push([minutes(b.start), minutes(b.end)]);
  for (const e of s.events.filter(
    (e) => e.date === d && e.status !== "cancelled" && e.kind !== "wait-free",
  ))
    fixed.push([minutes(e.start), minutes(e.end)]);
  const occupied = mergeIntervals(
    fixed.map(([a, b]) => [Math.max(begin, a), Math.min(finish, b)]),
  ).reduce((n, [a, b]) => n + b - a, 0);
  const raw = Math.max(0, finish - begin - occupied),
    reserved = s.reservations
      .filter((r) => r.date === d)
      .reduce((n, r) => n + r.minutes, 0),
    usable = Math.max(0, raw - reserved),
    buffer = Math.ceil(usable * st.bufferRate),
    limit = rt === "full" ? 0 : Math.min(st.dailyLimit, usable - buffer);
  const habit = s.habits.find((h) => h.date === d),
    application =
      habit && habit.status !== "exempt" ? habit.estimatedMinutes : 0;
  const work = active
      .filter((b) => ["work", "experiment", "prep"].includes(b.kind))
      .reduce((n, b) => n + minutes(b.end) - minutes(b.start), 0),
    planned = work + application;
  const calendar = [
    ...active,
    ...s.events.filter((e) => e.date === d && e.status !== "cancelled"),
  ].filter((b) => !["wait-free", "application"].includes(b.kind));
  const overlapRisks = [];
  for (let i = 0; i < calendar.length; i++)
    for (let j = i + 1; j < calendar.length; j++) {
      const a = calendar[i],
        b = calendar[j];
      if (
        minutes(a.start) < minutes(b.end) &&
        minutes(b.start) < minutes(a.end)
      )
        overlapRisks.push(
          `日程冲突：${a.title} 与 ${b.title}；请手工选择移动，锁定项不会自动变更。`,
        );
    }
  return {
    raw,
    reserved,
    usable,
    buffer,
    limit,
    application,
    work,
    planned,
    remaining: limit - planned,
    free,
    rest: rt,
    risks: [
      ...overlapRisks,
      ...(planned > limit
        ? [`任务超出净容量${planned - limit}分钟；请选择移动或免除投递`]
        : []),
      ...(active.some(
        (b) =>
          b.kind === "gym" &&
          minutes(b.start) < minutes(st.dinnerEnd) &&
          minutes(b.end) > minutes(st.dinnerStart),
      )
        ? ["健身与晚餐预留相交：建议将晚餐改到18:30—19:30，请在设置确认"]
        : []),
    ],
  };
}
export function conflicts(s, b, ignoreId = b.id) {
  if (b.kind === "wait-free") return [];
  const d = b.date,
    st = s.settings,
    a = minutes(b.start),
    z = minutes(b.end),
    errors = [];
  if (
    z <= a ||
    a < minutes(st.wake) ||
    z > minutes(st.workEnd) ||
    z > (st.sleep === "00:00" ? 1440 : minutes(st.sleep))
  )
    errors.push("超出作息可用时间");
  if (
    restType(s, d) === "full" ||
    (restType(s, d) === "am" && a < 780) ||
    (restType(s, d) === "pm" && z > 780)
  )
    errors.push("与休息时段冲突");
  for (const x of [
    ...blocksFor(s, d),
    ...s.events.filter(
      (e) => e.date === d && e.status !== "cancelled" && e.kind !== "wait-free",
    ),
  ])
    if (
      x.id !== ignoreId &&
      x.kind !== "application" &&
      x.kind !== "wait-free" &&
      a < minutes(x.end) &&
      z > minutes(x.start)
    )
      errors.push(`与${x.title}${x.locked ? "（锁定）" : ""}冲突`);
  for (const [name, start, end] of [
    ["午餐", st.lunchStart, st.lunchEnd],
    ["晚餐", st.dinnerStart, st.dinnerEnd],
    ["起床与个人生活", st.personalStart, st.personalEnd],
    ["睡前个人生活", st.windDownStart, st.windDownEnd],
  ])
    if (a < minutes(end) && z > minutes(start))
      errors.push(`与${name}预留冲突`);
  return errors;
}
function rankTasks(s, initial) {
  return s.tasks
    .filter(
      (t) =>
        !["done", "cancelled"].includes(t.status) &&
        (t.estimatedMinutes !== null || t.placeholderMinutes),
    )
    .sort(
      (a, b) =>
        a.priority - b.priority || s.tasks.indexOf(a) - s.tasks.indexOf(b),
    );
}
export function planWork(s, from, { initial = false, exclude = [] } = {}) {
  const draft = copy(s),
    add = [],
    unplaced = [],
    st = s.settings;
  for (const t of rankTasks(s, initial)) {
    const isReview = t.projectId === "review",
      isPlan = t.projectId === "plan";
    const existing = draft.blocks
      .filter((b) => b.taskId === t.id && b.status !== "cancelled")
      .reduce((n, b) => n + minutes(b.end) - minutes(b.start), 0);
    let left = Math.max(
      0,
      (t.remainingMinutes ?? t.estimatedMinutes ?? t.placeholderMinutes ?? 0) -
        existing,
    ); // unknowns remain unknown in model; explicit placeholders only
    if (exclude.includes(t.id)) continue;
    const minDate =
        t.notBefore ||
        (isPlan
          ? st.start
          : isReview
            ? addDays(st.start, 3)
            : addDays(st.start, 4)),
      deadline = isPlan
        ? st.planDue
        : t.id === "review-submit"
          ? st.reviewDue
          : t.due || st.end;
    const prior = t.dependsOn
      .flatMap((id) =>
        draft.blocks.filter((b) => b.taskId === id && b.status !== "cancelled"),
      )
      .sort((a, b) => (a.date + a.end).localeCompare(b.date + b.end))
      .at(-1);
    for (const d of dates(from, st.end)) {
      if (prior && d < prior.date) continue;
      if (!left) break;
      if (d < minDate || d > deadline || restType(draft, d) === "full")
        continue;
      if (isPlan && t.id !== "plan-confirm" && d > st.planDue) continue;
      let info = dayInfo(draft, d),
        room = info.remaining;
      const unique = new Set(
        blocksFor(draft, d)
          .filter((b) => ["work", "prep", "experiment"].includes(b.kind))
          .map((b) => b.taskId),
      );
      if (unique.size >= 3 && !unique.has(t.id)) continue;
      for (const [a0, z] of info.free) {
        const a =
          prior && d === prior.date
            ? Math.max(a0, minutes(prior.end) + st.breakMinutes)
            : a0;
        if (room < 30 || left <= 0) break;
        const duration = Math.min(90, left, room, z - a - st.breakMinutes);
        if (duration < 30) continue;
        const b = record({
          id: uid(),
          taskId: t.id,
          date: d,
          start: time(a),
          end: time(a + duration),
          kind: "work",
          title: t.title,
          locked: false,
          status: "todo",
          actualMinutes: 0,
          note: "",
          tentative: t.status === "blocked" || t.dependsOn.length > 0,
          budgetSource:
            t.estimatedMinutes === null ? "placeholder" : "estimate",
        });
        draft.blocks.push(b);
        add.push(b);
        left -= duration;
        room -= duration;
        info = dayInfo(draft, d);
      }
    }
    if (left > 0)
      unplaced.push({
        taskId: t.id,
        title: t.title,
        minutes: left,
        reason: "日期、每日容量或关键节点限制；建议延长范围/估时后确认。",
      });
  }
  return { add, unplaced };
}
export function milestoneRisks(s) {
  const out = ["投稿可行性尚待估算：综述剩余工时未知；导师反馈日期也未知。"];
  if (s.tasks.find((t) => t.id === "plan-confirm")?.status !== "done")
    out.push(`${s.settings.experimentStart}实验启动依赖导师确认，当前未通过。`);
  if (s.tasks.find((t) => t.id === "review-revise")?.status === "blocked")
    out.push("综述修改需导师反馈；建议在跟进日确认回复，不能保证外部时限。");
  return out;
}
export function proposal(
  s,
  title,
  from,
  after,
  details = [],
  risks = [],
  kind = "reschedule",
) {
  const p = record({
    id: uid(),
    title,
    kind,
    status: "pending",
    createdAt: now(),
    baseSignature: planSignature(s),
    before: {
      blocks: copy(s.blocks),
      events: copy(s.events),
      reservations: copy(s.reservations),
      settings: copy(s.settings),
      tasks: copy(s.tasks),
      projects: copy(s.projects),
    },
    after,
    details,
    risks,
    from,
  });
  s.proposals.push(p);
  return p;
}
export function planSignature(s) {
  return JSON.stringify([
    s.blocks,
    s.events,
    s.reservations,
    s.settings,
    s.tasks,
    s.projects,
  ]);
}
export function replanProposal(s, from = today(), settings = null) {
  const d = copy(s),
    effective = from < s.settings.start ? s.settings.start : from;
  d.blocks = d.blocks.filter(
    (b) =>
      b.date < effective ||
      b.locked ||
      ["done", "partial", "doing", "cancelled"].includes(b.status) ||
      !["work", "gym", "experiment"].includes(b.kind),
  );
  if (settings) {
    for (const date of s.settings.experimentDates.filter(
      (date) => !settings.experimentDates.includes(date),
    ))
      if (
        d.blocks.some(
          (b) =>
            b.kind === "experiment" &&
            b.date === date &&
            b.locked &&
            b.status !== "cancelled",
        )
      )
        throw Error(
          `${date}实验操作已锁定；先明确取消或解锁，不能通过执行日选择器默默移动。`,
        );
    d.settings = extendRules(s.settings, { ...d.settings, ...copy(settings) });
    for (const [date, type] of Object.entries(s.settings.restDays))
      if (date < effective) d.settings.restDays[date] = type;
    stamp(d.settings);
    syncHabits(d);
    d.reservations = d.reservations.filter((r) => r.date < effective);
    d.reservations.push(
      ...baseReservations(d).filter(
        (r) =>
          r.date >= effective &&
          !d.events.some((e) => e.reservationId === r.id),
      ),
    );
    const have = new Set(d.blocks.map((b) => b.id));
    d.blocks.push(
      ...baseGym(d).filter((b) => b.date >= effective && !have.has(b.id)),
    );
    for (const date of d.settings.experimentDates)
      if (
        date >= effective &&
        !d.blocks.some((b) => b.kind === "experiment" && b.date === date)
      )
        d.blocks.push(
          record({
            id: "execute-" + date,
            date,
            start: d.settings.experimentTime,
            end: time(
              minutes(d.settings.experimentTime) + d.settings.experimentMinutes,
            ),
            kind: "experiment",
            title: "实验亲自操作（导师确认后执行）",
            locked: true,
            status: "todo",
            taskId: "experiment-" + date,
            actualMinutes: 0,
            note: "",
          }),
        );
  }
  syncHabits(d);
  for (const [id, key] of [
    ["plan", "planDue"],
    ["review", "reviewDue"],
  ]) {
    const p = d.projects.find((p) => p.id === id);
    if (p && p.due !== d.settings[key]) {
      p.due = d.settings[key];
      stamp(p);
    }
  }
  const finalStage = d.tasks.find((t) => t.id === "review-submit");
  if (finalStage && finalStage.due !== d.settings.reviewDue) {
    finalStage.due = d.settings.reviewDue;
    stamp(finalStage);
  }
  for (const [project, key] of [
    ["plan", "planPlaceholder"],
    ["review", "reviewPlaceholder"],
  ])
    if (d.settings[key] !== s.settings[key]) {
      const ts = d.tasks.filter(
        (t) =>
          t.projectId === project &&
          t.placeholderMinutes &&
          t.status !== "done" &&
          t.estimatedMinutes === null,
      );
      const old = ts.reduce((n, t) => n + t.placeholderMinutes, 0);
      for (const t of ts) {
        t.placeholderMinutes = Math.round(
          (d.settings[key] * t.placeholderMinutes) / (old || 1),
        );
        stamp(t);
      }
    }
  const { add, unplaced } = planWork(d, effective);
  d.blocks.push(...add);
  const risks = unplaced.map(
    (x) => `${x.title}：${x.minutes}分钟未排入 / 可延期到11月`,
  );
  for (const b of d.blocks.filter(
    (b) => b.date >= effective && ["gym", "experiment"].includes(b.kind),
  ))
    risks.push(
      ...conflicts(d, b).map((x) =>
        b.kind === "gym" && /午餐|晚餐/.test(x)
          ? `${b.date} 生活时段调整建议：健身覆盖用餐预留，请另行确认用餐时间。`
          : `${b.date} ${b.title}：${x}`,
      ),
    );
  const details = diffBlocks(s.blocks, d.blocks);
  return proposal(
    s,
    "未来计划调整预览",
    effective,
    {
      blocks: d.blocks,
      events: d.events,
      reservations: d.reservations,
      settings: d.settings,
      projectUpdates: d.projects.filter(
        (p) =>
          JSON.stringify(p) !==
          JSON.stringify(s.projects.find((x) => x.id === p.id)),
      ),
      taskUpdates: d.tasks.filter(
        (t) =>
          JSON.stringify(t) !==
          JSON.stringify(s.tasks.find((x) => x.id === t.id)),
      ),
    },
    details,
    risks,
  );
}
export function diffBlocks(before, after) {
  const rows = [];
  for (const b of before) {
    const n = after.find((x) => x.id === b.id);
    if (!n)
      rows.push({
        id: b.id,
        title: b.title,
        before: `${b.date} ${b.start}—${b.end}`,
        after: "移出/重新分配",
        reason: "按优先级重排未来未开始块",
      });
    else if (JSON.stringify(n) !== JSON.stringify(b))
      rows.push({
        id: b.id,
        title: b.title,
        before: `${b.date} ${b.start}—${b.end}`,
        after: `${n.date} ${n.start}—${n.end}`,
        reason: "腾出准备时间",
      });
  }
  for (const b of after)
    if (!before.some((x) => x.id === b.id))
      rows.push({
        id: b.id,
        title: b.title,
        before: "未安排",
        after: `${b.date} ${b.start}—${b.end}`,
        reason: b.kind === "prep" ? "面试前准备" : "新增建议块",
      });
  return rows;
}
export function interviewProposal(s, input) {
  const d = copy(s),
    event = record({
      id: uid(),
      title: input.title || "面试",
      date: input.date,
      start: input.start,
      end: time(minutes(input.start) + input.duration),
      kind: "interview",
      locked: true,
      status: "todo",
      location: input.location || "",
      note: input.note || "",
    });
  if (input.duration <= 0 || minutes(event.end) > minutes(s.settings.workEnd))
    throw Error("面试时长或结束时间无效");
  const commute = input.commute || 0;
  const events = [event];
  if (commute)
    events.push(
      record({
        id: uid(),
        title: "面试通勤（去程）",
        date: input.date,
        start: time(minutes(input.start) - commute),
        end: input.start,
        kind: "commute",
        locked: true,
        status: "todo",
      }),
      record({
        id: uid(),
        title: "面试通勤（返程）",
        date: input.date,
        start: event.end,
        end: time(minutes(event.end) + commute),
        kind: "commute",
        locked: true,
        status: "todo",
      }),
    );
  const cutoff = today() > s.settings.start ? today() : s.settings.start;
  const from = input.prepDate || addDays(input.date, -1);
  if (from < cutoff) throw Error("不能调整历史；请选择今天或以后的准备期限");
  if (from > input.date) throw Error("准备期限必须在面试前");
  const protect = (b) =>
    b.date < cutoff ||
    b.locked ||
    ["done", "doing", "partial"].includes(b.status) ||
    ["gym", "experiment", "wait-monitor"].includes(b.kind) ||
    taskFor(s, b)?.projectId === "plan";
  const displaced = [];
  // Remove flexible low-priority work on preparation dates; all changes stay in proposal.
  d.blocks = d.blocks.filter((b) => {
    if (b.date < from || b.date > input.date || protect(b)) return true;
    const hit =
      b.date < input.date ||
      events.some(
        (e) =>
          e.date === b.date &&
          minutes(b.start) < minutes(e.end) &&
          minutes(b.end) > minutes(e.start),
      );
    if (hit && b.kind === "work") {
      displaced.push(b);
      return false;
    }
    return true;
  });
  const risks = [];
  for (const e of events)
    risks.push(
      ...conflicts(d, e, null).map(
        (x) => `${e.title}：${x}；需要用户选择，不会移动受保护项`,
      ),
    );
  d.events.push(...events);
  let left = input.prepMinutes ?? 240;
  const prepBefore = input.prepBefore || input.date;
  for (const date of dates(from, prepBefore)) {
    if (left <= 0) break;
    let info = dayInfo(d, date),
      room = info.remaining;
    const outcomes = new Set(
      blocksFor(d, date)
        .filter((b) => ["work", "prep", "experiment"].includes(b.kind))
        .map((b) => b.taskId || b.title),
    );
    if (outcomes.size >= 3) continue;
    for (const [a, z0] of info.free) {
      const z =
        date === input.date
          ? Math.min(z0, minutes(events[0].start) - commute)
          : z0;
      if (left <= 0 || room < 30) break;
      const n = Math.min(left, 120, room, z - a - s.settings.breakMinutes);
      if (n < 30) continue;
      d.blocks.push(
        record({
          id: uid(),
          date,
          start: time(a),
          end: time(a + n),
          kind: "prep",
          title: `面试准备：${event.title}`,
          taskId: "prep-" + event.id,
          locked: false,
          status: "todo",
          actualMinutes: 0,
          note: "",
        }),
      );
      left -= n;
      room -= n;
    }
  }
  if (left)
    risks.push(`准备容量不足：还有${left}分钟未排入，不能声称准备已完成排程。`);
  // Reschedule displaced reports first; writing/data follow, with original length and identities preserved.
  for (const b of displaced.sort((a, b) => priority(s, b) - priority(s, a))) {
    let placed = false;
    for (const date of dates(addDays(input.date, 1), s.settings.end)) {
      const info = dayInfo(d, date),
        n = minutes(b.end) - minutes(b.start);
      if (
        info.remaining < n ||
        new Set(
          blocksFor(d, date)
            .filter((x) => x.taskId)
            .map((x) => x.taskId),
        ).size >= 3
      )
        continue;
      const slot = info.free.find(
        ([a, z]) => z - a >= n + s.settings.breakMinutes,
      );
      if (slot) {
        const next = stamp({
          ...b,
          date,
          start: time(slot[0]),
          end: time(slot[0] + n),
        });
        d.blocks.push(next);
        placed = true;
        break;
      }
    }
    if (!placed) risks.push(`${b.title}未排入，保留为待排任务；建议延长范围。`);
    if (taskFor(s, b)?.due && input.date >= taskFor(s, b).due)
      risks.push(`${b.title}可能影响${taskFor(s, b).due}里程碑。`);
  }
  for (const date of dates(from, input.date))
    risks.push(...dayInfo(d, date).risks.map((x) => `${date}：${x}`));
  const p = proposal(
    s,
    `插入${event.title}：准备${hours(input.prepMinutes ?? 240)} + 面试${hours(input.duration)}（分别计时）`,
    from,
    {
      blocks: d.blocks,
      events: d.events,
      reservations: d.reservations,
      settings: d.settings,
    },
    diffBlocks(s.blocks, d.blocks),
    risks,
    "interview",
  );
  p.interviewRequirement = {
    eventId: event.id,
    prepMinutes: input.prepMinutes ?? 240,
    prepDate: from,
    prepBefore,
  };
  return p;
}
export function proposalProblems(s, p) {
  const errors = [],
    draft = { ...copy(s), ...copy(p.after) };
  syncHabits(draft);
  for (const b of [...draft.blocks, ...draft.events].filter(
    (b) => b.status !== "cancelled",
  )) {
    const old = [...p.before.blocks, ...p.before.events].find(
      (x) => x.id === b.id,
    );
    if (
      !old ||
      old.date !== b.date ||
      old.start !== b.start ||
      old.end !== b.end
    )
      errors.push(
        ...conflicts(draft, b)
          .filter((x) => !(b.kind === "gym" && /午餐|晚餐/.test(x)))
          .map((x) => `${b.date} ${b.title}：${x}`),
      );
  }
  for (const b of p.before.blocks)
    if (
      b.date < today() ||
      b.locked ||
      ["done", "doing", "partial"].includes(b.status)
    ) {
      const next = draft.blocks.find((x) => x.id === b.id);
      if (
        !next ||
        next.date !== b.date ||
        next.start !== b.start ||
        next.end !== b.end ||
        next.status !== b.status
      )
        errors.push(`${b.title}：历史、锁定或已有实际记录的块不可被调整移动。`);
    }
  for (const d of dates(draft.settings.start, draft.settings.end))
    if (d >= today())
      errors.push(
        ...dayInfo(draft, d)
          .risks.filter((r) => r.includes("超出净容量"))
          .map((r) => `${d}：${r}`),
      );
  if (p.interviewRequirement) {
    const req = p.interviewRequirement,
      event = draft.events.find((e) => e.id === req.eventId),
      prep = draft.blocks.filter(
        (b) =>
          b.kind === "prep" &&
          b.taskId === "prep-" + req.eventId &&
          b.status !== "cancelled",
      );
    const total = prep.reduce(
      (n, b) => n + minutes(b.end) - minutes(b.start),
      0,
    );
    if (total < req.prepMinutes)
      errors.push(
        `准备容量不足：还有${req.prepMinutes - total}分钟未排入，请重新生成或补齐准备窗口。`,
      );
    if (!event) errors.push("面试事件缺失");
    else
      for (const b of prep)
        if (
          b.date < req.prepDate ||
          b.date > req.prepBefore ||
          b.date > event.date ||
          (b.date === event.date && minutes(b.end) > minutes(event.start))
        )
          errors.push("准备必须在指定期限及面试前完成，不能移到面试之后。");
  }
  return [...new Set(errors)];
}
export function acceptProposal(s, id) {
  const p = s.proposals.find((p) => p.id === id);
  if (!p || p.status !== "pending") throw Error("建议已处理");
  if (p.baseSignature !== planSignature(s))
    throw Error("计划在预览后已更改，请取消并重新生成建议");
  const problems = proposalProblems(s, p);
  if (problems.length) throw Error(problems.join("；"));
  for (const key of ["blocks", "events", "reservations", "settings"])
    s[key] = copy(p.after[key]);
  for (const project of p.after.projectUpdates || [])
    s.projects[s.projects.findIndex((x) => x.id === project.id)] =
      copy(project);
  for (const t of p.after.taskUpdates || [])
    s.tasks[s.tasks.findIndex((x) => x.id === t.id)] = copy(t);
  stamp(p);
  p.status = "accepted";
  p.acceptedSignature = planSignature(s);
  p.acceptedAt = now();
  syncHabits(s);
  s.logs.push(
    record({
      id: uid(),
      at: now(),
      title: "确认调整：" + p.title,
      detail: p.details.length + "项日程变化；" + p.risks.join("；"),
      proposalId: p.id,
    }),
  );
  touch(s);
}
export function undoProposal(s, id) {
  const p = s.proposals.find((p) => p.id === id);
  if (!p || p.status !== "accepted") throw Error("不能撤销");
  if (p.acceptedSignature !== planSignature(s))
    throw Error("接受后已有新计划或完成记录，请生成新的调整，避免覆盖历史");
  for (const k of ["blocks", "events", "reservations", "settings"])
    s[k] = copy(p.before[k]);
  for (const project of p.after.projectUpdates || [])
    s.projects[s.projects.findIndex((x) => x.id === project.id)] = copy(
      p.before.projects.find((x) => x.id === project.id),
    );
  for (const t of p.after.taskUpdates || []) {
    const old = p.before.tasks.find((x) => x.id === t.id);
    s.tasks[s.tasks.findIndex((x) => x.id === t.id)] = copy(old);
  }
  p.status = "undone";
  stamp(p);
  syncHabits(s);
  s.logs.push(
    record({
      id: uid(),
      at: now(),
      title: "撤销调整：" + p.title,
      detail: "原计划恢复，复盘记录保留",
    }),
  );
  touch(s);
}
export function reviewAdvice(reason) {
  return (
    {
      估时不足: "延长剩余估时：先增加25%，核对可用容量后预览调整。",
      临时面试或会议:
        "优先移动弹性报告，再移动可延后写作；保留关键方案与锁定项。",
      "等待导师/设备":
        "设为阻塞，明确下一跟进日；外部依赖未通过时不执行依赖任务。",
      精力不足: "减少下一工作日负荷，将一个深度块改成最小下一步。",
      任务不够明确: "拆出可验证的最小产出，如一张参数矩阵或一幅核对后的图。",
      优先级变化: "检查截止节点，再预览未来未开始块的移动。",
      其他: "根据备注修改估时或拆分任务；确认后才更新日程。",
    }[reason] || "填写原因后生成具体建议。"
  );
}
export function validateState(s) {
  const fail = (m) => {
    throw Error(m);
  };
  if (!s || s.schemaVersion !== SCHEMA) fail("schemaVersion不支持");
  if (!s.settings || s.settings.timezone !== "Asia/Shanghai")
    fail("时区必须为Asia/Shanghai");
  for (const k of COLLECTIONS)
    if (!Array.isArray(s[k]) || s[k].length > 12000)
      fail(k + "必须为合理长度的数组");
  const date = (d) =>
    typeof d === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(d) &&
    new Date(d + "T12:00Z").toISOString().slice(0, 10) === d;
  const clock = (t) =>
    typeof t === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
  const finite = (n) => typeof n === "number" && Number.isFinite(n) && n >= 0;
  if (
    s.settings.id !== "settings" ||
    !Number.isInteger(s.settings.version) ||
    s.settings.version < 1
  )
    fail("设置版本无效");
  for (const k of ["planDue", "reviewDue", "experimentStart"])
    if (!date(s.settings[k])) fail(k + "日期无效");
  if (
    !date(s.settings.start) ||
    !date(s.settings.end) ||
    s.settings.start > s.settings.end
  )
    fail("日期范围无效");
  dates(s.settings.start, s.settings.end);
  for (const k of [
    "wake",
    "sleep",
    "workEnd",
    "lunchStart",
    "lunchEnd",
    "dinnerStart",
    "dinnerEnd",
    "gymStart",
    "gymEnd",
    "experimentTime",
    "personalStart",
    "personalEnd",
    "windDownStart",
    "windDownEnd",
  ])
    if (!clock(s.settings[k])) fail(k + "时间无效");
  if (
    !finite(s.settings.dailyLimit) ||
    s.settings.dailyLimit > 420 ||
    s.settings.dailyLimit < 60 ||
    s.settings.bufferRate < 0.15 ||
    s.settings.bufferRate > 0.5
  )
    fail("每日上限应为1—7小时，缓冲至少15%");
  if (
    minutes(s.settings.wake) >= minutes(s.settings.workEnd) ||
    minutes(s.settings.workEnd) >
      (s.settings.sleep === "00:00" ? 1440 : minutes(s.settings.sleep))
  )
    fail("作息时间无效，工作须在起床后与睡眠前");
  for (const [a, b] of [
    ["lunchStart", "lunchEnd"],
    ["dinnerStart", "dinnerEnd"],
    ["personalStart", "personalEnd"],
    ["windDownStart", "windDownEnd"],
    ["gymStart", "gymEnd"],
  ])
    if (minutes(s.settings[b]) <= minutes(s.settings[a]))
      fail("生活时段结束必须晚于开始");
  if (
    !s.settings.restDays ||
    typeof s.settings.restDays !== "object" ||
    Array.isArray(s.settings.restDays)
  )
    fail("休息日设置无效");
  for (const [d, v] of Object.entries(s.settings.restDays))
    if (!date(d) || !["full", "am", "pm", "none"].includes(v))
      fail("休息日无效");
  for (const k of [
    "gymDates",
    "meetingCandidates",
    "experimentCandidates",
    "experimentDates",
    "exemptDays",
  ])
    if (!Array.isArray(s.settings[k]) || s.settings[k].some((d) => !date(d)))
      fail(k + "日期无效");
  for (const k of [
    "applications",
    "applicationEach",
    "meetingMinutes",
    "experimentMinutes",
    "planPlaceholder",
    "reviewPlaceholder",
    "breakMinutes",
  ])
    if (!finite(s.settings[k]) || s.settings[k] > 10000) fail(k + "数值无效");
  for (const k of COLLECTIONS) {
    const ids = new Set();
    for (const x of s[k]) {
      if (
        !x ||
        typeof x.id !== "string" ||
        !x.id ||
        ids.has(x.id) ||
        !Number.isInteger(x.version) ||
        x.version < 1 ||
        typeof x.updatedAt !== "string"
      )
        fail(k + "记录ID/版本无效");
      ids.add(x.id);
    }
  }
  const taskIds = new Set(s.tasks.map((t) => t.id)),
    projectIds = new Set(s.projects.map((p) => p.id));
  for (const t of s.tasks) {
    if (
      (t.due && !date(t.due)) ||
      (t.followUp && !date(t.followUp)) ||
      (t.notBefore && !date(t.notBefore))
    )
      fail("任务日期无效");
    if (
      typeof t.title !== "string" ||
      !projectIds.has(t.projectId) ||
      !Object.hasOwn(STATUS, t.status) ||
      !Array.isArray(t.dependsOn) ||
      !Array.isArray(t.checklist)
    )
      fail("任务结构无效");
    for (const k of ["estimatedMinutes", "remainingMinutes"])
      if (t[k] !== null && !finite(t[k])) fail("任务工时无效");
    if (t.progress !== null && (!finite(t.progress) || t.progress > 100))
      fail("进度无效");
    if (!finite(t.actualMinutes) || t.dependsOn.some((id) => !taskIds.has(id)))
      fail("任务工时或依赖无效");
  }
  for (const b of [...s.blocks, ...s.events])
    if (
      ![
        "work",
        "gym",
        "experiment",
        "prep",
        "fixed",
        "interview",
        "commute",
        "wait-free",
        "wait-monitor",
        "application",
      ].includes(b.kind) ||
      !date(b.date) ||
      !clock(b.start) ||
      !clock(b.end) ||
      minutes(b.end) <= minutes(b.start) ||
      typeof b.title !== "string" ||
      !Object.hasOwn(STATUS, b.status)
    )
      fail("日程时间或状态无效");
  for (const h of s.habits)
    if (
      !date(h.date) ||
      !finite(h.count) ||
      !Number.isInteger(h.count) ||
      !finite(h.actualMinutes) ||
      !finite(h.estimatedMinutes) ||
      !["todo", "doing", "partial", "done", "exempt"].includes(h.status)
    )
      fail("网申记录无效");
  if (new Set(s.habits.map((h) => h.date)).size !== s.habits.length)
    fail("每日习惯日期重复");
  for (const r of s.reservations)
    if (!date(r.date) || !finite(r.minutes)) fail("容量预留无效");
  for (const p of s.projects) {
    if (p.due && !date(p.due)) fail("项目日期无效");
    for (const k of ["estimatedMinutes", "remainingMinutes"])
      if (p[k] !== null && !finite(p[k])) fail("项目工时无效");
    if (typeof p.title !== "string" || !Array.isArray(p.dependsOn))
      fail("项目结构无效");
    if (p.progress !== null && (!finite(p.progress) || p.progress > 100))
      fail("项目进度无效");
  }
  for (const r of s.reviews)
    if (!date(r.date) || !Array.isArray(r.items)) fail("复盘结构无效");
  for (const p of s.proposals)
    if (
      !["pending", "accepted", "cancelled", "undone"].includes(p.status) ||
      !p.before ||
      !p.after ||
      !Array.isArray(p.details) ||
      !Array.isArray(p.risks) ||
      typeof p.baseSignature !== "string"
    )
      fail("调整建议无效");
  for (const p of s.proposals) {
    for (const snapshot of [p.before, p.after]) {
      if (
        !Array.isArray(snapshot.blocks) ||
        !Array.isArray(snapshot.events) ||
        !Array.isArray(snapshot.reservations) ||
        !snapshot.settings
      )
        fail("建议快照结构无效");
      const sub = { ...s, ...snapshot, proposals: [], logs: [] };
      validateState(sub);
    }
    if (p.after.taskUpdates && !Array.isArray(p.after.taskUpdates))
      fail("建议任务更新结构无效");
  }
  return s;
}
export function mergeStates(base, local, remote, choices = {}) {
  const result = copy(remote),
    conflicts = [];
  const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  for (const key of [...COLLECTIONS, "settings"]) {
    const ba = key === "settings" ? [base.settings] : base[key],
      la = key === "settings" ? [local.settings] : local[key],
      ra = key === "settings" ? [remote.settings] : remote[key];
    const out = [];
    for (const id of new Set([...ba, ...la, ...ra].map((x) => x.id))) {
      const b = ba.find((x) => x.id === id),
        l = la.find((x) => x.id === id),
        r = ra.find((x) => x.id === id);
      let chosen;
      if (eq(l, b)) chosen = r;
      else if (eq(r, b) || eq(l, r)) chosen = l;
      else {
        const token = key + ":" + id;
        conflicts.push({ token, key, id, local: l, remote: r });
        chosen = choices[token] === "local" ? l : r;
      }
      if (chosen) out.push(copy(chosen));
    }
    if (key === "settings") result.settings = out[0];
    else result[key] = out;
  }
  touch(result);
  return { state: result, conflicts };
}
