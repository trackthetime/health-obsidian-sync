// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-blue; icon-glyph: magic;
// ========================================
// 每日时间块 · 三列 + iCloud 备份
// 时间 / 目标 / 完成情况
// Scriptable 大号桌面组件
// ========================================

const STORE_KEY = "DAILY_BLOCK_PLANNER_V1";

const BLOCKS = [
  { start: 0, end: 480, name: "休息", free: true },
  { start: 480, end: 720, name: "上午", free: false },
  { start: 720, end: 780, name: "午休", free: true },
  { start: 780, end: 1080, name: "下午", free: false },
  { start: 1080, end: 1440, name: "晚间", free: true }
];

const STATUS = [
  "待记录",
  "已完成",
  "完成一部分",
  "一点没干"
];

const SYMBOLS = ["○", "✓", "◐", "×"];

// ===== 蓝黑灰白色卡 =====
const C = {
  bg: "#06121E",
  group: "#0A2238",
  free: "#94A2AD",
  planBlank: "#0C1B2A",
  plan: "#284963",
  resultBlank: "#102331",
  text: "#F5F8FA",
  darkText: "#0A2238",
  timeline: "#FFFFFF"
};

const RESULT_COLORS = [
  "#263747", // 待记录
  "#DCE6EC", // 已完成
  "#708B9F", // 完成一部分
  "#374856"  // 一点没干
];

const now = new Date();
const pad = n => String(n).padStart(2, "0");

