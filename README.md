# Health → Obsidian 生活与健康看板

把 iPhone 健康导出、Scriptable 每日事项与健身记录、Excel 饮食表，以及可选的体脂秤 CSV，定时整理到本机 Obsidian。生成一个总览页和七个专题页：健康指标、睡眠、体脂秤、饮食、健身、每日事项、饮食训练日历。

只发布程序与空配置。**原始健康数据、饮食表、体脂秤 CSV、Obsidian 生成页面和真实配置均不在这个仓库。** 这是 Windows + iPhone 的参考实现，时间按北京时间处理。

## 数据流

```text
iPhone 健康 App → Health Data Export → iCloud Drive JSON ┐
iPhone Scriptable → iCloud Drive JSON ────────────────────┼→ Windows refresh.py → Obsidian 页面
Excel 饮食表 ──────────────────────────────────────────────┤
可选：私有体脂秤仓库 → 本地 CSV ──────────────────────────┘
```

Windows 上的 iCloud 同步文件夹不会直接显示健康 App 的原始数据库；需要 iPhone 端的健康导出应用先把数据写成文件。聚合过程可自动运行，但饮食和事项仍由本人记录，iOS 后台导出和 iCloud 同步时间也可能晚于 09:30。下一次刷新会读取新文件，并将已见导出归档累积。

## 准备

- Windows 10/11、Python 3.10+、iCloud for Windows、Obsidian。
- iPhone 上可把 Apple 健康数据导出为 JSON 到 iCloud Drive 的应用。本项目按 Health Data Export 输出的 `metrics`、`category_metrics`、`workouts` 格式读取；其他应用的格式需先转换。
- iPhone 上的 [Scriptable](https://scriptable.app/)；本仓库的 `scriptable/fitness.js`、`scriptable/daily-tasks.js` 会分别写出 `TrainingLogs/training-records.json`、`DailyBlocks/YYYY-MM-DD.json`。在 Scriptable 里运行脚本并授予 iCloud Drive 权限，按需要加入组件；备份在脚本执行时更新。
- Excel 饮食表。工作表名推荐 `饮食与运动记录`；第 9 行起记录，A–K 列依次为：日期、时段、食物/饮品、数量、重量/容量、饮食备注、运动项目、时长、阻力/重量、配速/组数、其他备注。合并的日期单元格可用，后续行沿用最近日期。第 4–5 行非空内容会作为原文附在饮食页，不会计算热量。
- Obsidian 的 [Charts 插件](https://github.com/phibr0/obsidian-charts)用于图表；未装插件时表格和文字仍可阅读。把 `health-space.css` 复制到 vault 的 `.obsidian/snippets/` 并在 Obsidian 的外观设置中启用，可显示卡片和日历样式。

建议先在 iPhone 的 Health Data Export 中授权需要的健康类型，选择 JSON 与 iCloud Drive 目录，手动导出一次并确认 Windows 能看到文件，再设置每天约 09:00 的后台导出。导出配置由该 App 管理，是否准时执行取决于 iOS 和 iCloud；刷新脚本读取实际到达的文件。首次完整历史范围取决于导出 App 提供的范围，后续文件会累积。

## 本机配置与首次运行

```powershell
git clone https://github.com/trackthetime/health-obsidian-sync.git
cd health-obsidian-sync
py -3 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
Copy-Item config.example.json config.json
```

编辑 `config.json`，填入自己的绝对路径：

| 键 | 用途 |
| --- | --- |
| `vault_path` | 存放八个生成页面的 Obsidian 文件夹；建议在 vault 内新建专用子文件夹 |
| `health_export_dir` | iCloud Drive 中的健康 JSON 导出目录 |
| `scriptable_dir` | Windows 上的 Scriptable iCloud 文档目录 |
| `diet_workbook` | 自己的 `.xlsx` 饮食表 |
| `schedule_time` | 每日整理时间，默认 `09:30` |
| `archive_dir` | 可省略；默认 `%LOCALAPPDATA%/HealthObsidianSync/archive`，保留已读导出 |
| `scale_csv` | 可选的私有体脂秤 CSV 路径 |
| `scale_repo_path`、`scale_github_repo` | 可选：刷新前触发私有仓库 Actions 并 `git pull`；两项须一起配置，且要填写 `scale_csv` |
| `scale_source_label` | 体脂秤来源名称，默认“体脂秤” |

首次运行前，请确认 `vault_path` 指向专用空文件夹，或其中只有本程序生成的页面；脚本会拒绝覆盖无自动生成标记的同名页面。已有页面的“个人笔记”部分会保留。

```powershell
.\.venv\Scripts\python.exe refresh.py --config config.json
```

成功后看 `vault_path/生活与健康总览.md`，再检查 `%LOCALAPPDATA%/HealthObsidianSync/last_run.json`。没有可读健康 JSON 时，脚本会报错且不更新页面。体脂秤采集失败时仍显示本地旧 CSV，并在状态文件标为 `partial`。

## 每天 09:30 自动整理

在 PowerShell 运行，传入完整 Python 路径：

```powershell
.\scripts\install-task.ps1 -PythonPath "$PWD\.venv\Scripts\python.exe"
```

安装脚本创建当前 Windows 用户的计划任务：每天 `schedule_time` 运行；登录时也检查当天是否错过。它不会覆盖同名任务。检查任务可用 `Get-ScheduledTask -TaskName HealthObsidianSync_0930`；删除可用 `Unregister-ScheduledTask -TaskName HealthObsidianSync_0930 -Confirm:$false`。Windows 需登录、可访问本机文件及 iCloud 已同步，才能刷新。定时任务只运行本项目的脚本，不修改 iPhone 的后台导出设置。

## 可选：体脂秤

`private-scale-template/` 含独立的采集程序和 Actions 工作流。**必须复制到你自己的私有仓库后运行**；公开主仓库不安装该工作流，也不保存 CSV。详细步骤见 [私有采集模板](private-scale-template/README.md)。没有体脂秤也可以正常生成看板。

## 页面口径

- 首页画步数、静息心率、已标记睡着时长和体重；距离仅保留原始明细并标“待核对”，不会换算或据此评估运动。
- 睡眠按北京时间 18:00 分夜，合并重叠的“睡着”片段；未知和清醒片段不算睡着。不推断深睡或 REM。
- 饮食仅展示 Excel 中有来源的条目，不凭食物名称推算热量或营养素。
- 体脂秤数值保留来源标签；页面是记录展示，不提供医学诊断。

本项目按 MIT 许可发布。运行 `python -m unittest discover -s tests -v` 可验证合成数据流程。
