import {
  SCHEMA,
  STATUS,
  REASONS,
  COLLECTIONS,
  uid,
  copy,
  now,
  today,
  dates,
  addDays,
  time,
  minutes,
  hours,
  stamp,
  touch,
  weekIndex,
  restType,
  blocksFor,
  taskFor,
  dayInfo,
  conflicts,
  milestoneRisks,
  syncHabits,
  task,
  proposal,
  replanProposal,
  interviewProposal,
  acceptProposal,
  proposalProblems,
  undoProposal,
  reviewAdvice,
  validateState,
  mergeStates,
  planSignature,
} from "/shared/model.js";
const app = document.querySelector("#app"),
  dialog = document.querySelector("#dialog");
let S = null,
  user = null,
  base = null,
  revision = 0,
  savedAt = "",
  view = "today",
  selectedDate = "2026-10-12",
  week = 0,
  syncStatus = "正在读取",
  pending = false,
  saving = false,
  saveTimer = null,
  conflictData = null,
  formHandler = null,
  authMode = "login",
  offline = false;
const e = (x) =>
  String(x ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const fmt = (d) => d?.slice(5).replace("-", " / ") || "—",
  weekday = (d) =>
    ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][
      new Date(d + "T12:00Z").getUTCDay()
    ];
const prettyTime = (x) =>
  x
    ? new Intl.DateTimeFormat("zh-CN", {
        timeZone: "Asia/Shanghai",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(x))
    : "";
const btn = (label, action, id = "", cls = "") =>
  `<button class="${cls}" data-action="${action}" data-id="${e(id)}">${label}</button>`;
const badge = (label, cls = "") =>
  `<span class="badge ${cls}">${e(label)}</span>`;
const panel = (title, body, action = "") =>
  `<section class="panel"><div class="panel-head"><h2>${title}</h2>${action}</div><div class="panel-body">${body}</div></section>`;
const field = (label, name, value, type = "text", extra = "") =>
  `<label>${label}<input name="${name}" aria-label="${e(label)}" type="${type}" value="${e(value)}" ${extra}></label>`;
const area = (label, name, value, extra = "") =>
  `<label class="full">${label}<textarea name="${name}" aria-label="${e(label)}" ${extra}>${e(value)}</textarea></label>`;
const select = (label, name, value, options) =>
  `<label>${label}<select name="${name}" aria-label="${e(label)}">${options.map(([v, l]) => `<option value="${e(v)}" ${v === value ? "selected" : ""}>${e(l)}</option>`).join("")}</select></label>`;
const statusOptions = Object.entries(STATUS);
const category = (b) =>
  b.kind === "gym"
    ? "gym"
    : b.kind === "application"
      ? "job"
      : ["interview", "commute", "fixed", "wait-monitor"].includes(b.kind)
        ? "fixed"
        : S.projects.find((p) => p.id === taskFor(S, b)?.projectId)?.category ||
          "research";
function toast(text) {
  const t = document.querySelector("#toast");
  t.textContent = text;
  t.style.display = "block";
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (t.style.display = "none"), 4300);
}
function fail(error) {
  toast(error.message || error);
}
async function api(url, options = {}) {
  const r = await fetch(url, {
    ...options,
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      "X-Worktable-Request": "1",
      ...options.headers,
    },
  });
  const data = await r.json();
  if (!r.ok)
    throw Object.assign(Error(data.error || "请求失败"), {
      status: r.status,
      data,
    });
  return data;
}
const cacheKey = () => `worktable-v1-${user.id}`;
function cache() {
  try {
    localStorage.setItem(
      cacheKey(),
      JSON.stringify({ state: S, base, revision, savedAt, pending }),
    );
    localStorage.setItem("worktable-last-user", JSON.stringify(user));
  } catch {
    syncStatus = "本机缓存空间不足，请立即导出备份";
    toast(syncStatus);
  }
}
function updateSync() {
  const el = document.querySelector("#sync");
  if (el) {
    el.className = "sync " + (pending ? "warning" : "");
    el.textContent =
      syncStatus + (savedAt && !pending ? " · " + prettyTime(savedAt) : "");
  }
}
function mark(label = "编辑记录") {
  touch(S);
  pending = true;
  cache();
  syncStatus = navigator.onLine ? "保存中…" : "离线待同步";
  updateSync();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 450);
}
async function flush() {
  if (!pending || saving || conflictData || !user) return;
  const snapshot = copy(S),
    signature = JSON.stringify(snapshot);
  saving = true;
  syncStatus = "保存中…";
  updateSync();
  try {
    const r = await api("/api/state", {
      method: "PUT",
      body: JSON.stringify({ state: snapshot, revision }),
    });
    revision = r.revision;
    savedAt = r.savedAt;
    base = snapshot;
    pending = JSON.stringify(S) !== signature;
    offline = false;
    syncStatus = pending ? "保存中…" : "已保存至此服务器";
    cache();
  } catch (err) {
    if (err.status === 409 && err.data.state) {
      const merged = mergeStates(base, S, err.data.state);
      if (merged.conflicts.length === 0) {
        S = merged.state;
        base = copy(err.data.state);
        revision = err.data.revision;
        savedAt = err.data.savedAt;
        pending = true;
        offline = false;
        syncStatus = "已安全合并重复或独立修改 · 保存中…";
        cache();
        render();
      } else {
        conflictData = err.data;
        syncStatus = "版本冲突 · 等待选择";
        openConflict();
      }
    } else {
      offline = true;
      syncStatus =
        err.status === 401
          ? "登录已过期 · 待同步保留"
          : "离线待同步 / 保存失败，可重试";
    }
  } finally {
    saving = false;
    updateSync();
    if (pending && !conflictData && !offline) setTimeout(flush, 150);
  }
}
function mutate(fn, label = "修改") {
  if (conflictData) {
    toast("请先处理多设备版本冲突");
    return;
  }
  const before = copy(S);
  try {
    fn();
    validateState(S);
    S.logs.push({
      id: uid(),
      title: label,
      detail: "用户手工操作",
      at: now(),
      version: 1,
      updatedAt: now(),
    });
    mark(label);
    render();
  } catch (err) {
    S = before;
    fail(err);
  }
}
async function bootstrap() {
  try {
    const r = await api("/api/me");
    user = r.user;
    await load();
  } catch (err) {
    if (!err.status) {
      try {
        user = JSON.parse(localStorage.getItem("worktable-last-user"));
        const c = user && JSON.parse(localStorage.getItem(cacheKey()));
        if (c) {
          restore(c);
          selectedDate =
            today() >= S.settings.start && today() <= S.settings.end
              ? today()
              : S.settings.start;
          week = Math.max(0, weekIndex(S, selectedDate));
          offline = true;
          syncStatus = "离线读取本机缓存 · 待同步";
          render();
          return;
        }
      } catch {}
    }
    authMode = "login";
    renderAuth();
  }
}
function restore(c) {
  S = c.state;
  base = c.base || copy(c.state);
  revision = c.revision;
  savedAt = c.savedAt;
  pending = c.pending;
}
async function load() {
  let c = null;
  try {
    c = JSON.parse(localStorage.getItem(cacheKey()));
  } catch {}
  try {
    const remote = await api("/api/state");
    if (c?.pending) {
      restore(c);
      if (c.revision !== remote.revision) {
        conflictData = remote;
        syncStatus = "版本冲突 · 等待选择";
      } else syncStatus = "待同步本机修改";
    } else {
      S = remote.state;
      base = copy(S);
      revision = remote.revision;
      savedAt = remote.savedAt;
      pending = false;
      syncStatus = "已保存至此服务器";
    }
    offline = false;
  } catch (err) {
    if (!c) throw err;
    restore(c);
    offline = true;
    syncStatus = "离线待同步 / 保存失败，可重试";
  }
  selectedDate =
    today() >= S.settings.start && today() <= S.settings.end
      ? today()
      : S.settings.start;
  week = Math.max(0, weekIndex(S, selectedDate));
  cache();
  render();
  if (conflictData) openConflict();
  else if (pending) flush();
}
function renderAuth() {
  app.innerHTML = `<main class="auth"><div class="auth-card"><div class="brand"><span class="logo">序</span>序时</div><h1>让每一天，落在计划里。</h1><p class="subtitle">科研 · 求职 · 生活<br>私人工作台，记录保存在这台服务器。</p><form id="auth-form">${field("用户名", "username", "", "text", 'required autocomplete="username" minlength="2" maxlength="64"')}${field("密码（至少10字符）", "password", "", "password", `required minlength="10" autocomplete="${authMode === "register" ? "new-password" : "current-password"}"`)}${authMode === "register" ? field("初始化令牌（本机首次注册可留空）", "setupToken", "", "password", 'autocomplete="off"') : ""}<button class="primary" type="submit">${authMode === "register" ? "创建私人账户" : "登录工作台"}</button><div id="auth-error" class="error" role="alert"></div></form>${btn(authMode === "register" ? "已有账户，登录" : "首次使用，创建账户", "auth-toggle", "", "ghost small")}<p class="auth-note">跨设备访问需要使用同一台已部署服务器和同一账户。默认监听本机；未部署时，可通过JSON导出/导入手动恢复。公共部署请使用HTTPS并关闭开放注册。</p></div></main>`;
  document.querySelector("#auth-form").onsubmit = async (ev) => {
    ev.preventDefault();
    const f = new FormData(ev.target);
    const b = ev.target.querySelector("button[type=submit]");
    b.disabled = true;
    try {
      const r = await api(
        "/api/" + (authMode === "register" ? "register" : "login"),
        { method: "POST", body: JSON.stringify(Object.fromEntries(f)) },
      );
      user = r.user;
      await load();
    } catch (err) {
      document.querySelector("#auth-error").textContent = err.message;
    } finally {
      b.disabled = false;
    }
  };
}
function metric(label, number, foot) {
  return `<div class="metric"><div class="label">${label}</div><div class="number">${number}</div><div class="foot">${foot}</div></div>`;
}
function shell(body) {
  const nav = [
    ["today", "◷", "今日安排"],
    ["week", "▦", "周计划"],
    ["projects", "▤", "项目与成果"],
    ["review", "◴", "复盘"],
    ["settings", "⚙", "设置与记录"],
  ];
  app.innerHTML = `<div class="shell"><aside class="sidebar"><div class="brand"><span class="logo">序</span>序时</div><div class="brand-sub">个人时间管理工作台</div><nav class="nav">${nav.map(([v, s, l]) => btn(`<span class="nav-symbol">${s}</span>${l}`, "nav", v, v === view ? "active" : "")).join("")}</nav><div class="sidebar-note"><div class="tiny">当前规划周期</div><strong>${fmt(S.settings.start)} — ${fmt(S.settings.end)}</strong><br>${dates(S.settings.start, S.settings.end).length}天 · Asia/Shanghai<br>规则排程 · 调整由你确认</div><div class="sidebar-bottom">${badge("私人账户", "research")}<div style="margin-top:9px">${e(user.username)}</div>${btn("退出登录", "logout", "", "ghost small")}</div></aside><main class="main"><header class="topbar"><span class="breadcrumb">WORKTABLE / ${nav.find((x) => x[0] === view)[2]}</span><div class="actions"><span id="sync" class="sync">${e(syncStatus)}</span>${btn("重试 / 检查同步", "sync", "", "ghost small")}</div></header>${body}<p class="footer-note">计划留有余地。未知工时不会按零处理；导师与实验依赖须手工确认。全部调整使用透明规则，未调用大模型。</p></main></div>`;
  updateSync();
}
function heading(title, subtitle, actions = "") {
  return `<div class="page-heading"><div><div class="eyebrow">YOUR RESEARCH & LIFE</div><h1>${title}</h1><p class="subtitle">${subtitle}</p></div><div class="actions">${actions}</div></div>`;
}
function dateControls() {
  return `<div class="date-control">${btn("‹", "date-prev", "", "small")}<input type="date" id="selected-date" aria-label="查看日期" value="${selectedDate}" min="${S.settings.start}" max="${S.settings.end}">${btn("›", "date-next", "", "small")}</div>`;
}
function capacityBody(info) {
  return `<div class="capacity-list"><div class="row"><span>作息内空闲（已扣生活/健身/固定）</span><span>${hours(info.raw)}</span></div><div class="row"><span>待确认容量预留</span><span>− ${hours(info.reserved)}</span></div><div class="row"><span>空闲缓冲 ${Math.round(S.settings.bufferRate * 100)}%</span><span>− ${hours(info.buffer)}</span></div><div class="row"><span>个人净任务上限</span><span>${hours(S.settings.dailyLimit)}</span></div><div class="row"><span>净任务容量 min(上限,空闲−缓冲)</span><span>${hours(info.limit)}</span></div><div class="row"><span>工作时间块 + 投递容量</span><span>${hours(info.work)} + ${hours(info.application)}</span></div><div class="row"><span>剩余任务容量</span><span class="${info.remaining < 0 ? "stop" : ""}">${hours(info.remaining)}</span></div></div><p class="tiny muted">连续工作间隔${S.settings.breakMinutes}分钟不计工时，排块时另留；健身/组会占日历时间，不计科研工时。安全等待不增加容量。</p>`;
}
function milestones() {
  return `<div class="milestone"><div class="milestone-date">${fmt(S.settings.planDue)}</div><div class="milestone-text">实验方案内部提交目标<br>${badge("建议，非用户硬截止", "warning")}<br>提交 ≠ 导师确认</div></div><div class="milestone"><div class="milestone-date">${fmt(S.settings.experimentStart)}</div><div class="milestone-text">实验目标启动<br>${badge(S.tasks.find((t) => t.id === "plan-confirm")?.status === "done" ? "导师已确认" : "等待导师确认", S.tasks.find((t) => t.id === "plan-confirm")?.status === "done" ? "research" : "blocked")}</div></div><div class="milestone"><div class="milestone-date">10 / 21</div><div class="milestone-text">综述初稿建议里程碑<br><span class="muted">22提交 · 28修改 · 29—30准备</span></div></div><div class="milestone"><div class="milestone-date">${fmt(S.settings.reviewDue)}</div><div class="milestone-text">投稿目标<br>${badge("用户目标", "writing")}<br>导师反馈日期未知</div></div>`;
}
function risksHtml(risks) {
  return risks
    .map(
      (r) => `<div class="risk"><span class="risk-mark">△</span>${e(r)}</div>`,
    )
    .join("");
}
function blockHtml(b) {
  const t = taskFor(S, b),
    deps =
      t?.dependsOn.filter(
        (id) => S.tasks.find((x) => x.id === id)?.status !== "done",
      ) || [];
  return `<div class="time-row ${b.status === "done" ? "archive" : ""}"><div class="time-col">${e(b.start)}<br>${e(b.end)}</div><div class="block-card ${category(b)}"><div class="row"><div class="block-title">${e(b.title)}</div>${badge(STATUS[b.status], b.status === "blocked" ? "blocked" : "")}</div><div class="block-meta"><span>${hours(minutes(b.end) - minutes(b.start))}计划 / ${hours(b.actualMinutes || 0)}实际</span><span>${b.locked ? "锁定" : "可调整"}</span>${b.budgetSource === "placeholder" ? "<span>⚑ 未知工时的占位预算</span>" : ""}${deps.length ? "<span>⚠ 依赖未通过，仅建议</span>" : ""}</div>${b.note ? `<p class="tiny muted">${e(b.note)}</p>` : ""}<div class="block-actions">${btn("记录 / 编辑 / 移动", "block-edit", b.id, "small ghost")}${b.status !== "done" && b.status !== "cancelled" ? btn("记录完成", "block-complete", b.id, "small ghost") : ""}${btn(b.locked ? "解锁" : "锁定", "block-lock", b.id, "small ghost")}</div></div></div>`;
}
function todayView() {
  const d = selectedDate,
    info = dayInfo(S, d),
    bs = blocksFor(S, d).sort((a, b) => a.start.localeCompare(b.start)),
    h = S.habits.find((x) => x.date === d),
    focus = [
      ...new Set(
        bs
          .filter(
            (b) =>
              ["work", "prep", "experiment"].includes(b.kind) &&
              b.status !== "done",
          )
          .map((b) => b.taskId || b.title),
      ),
    ]
      .slice(0, 3)
      .map(
        (id) =>
          S.tasks.find((t) => t.id === id)?.title ||
          bs.find((b) => b.taskId === id || b.title === id)?.title,
      ),
    completed = bs.filter((b) => b.status === "done").length,
    actual =
      bs.reduce((n, b) => n + (b.actualMinutes || 0), 0) +
      (h?.actualMinutes || 0),
    pendingPs = S.proposals.filter((p) => p.status === "pending");
  const habit = h
    ? `<div class="habit"><div><strong>每日网申</strong> ${badge(h.status === "exempt" ? "整日目标免除" : h.count >= h.target ? "已完成" : "弹性待办", "job")}<p class="tiny muted">产出：${h.target}家公司申请（每家约${S.settings.applicationEach}分钟），不自动累积欠账。<br>计划${hours(h.estimatedMinutes)} · 实际${hours(h.actualMinutes)} · 已投 ${h.count} / ${h.target} 家</p></div>${btn("记录数量 / 耗时", "habit-edit", h.id, "small")}</div>`
    : "";
  let timeline =
    info.rest === "full"
      ? `<div class="notice">今日为建议完整休息日。没有工作要求，网申免除；可在设置移动休息日。</div>`
      : "";
  timeline += `<div class="notice">生活预留：${e(S.settings.personalStart)}—${e(S.settings.personalEnd)}起床与个人生活 · ${e(S.settings.lunchStart)}—${e(S.settings.lunchEnd)}午餐 · ${e(S.settings.dinnerStart)}—${e(S.settings.dinnerEnd)}晚餐 · ${e(S.settings.windDownStart)}—${e(S.settings.windDownEnd)}睡前。${e(S.settings.sleep)}—${e(S.settings.wake)}睡眠，不排工作。</div>`;
  timeline += S.events
    .filter((x) => x.date === d && x.status !== "cancelled")
    .map((x) => blockHtml(x))
    .join("");
  timeline += bs.map(blockHtml).join("");
  if (!bs.length && !S.events.some((x) => x.date === d))
    timeline +=
      '<div class="empty">留白也是计划的一部分。今天没有固定工作时间块。</div>';
  return (
    heading(
      `${fmt(d)} ${weekday(d)}`,
      `${d} · ${info.rest === "full" ? "休息日" : "把注意力留给具体的成果"}`,
      dateControls() +
        btn("新增面试", "interview", "", "primary") +
        btn("新增时间块", "block-new"),
    ) +
    `<div class="metrics">${metric("净任务容量", hours(info.limit), "包括科研、写作、实验操作与投递")}${metric("已计划任务", hours(info.planned), `保留${hours(info.buffer)}空闲缓冲`)}${metric("实际投入", hours(actual), `${completed}个时间块完成 · 工时不代表成果`)}${metric("网申进度", h?.status === "exempt" ? "免除" : `${h?.count || 0}<span class="muted" style="font-size:15px"> / ${h?.target || 5}家</span>`, "休息日免除 · 次日不加倍")}</div>${pendingPs.length ? `<div class="notice warning">有${pendingPs.length}项待确认调整，当前正式日程尚未改变。 ${btn("查看建议", "proposals", "", "small")}</div>` : ""}<div class="layout"><div>${panel("今日重点成果 · 最多3项", focus.length ? `<div class="focus-grid">${focus.map((f, i) => `<div class="focus"><div class="focus-num">0${i + 1} / 今日产出</div>${e(f)}</div>`).join("")}</div>` : '<div class="muted">今天不用填满；可从项目中选择下一步。</div>')}${panel("时间安排", timeline, `${badge("可编辑建议")} ${btn("结束今日 / 复盘", "end-day", "", "small")}`)}${panel(
      "当日弹性待办",
      habit +
        S.tasks
          .filter((t) => t.followUp === d && t.status !== "done")
          .map(
            (t) =>
              `<div class="risk">跟进：${e(t.title)} ${btn("记录反馈", "task-edit", t.id, "small")}</div>`,
          )
          .join(""),
    )}</div><aside class="side-panels">${panel("关键节点", milestones())}${panel("容量账本", capacityBody(info))}${panel("需要留意", risksHtml([...info.risks, ...milestoneRisks(S), ...S.reservations.filter((r) => r.date === d).map((r) => r.title + "：" + hours(r.minutes))]))}</aside></div>`
  );
}
function weekView() {
  const start = addDays(S.settings.start, week * 7),
    ds = dates(start, [addDays(start, 6), S.settings.end].sort()[0]),
    tot = ds.map((d) => dayInfo(S, d)),
    habits = S.habits.filter(
      (h) => ds.includes(h.date) && h.status !== "exempt",
    ),
    rs = S.reservations.filter((r) => ds.includes(r.date)),
    allWeeks = Math.ceil(dates(S.settings.start, S.settings.end).length / 7);
  return (
    heading(
      `第${week + 1}周 · ${fmt(start)}—${fmt(ds.at(-1))}`,
      "深度工作、弹性投递与生活共用真实时间；虚线仅表示容量预留。",
      btn("‹ 上一周", "week-prev", "", "small") +
        btn("下一周 ›", "week-next", "", "small") +
        btn("事件 / 组会确认", "event-new") +
        btn("选择实验执行日", "experiment", "", "primary"),
    ) +
    `<div class="metrics">${metric("本周净任务容量", hours(tot.reduce((n, i) => n + i.limit, 0)), `${ds.length}天 · 已扣缓冲和待确认预留`)}${metric("已安排任务", hours(tot.reduce((n, i) => n + i.planned, 0)), "实际实验操作才占工作块")}${metric("网申目标", habits.reduce((n, h) => n + h.target, 0) + "家", `${habits.length}个投递日；休息日不要求投递`)}${metric("待确认预留", hours(rs.reduce((n, r) => n + r.minutes, 0)), `${rs.filter((r) => r.kind === "meeting").length}次组会 · ${rs.filter((r) => r.kind === "experiment").length}个实验候选日`)}</div><div class="tab-line">${Array.from({ length: allWeeks }, (_, i) => btn("第" + (i + 1) + "周", "week-select", String(i), i === week ? "primary small" : "small")).join("")}</div><div class="week-scroll"><div class="week-grid">${ds
      .map((d) => {
        const info = dayInfo(S, d),
          h = S.habits.find((x) => x.date === d);
        return `<section class="day-cell ${info.rest === "full" ? "rest-day" : ""}"><div class="day-head">${btn(`${weekday(d)} ${d.slice(8)}`, "open-day", d, "ghost small")}<div class="tiny muted">净${hours(info.limit)} · 已排${hours(info.planned)}</div>${info.remaining < 0 ? badge("容量不足", "blocked") : ""}</div>${info.rest !== "none" ? `<div class="mini-block rest">${info.rest === "full" ? "完整休息日" : info.rest === "am" ? "上午休息" : "下午休息"}<br>不排休息期间工作</div>` : ""}${S.reservations
          .filter((r) => r.date === d)
          .map(
            (r) =>
              `<div class="reservation">${e(r.title)}<br>${hours(r.minutes)} · 无确定时间</div>`,
          )
          .join("")}${[
          ...S.events.filter((e) => e.date === d && e.status !== "cancelled"),
          ...blocksFor(S, d),
        ]
          .sort((a, b) => a.start.localeCompare(b.start))
          .map(
            (b) =>
              `<div class="mini-block ${category(b)}" role="button" tabindex="0" data-action="block-edit" data-id="${e(b.id)}"><strong>${e(b.start)}—${e(b.end)}</strong><br>${e(b.title)}<br><span class="tiny">${STATUS[b.status]}${b.locked ? " · 锁定" : ""}${b.tentative ? " · 依赖待确认" : ""}</span></div>`,
          )
          .join(
            "",
          )}<div class="mini-block job">网申：${h?.status === "exempt" ? "免除" : `${h?.count || 0}/${h?.target || 5}家 · 75分钟弹性`}</div>${d === S.settings.planDue || d === S.settings.reviewDue ? badge(d === S.settings.planDue ? "方案内部目标" : "投稿目标", "warning") : ""}${btn("调整日类型", "day-setting", d, "small ghost")}</section>`;
      })
      .join(
        "",
      )}</div></div><div class="notice" style="margin-top:18px">组会候选日期仅扣每周容量，确认真实时间后才转换事件。实验执行日默认未选：选择后生成锁定的2小时操作块并释放该周未用候选预留。等待只有标记“可自由支配”才允许并行。</div>`
  );
}
function projectProgress(p) {
  const ts = S.tasks.filter((t) => t.projectId === p.id);
  return p.progress !== null
    ? { n: p.progress, text: "手工进度" }
    : {
        n: ts.length
          ? Math.round(
              (ts.filter((t) => t.status === "done").length / ts.length) * 100,
            )
          : 0,
        text: `${ts.filter((t) => t.status === "done").length}/${ts.length}阶段/任务完成比例`,
      };
}
function projectsView() {
  const unplaced = S.tasks
    .filter((t) => !["done", "cancelled"].includes(t.status))
    .map((t) => ({
      t,
      left: Math.max(
        0,
        (t.remainingMinutes ??
          t.estimatedMinutes ??
          t.placeholderMinutes ??
          0) -
          S.blocks
            .filter((b) => b.taskId === t.id && b.status !== "cancelled")
            .reduce((n, b) => n + minutes(b.end) - minutes(b.start), 0),
      ),
    }))
    .filter((x) => x.left > 0);
  const cap = dates(S.settings.start, S.settings.end).reduce(
      (n, d) => n + dayInfo(S, d).limit,
      0,
    ),
    habits = S.habits.filter(
      (h) =>
        h.date >= S.settings.start &&
        h.date <= S.settings.end &&
        h.status !== "exempt",
    ),
    apps = habits.reduce((n, h) => n + h.estimatedMinutes, 0),
    exp = S.blocks
      .filter((b) => b.kind === "experiment")
      .reduce((n, b) => n + minutes(b.end) - minutes(b.start), 0),
    known = 2280 + apps + exp;
  return (
    heading(
      "项目与成果",
      "完成记录是进度的依据。输入工时不会自动完成任务或通过导师依赖。",
      btn("新增任务", "task-new", "", "primary") +
        btn("预览未来排程", "replan"),
    ) +
    `<div class="metrics">${metric("已知总工作量", hours(known), `数据20h + 报告18h + 投递${hours(apps)} + 已选实验`)}${metric("规划净容量", hours(cap), `已知量后余${hours(Math.max(0, cap - known))} · 不代表可行`)}${metric("显式占位预算", hours(S.settings.planPlaceholder + S.settings.reviewPlaceholder), "方案与综述未知；可编辑假设")}${metric("需估算 / 确认", "方案 · 综述 · 实验", "投稿可行性尚待估算")}</div><div class="notice warning">${e(S.settings.interpretation)}<br>阶段工时、综述主题和导师反馈仍未知。数据20小时和报告18小时已知；不能据未知值宣称投稿可行。</div>${unplaced.length ? panel("尚未排入 / 延期建议", unplaced.map((x) => `<div class="risk">${e(x.t.title)}：${hours(x.left)}未排入。${x.t.projectId === "reports" ? "可保留到11月，无硬性月末截止。" : "请核对剩余估时与关键节点风险。"}</div>`).join("")) : ""}${S.projects
      .map((p) => {
        const prog = projectProgress(p);
        return `<section class="panel project-card"><div class="project-top"><div><div class="eyebrow">${p.category === "research" ? "RESEARCH" : "WRITING"} / ${e(p.id)}</div><h2>${e(p.title)}</h2></div><div class="actions">${badge(p.due ? `${p.due} · ${p.dueType === "user" ? "用户目标" : "内部建议"}` : "无硬性截止", p.category)}${btn("编辑项目", "project-edit", p.id, "small")}</div></div><div class="project-detail">${e(p.description)}<br>${p.topic ? "研究题目：" + e(p.topic) + " · " : ""}预计 / 剩余：${p.estimatedMinutes === null ? "未知" : hours(p.estimatedMinutes)} / ${p.remainingMinutes === null ? "未知" : hours(p.remainingMinutes)} ${p.id === "execution" ? " · 依赖：导师确认 " + (S.tasks.find((t) => t.id === "plan-confirm")?.status === "done" ? "已通过" : "未通过") : ""}${p.blockedReason ? " · 阻塞：" + e(p.blockedReason) : ""}</div><div class="progress"><span style="width:${prog.n}%"></span></div><div class="tiny muted">${prog.n}% · ${prog.text}（工时不参与自动完成判定）</div><table class="task-table"><thead><tr><th>阶段 / 可交付任务</th><th>状态</th><th>预计 / 剩余 / 实际</th><th>操作</th></tr></thead><tbody>${S.tasks
          .filter((t) => t.projectId === p.id)
          .map(
            (t) =>
              `<tr><td>${e(t.title)}${t.dependsOn.length ? `<div class="tiny muted">依赖：${t.dependsOn.map((id) => e(S.tasks.find((x) => x.id === id)?.title || id)).join("；")}</div>` : ""}${t.followUp ? `<div class="tiny muted">跟进：${e(t.followUp)}</div>` : ""}${t.blockedReason ? `<div class="tiny stop">${e(t.blockedReason)}</div>` : ""}</td><td>${badge(STATUS[t.status], t.status === "blocked" ? "blocked" : "")}${t.progress !== null ? `<div class="tiny muted">${t.progress}% 手工进度</div>` : t.checklist.length ? `<div class="tiny muted">${Math.round((t.checklist.filter((c) => c.done).length / t.checklist.length) * 100)}% 子项比例</div>` : ""}${t.id === "plan-submit" && t.status === "done" ? '<div class="tiny">已提交，尚不代表确认</div>' : ""}</td><td>${t.estimatedMinutes === null ? "未知" : hours(t.estimatedMinutes)} / ${t.remainingMinutes === null ? "未知" : hours(t.remainingMinutes)} / ${hours(t.actualMinutes)}${t.estimatedMinutes === null && t.placeholderMinutes ? `<div class="tiny muted">占位 ${hours(t.placeholderMinutes)}</div>` : ""}</td><td>${btn("编辑 / 子任务", "task-edit", t.id, "small")}${btn("安排时间", "task-schedule", t.id, "small ghost")}</td></tr>`,
          )
          .join(
            "",
          )}</tbody></table>${p.id === "execution" ? '<div class="empty">具体执行日请在周计划选择，不默认每天到实验室。</div>' : ""}</section>`;
      })
      .join("")}`
  );
}
function reviewView() {
  const d = selectedDate,
    bs = blocksFor(S, d).filter((b) =>
      ["work", "prep", "experiment"].includes(b.kind),
    ),
    review = S.reviews.find((r) => r.date === d),
    ds = dates(
      addDays(S.settings.start, week * 7),
      [S.settings.end, addDays(S.settings.start, week * 7 + 6)].sort()[0],
    );
  const all = S.blocks.filter((b) => ds.includes(b.date));
  const allocation = ["research", "writing", "gym", "job", "fixed"].map(
    (cat) => ({
      cat,
      actual: all
        .filter((b) => category(b) === cat)
        .reduce((n, b) => n + (b.actualMinutes || 0), 0),
    }),
  );
  allocation.find((x) => x.cat === "job").actual += S.habits
    .filter((h) => ds.includes(h.date))
    .reduce((n, h) => n + h.actualMinutes, 0);
  const max = Math.max(60, ...allocation.map((x) => x.actual));
  return (
    heading(
      "日复盘与调整",
      "记录产出、实际耗时和未完成原因；规则建议独立保存，确认前不改正式计划。",
      dateControls() + btn("生成未来调整预览", "review-propose", "", "primary"),
    ) +
    `<div class="layout"><div>${panel(
      `${fmt(d)} · 结束今日`,
      `<form id="review-form"><div class="notice">不要求逐个弹窗。已完成成果请手工记录；时间块完成不会自动勾选所属阶段。</div>${
        bs.length
          ? bs
              .map((b) => {
                const item =
                  review?.items.find((x) => x.blockId === b.id) || {};
                return `<div class="review-item" data-review-block="${e(b.id)}"><div><div class="title">${e(b.title)}</div><div class="tiny muted">${b.start}—${b.end} · ${STATUS[b.status]} · 计划${hours(minutes(b.end) - minutes(b.start))}</div>${area("完成成果 / 最小下一步", "outcome-" + b.id, item.outcome || b.note || "")}</div><div>${field("实际分钟", "actual-" + b.id, item.actualMinutes ?? b.actualMinutes ?? 0, "number", 'min="0" max="1440"')}${select("未完成原因", "reason-" + b.id, item.reason || "", [["", "无 / 已完成"], ...REASONS.map((x) => [x, x])])}${item.reason ? `<div class="tiny muted">建议：${e(reviewAdvice(item.reason))}</div>` : ""}</div></div>`;
              })
              .join("")
          : '<p class="muted">今天没有工作块，可记录休息与当日感受。</p>'
      }${area("当日备注", "day-note", review?.note || "")}<div class="actions" style="margin-top:15px"><button class="primary" type="submit">保存复盘</button>${review ? badge("已保存复盘") : ""}</div></form>`,
    )}${proposalList()}</div><aside>${panel(`第${week + 1}周 · 实际时间分配`, allocation.map((x) => `<div class="bar-row"><span>${{ research: "科研 / 实验", writing: "写作 / 报告", gym: "健身", job: "网申", fixed: "固定事件" }[x.cat]}</span><div class="bar-track"><span style="width:${(x.actual / max) * 100}%"></span></div><span>${hours(x.actual)}</span></div>`).join("") + `<p class="tiny muted">${ds[0]}—${ds.at(-1)} · 只统计实际输入记录，不用计划预算冒充投入。</p>`, btn("切换周", "review-week", "", "small"))}${panel("成果进展", S.projects.map((p) => `<div class="risk"><div class="row"><strong>${e(p.title)}</strong><span>${projectProgress(p).n}%</span></div><div class="tiny muted">${projectProgress(p).text}</div></div>`).join(""))}${panel(
      "历史复盘",
      S.reviews
        .slice()
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 30)
        .map(
          (r) =>
            `<div class="risk">${btn(r.date, "open-review", r.date, "small ghost")}<br>${e(r.note || "已记录成果与原因")}<br><span class="tiny muted">${r.items.filter((i) => i.outcome).length}条成果 · ${r.items.filter((i) => i.reason).length}条未完成原因</span></div>`,
        )
        .join("") || '<span class="muted">尚无复盘记录</span>',
    )}</aside></div>`
  );
}
function proposalList() {
  return S.proposals.length
    ? panel(
        "调整建议 · 与当前计划分开",
        S.proposals
          .slice()
          .reverse()
          .map(
            (p) =>
              `<div class="risk"><div class="row"><strong>${e(p.title)}</strong>${badge({ pending: "待确认", accepted: "已接受", cancelled: "已取消", undone: "已撤销" }[p.status], p.status === "pending" ? "warning" : "")}</div><div class="tiny muted">${prettyTime(p.createdAt)} · ${p.details.length}项变化 · ${p.risks.length}项风险</div><div class="actions" style="margin-top:9px">${btn("查看对比 / 逐项修改", "proposal-open", p.id, "small")}${p.status === "accepted" ? btn("撤销", "proposal-undo", p.id, "small") : ""}</div></div>`,
          )
          .join(""),
      )
    : "";
}
function settingsView() {
  const st = S.settings;
  const dateList = (x) => x.join(", ");
  return (
    heading(
      "设置与记录",
      "配置改变先生成预览。保持完整休息、睡眠、锁定工作与历史记录。",
      btn("导出JSON备份", "export", "", "primary") + btn("导入恢复", "import"),
    ) +
    `<div class="notice">服务器SQLite持久化 + 私人账户隔离。跨设备需部署并访问同一服务器；当前默认本机运行，尚未提供公网网址。离线修改保存在此账户本机待同步缓存，联网重试；冲突必须选择合并。最后服务端保存：${e(prettyTime(savedAt) || "尚无")}。</div><form id="settings-form"><div class="settings-grid">${panel("日期与作息", `<div class="form-grid">${field("起始日期", "start", st.start, "date", "required")}${field("结束日期（不自动延长两个月）", "end", st.end, "date", "required")}${field("起床", "wake", st.wake, "time", "required")}${field("睡觉（00:00表示次日零点）", "sleep", st.sleep, "time", "required")}${field("最晚工作时间", "workEnd", st.workEnd, "time", "required")}${field("每日净容量（分钟，60—420）", "dailyLimit", st.dailyLimit, "number", 'min="60" max="420" required')}${field("缓冲比例（至少15%）", "bufferPercent", st.bufferRate * 100, "number", 'min="15" max="50" required')}${field("连续工作间隔（分钟）", "breakMinutes", st.breakMinutes, "number", 'min="10" max="15" required')}${field("午餐开始", "lunchStart", st.lunchStart, "time")}${field("午餐结束", "lunchEnd", st.lunchEnd, "time")}${field("晚餐开始", "dinnerStart", st.dinnerStart, "time")}${field("晚餐结束", "dinnerEnd", st.dinnerEnd, "time")}${field("起床与个人生活开始", "personalStart", st.personalStart, "time")}${field("起床与个人生活结束", "personalEnd", st.personalEnd, "time")}${field("睡前个人生活开始", "windDownStart", st.windDownStart, "time")}${field("睡前个人生活结束", "windDownEnd", st.windDownEnd, "time")}</div>`)}${panel(
      "重复规则与生活安排",
      `<div class="form-grid">${field("每日投递目标（家公司）", "applications", st.applications, "number", 'min="1" max="30"')}${field("每家公司估时（分钟）", "applicationEach", st.applicationEach, "number", 'min="1" max="60"')}${field("健身开始", "gymStart", st.gymStart, "time")}${field("健身结束（默认3小时）", "gymEnd", st.gymEnd, "time")}${area("健身建议日期（逗号分隔YYYY-MM-DD）", "gymDates", dateList(st.gymDates))}${area(
        "休息日（每行 YYYY-MM-DD full / am / pm）",
        "restDays",
        Object.entries(st.restDays)
          .filter(([, v]) => v !== "none")
          .map(([d, v]) => `${d} ${v}`)
          .join("\n"),
      )}${area("明确免投递日期（半天休息也可整日免除）", "exemptDays", dateList(st.exemptDays))}</div>`,
    )}${panel("关键目标与透明假设", `<div class="form-grid">${field("方案内部提交目标（可编辑解释）", "planDue", st.planDue, "date")}${field("实验目标启动（不是已确认启动）", "experimentStart", st.experimentStart, "date")}${field("投稿目标", "reviewDue", st.reviewDue, "date")}${field("方案排程占位预算（分钟，非用户工时）", "planPlaceholder", st.planPlaceholder, "number", 'min="0" max="3000"')}${field("综述剩余占位预算（分钟，非用户工时）", "reviewPlaceholder", st.reviewPlaceholder, "number", 'min="0" max="6000"')}${area("已确认 / 可修改的解释记录", "interpretation", st.interpretation)}</div><p class="tiny muted">调整占位总预算会按当前阶段占位比例分配，仅适用于仍未知且未完成阶段。真实估时请在项目任务中填写。</p>`)}${panel("组会与实验预留", `<div class="form-grid">${field("每次组会预留分钟", "meetingMinutes", st.meetingMinutes, "number", 'min="1" max="600"')}${field("实验亲自操作分钟", "experimentMinutes", st.experimentMinutes, "number", 'min="1" max="600"')}${area("组会候选日期（每周一次，仅容量）", "meetingCandidates", dateList(st.meetingCandidates))}${area("实验候选预留日期（不是每天执行）", "experimentCandidates", dateList(st.experimentCandidates))}${area("已选实验执行日期", "experimentDates", dateList(st.experimentDates))}${field("实验操作开始", "experimentTime", st.experimentTime, "time")}</div>`)}</div><div class="actions"><button type="submit" class="primary">生成设置与日程调整预览</button>${btn("新增固定事件 / 等待窗口", "event-new")}</div></form><div style="margin-top:22px">${proposalList()}${panel(
      "历史调整日志",
      `<div class="logs">${S.logs
        .slice()
        .reverse()
        .slice(0, 100)
        .map(
          (l) =>
            `<div class="log"><div class="row"><strong>${e(l.title)}</strong><span class="muted">${prettyTime(l.at)}</span></div>${e(l.detail)}</div>`,
        )
        .join("")}</div>`,
    )}</div>`
  );
}
function render() {
  if (!S) return;
  const body = {
    today: todayView,
    week: weekView,
    projects: projectsView,
    review: reviewView,
    settings: settingsView,
  }[view]();
  shell(body);
  bindForms();
}
function openDialog(title, body, onSubmit, submit = "保存", extra = "") {
  formHandler = onSubmit;
  dialog.innerHTML = `<form id="dialog-form"><div class="dialog-head"><h2>${e(title)}</h2>${btn("✕", "dialog-close", "", "ghost small")}</div><div class="dialog-body">${body}<div id="dialog-error" class="error" role="alert"></div></div><div class="dialog-foot">${extra}${btn("取消", "dialog-close")}${onSubmit ? `<button type="submit" class="primary">${e(submit)}</button>` : ""}</div></form>`;
  if (!dialog.open) dialog.showModal();
  document.querySelector("#dialog-form").onsubmit = async (ev) => {
    ev.preventDefault();
    try {
      const f = new FormData(ev.target);
      const result = await formHandler(f);
      if (result !== false) dialog.close();
    } catch (err) {
      document.querySelector("#dialog-error").textContent = err.message;
    }
  };
}
function formObj(f) {
  return Object.fromEntries(f);
}
function number(f, name, max = 10000) {
  const n = Number(f.get(name));
  if (!Number.isFinite(n) || n < 0 || n > max) throw Error(name + "数值无效");
  return n;
}
function nullable(f, name) {
  return f.get(name) === "" ? null : number(f, name);
}
function updateRecord(r, values) {
  Object.assign(r, values);
  stamp(r);
}
function addLog(title, detail = "") {
  S.logs.push({
    id: uid(),
    title,
    detail,
    at: now(),
    version: 1,
    updatedAt: now(),
  });
}
function commitDialog(fn, label) {
  if (conflictData) throw Error("请先处理多设备版本冲突");
  const before = copy(S);
  try {
    fn();
    validateState(S);
    addLog(label);
    mark(label);
    render();
  } catch (err) {
    S = before;
    throw err;
  }
}
function blockEditor(id, taskId = "", complete = false) {
  const b = id
      ? S.blocks.find((x) => x.id === id) || S.events.find((x) => x.id === id)
      : null,
    isEvent = b && S.events.some((x) => x.id === id),
    t = S.tasks.find((x) => x.id === (b?.taskId || taskId));
  openDialog(
    b ? "时间块记录与移动" : "新增真实时间块",
    `<div class="notice">日期和时间移动会校验冲突。已完成或历史块只能补记耗时/备注；仅记录工时不会完成阶段。实验开始需导师已确认。</div><div class="form-grid">${field("具体产出", "title", b?.title || t?.title || "", "text", 'required maxlength="200"')}${select("关联任务", "taskId", b?.taskId || taskId || "", [["", "无关联任务"], ...S.tasks.map((t) => [t.id, t.title])])}${field("日期", "date", b?.date || selectedDate, "date", "required")}${field("开始时间", "start", b?.start || "09:00", "time", "required")}${field("结束时间", "end", b?.end || "10:30", "time", "required")}${select("状态", "status", complete ? "done" : b?.status || "todo", statusOptions)}${field("实际工时（分钟）", "actualMinutes", b?.actualMinutes || 0, "number", 'min="0" max="1440"')}${select(
      "锁定",
      "locked",
      b?.locked ? "yes" : "no",
      [
        ["no", "可调整"],
        ["yes", "锁定，排程不移动"],
      ],
    )}${area("完成成果 / 备注", "note", b?.note || "")}</div>`,
    (f) => {
      const v = formObj(f),
        moving =
          !b || v.date !== b.date || v.start !== b.start || v.end !== b.end;
      if (b && (b.date < today() || b.status === "done") && moving)
        throw Error("历史或已完成块不能移动");
      if (b?.locked && moving) throw Error("请先明确解锁再移动");
      if (v.date < S.settings.start || v.date > S.settings.end)
        throw Error("日期超出当前规划范围，请在设置先延长");
      const n = {
        ...(b || { id: uid(), kind: "work", version: 0 }),
        ...v,
        locked: v.locked === "yes",
        actualMinutes: number(f, "actualMinutes", 1440),
      };
      if (
        minutes(n.end) <= minutes(n.start) ||
        (n.kind === "work" && minutes(n.end) - minutes(n.start) > 120)
      )
        throw Error("结束须晚于开始，工作块最长120分钟");
      if (n.kind === "gym" && minutes(n.end) - minutes(n.start) !== 180)
        throw Error("健身含相关时间必须保留3小时");
      const linked = S.tasks.find((t) => t.id === n.taskId),
        deps =
          linked?.dependsOn.filter(
            (id) => S.tasks.find((t) => t.id === id)?.status !== "done",
          ) || [];
      if (
        ["doing", "done", "partial"].includes(n.status) &&
        (deps.length ||
          (n.kind === "experiment" &&
            S.tasks.find((t) => t.id === "plan-confirm")?.status !== "done"))
      )
        throw Error("依赖尚未通过，请先记录前置阶段或导师确认");
      if (moving) {
        const errs = conflicts(S, n);
        if (errs.length) throw Error(errs.join("；"));
        const tmp = copy(S);
        if (b) {
          const coll = isEvent ? "events" : "blocks";
          tmp[coll] = tmp[coll].filter((x) => x.id !== b.id);
        }
        tmp[isEvent ? "events" : "blocks"].push(n);
        if (["work", "prep", "experiment"].includes(n.kind)) {
          const i = dayInfo(tmp, n.date);
          if (i.remaining < 0)
            throw Error("超过当天净任务容量，请先调整负荷或免除投递");
          const distinct = new Set(
            blocksFor(tmp, n.date)
              .filter((x) => ["work", "prep", "experiment"].includes(x.kind))
              .map((x) => x.taskId || x.title),
          );
          if (distinct.size > 3) throw Error("当天最多3项重点成果");
        }
      }
      commitDialog(() => {
        if (linked) {
          linked.actualMinutes = Math.max(
            0,
            linked.actualMinutes + n.actualMinutes - (b?.actualMinutes || 0),
          );
          stamp(linked);
        }
        if (n.kind === "experiment" && n.status === "cancelled") {
          S.settings.experimentDates = S.settings.experimentDates.filter(
            (d) => d !== n.date,
          );
          stamp(S.settings);
        }
        if (n.status === "done" && !b?.completedSnapshot)
          n.completedSnapshot = {
            date: n.date,
            start: n.start,
            end: n.end,
            title: n.title,
            at: now(),
          };
        stamp(n);
        if (b)
          S[isEvent ? "events" : "blocks"][
            S[isEvent ? "events" : "blocks"].findIndex((x) => x.id === b.id)
          ] = n;
        else S.blocks.push(n);
      }, "记录时间块：" + n.title);
    },
  );
}
function habitEditor(id) {
  const h = S.habits.find((x) => x.id === id);
  openDialog(
    "每日投递记录",
    `<div class="notice">当日目标${h.target}家。允许超过目标，但未完成数量不会加到次日。实际分钟与数量分别记录。</div><div class="form-grid">${field("已提交家公司数", "count", h.count, "number", 'min="0" max="1000" step="1"')}${field("实际分钟", "actualMinutes", h.actualMinutes, "number", 'min="0" max="1440"')}${select(
      "当日整日目标免除",
      "exempt",
      h.status === "exempt" ? "yes" : "no",
      [
        ["no", "不免除"],
        ["yes", "免除，显示独立习惯状态"],
      ],
    )}${area("备注", "note", h.note)}</div>`,
    (f) => {
      const count = number(f, "count", 1000);
      if (!Number.isInteger(count)) throw Error("数量须为整数");
      if (restType(S, h.date) === "full" && f.get("exempt") !== "yes")
        throw Error("完整休息日默认免除；请先更改休息设置");
      commitDialog(
        () => {
          const exempt = f.get("exempt") === "yes";
          updateRecord(h, {
            count,
            actualMinutes: number(f, "actualMinutes", 1440),
            status: exempt
              ? "exempt"
              : count >= h.target
                ? "done"
                : count
                  ? "partial"
                  : "todo",
            note: f.get("note"),
          });
          S.settings.exemptDays = S.settings.exemptDays.filter(
            (d) => d !== h.date,
          );
          if (exempt) S.settings.exemptDays.push(h.date);
          stamp(S.settings);
        },
        "更新" + h.date + "投递记录",
      );
    },
  );
}
function taskEditor(id) {
  const t = id ? S.tasks.find((x) => x.id === id) : null;
  openDialog(
    t ? "编辑任务 / 阶段" : "新增可执行任务",
    `<div class="notice">空白估时表示未知，不代表0。完成状态需要具体产出；子任务清单勾选不会自动完成阶段。提交与导师确认独立记录。</div><div class="form-grid">${field("具体产出", "title", t?.title || "", "text", 'required maxlength="300"')}${select(
      "所属项目",
      "projectId",
      t?.projectId || S.projects[0].id,
      S.projects.map((p) => [p.id, p.title]),
    )}${select("状态", "status", t?.status || "todo", statusOptions)}${field("预计分钟（未知留空）", "estimatedMinutes", t?.estimatedMinutes ?? "", "number", 'min="0" max="10000"')}${field("剩余分钟（未知留空）", "remainingMinutes", t?.remainingMinutes ?? "", "number", 'min="0" max="10000"')}${field("实际分钟", "actualMinutes", t?.actualMinutes || 0, "number", 'min="0" max="10000"')}${field("跟进日期（可留空）", "followUp", t?.followUp || "", "date")}${field("任务目标日期（可留空）", "due", t?.due || "", "date")}${field("建议最早开始（可留空）", "notBefore", t?.notBefore || "", "date")}${select(
      "日期类型",
      "dueType",
      t?.dueType || "internal",
      [
        ["internal", "内部建议"],
        ["user", "用户确认目标"],
        ["none", "无硬截止"],
      ],
    )}${field("手工进度%（空白用子项完成比例）", "progress", t?.progress ?? "", "number", 'min="0" max="100"')}${area("阻塞原因 / 反馈记录", "blockedReason", t?.blockedReason || "")}${area("子任务清单（每行一个具体产出）", "checklist", t?.checklist.map((x) => x.title).join("\n") || "")}${t?.checklist.length ? `<div class="full checklist">${t.checklist.map((c, i) => `<label><input type="checkbox" name="check-${i}" ${c.done ? "checked" : ""}>${e(c.title)}</label>`).join("")}<div class="tiny muted">${t.checklist.filter((x) => x.done).length}/${t.checklist.length}项完成 · 自动比例${Math.round((t.checklist.filter((x) => x.done).length / t.checklist.length) * 100)}%</div></div>` : ""}<label class="full">前置任务（多选；Ctrl/⌘选择）<select name="dependsOn" multiple size="4">${S.tasks
      .filter((x) => x.id !== id)
      .map(
        (x) =>
          `<option value="${e(x.id)}" ${t?.dependsOn.includes(x.id) ? "selected" : ""}>${e(x.title)}</option>`,
      )
      .join("")}</select></label></div>`,
    (f) => {
      const v = formObj(f),
        deps = f.getAll("dependsOn");
      if (
        v.status === "done" &&
        deps.some((id) => S.tasks.find((t) => t.id === id)?.status !== "done")
      )
        throw Error("前置阶段未完成，不能把依赖自动视为通过");
      if (
        id === "plan-confirm" &&
        v.status === "done" &&
        S.tasks.find((t) => t.id === "plan-submit")?.status !== "done"
      )
        throw Error("须先记录方案已提交，再记录导师确认");
      const vals = {
        title: v.title,
        projectId: v.projectId,
        status: v.status,
        estimatedMinutes: nullable(f, "estimatedMinutes"),
        remainingMinutes: nullable(f, "remainingMinutes"),
        actualMinutes: number(f, "actualMinutes"),
        progress: nullable(f, "progress"),
        followUp: v.followUp,
        notBefore: v.notBefore || null,
        due: v.due || null,
        dueType: v.dueType,
        blockedReason: v.blockedReason,
        dependsOn: deps,
        checklist: v.checklist
          .split("\n")
          .map((x) => x.trim())
          .filter(Boolean)
          .map((title) => {
            const old = t?.checklist.find((x) => x.title === title);
            const i = t?.checklist.indexOf(old);
            return { title, done: old ? f.has("check-" + i) : false };
          }),
      };
      const graph = new Map(
        S.tasks.map((x) => [x.id, x.id === id ? deps : x.dependsOn]),
      );
      if (id) {
        const seen = new Set();
        const visit = (k) => {
          if (k === id && seen.size) throw Error("依赖不能形成循环");
          if (seen.has(k)) return;
          seen.add(k);
          for (const next of graph.get(k) || []) visit(next);
        };
        for (const dep of deps) {
          seen.clear();
          seen.add(id);
          visit(dep);
        }
      }
      commitDialog(
        () => {
          if (t) updateRecord(t, vals);
          else S.tasks.push(task(vals.title, vals.projectId, vals));
        },
        (t ? "编辑" : "新增") + "任务：" + vals.title,
      );
    },
  );
}
function projectEditor(id) {
  const p = S.projects.find((x) => x.id === id);
  openDialog(
    "编辑项目目标与未知工时",
    `<div class="form-grid">${field("项目名称", "title", p.title, "text", "required")}${field("题目（未知留空）", "topic", p.topic)}${field("预计分钟（未知留空）", "estimatedMinutes", p.estimatedMinutes ?? "", "number", 'min="0"')}${field("剩余分钟（未知留空）", "remainingMinutes", p.remainingMinutes ?? "", "number", 'min="0"')}${field("目标日期（无硬截止留空）", "due", p.due || "", "date")}${select(
      "目标日期类型",
      "dueType",
      p.dueType,
      [
        ["internal", "内部建议"],
        ["user", "用户目标"],
        ["none", "无硬性截止"],
      ],
    )}${field("手工进度%（空白按阶段完成）", "progress", p.progress ?? "", "number", 'min="0" max="100"')}${area("描述 / 解释", "description", p.description)}${area("阻塞原因", "blockedReason", p.blockedReason)}</div><p class="tiny muted">项目总估时不会悄悄分配给阶段，请同时为可执行任务填写剩余工时，再预览排程。</p>`,
    (f) => {
      const v = formObj(f);
      commitDialog(() => {
        updateRecord(p, {
          ...v,
          estimatedMinutes: nullable(f, "estimatedMinutes"),
          remainingMinutes: nullable(f, "remainingMinutes"),
          progress: nullable(f, "progress"),
          due: v.due || null,
        });
        if (p.id === "plan" && p.due) {
          S.settings.planDue = p.due;
          stamp(S.settings);
        }
        if (p.id === "review" && p.due) {
          S.settings.reviewDue = p.due;
          S.tasks.find((t) => t.id === "review-submit").due = p.due;
          stamp(S.settings);
        }
      }, "更新项目：" + p.title);
    },
  );
}
function interviewForm() {
  const next = addDays(today() >= S.settings.start ? today() : selectedDate, 1);
  openDialog(
    "插入面试 · 先预览，不改变当前计划",
    `<div class="notice">准备与面试、通勤分别计时。默认4小时准备，尽可能拆成2个2小时块并留间隔；容量不足时要求明确决策，不能牺牲方案、锁定项或休息。</div><div class="form-grid">${field("面试名称", "title", "面试", "text", "required")}${field("面试日期", "date", next, "date", "required")}${field("面试开始", "start", "14:00", "time", "required")}${field("面试本身分钟", "duration", 60, "number", 'min="1" max="480" required')}${field("准备开始日", "prepDate", addDays(next, -1), "date", "required")}${field("准备必须完成于（不晚于面试日）", "prepBefore", next, "date", "required")}${field("准备总分钟", "prepMinutes", 240, "number", 'min="30" max="600" required')}${field("单程通勤分钟（可选）", "commute", 0, "number", 'min="0" max="240"')}${field("地点（可选）", "location", "")}${area("备注", "note", "")}</div>`,
    (f) => {
      const v = formObj(f);
      if (v.date < S.settings.start || v.date > S.settings.end)
        throw Error("面试超出规划范围，请先在设置延长范围");
      if (v.prepBefore > v.date || v.prepBefore < v.prepDate)
        throw Error("准备期限无效");
      let p;
      commitDialog(() => {
        p = interviewProposal(S, {
          ...v,
          duration: number(f, "duration", 480),
          prepMinutes: number(f, "prepMinutes", 600),
          commute: number(f, "commute", 240),
        });
      }, "生成面试建议（未执行）");
      openProposal(p.id);
      return false;
    },
    "生成对比预览",
  );
}
function eventForm() {
  openDialog(
    "新增固定事件 / 确认组会 / 等待窗口",
    `<div class="form-grid">${field("事件名称", "title", "组会", "text", "required")}${field("日期", "date", selectedDate, "date", "required")}${field("开始", "start", "09:00", "time", "required")}${field("结束", "end", "12:00", "time", "required")}${select(
      "事件类型",
      "kind",
      "fixed",
      [
        ["fixed", "已确认固定事件（占时间）"],
        ["wait-monitor", "实验等待：需要巡视/监测（不可并行）"],
        ["wait-free", "实验等待：已确认可自由支配（不重复计时）"],
      ],
    )}${select("替换待确认预留", "reservationId", "", [["", "不替换"], ...S.reservations.map((r) => [r.id, `${r.date} ${r.title}`])])}${area("地点与说明", "note", "")}</div>`,
    (f) => {
      const v = formObj(f),
        n = {
          ...v,
          id: uid(),
          locked: true,
          status: "todo",
          actualMinutes: 0,
          version: 1,
          updatedAt: now(),
        };
      if (n.date < today()) throw Error("不能新增历史日程");
      if (minutes(n.end) <= minutes(n.start)) throw Error("结束时间须晚于开始");
      const errs = conflicts(S, n, null);
      if (errs.length)
        throw Error(errs.join("；") + "；请先预览调整受影响工作，不能静默移动");
      commitDialog(() => {
        S.events.push(n);
        if (n.reservationId)
          S.reservations = S.reservations.filter(
            (r) => r.id !== n.reservationId,
          );
      }, "新增事件：" + n.title);
    },
  );
}
function openProposal(id) {
  const p = S.proposals.find((x) => x.id === id);
  const liveRisks =
    p.status === "pending"
      ? [
          ...new Set([
            ...p.risks.filter(
              (r) => !/准备容量不足|超出净容量|：与.*冲突/.test(r),
            ),
            ...proposalProblems(S, p),
          ]),
        ]
      : p.risks;
  const ds = [...new Set(p.after.blocks.map((b) => b.date))].sort();
  const capRows = ds
    .map((d) => {
      const a = dayInfo({ ...S, ...p.before }, d),
        b = dayInfo({ ...S, ...p.after }, d);
      return a.planned !== b.planned || a.limit !== b.limit
        ? `<div class="tiny row"><span>${d} 净容量${hours(a.limit)} → ${hours(b.limit)}</span><span>已排${hours(a.planned)} → ${hours(b.planned)}</span></div>`
        : "";
    })
    .join("");
  openDialog(
    "调整前后对比",
    `<div class="notice">${e(p.title)} · ${p.status === "pending" ? "正式日程尚未改变" : "建议已处理"}。确认批量保存为一个版本；若其他设备先保存，将进入版本冲突对比。</div>${liveRisks.length ? `<div class="notice warning"><strong>风险 / 未排入</strong><br>${liveRisks.map(e).join("<br>")}</div>` : ""}<div class="capacity-list">${capRows || '<div class="muted tiny">净容量与已排总量未变。</div>'}</div><table class="diff-table"><thead><tr><th>产出 / 原因</th><th>调整前</th><th>调整后</th><th></th></tr></thead><tbody>${p.details.map((r) => `<tr><td>${e(r.title)}<div class="tiny muted">${e(r.reason)}</div></td><td class="diff-before">${e(r.before)}</td><td class="diff-after">${e(r.after)}</td><td>${p.status === "pending" && p.after.blocks.some((b) => b.id === r.id) ? btn("修改", "proposal-block", p.id + "|" + r.id, "small") : ""}</td></tr>`).join("") || '<tr><td colspan="4">没有时间块变化；仅调整设置或预留。</td></tr>'}</tbody></table><p class="tiny muted">普通报告没有10月31日硬截止。未排入工作仍在项目中，不会伪造完成或自动堆到明天。冲突、容量不足必须先修改，确认按钮不会绕过约束。</p>`,
    p.status === "pending"
      ? () => {
          commitDialog(() => acceptProposal(S, p.id), "接受调整");
          toast("调整已确认，支持在建议记录中撤销");
        }
      : null,
    "全部接受",
    p.status === "pending"
      ? btn("取消此建议", "proposal-cancel", p.id, "danger")
      : "",
  );
}
function proposalBlockEditor(ids) {
  const [pid, bid] = ids.split("|"),
    p = S.proposals.find((p) => p.id === pid),
    b = p.after.blocks.find((b) => b.id === bid);
  openDialog(
    "逐项修改建议中的时间块",
    `<div class="notice">修改的是待确认建议，正式计划保持不变。可取消这一个建议块，任务仍在项目中。</div><div class="form-grid">${field("日期", "date", b.date, "date")}${field("开始", "start", b.start, "time")}${field("结束", "end", b.end, "time")}${select(
      "保留此块",
      "keep",
      "yes",
      [
        ["yes", "保留"],
        ["no", "不排入（任务仍保留）"],
      ],
    )}</div>`,
    (f) => {
      const updated = {
        ...b,
        date: f.get("date"),
        start: f.get("start"),
        end: f.get("end"),
      };
      if (
        updated.date < today() ||
        updated.date < S.settings.start ||
        updated.date > S.settings.end
      )
        throw Error("只能修改范围内未来块");
      if (b.locked && ["date", "start", "end"].some((k) => updated[k] !== b[k]))
        throw Error("建议内锁定块不能移动");
      if (f.get("keep") === "no" && b.locked) throw Error("不能移除受保护块");
      if (f.get("keep") === "yes") {
        const temp = {
          ...S,
          ...p.after,
          blocks: p.after.blocks.filter((x) => x.id !== bid),
        };
        const errs = conflicts(temp, updated);
        if (errs.length) throw Error(errs.join("；"));
        if (
          minutes(updated.end) <= minutes(updated.start) ||
          (minutes(updated.end) - minutes(updated.start) > 120 &&
            ["work", "prep"].includes(b.kind))
        )
          throw Error("工作块时长须为1—120分钟");
        temp.blocks.push(updated);
        if (dayInfo(temp, updated.date).remaining < 0)
          throw Error("超过当天净容量");
      }
      commitDialog(() => {
        p.after.blocks = p.after.blocks.filter((x) => x.id !== bid);
        if (f.get("keep") === "yes") p.after.blocks.push(stamp(updated));
        const row = p.details.find((x) => x.id === bid);
        if (row)
          row.after =
            f.get("keep") === "yes"
              ? `${updated.date} ${updated.start}—${updated.end}`
              : "未排入（用户选择）";
        stamp(p);
      }, "修改建议块（尚未执行）");
      openProposal(pid);
      return false;
    },
  );
}
function daySetting(date) {
  openDialog(
    "调整休息与投递 · 先预览",
    `<p class="muted">${date} · 完整休息日免投递；半天休息默认仍有75分钟投递。</p><div class="form-grid">${select(
      "休息类型",
      "rest",
      restType(S, date),
      [
        ["none", "普通工作日"],
        ["full", "完整休息日"],
        ["am", "上午休息"],
        ["pm", "下午休息"],
      ],
    )}${select(
      "明确免除整日投递",
      "exempt",
      S.settings.exemptDays.includes(date) ? "yes" : "no",
      [
        ["no", "按休息规则"],
        ["yes", "整日免除"],
      ],
    )}</div>`,
    (f) => {
      if (date < today()) throw Error("只调整未来计划");
      const st = copy(S.settings);
      st.restDays[date] = f.get("rest");
      st.exemptDays = st.exemptDays.filter((d) => d !== date);
      if (f.get("exempt") === "yes") st.exemptDays.push(date);
      let p;
      commitDialog(() => {
        p = replanProposal(S, today(), st);
      }, "生成休息调整（未执行）");
      openProposal(p.id);
      return false;
    },
    "预览调整",
  );
}
function experimentPicker() {
  const start = addDays(S.settings.start, week * 7),
    ds = dates(start, [addDays(start, 6), S.settings.end].sort()[0]).filter(
      (d) => d >= S.settings.experimentStart,
    );
  openDialog(
    "选择本周实验执行日",
    `<div class="notice warning">操作每次${hours(S.settings.experimentMinutes)}，生成锁定时间块。导师确认是启动依赖，目前${S.tasks.find((t) => t.id === "plan-confirm")?.status === "done" ? "已确认" : "未通过，操作块仅作为安排，不能标记开始/完成"}。同周候选预留会释放，不要求每天到实验室。</div><div class="checklist">${ds.map((d) => `<label><input type="checkbox" name="execution" value="${d}" ${S.settings.experimentDates.includes(d) ? "checked" : ""}>${d} ${weekday(d)} ${restType(S, d) === "full" ? "（休息日，不可排）" : ""}</label>`).join("") || "<p>本周尚未到实验目标启动日。</p>"}</div>${field("操作开始时间", "experimentTime", S.settings.experimentTime, "time")}`,
    (f) => {
      const selected = f.getAll("execution");
      if (selected.some((d) => restType(S, d) === "full"))
        throw Error("不可把实验排在完整休息日");
      const st = copy(S.settings);
      st.experimentDates = [
        ...st.experimentDates.filter((d) => !ds.includes(d)),
        ...selected,
      ];
      st.experimentTime = f.get("experimentTime");
      let p;
      commitDialog(() => {
        p = replanProposal(S, today(), st);
      }, "生成实验执行日建议");
      openProposal(p.id);
      return false;
    },
    "预览执行日",
  );
}
function exportState(state = S, prefix = "worktable") {
  const blob = new Blob(
      [
        JSON.stringify(
          { schemaVersion: SCHEMA, exportedAt: now(), state },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    ),
    url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = `${prefix}-${today()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast("JSON备份已下载，包含全部任务、计划、实际、备注与日志");
}
function importDialog() {
  openDialog(
    "JSON恢复 · 校验后再确认",
    `<div class="notice warning">恢复会替换此账户的全部项目、任务、日程、习惯、复盘、建议、日志和设置。不会替换账户密码或其他用户数据。导入前会自动下载当前数据备份；可取消。</div><label>选择JSON备份<input type="file" name="backup" accept="application/json,.json" required></label>`,
    async (f) => {
      const file = f.get("backup");
      if (file.size > 8_000_000) throw Error("文件超过8MB");
      let imported;
      try {
        imported = JSON.parse(await file.text());
      } catch {
        throw Error("不是有效JSON文件，当前记录未改变");
      }
      if (
        imported.schemaVersion !== SCHEMA ||
        !imported.exportedAt ||
        !imported.state
      )
        throw Error("备份缺少schemaVersion、exportedAt或state");
      validateState(imported.state);
      const st = copy(imported.state);
      openDialog(
        "确认覆盖范围",
        `<div class="notice warning">将以 ${e(imported.exportedAt)} 的备份覆盖当前账户记录。</div><p>日期：${e(st.settings.start)}—${e(st.settings.end)}</p><p>${st.projects.length}项目 / ${st.tasks.length}任务 / ${st.blocks.length}时间块 / ${st.reviews.length}复盘 / ${st.proposals.length}建议 / ${st.logs.length}日志</p><p class="muted">确认前未改变任何记录。确认后使用当前服务端版本检测；冲突不会无提示覆盖。</p>`,
        () => {
          exportState(S, "before-import");
          S = st;
          addLog("JSON导入恢复", "导入前已下载本机备份");
          mark("导入");
          selectedDate = S.settings.start;
          week = 0;
          render();
        },
        "下载当前备份并恢复",
      );
      return false;
    },
    "校验并查看覆盖范围",
  );
}
function openConflict() {
  if (!conflictData) return;
  const merged = mergeStates(base, S, conflictData.state);
  openDialog(
    "多设备版本冲突 · 选择后保存",
    `<div class="notice warning">本机基于版本${revision}，服务器已有版本${conflictData.revision}。不覆盖任何版本，先比较。同一记录双方均修改时须选择；不同记录会合并。</div>${
      merged.conflicts
        .map(
          (c) =>
            `<div class="conflict-row"><strong>${e(c.local?.title || c.remote?.title || c.id)}</strong><div class="tiny muted">${e(c.key)} · ${e(c.id)}</div><details><summary>展开本机与服务器记录</summary><pre>本机 ${e(JSON.stringify(c.local, null, 2))}\n服务器 ${e(JSON.stringify(c.remote, null, 2))}</pre></details>${select(
              "保留哪一版",
              c.token,
              "",
              [
                ["", "请选择"],
                ["local", "保留本机修改"],
                ["remote", "保留服务器修改"],
              ],
            )}</div>`,
        )
        .join("") || "<p>修改涉及不同记录，可以安全合并。</p>"
    }<p class="tiny muted">日志和复盘按稳定ID合并。若合并后的日程冲突，仍需手工处理，不自动移动锁定项。</p>`,
    (f) => {
      const choices = formObj(f);
      if (merged.conflicts.some((c) => !choices[c.token]))
        throw Error("请为每条冲突记录选择版本");
      const r = mergeStates(base, S, conflictData.state, choices);
      validateState(r.state);
      S = r.state;
      base = copy(conflictData.state);
      revision = conflictData.revision;
      savedAt = conflictData.savedAt;
      conflictData = null;
      pending = true;
      offline = false;
      cache();
      render();
      flush();
    },
    "合并并重试保存",
    btn("保留服务器全部记录", "conflict-remote", "", "danger"),
  );
}
function reviewProposalForm() {
  const r = S.reviews.find((x) => x.date === selectedDate);
  if (!r) {
    toast("请先保存当日复盘");
    return;
  }
  const rows = r.items
    .filter((i) => i.reason)
    .map((i) => ({
      ...i,
      task: S.tasks.find(
        (t) => t.id === S.blocks.find((b) => b.id === i.blockId)?.taskId,
      ),
    }));
  openDialog(
    "根据原因调整剩余估时与下一步",
    `<div class="notice">这些改动只保存为建议，接受前不更改任务或正式日程。保留历史快照，调整未来未开始块。</div>${rows.map((i, index) => `<div class="risk"><strong>${e(i.title)}</strong><p class="tiny muted">${e(i.reason)} · ${e(i.advice)}</p>${i.task ? `<div class="form-grid">${field("建议剩余分钟（未知可留空）", "remaining-" + index, i.reason === "估时不足" ? Math.ceil((i.task.remainingMinutes ?? i.task.placeholderMinutes ?? 60) * 1.25) : (i.task.remainingMinutes ?? ""), "number", 'min="0"')}${field("跟进日期（等待时建议填写）", "follow-" + index, i.task.followUp || addDays(selectedDate, 2), "date")}${field("最小下一步具体产出（可选）", "next-" + index, "")}</div>` : '<div class="tiny muted">无关联任务，可手工修改该工作块。</div>'}</div>`).join("") || "<p>没有未完成原因；仍可预览未来容量分配。</p>"}`,
    (f) => {
      const d = copy(S),
        updates = [];
      rows.forEach((i, index) => {
        if (!i.task) return;
        const t = d.tasks.find((t) => t.id === i.task.id);
        t.remainingMinutes = nullable(f, "remaining-" + index);
        t.followUp = f.get("follow-" + index);
        if (i.reason === "等待导师/设备") {
          t.status = "blocked";
          t.blockedReason = i.reason;
        }
        const next = String(f.get("next-" + index) || "").trim();
        if (next) t.checklist.push({ title: next, done: false });
        stamp(t);
        updates.push(t);
      });
      const temp = replanProposal(d, today()),
        after = { ...temp.after, taskUpdates: updates },
        risks = [...temp.risks, ...rows.map((i) => `${i.title}：${i.advice}`)];
      let p;
      commitDialog(() => {
        p = proposal(
          S,
          "复盘后调整：估时 / 等待 / 最小下一步",
          today(),
          after,
          temp.details,
          risks,
        );
      }, "复盘调整建议（未执行）");
      openProposal(p.id);
      return false;
    },
    "生成对比预览",
  );
}
function parseDates(str) {
  return [...new Set(str.split(/[\s,，]+/).filter(Boolean))];
}
function bindForms() {
  const settings = document.querySelector("#settings-form");
  if (settings)
    settings.onsubmit = (ev) => {
      ev.preventDefault();
      try {
        const f = new FormData(ev.target),
          v = formObj(f),
          st = copy(S.settings);
        for (const k of [
          "start",
          "end",
          "wake",
          "sleep",
          "workEnd",
          "lunchStart",
          "lunchEnd",
          "dinnerStart",
          "dinnerEnd",
          "gymStart",
          "gymEnd",
          "planDue",
          "experimentStart",
          "reviewDue",
          "interpretation",
          "experimentTime",
          "personalStart",
          "personalEnd",
          "windDownStart",
          "windDownEnd",
        ])
          st[k] = v[k];
        for (const k of [
          "dailyLimit",
          "applications",
          "applicationEach",
          "planPlaceholder",
          "reviewPlaceholder",
          "meetingMinutes",
          "experimentMinutes",
          "breakMinutes",
        ])
          st[k] = number(f, k);
        st.bufferRate = number(f, "bufferPercent", 50) / 100;
        for (const k of [
          "gymDates",
          "meetingCandidates",
          "experimentCandidates",
          "experimentDates",
          "exemptDays",
        ])
          st[k] = parseDates(v[k]);
        st.restDays = {};
        for (const line of v.restDays
          .split("\n")
          .map((x) => x.trim())
          .filter(Boolean)) {
          const [d, type, ...extra] = line.split(/\s+/);
          if (extra.length || !["full", "am", "pm"].includes(type))
            throw Error("休息日格式：YYYY-MM-DD full / am / pm");
          st.restDays[d] = type;
        }
        validateState({ ...S, settings: st });
        if (minutes(st.gymEnd) - minutes(st.gymStart) !== 180)
          throw Error("健身含相关时间须保留3小时，请选择3小时时段");
        let p;
        mutate(() => {
          p = replanProposal(S, today(), st);
        }, "生成设置调整预览");
        if (p) openProposal(p.id);
      } catch (err) {
        fail(err);
      }
    };
  const form = document.querySelector("#review-form");
  if (form)
    form.onsubmit = (ev) => {
      ev.preventDefault();
      try {
        const f = new FormData(ev.target),
          bs = blocksFor(S, selectedDate).filter((b) =>
            ["work", "prep", "experiment"].includes(b.kind),
          ),
          items = bs.map((b) => ({
            blockId: b.id,
            title: b.title,
            status: b.status,
            plannedSnapshot: {
              date: b.date,
              start: b.start,
              end: b.end,
              title: b.title,
              status: b.status,
            },
            actualMinutes: number(f, "actual-" + b.id, 1440),
            outcome: f.get("outcome-" + b.id),
            reason: f.get("reason-" + b.id),
            advice: reviewAdvice(f.get("reason-" + b.id)),
          }));
        mutate(
          () => {
            for (const item of items) {
              const b = S.blocks.find((b) => b.id === item.blockId),
                t = taskFor(S, b);
              if (t) {
                t.actualMinutes = Math.max(
                  0,
                  t.actualMinutes + item.actualMinutes - (b.actualMinutes || 0),
                );
                stamp(t);
              }
              updateRecord(b, { actualMinutes: item.actualMinutes });
            }
            let r = S.reviews.find((r) => r.date === selectedDate);
            const vals = { date: selectedDate, note: f.get("day-note"), items };
            if (r) updateRecord(r, vals);
            else
              S.reviews.push({
                ...vals,
                id: uid(),
                version: 1,
                updatedAt: now(),
              });
          },
          "保存" + selectedDate + "复盘",
        );
        toast("成果、原因、建议与计划快照已保存");
      } catch (err) {
        fail(err);
      }
    };
}
app.addEventListener("change", (ev) => {
  if (ev.target.id === "selected-date") {
    const d = ev.target.value;
    if (d >= S.settings.start && d <= S.settings.end) {
      selectedDate = d;
      week = Math.max(0, weekIndex(S, d));
      render();
    }
  }
});
async function action(name, id) {
  try {
    switch (name) {
      case "auth-toggle":
        authMode = authMode === "login" ? "register" : "login";
        renderAuth();
        break;
      case "nav":
        view = id;
        render();
        break;
      case "date-prev":
      case "date-next": {
        const d = addDays(selectedDate, name === "date-prev" ? -1 : 1);
        if (d >= S.settings.start && d <= S.settings.end) {
          selectedDate = d;
          week = weekIndex(S, d);
          render();
        }
        break;
      }
      case "week-prev":
        week = Math.max(0, week - 1);
        render();
        break;
      case "week-next":
        week = Math.min(
          Math.ceil(dates(S.settings.start, S.settings.end).length / 7) - 1,
          week + 1,
        );
        render();
        break;
      case "week-select":
        week = Number(id);
        render();
        break;
      case "review-week":
        week =
          (week + 1) %
          Math.ceil(dates(S.settings.start, S.settings.end).length / 7);
        render();
        break;
      case "open-day":
        selectedDate = id;
        view = "today";
        render();
        break;
      case "open-review":
        selectedDate = id;
        view = "review";
        render();
        break;
      case "end-day":
        view = "review";
        render();
        break;
      case "block-new":
        blockEditor();
        break;
      case "block-edit":
        blockEditor(id);
        break;
      case "block-complete":
        blockEditor(id, "", true);
        break;
      case "block-lock":
        mutate(() => {
          const b =
            S.blocks.find((x) => x.id === id) ||
            S.events.find((x) => x.id === id);
          if (b.date < today()) throw Error("历史日程不改变锁定状态");
          b.locked = !b.locked;
          stamp(b);
        }, "手工锁定状态更新");
        break;
      case "habit-edit":
        habitEditor(id);
        break;
      case "task-new":
        taskEditor();
        break;
      case "task-edit":
        taskEditor(id);
        break;
      case "task-schedule":
        blockEditor("", id);
        break;
      case "project-edit":
        projectEditor(id);
        break;
      case "interview":
        interviewForm();
        break;
      case "event-new":
        eventForm();
        break;
      case "day-setting":
        daySetting(id);
        break;
      case "experiment":
        experimentPicker();
        break;
      case "review-propose":
        reviewProposalForm();
        break;
      case "replan": {
        let p;
        mutate(() => {
          p = replanProposal(S, today());
          if (name === "review-propose") {
            const r = S.reviews.find((r) => r.date === selectedDate);
            if (r)
              p.risks.push(
                ...r.items
                  .filter((i) => i.reason)
                  .map((i) => `${i.title} · ${i.reason}：${i.advice}`),
              );
          }
        }, "生成未来规则调整（未执行）");
        if (p) openProposal(p.id);
        break;
      }
      case "proposals":
        view = "review";
        render();
        break;
      case "proposal-open":
        openProposal(id);
        break;
      case "proposal-block":
        proposalBlockEditor(id);
        break;
      case "proposal-cancel":
        mutate(() => {
          const p = S.proposals.find((x) => x.id === id);
          p.status = "cancelled";
          stamp(p);
        }, "取消建议，正式日程保持不变");
        dialog.close();
        break;
      case "proposal-undo":
        mutate(() => undoProposal(S, id), "撤销调整");
        break;
      case "export":
        exportState();
        break;
      case "import":
        importDialog();
        break;
      case "dialog-close":
        dialog.close();
        break;
      case "sync":
        offline = false;
        if (conflictData) {
          openConflict();
          break;
        }
        if (pending) {
          await flush();
          if (syncStatus.startsWith("登录")) {
            renderAuth();
          }
        } else {
          const r = await api("/api/state");
          if (r.revision !== revision) {
            S = r.state;
            base = copy(S);
            revision = r.revision;
            savedAt = r.savedAt;
            syncStatus = "已保存至此服务器";
            cache();
            render();
            toast("已读取另一设备的最新记录");
          } else toast("服务器记录已是最新版本");
        }
        break;
      case "conflict-remote":
        S = copy(conflictData.state);
        base = copy(S);
        revision = conflictData.revision;
        savedAt = conflictData.savedAt;
        conflictData = null;
        pending = false;
        syncStatus = "已保存至此服务器";
        cache();
        dialog.close();
        render();
        break;
      case "logout":
        await api("/api/logout", { method: "POST", body: "{}" });
        cache();
        S = null;
        user = null;
        localStorage.removeItem("worktable-last-user");
        renderAuth();
        break;
    }
  } catch (err) {
    fail(err);
  }
}
for (const target of [app, dialog]) {
  target.addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-action]");
    if (b) {
      ev.preventDefault();
      action(b.dataset.action, b.dataset.id);
    }
  });
  target.addEventListener("keydown", (ev) => {
    if (
      (ev.key === "Enter" || ev.key === " ") &&
      ev.target.matches("[role=button][data-action]")
    ) {
      ev.preventDefault();
      action(ev.target.dataset.action, ev.target.dataset.id);
    }
  });
}
window.addEventListener("online", () => {
  offline = false;
  flush();
});
window.addEventListener("offline", () => {
  offline = true;
  syncStatus = pending ? "离线待同步" : "离线 · 本机缓存";
  updateSync();
});
window.addEventListener("storage", (ev) => {
  if (user && ev.key === cacheKey() && !saving) {
    syncStatus = "本机另一标签页有修改 · 请检查同步";
    updateSync();
  }
});
window.addEventListener("beforeunload", (ev) => {
  if (pending) {
    cache();
    ev.preventDefault();
    ev.returnValue = "";
  }
});
if ("serviceWorker" in navigator)
  navigator.serviceWorker.register("/sw.js").catch(() => {});
bootstrap();