const todayKey =
  `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

function clock(value) {
  return `${pad(Math.floor(value / 60))}:${pad(value % 60)}`;
}

function range(block) {
  return `${clock(block.start)}—${clock(block.end)}`;
}

function parseTime(value) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;

  const hour = Number(match[1]);
  const minute = Number(match[2]);

  if (
    hour > 24 ||
    minute > 59 ||
    (hour === 24 && minute !== 0)
  ) return null;

  return hour * 60 + minute;
}

// ===== 本机记录 =====
let database = {};

if (Keychain.contains(STORE_KEY)) {
  database = JSON.parse(Keychain.get(STORE_KEY));

  if (
    !database ||
    typeof database !== "object" ||
    Array.isArray(database)
  ) {
    throw new Error("数据格式异常，停止运行以保护记录。");
  }
}

if (!database[todayKey]) database[todayKey] = [];

const tasks = database[todayKey];

if (!Array.isArray(tasks)) {
  throw new Error("今日记录格式异常。");
}

// ===== iCloud 按日期备份 =====
// 本机记录为准；此版本不会从云端反向导入。
function backupToCloud() {
  // 放在函数内创建，iCloud 不可用时仍能保存本机。
  const fm = FileManager.iCloud();

  const folder = fm.joinPath(
    fm.documentsDirectory(),
    "DailyBlocks"
  );

  if (!fm.fileExists(folder)) {
    fm.createDirectory(folder, true);
  }

  for (const date of Object.keys(database)) {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Array.isArray(database[date])
    ) continue;

    const path = fm.joinPath(folder, `${date}.json`);

    const content = JSON.stringify({
      date,
      tasks: database[date]
    }, null, 2);

    // 文件已下载时，跳过内容相同的备份。
    if (fm.fileExists(path) && fm.isFileDownloaded(path)) {
      if (fm.readString(path) === content) continue;
    }

    fm.writeString(path, content);
  }
}

let cloudError = "";

function tryCloudBackup() {
  try {
    backupToCloud();
    cloudError = "";
    console.log("已写入 iCloud 备份，等待系统同步。");
  } catch (error) {
    cloudError = String(error);
    console.log("本机记录保留，iCloud 备份失败：" + cloudError);
  }
}

function save() {
  // 本机先保存，云端失败不影响本次记录。
  Keychain.set(STORE_KEY, JSON.stringify(database));
  tryCloudBackup();
}

function blockTasks(index) {
  return tasks
    .filter(task => task.block === index)
    .sort((a, b) => a.start - b.start);
}

function taskStatus(task) {
  return Number.isInteger(task.status) &&
    task.status >= 0 && task.status <= 3
      ? task.status
      : 0;
}

async function notice(title, content) {
  const alert = new Alert();
  alert.title = title;
  alert.message = content;
  alert.addAction("好");
  await alert.presentAlert();
}

// ===== 添加 / 修改安排 =====
async function inputTask(index, existing = null) {
  const block = BLOCKS[index];
  let defaultStart = block.start;
  let defaultEnd = block.end;

  if (!existing) {
    let cursor = block.start;
    let found = false;

    for (const task of blockTasks(index)) {
      if (task.start > cursor) {
        defaultStart = cursor;
        defaultEnd = task.start;
        found = true;
        break;
      }

      cursor = Math.max(cursor, task.end);
    }

    if (!found && cursor < block.end) {
      defaultStart = cursor;
      defaultEnd = block.end;
      found = true;
    }

    if (!found) {
      await notice("已排满", "请先修改已有安排。");
      return;
    }
  }

  const alert = new Alert();
  alert.title = existing ? "修改安排" : "添加临时安排";
  alert.message = `${range(block)} · ${block.name}`;

  alert.addTextField(
    "开始时间",
    clock(existing ? existing.start : defaultStart)
  );

  alert.addTextField(
    "结束时间",
    clock(existing ? existing.end : defaultEnd)
  );

  alert.addTextField("目标", existing ? existing.goal : "");

  alert.addAction("保存");
  alert.addCancelAction("取消");

  if (await alert.presentAlert() < 0) return;

  const start = parseTime(alert.textFieldValue(0));
  const end = parseTime(alert.textFieldValue(1));
  const goal = alert.textFieldValue(2).trim();

  if (
    start === null || end === null ||
    start < block.start || end > block.end ||
    end <= start || !goal
  ) {
    await notice(
      "内容不正确",
      "填写目标，小块起止时间必须位于所选大块内。"
    );
    return;
  }

  const overlap = tasks.some(task =>
    task !== existing &&
    task.block === index &&
    start < task.end &&
    end > task.start
  );

  if (overlap) {
    await notice("时间重叠", "请避开已有安排。");
    return;
  }

  if (existing) {
    existing.start = start;
    existing.end = end;
    existing.goal = goal;
  } else {
    tasks.push({
      block: index,
      start,
      end,
      goal,
      status: 0,
      actual: ""
    });
  }

  save();
}

// ===== 完成情况 =====
async function recordResult(task) {
  const menu = new Alert();
  menu.title = task.goal;

  STATUS.forEach((name, index) => {
    menu.addAction(`${SYMBOLS[index]} ${name}`);
  });

  menu.addCancelAction("取消");

  const status = await menu.presentSheet();
  if (status < 0) return;

  let actual = "";

  if (status === 2 || status === 3) {
    const note = new Alert();
    note.title = STATUS[status];
    note.message = "填写实际做了什么，或时间去干什么了。";

    note.addTextField(
      "你填写的文字将显示在第三列",
      task.actual || ""
    );

    note.addAction("保存");
    note.addCancelAction("取消");

    if (await note.presentAlert() < 0) return;

    actual = note.textFieldValue(0).trim();
  }

  task.status = status;
  task.actual = actual;
  save();
}

async function editTask(task) {
  const menu = new Alert();
  const status = taskStatus(task);

  menu.title = `${clock(task.start)}—${clock(task.end)}`;

  menu.message =
    `${task.goal}\n${STATUS[status]}` +
    (task.actual ? `\n实际：${task.actual}` : "");

  menu.addAction("记录 / 修改完成情况");
  menu.addAction("修改时间 / 目标");
  menu.addDestructiveAction("删除安排");
  menu.addCancelAction("返回");

  const choice = await menu.presentSheet();

  if (choice === 0) {
    await recordResult(task);

  } else if (choice === 1) {
    await inputTask(task.block, task);

  } else if (choice === 2) {
    const confirm = new Alert();
    confirm.title = "删除这个安排？";
    confirm.message = task.goal;
    confirm.addDestructiveAction("删除");
    confirm.addCancelAction("保留");

    if (await confirm.presentAlert() === 0) {
      tasks.splice(tasks.indexOf(task), 1);
      save();
    }
  }
}

async function openBlock(index, resultMode = false) {
  while (true) {
    const list = blockTasks(index);

    if (resultMode && !list.length) {
      await notice("还没有安排", "先在第二列添加目标。");
      return;
    }

    const menu = new Alert();
    menu.title = `${range(BLOCKS[index])} · ${BLOCKS[index].name}`;

    if (!resultMode) menu.addAction("＋ 添加临时安排");

    list.forEach(task => {
      menu.addAction(
        `${SYMBOLS[taskStatus(task)]} ${clock(task.start)} ${task.goal}`
      );
    });

    menu.addCancelAction("返回");

    const choice = await menu.presentSheet();
    if (choice < 0) return;

    if (resultMode) {
      await recordResult(list[choice]);
    } else if (choice === 0) {
      await inputTask(index);
    } else {
      await editTask(list[choice - 1]);
    }
  }
}

// ===== 应用内操作 =====
if (config.runsInApp) {
  // 首次运行迁移历史；以后运行时重试之前失败的备份。
  save();

  const query = args.queryParameters || {};

  if (query.block !== undefined) {
    const index = Number(query.block);

    if (
      Number.isInteger(index) &&
      index >= 0 && index < BLOCKS.length
    ) {
      await openBlock(index, query.mode === "result");
    }

  } else {
    while (true) {
      const menu = new Alert();
      menu.title = `${todayKey} · 时间安排`;

      BLOCKS.forEach((block, index) => {
        menu.addAction(
          `${range(block)} ${block.name} · ${blockTasks(index).length}项`
        );
      });

      menu.addAction("查看完整记录");
      menu.addAction("检查 / 重试 iCloud 备份");
      menu.addAction("预览组件");
      menu.addCancelAction("结束");

      const choice = await menu.presentSheet();
      if (choice < 0 || choice === 10) break;

      if (choice === 8) {
        const detail = BLOCKS.map((block, index) =>
          `${range(block)} ${block.name}\n` +
          (
            blockTasks(index).map(task =>
              `${SYMBOLS[taskStatus(task)]} ` +
              `${clock(task.start)}—${clock(task.end)} ${task.goal}\n` +
              `${STATUS[taskStatus(task)]}` +
              (task.actual ? `\n实际：${task.actual}` : "")
            ).join("\n\n") || "未安排"
          )
        ).join("\n\n");

        await notice("今日完整记录", detail);

      } else if (choice === 9) {
        tryCloudBackup();

        await notice(
          cloudError ? "云端备份失败" : "已写入备份",
          cloudError
            ? "本机记录已保留。\n请检查 iCloud Drive 和 Scriptable 权限。\n\n" + cloudError
            : "文件 → iCloud Drive → Scriptable → DailyBlocks\n\n实际上传时间由 iCloud 决定。"
        );

      } else {
        await openBlock(choice);
      }
    }
  }
}

// ===== 三列绘图 =====
const WIDTHS = [68, 122, 98];
const GAP = 6;
const SCALE = 0.28;

const renderTime = new Date();
const currentMinute =
  renderTime.getHours() * 60 +
  renderTime.getMinutes() +
  renderTime.getSeconds() / 60;

function drawText(ctx, value, rect, size, color) {
  ctx.setFont(Font.systemFont(size));
  ctx.setTextColor(new Color(color));
  ctx.setTextAlignedLeft();
  ctx.drawTextInRect(String(value), rect);
}

function columnImage(index, column) {
  const block = BLOCKS[index];
  const bodyWidth = WIDTHS[column];
  const width = bodyWidth + (column < 2 ? GAP : 0);
  const height = (block.end - block.start) * SCALE;

  const ctx = new DrawContext();
  ctx.size = new Size(width, height);
  ctx.opaque = true;
  ctx.respectScreenScale = true;

  ctx.setFillColor(new Color(C.bg));
  ctx.fillRect(new Rect(0, 0, width, height));

  const baseColor = column === 0
    ? (block.free ? C.free : C.group)
    : column === 1 ? C.planBlank : C.resultBlank;

  ctx.setFillColor(new Color(baseColor));
  ctx.fillRect(new Rect(0, 2, bodyWidth, height - 4));

  if (column === 0) {
    const color = block.free ? C.darkText : C.text;
    const middleY = height / 2;

    drawText(
      ctx, clock(block.start),
      new Rect(8, middleY - 14, bodyWidth - 16, 13),
      10, color
    );

    drawText(
      ctx, clock(block.end),
      new Rect(8, middleY + 1, bodyWidth - 16, 13),
      10, color
    );

  } else {
    blockTasks(index).forEach(task => {
      const startY = Math.max(
        2, (task.start - block.start) * SCALE
      );

      const endY = Math.min(
        height - 2, (task.end - block.start) * SCALE
      );

      const available = endY - startY;
      if (available <= 0) return;

      const gap = Math.min(2, available / 4);
      const y = startY + gap / 2;
      const h = available - gap;
      const status = taskStatus(task);

      ctx.setFillColor(
        new Color(column === 1 ? C.plan : RESULT_COLORS[status])
      );

      ctx.fillRect(new Rect(0, y, bodyWidth, h));

      if (column === 1 && h >= 14) {
        drawText(
          ctx, task.goal,
          new Rect(6, y + 2, bodyWidth - 12, h - 4),
          10, C.text
        );
      }

      if (
        column === 2 &&
        (status === 2 || status === 3) &&
        task.actual &&
        h >= 14
      ) {
        drawText(
          ctx, task.actual,
          new Rect(6, y + 2, bodyWidth - 12, h - 4),
          9, C.text
        );
      }
    });
  }

  // 当前时间线贯穿三列与间隙。
  if (
    currentMinute >= block.start &&
    currentMinute < block.end
  ) {
    const y = Math.max(
      1,
      Math.min(height - 2, (currentMinute - block.start) * SCALE)
    );

    ctx.setFillColor(new Color(C.bg));
    ctx.fillRect(new Rect(0, y - 1, width, 3.5));

    ctx.setFillColor(new Color(C.timeline));
    ctx.fillRect(new Rect(0, y, width, 1.5));
  }

  return { image: ctx.getImage(), width, height };
}

// ===== 输出组件 =====
const widget = new ListWidget();
widget.backgroundColor = new Color(C.bg);
widget.setPadding(12, 12, 12, 12);

widget.addSpacer();

// 展示 08:00—24:00。
for (let index = 1; index < BLOCKS.length; index++) {
  const row = widget.addStack();
  row.layoutHorizontally();

  for (let column = 0; column < 3; column++) {
    const result = columnImage(index, column);
    const image = row.addImage(result.image);

    image.imageSize = new Size(result.width, result.height);

    image.url =
      "scriptable:///run?scriptName=" +
      encodeURIComponent(Script.name()) +
      "&block=" + index +
      "&mode=" + (column === 2 ? "result" : "plan");
  }
}

widget.addSpacer();

widget.refreshAfterDate = new Date(
  Date.now() + 30 * 60 * 1000
);

Script.setWidget(widget);

if (config.runsInApp) {
  await widget.presentLarge();
}

Script.complete();
