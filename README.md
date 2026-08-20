# WebDeck（网页甲板）

通用桌面网页包装器：**通过 URL 添加应用**，每个应用可配置**启动方式**（自动拉起本地服务）与**健康监测**（状态灯）。侧边栏标签页形态，跨平台（macOS / Windows / Linux），Electron 实现。

## 快速开始

```bash
npm install        # 若 Electron 二进制下载失败，见下方「常见问题」
npm start          # 启动 WebDeck（scripts/dev.sh 平台分发：macOS 改名 .app 副本，Windows/Linux 直接 electron .）
npm test           # 核心逻辑单测（无需 GUI，三平台通用）
npm run smoke      # 全链路冒烟测试（自动开窗跑一遍后退出）
```

`npm start` 在 macOS 上会生成改名的 `dist/WebDeck.app`（Dock/⌘Tab 显示 WebDeck）；Windows / Linux 直接以 `electron .` 启动（任务栏身份由 `app.setAppUserModelId` 声明）。

## 核心概念：添加应用 = URL + 启动方式 + 监测

应用**不是内置的**，全部由用户添加。侧边栏左上角 **＋**（或 ⌘N）打开添加弹窗：

| 配置项 | 说明 |
|---|---|
| 名称 / URL | 必填。URL 可省略 `http://`，自动补全 |
| 启动方式 | **无**（仅打开 URL，适合远程站点）；**直接命令**（可执行文件 + 参数）；**Shell 命令**（整条命令，如 `cd ~/dsh && pnpm dsh`） |
| 工作目录 / 环境变量 | 传给本地进程（环境变量每行 `KEY=VALUE`） |
| 等健康检查通过后标记运行中 | 本地服务拉起的就绪判定；超时可配（默认 30s） |
| 退出 WebDeck 时结束该进程 | 防止留下孤儿服务（默认开） |
| 切换到该应用时自动启动 | 打开标签即拉起服务（默认开） |
| 健康监测 | 按间隔探测检查 URL，绿=运行中 / 黄=启动中 / 红=错误 / 灰=停止 |

内置两个快捷预设：**DeepSeek Harness**（`pnpm dsh` → `http://127.0.0.1:3080`）和**本地静态服务**（`python -m http.server`，命令按平台自动选择：Windows 用 `python`，macOS/Linux 用 `python3`）。

### 常用操作

- 侧边栏点击应用 = 切换标签（重复点击回到首页 URL）
- **侧边栏宽度可调**：拖动侧边栏右边界分隔条调整宽度（最小 180px，最大不超过窗口一半），宽度持久化、重启保持；收起态下分隔条隐藏
- 工具栏：▶/⏹ 启动停止本地服务 · ↻ 重载 · ↗ 系统浏览器打开 · ☰ 查看启动日志（实时滚动）· ✎ 编辑
- ⌘1–⌘9 切换标签，⌘R 重载当前应用，⌘⌥I 当前应用开发者工具
- **页内查找**：⌘F 在当前应用页面内查找（输入即高亮，查找栏显示 n/m 计数）；Enter / ⌘G 下一处，Shift+Enter / ⇧⌘G 上一处，Esc 关闭并清除高亮。查找只作用于**当前激活的应用页面**（WebDeck 自身 UI 不参与），切换应用或重载页面时自动关闭
- 应用菜单里也可切换（带勾选态）

### 启动日志怎么读

日志面板按**链路**记录每次本地进程启动，从下到上依次是：

```
[launch] trigger=manual mode=direct cmd=dsh args=--profile web cwd=...
[env] PATH来源=注册表兜底(HKLM+HKCU)+补全 PATH长度=3501
[resolve] dsh → C:\Program Files\nodejs\dsh.cmd (cmd, 共尝试 12 候选)
[spawn] exec=C:\Windows\System32\cmd.exe argv=/d,/s,/c,"C:\Program Files\nodejs\dsh.cmd" --profile web
（进程 stdout/stderr 输出…）
[exit] code=9009 signal=null 存活=85ms
[judge] status=error detail=进程异常退出 (code=9009)
```

