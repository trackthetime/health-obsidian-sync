// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: purple; icon-glyph: magic;
// ========================================
// 健身月历 · 完整版 + iCloud 备份
// Scriptable 大号桌面组件
// ========================================

const STORE_KEY = "TRAINING_LOG_V1";
const TYPES = ["有氧", "背", "肩"];

const C = {
  bg: "#222222",
  today: "#C57BB5",
  text: "#F2F2F2",
  muted: "#827B7E",
  emptyRing: "#544040",
  cardio: "#CE7979",
  back: "#479DD0",
  shoulder: "#B78BD0"
};

const now = new Date();
const year = now.getFullYear();
const month = now.getMonth() + 1;
const day = now.getDate();

const pad = n => String(n).padStart(2, "0");
const keyFor = d => `${year}-${pad(month)}-${pad(d)}`;
const todayKey = keyFor(day);

// ===== 本机记录 =====
let records = {};

if (Keychain.contains(STORE_KEY)) {
  records = JSON.parse(Keychain.get(STORE_KEY));

  if (
    !records ||
    typeof records !== "object" ||
    Array.isArray(records)
  ) {
    throw new Error("记录格式异常，停止运行以保护已有数据。");
  }
}

function getRecord(key) {
  const value = records[key];

  return Array.isArray(value)
    ? TYPES.filter(type => value.includes(type))
    : [];
}

// ===== iCloud 单向备份 =====
let cloudError = "";

function backupToCloud() {
  try {
    const fm = FileManager.iCloud();

    const folder = fm.joinPath(
      fm.documentsDirectory(),
      "TrainingLogs"
    );

    if (!fm.fileExists(folder)) {
      fm.createDirectory(folder, true);
    }

    const path = fm.joinPath(
      folder,
      "training-records.json"
    );

    // 完整记录统一保存，取消打卡也会更新备份。
    const content = JSON.stringify({
      version: 1,
      records
    }, null, 2);

    let shouldWrite = true;

    if (
      fm.fileExists(path) &&
      fm.isFileDownloaded(path)
    ) {
      shouldWrite = fm.readString(path) !== content;
    }

    if (shouldWrite) {
      fm.writeString(path, content);
    }

    cloudError = "";
    console.log("已写入 iCloud 备份，实际上传由系统同步。");

  } catch (error) {
    cloudError = String(error);

    console.log(
      "本机记录保留，iCloud 备份失败：" + cloudError
    );
  }
}

function saveRecords() {
  // 先保存本机，云端失败不影响本次记录。
  Keychain.set(STORE_KEY, JSON.stringify(records));
  backupToCloud();
}

function toggle(key, type) {
  const current = getRecord(key);

  const next = current.includes(type)
    ? current.filter(item => item !== type)
    : [...current, type];

  if (next.length) {
    records[key] = next;
  } else {
    delete records[key];
  }

  saveRecords();
}

// ===== 补记 / 修改日期 =====
async function editDate() {
  const input = new Alert();
  input.title = "补记 / 修改";
  input.message = "输入日期，例如 2026-10-12";

  input.addTextField("YYYY-MM-DD", todayKey);
  input.addAction("继续");
  input.addCancelAction("取消");

  if (await input.presentAlert() < 0) return;

  const key = input.textFieldValue(0).trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);

  let valid = false;

  if (match) {
    const [y, m, d] = match.slice(1).map(Number);
    const check = new Date(y, m - 1, d);

    valid =
      y >= 2000 &&
      y <= 2100 &&
      check.getFullYear() === y &&
      check.getMonth() === m - 1 &&
      check.getDate() === d &&
      key <= todayKey;
  }

  if (!valid) {
    const error = new Alert();
    error.title = "日期无效";
    error.message = "请填写真实日期，不能记录未来训练。";
    error.addAction("好");

    await error.presentAlert();
    return;
  }

  while (true) {
    const current = getRecord(key);
    const menu = new Alert();

    menu.title = key;
    menu.message = "点击切换，立即保存。";

    TYPES.forEach(type => {
      menu.addAction(
        `${current.includes(type) ? "✓" : "○"} ${type}`
      );
    });

    menu.addCancelAction("完成");

    const choice = await menu.presentSheet();
    if (choice < 0) break;

    toggle(key, TYPES[choice]);
  }
}

