Status: implemented

## ADDED Requirements

### Requirement: 侧边栏品牌标识使用应用图标

用户 SHALL 在 WebDeck 侧边栏左上角看到与任务栏 / Dock 一致的应用图标（`assets/icon.png` 同设计），而非渐变色块；「WebDeck」名称文字保留。

#### Scenario: 启动应用

- **WHEN** 用户启动 WebDeck
- **THEN** 侧边栏头部左上角显示 WebDeck 应用图标（与任务栏 / Dock 图标同设计形状与配色）

#### Scenario: 主题切换

- **WHEN** 用户在深色与浅色主题之间切换
- **THEN** 品牌图标在两个主题下均清晰可见、可辨识，不因背景变化而模糊