- **进程退出后日志保留**：日志面板显示「进程已退出 (code=N, 存活 Xs)」而非空白，直到下次启动/停止/删除应用
- **打包版（GUI 启动）全量日志落盘**：`userData/logs/webdeck.log`（1MB 轮转，保留 3 份），`userData` 位置：macOS `~/Library/Application Support/WebDeck/`，Windows `%APPDATA%\WebDeck\`，Linux `~/.config/WebDeck/`

## 架构

```
src/main/
  index.js          主进程入口：窗口、WebContentsView 标签管理、IPC、菜单、冒烟测试
  apps.js           应用注册表：配置校验/规范化、增删改查、持久化（纯 Node，可单测）
  process-manager.js 本地进程生命周期：spawn(直接/Shell)、平台化终止、日志环形缓冲（纯 Node，可单测）
  monitor.js        健康监测状态机：stopped/starting/running/error（纯 Node，可单测）
  store.js          JSON 原子持久化（userData/webdeck.json）
src/preload/
  preload.cjs       contextBridge 白名单 API（contextIsolation + sandbox，含 platform）
src/renderer/
  index.html / styles.css / app.js   侧边栏 UI（原生 JS，无构建链）
scripts/
  dev.sh           开发态运行入口（平台分发：macOS 改名 .app 副本，其他平台直接 electron .）
  demo-server.js    演示用最小 HTTP 服务（也可当测试靶子）
  test-core.js      核心逻辑端到端单测
```

设计要点：

- **每个应用一个独立 session 分区**（`persist:webdeck-<id>`）：登录态互不串扰、重启保留
- **进程终止的平台适配**：POSIX（macOS/Linux）以 `detached` 进程组启动，停止时 SIGTERM 整组、2 秒后 SIGKILL，不遗留子进程；Windows 用 `taskkill /pid <pid> /T /F` 强杀整棵进程树（控制台进程无温和终止语义），spawn 统一 `windowsHide: true` 不弹控制台窗口
- **Shell 命令的默认 shell 按平台选择**：Windows 用 `%ComSpec%`（cmd.exe `/d /s /c`），macOS/Linux 用 `$SHELL` 或 `/bin/zsh`
- **状态机**：健康检查通过 → `running`；进程在跑但检查未通过 → `starting`（超时转 `error`）；进程退出/未启动 → `stopped`
- **安全**：远程页面运行在 sandbox + contextIsolation 中，无 Node 能力；`window.open` 一律转到系统浏览器；权限按白名单放行

## 状态机

```
            启动命令               健康检查通过
 stopped ────────────► starting ───────────────► running
    ▲                    │ 超时                      │ 检查失败/进程退出
    └────────────────────┴──────────────────────────┴──────► error / stopped
