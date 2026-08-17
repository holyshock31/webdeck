# WebDeck Packaging Specification

## ADDED Requirements

### Requirement: 打包产物包含运行时依赖

安装包内的应用代码可正常加载**运行时依赖**：所有被 `src/**` 代码 import 的外部包（如 electron-updater）随 asar 打包（置于 `package.json` 的 `dependencies`，electron-builder 自动包含其传递依赖）；仅构建期使用的工具（electron、electron-builder）留在 devDependencies 不进包。打包产物启动时不得出现 `ERR_MODULE_NOT_FOUND` 类缺包崩溃。

#### Scenario: 安装版启动不因缺包崩溃

用户安装新版 WebDeck（如 v0.1.9）并启动，应用正常进入主界面，更新服务初始化成功——不出现 `Cannot find package 'electron-updater'` 崩溃。

#### Scenario: 更新检查入口可用

用户在安装版菜单点击「帮助 → 检查更新…」，更新服务正常发起检查（成功或返回可理解的失败提示），不因缺包直接崩溃。
