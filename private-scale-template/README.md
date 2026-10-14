# 可选：体脂秤私有采集仓库模板

这个目录是**复制模板**，不会在本公开仓库运行。`scale_sync.py` 使用好燃体脂秤的非公开接口，接口和签名规则可能变化；仅用于你有权访问的个人记录。

1. 新建一个 **Private** GitHub 仓库，把本目录里的 `scale_sync.py` 和 `.github/workflows/sync.yml` 复制到该仓库根目录。工作流本身也设置了私有仓库条件；公开仓库中不会运行采集任务。
2. 在该私有仓库的 Actions Secrets 中设置 `SCALE_UNION_ID` 和 `SCALE_USER_ID`，值来自你自己的体脂秤账号。不要把它们写进代码、Issue 或日志。
3. 启用 Actions，手动运行一次 `Sync body scale`，确认私有仓库出现 `data/body_scale.csv`；以后工作流按北京时间约 03:23 每天运行。GitHub 的计划任务可能延迟。
4. 在 Windows 克隆这个私有仓库。若只想读取已同步的 CSV，在主项目 `config.json` 填 `scale_csv` 即可。若还想在 Obsidian 每次刷新前触发云端采集，同时填写 `scale_repo_path` 和 `scale_github_repo`（`owner/repo`），并保证 Windows Git 已授权访问该私有仓库。

体脂秤 CSV 属于个人健康数据，只保留在私有仓库和你的本机。不要将它复制到主项目中。