```

## 跨平台使用说明（Windows / Linux）

- **Shell 命令写法**：Windows 用 `%USERPROFILE%` 代替 `~`，跨盘符时用 `cd /d`；示例：`cd /d %USERPROFILE%\dsh && pnpm dsh`。macOS/Linux 维持 `cd ~/dsh && pnpm dsh`
- **中文日志乱码**：Windows 控制台默认 GBK 编码，子进程输出的中文可能乱码；可在 Shell 命令前加 `chcp 65001 >nul &&` 切换为 UTF-8 代码页
- **内置预设**：本地静态服务预设的 `python` 命令按平台自动选择（Windows `python` / macOS、Linux `python3`），也可在添加弹窗里手动修改
- **CI**：`.github/workflows/ci.yml` 在 macOS / Windows / Linux 三平台自动跑 `npm test` 与 `npm run smoke`（Linux 用 `xvfb-run`），任何平台失败都会标红

## 发布流程

WebDeck 用 electron-builder 打包，GitHub Actions 在打 tag 时自动构建并上传 **GitHub Releases**（资产先进**草稿**，人工确认后才对外可见）：

```bash
# 1. 更新 package.json 的 version（如 0.2.0），提交并推送
# 2. 打 tag 并推送（tag 名 v<version>，如 v0.2.0）
git tag v0.2.0 && git push origin v0.2.0
# 3. CI 自动构建（各自原生构建，禁止交叉编译）：
#    macOS → dmg + zip · Windows → NSIS 安装包 + portable 便携版 · Linux → AppImage
#    三平台资产上传到 draft（草稿）release——不自动发布、不自动标记 Latest
# 4. 到仓库 Releases 页面确认三平台资产齐全后，手动点 "Publish release"：
#    未 Publish 前客户端（自动更新）检测不到该版本；任一平台构建失败时
#    release 保持草稿状态、客户端不受影响，不会出现下载 404
```

本地构建（验证配置用）：`npm run dist`（当前平台）、`npm run dist:mac` / `dist:win` / `dist:linux`，产物在 `dist/`。

### 自动更新

- **Windows 安装版**：内置自动更新（electron-updater）——启动后自动检查（约每 6 小时，失败自动退避重试），发现新版本自动下载并提示，**用户点击"立即安装"才执行**（退出应用不自动安装）；也可通过菜单「帮助 → 检查更新…」手动检查
- **macOS**：同样内置自动更新——检测到新版本自动下载，点击"立即安装"完成安装并自动重启。自动更新能否安装取决于该版本产物的签名方式（见下方「签名决策」）：**证书签名产物**（Developer ID 或自签名证书）可正常自动安装；**ad-hoc 兜底产物**无法自动跨版本安装（Squirrel.Mac 用旧版二进制哈希校验新包，机制上必然失败），需手动下载安装。若安装阶段失败，界面会明确提示失败原因并提供**「打开下载页」**兜底（跳转 GitHub Releases 手动下载），不再静默无反馈
- **portable 版**：不做自动检查，更新方式为手动下载新版本
- **自定义安装目录支持（Windows）**：安装包允许更改安装目录（`allowToChangeInstallationDirectory`），更新时会安装到**当前 exe 所在目录**（自动对齐，不会装回默认目录造成双实例）
- **关机/退出保护**：系统关机或应用退出时停止发起新下载并取消进行中的下载，不残留半成品文件导致下次启动更新损坏
- **下载可取消**：下载中提示条出现「取消」按钮（经 IPC 中止下载）；取消后应用正常使用，可再次「检查更新」重新下载
- **系统通知**：发现新版本/下载完成时发送系统通知（点击通知聚焦应用窗口），窗口不聚焦也能感知更新
- **状态持久化**：下载完成未安装重启后仍提示可安装（不白下载）；更新弹窗「忽略此版本」后该版本不再提示（含重启后），再次「检查更新」可重新下载
- **自动检查开关**：帮助菜单「自动检查更新」可关闭自动检查（关闭后不再自动检查，手动「检查更新」不受影响；重新开启自动恢复）
- **多语言 release notes**：发布说明按应用语言显示（`<!--LANG:xx-->…<!--LANG:END-->` 标记块，主进程本地化后下发）
- **更新日志**：检查/下载进度/安装/错误事件写入 `userData/logs/webdeck.log`（`[updater]` 前缀，与主进程链路日志同一落盘通道），更新失败可从日志定位环节
- **开发态调试更新链路**：仓库根 `dev-app-update.yml`（默认 `http://127.0.0.1:8123`）——构建产物 + `latest*.yml` 放入本地静态服务器目录并指向它，开发态启动应用后菜单「检查更新…」即走完整链路（检查 → 下载 → 取消 → 就绪提示）
- 更新元数据（`latest*.yml`）随每次发布自动上传到 GitHub Releases

### 签名决策（macOS 三分支 / Windows 未签名）