// ===== 查看 / 重试备份 =====
async function checkBackup() {
  backupToCloud();

  const result = new Alert();

  result.title = cloudError
    ? "备份失败"
    : "已写入备份";

  result.message = cloudError
    ? "本机记录仍然保留。\n请检查 iCloud Drive 和 Scriptable 权限。\n\n" + cloudError
    : "文件 → iCloud Drive → Scriptable → TrainingLogs → training-records.json\n\n实际上传时间由 iCloud 决定。这是本机到云端的单向备份。";

  result.addAction("好");
  await result.presentAlert();
}

// 手动运行时备份历史，并重试之前失败的备份。
if (config.runsInApp) {
  backupToCloud();
}

// ===== 桌面按钮 =====
const action = (args.queryParameters || {}).action;
let fromButton = false;

if (config.runsInApp && TYPES.includes(action)) {
  toggle(todayKey, action);
  fromButton = true;

  console.log(
    `${todayKey}：` +
    `${getRecord(todayKey).includes(action) ? "已记录" : "已取消"} ${action}`
  );
}

// ===== 手动运行菜单 =====
if (config.runsInApp && !fromButton) {
  const menu = new Alert();
  menu.title = "健身记录";

  TYPES.forEach(type => {
    menu.addAction(
      `${getRecord(todayKey).includes(type) ? "✓" : "○"} 今天 · ${type}`
    );
  });

  menu.addAction("补记 / 修改日期");
  menu.addAction("预览组件");
  menu.addAction("检查 / 重试 iCloud 备份");
  menu.addCancelAction("取消");

  const choice = await menu.presentSheet();

  if (choice >= 0 && choice < 3) {
    toggle(todayKey, TYPES[choice]);

  } else if (choice === 3) {
    await editDate();

  } else if (choice === 5) {
    await checkBackup();
  }
}

// ===== 绘制月历 =====
const W = 340;
const H = 280;

const canvas = new DrawContext();
canvas.size = new Size(W, H);
canvas.opaque = true;
canvas.respectScreenScale = true;

canvas.setFillColor(new Color(C.bg));
canvas.fillRect(new Rect(0, 0, W, H));

function text(value, x, y, width, size, color, bold = false) {
  canvas.setFont(
    bold ? Font.boldSystemFont(size) : Font.systemFont(size)
  );

  canvas.setTextColor(new Color(color));
  canvas.setTextAlignedCenter();

  canvas.drawTextInRect(
    String(value),
    new Rect(x, y, width, size + 7)
  );
}

function ring(x, y, diameter, color, width) {
  canvas.setStrokeColor(new Color(color));
  canvas.setLineWidth(width);

  canvas.strokeEllipse(
    new Rect(x, y, diameter, diameter)
  );
}

function line(x, y, width, color) {
  const height = 3;

  canvas.setFillColor(new Color(color));

  canvas.fillRect(
    new Rect(
      x + height / 2,
      y,
      width - height,
      height
    )
  );

  canvas.fillEllipse(
    new Rect(x, y, height, height)
  );

  canvas.fillEllipse(
    new Rect(
      x + width - height,
      y,
      height,
      height
    )
  );
}

const daysInMonth = new Date(year, month, 0).getDate();

const offset =
  (new Date(year, month - 1, 1).getDay() + 6) % 7;

const rows = Math.ceil((offset + daysInMonth) / 7);
const weekdays = ["一", "二", "三", "四", "五", "六", "日"];

const left = 10;
const cellWidth = 320 / 7;
const diameter = 32;

const gridTop = 39;
const lastRowY = H - diameter - 10;
const rowStep = (lastRowY - gridTop) / (rows - 1);

weekdays.forEach((name, index) => {
  text(
    name,
    left + index * cellWidth,
    8,
    cellWidth,
    12,
    C.muted
  );
});

