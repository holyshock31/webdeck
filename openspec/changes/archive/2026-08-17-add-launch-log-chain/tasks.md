# Tasks — add-launch-log-chain

- [x] process-manager.js：launch 增加链路日志——`[launch]` 触发来源与配置原文、`[env]` PATH 来源与摘要、`[resolve]` 解析结果（命中/未命中尝试列表）、`[spawn]` exec/argv/spawnargs 真实命令行，统一写入 logLines
- [x] process-manager.js：exit 处理记录 `[exit]` 退出码/信号/存活时长，并**保留 tombstone**（logLines + 退出信息），下次 launch 替换、stop/删除应用时清除
- [x] process-manager.js：状态判定处输出 `[judge]` 链节（error/stopped/running 及 detail），与现有 apps:status 联动
- [x] src/main/index.js：新增落盘日志模块——userData/logs/webdeck.log 追加写入、1MB 轮转保留 3 份（轮转为纯函数），主进程日志与链路行写盘
- [x] src/renderer/app.js：日志面板渲染退出状态行（基于 tombstone 的 exitCode/signal/存活时长），退出后不再空白
- [x] scripts/test-core.js：单测——退出后 tombstone 保留（logLines/exitCode 可读）、下次 launch 替换、stop 清除、轮转纯函数（超限裁剪、保留份数）
- [x] README.md 与 docs：日志查看指引（日志面板 + userData/logs/webdeck.log 位置与轮转说明）
- [x] 真机手动验证：清单文档化于 docs/windows-manual-verification.md（Windows 上直接命令 `dsh --profile web` 失败时日志面板显示完整链路与「进程已退出 code=N」；userData/logs/webdeck.log 存在且含链路行；npm test 与 npm run smoke 三平台 CI 全绿）；真机执行留待验收