- **macOS**：发布流水线按仓库 secrets 的齐全度自动选择三种互斥模式：
  1. **Developer ID 签名 + 公证**（secrets 含 `CSC_LINK` / `CSC_KEY_PASSWORD` 且 `APPLE_TEAM_ID` 等公证凭据齐全）：任何 Mac 双击 dmg 直接安装，无 Gatekeeper 拦截，自动更新可用。需 Apple Developer 账号（$99/年）
  2. **证书签名、不公证**（只有 `CSC_LINK` / `CSC_KEY_PASSWORD`）：**自签名证书即可**（零成本）——自动更新可用（Squirrel.Mac 校验通过）；首次手动安装 dmg 会被 Gatekeeper 拦截（右键→打开，见下方常见问题）。**这是无付费证书环境下的推荐模式**
  3. **ad-hoc 签名兜底**（无 `CSC_LINK`）：产物可用（首次安装需按下方指引放行），但**自动更新不可用**（跨版本校验机制上无法通过），每次升级需手动下载安装
  - 产物命名：模式 1 无后缀；模式 2/3 带 `-unsigned` 后缀（语义="未用 Developer ID 签名"，**不影响可安装性与自动更新**——模式 2 的 `-unsigned` 产物可自动更新）
  - **自签名证书生成与配置（模式 2，零成本）**：
    ```bash
    # 1. 生成自签名代码签名证书（有效期建议 10–20 年；私钥务必妥善保管，
    #    泄露=任何人可冒名签名；证书失效/私钥丢失后更新将失败，需重新过渡安装）
    cat > csc.cnf <<'EOF'
    [req]
    distinguished_name = dn
    x509_extensions = v3
    prompt = no
    [dn]
    CN = WebDeck Code Signing
    O = WebDeck
    [v3]
    basicConstraints = critical,CA:FALSE
    keyUsage = critical,digitalSignature
    extendedKeyUsage = codeSigning
    subjectKeyIdentifier = hash
    EOF
    openssl req -x509 -newkey rsa:2048 -keyout csc.key.pem -out csc.cert.pem \
      -days 7300 -nodes -config csc.cnf
    # 2. 导入钥匙串并导出 p12（记录 p12 密码）
    security import csc.cert.pem -k ~/Library/Keychains/login.keychain-db
    security export -k ~/Library/Keychains/login.keychain-db -t certs -f pkcs12 \
      -P <p12密码> -o csc.p12
    # 3. 配置 CI：仓库 secrets 设 CSC_LINK = `base64 -i csc.p12` 的输出（含私钥的
    #    p12 的 base64，不带换行）、CSC_KEY_PASSWORD = p12 密码
    ```
    （私钥若未随证书导入钥匙串，可用 `openssl pkcs12 -export -inkey csc.key.pem -in csc.cert.pem -passout pass:<p12密码> -out csc.p12` 直接合成 p12。）
    **注意**：p12 保持 openssl 默认加密即可（CI 经 macOS `security import` 导入，默认算法兼容）；**不要**用 `-keypbe AES-256-CBC` 等参数——Apple 钥匙串工具链对该格式报 `Unknown format in import`。
  - **过渡安装**：已安装 ad-hoc 旧版（v0.1.16 及更早）的机器无法自动升级到首个证书签名版本（Squirrel.Mac 仍用旧版二进制哈希校验）——**首个证书签名版本需手动下载 dmg 安装一次**（右键→打开放行），此后自动更新恢复正常。发布说明会对此标注
- **Windows**：当前决策「**先不签**」（零成本）——未签名 exe 首次运行会有 SmartScreen 提示，绕过方法见下方常见问题；后续分发规模上来可升级 **Azure Trusted Signing**（微软云签名，低成本、信誉建立快），升级路径：配置该服务后把签名步骤接入 release.yml
- 两个决策都会随发布演进更新：产物一旦对外分发，建议优先补齐 macOS 签名公证（Gatekeeper 拦截体验最差）

## 常见问题

- **`npm install` 后 Electron 二进制下载失败（EPERM ~/Library/Caches/electron）**：缓存目录不可写时，用
  `electron_config_cache="$PWD/.electron-cache" node node_modules/electron/install.js` 手动下载（或先 `npm install --ignore-scripts` 再手动跑 install.js）