for (let d = 1; d <= daysInMonth; d++) {
  const position = offset + d - 1;
  const column = position % 7;
  const row = Math.floor(position / 7);

  const cellX = left + column * cellWidth;
  const x = cellX + (cellWidth - diameter) / 2;
  const y = gridTop + row * rowStep;

  const selected = getRecord(keyFor(d));
  const isToday = d === day;

  // 深色圆心。
  canvas.setFillColor(new Color("#181818"));

  canvas.fillEllipse(
    new Rect(x, y, diameter, diameter)
  );

  // 有氧：珊瑚红圆环。
  ring(
    x,
    y,
    diameter,
    selected.includes("有氧") ? C.cardio : C.emptyRing,
    selected.includes("有氧") ? 3 : 1.3
  );

  text(
    d,
    cellX,
    y + 5,
    cellWidth,
    19,
    d > day ? C.muted : C.text,
    isToday
  );

  // 今天：顶部紫色小点。
  if (isToday) {
    canvas.setFillColor(new Color(C.today));

    canvas.fillEllipse(
      new Rect(
        x + diameter / 2 - 2,
        y - 7,
        4,
        4
      )
    );
  }

  // 背：蓝色横线；肩：紫色横线。
  const hasBack = selected.includes("背");
  const hasShoulder = selected.includes("肩");
  const markY = y + diameter + 4;

  if (hasBack && hasShoulder) {
    line(x, markY, 14, C.back);
    line(x + 18, markY, 14, C.shoulder);

  } else if (hasBack) {
    line(x, markY, diameter, C.back);

  } else if (hasShoulder) {
    line(x, markY, diameter, C.shoulder);
  }
}

// ===== 创建组件 =====
const widget = new ListWidget();
widget.backgroundColor = new Color(C.bg);
widget.setPadding(10, 8, 10, 8);

const calendar = widget.addImage(canvas.getImage());
calendar.resizable = true;
calendar.applyFittingContentMode();
calendar.centerAlignImage();

widget.addSpacer(5);

// ===== 底部图例式按钮 =====
function legendIcon(type, color) {
  const context = new DrawContext();
  context.size = new Size(24, 24);
  context.opaque = false;
  context.respectScreenScale = true;

  if (type === "有氧") {
    context.setStrokeColor(new Color(color));
    context.setLineWidth(2.8);

    context.strokeEllipse(
      new Rect(4, 4, 16, 16)
    );

  } else {
    context.setFillColor(new Color(color));

    context.fillRect(
      new Rect(4, 10.5, 16, 3)
    );

    context.fillEllipse(
      new Rect(2.5, 10.5, 3, 3)
    );

    context.fillEllipse(
      new Rect(18.5, 10.5, 3, 3)
    );
  }

  return context.getImage();
}

const buttons = widget.addStack();
buttons.layoutHorizontally();
buttons.centerAlignContent();
buttons.addSpacer();

const current = getRecord(todayKey);
const colors = [C.cardio, C.back, C.shoulder];

TYPES.forEach((type, index) => {
  if (index > 0) buttons.addSpacer(18);

  const button = buttons.addStack();
  button.layoutHorizontally();
  button.centerAlignContent();
  button.setPadding(9, 3, 9, 3);

  button.url =
    "scriptable:///run?scriptName=" +
    encodeURIComponent(Script.name()) +
    "&action=" + encodeURIComponent(type);

  const icon = button.addImage(
    legendIcon(type, colors[index])
  );

  icon.imageSize = new Size(22, 22);
  button.addSpacer(5);

  const checked = current.includes(type);

  const title = button.addText(
    checked ? `${type} ✓` : type
  );

  title.font = checked
    ? Font.mediumSystemFont(14)
    : Font.systemFont(14);

  title.textColor = new Color(
    checked ? colors[index] : "#C8C3C5"
  );

  title.lineLimit = 1;
});

buttons.addSpacer();

// ===== 刷新与输出 =====
widget.refreshAfterDate = new Date(
  Date.now() + 30 * 60 * 1000
);

Script.setWidget(widget);

if (config.runsInApp && !fromButton) {
  await widget.presentLarge();
}

Script.complete();