- **服务已启动但状态一直是 starting**：检查健康检查 URL 与期望状态码（部分服务 302 跳转，把期望码改为 302 或让检查 URL 指向具体接口）
- **Shell 命令里的路径**：工作目录留空时继承 WebDeck 进程的 cwd；建议 `cd <目录> && <命令>` 写法
- **Windows 上停止本地服务的行为差异**：Windows 没有 SIGTERM 进程组语义，停止走 `taskkill /pid <pid> /T /F` 强杀整棵进程树——控制台进程（cmd/node 等）无法温和终止，这是平台差异，不是缺陷
- **Windows 上启动本地服务不弹黑窗**：所有本地进程均以隐藏控制台窗口启动（`windowsHide: true`）；若看到黑色控制台窗口闪出，请确认 WebDeck 版本包含跨平台适配（0.2 起）
- **打包版（Finder/Dock 启动）里 `pnpm`/`node` 等命令找不到**：macOS 从 Finder 启动的 GUI 应用 PATH 只有系统默认目录。WebDeck 会自动补全常见用户 bin 路径（Homebrew、`~/.local/share/pnpm`、npm-global、yarn、nvm 版本目录等）；若工具装在非常规位置，请把命令改为绝对路径（如 `~/.local/share/pnpm/pnpm dsh`）
- **Windows 上直接命令启动报 `ENOENT`（cmd 里手动执行正常）**：npm 等工具在 `nodejs` 目录同时生成无扩展名 shim（如 `dsh`）与 `dsh.cmd`，Node 的 spawn 会命中无扩展名文件后直接失败，不继续尝试 `.cmd`。WebDeck（0.1.4 起）自动按 PATH+PATHEXT 解析（跳过无扩展名 shim、`.cmd/.bat` 经 cmd.exe 执行）；旧版本解法：启动方式改为 Shell 命令并写绝对路径，如 `C:\Program Files\nodejs\dsh.cmd --profile web`
- **Windows 上直接命令报 `'\"...\"' is not recognized` / `'C:\Program' is not recognized`**：经 cmd.exe 执行 `.cmd/.bat` 时的两层坑——①Node 序列化 argv 把引号转义成 `\"`（v0.1.5 及更早）；②cmd 的 `/S` 规则剥掉首引号，单层引号路径失去保护被按空格拆分（v0.1.6）。WebDeck（0.1.7 起）以 `windowsVerbatimArguments` 原样传递 + 双层引号包裹命令行（cmd 剥外层后内层路径引号完整）；日志面板的 `[spawn]` 链节可核对实际命令行
- **打包版启动崩溃 `Cannot find package 'electron-updater'`（v0.1.8）**：运行时依赖须放在 `package.json` 的 `dependencies`（electron-builder 只把生产依赖打进 asar）——v0.1.8 曾把 electron-updater 误放 devDependencies 导致此崩溃，v0.1.9 起修复；开发/构建时新增被 `src/**` import 的外部包，一律放 `dependencies`
- **Windows SmartScreen 提示「Windows 已保护你的电脑」**：未签名产物的正常提示。点击「更多信息」→「仍要运行」即可；若提示「未知发布者」且经常出现，说明信誉尚未建立，属正常现象
- **macOS Gatekeeper 拦截「无法打开，因为无法验证开发者」**：**已签名但未公证**产物的正常提示。右键（或按住 Control 点击）应用图标 →「打开」→ 确认；或系统设置 → 隐私与安全性 →「仍要打开」
- **macOS 报「“WebDeck” is damaged and can’t be opened」**：**未签名**（`-unsigned`）产物的正常提示——Gatekeeper 对无签名应用不提供「仍要打开」选项。解法：移除隔离属性后打开
  ```bash
  xattr -dr com.apple.quarantine /Applications/WebDeck.app
  ```
  注意：这是「先不签」决策的已知代价；配置签名 secrets 后产出的 dmg 无需此步骤
- **下载的产物标记 `-unsigned`**：表示该次构建未用 Developer ID 证书签名（见「发布流程 → 签名决策」）。**证书签名**的 `-unsigned` 产物（自签名证书，模式 2）**应用内自动更新可正常安装**；**ad-hoc 兜底**的 `-unsigned` 产物（模式 3）自动更新不可用、需手动下载安装。手动安装 dmg 时均按上面两条对应的指引放行

## 路线图

- [x] electron-builder 打包（dmg/zip + NSIS/portable + AppImage，`appId: com.webdeck.app`）+ GitHub Releases 流水线
- [x] Windows 运行时适配（进程组终止方式、平台默认命令、三平台 CI）
- [x] 侧边栏可折叠 / 宽度可调
- [ ] 应用级代理配置、证书忽略开关
- [ ] 托盘图标 + 快捷切换
- [ ] 图标与品牌视觉
