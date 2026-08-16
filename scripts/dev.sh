#!/bin/bash
# dev.sh — 开发态运行入口（跨平台）
#
# 直接用 `electron .` 跑开发态时，macOS 的 Dock 悬停名 / ⌘Tab 切换器显示的是
# "Electron"（取自 node_modules/electron/dist/Electron.app 包的 Info.plist，
# 运行时 API 无法修改，app.dock 没有改名的接口）。macOS 上本脚本把该 .app
# 复制为 dist/WebDeck.app，改写包内名称/标识/可执行文件名后再启动，使 Dock、
# ⌘Tab、菜单栏均显示 WebDeck。Electron 版本变化时自动重建副本。
# 非 macOS 平台（Windows / Linux）无需改名（任务栏身份由 app.setAppUserModelId
# 声明），直接回退到 `electron .`。

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BIN="$ROOT/node_modules/.bin/electron"

if [ "$(uname -s)" != "Darwin" ]; then
  exec "$BIN" "$ROOT" "$@"
fi

SRC="$ROOT/node_modules/electron/dist/Electron.app"
DIST="$ROOT/dist/WebDeck.app"
MARKER="$ROOT/dist/.webdeck-app-version"
SRC_VER="$(plutil -extract CFBundleShortVersionString raw "$SRC/Contents/Info.plist" 2>/dev/null || echo unknown)"

if [ ! -d "$DIST" ] || [ ! -f "$MARKER" ] || [ "$(cat "$MARKER" 2>/dev/null || true)" != "$SRC_VER" ]; then
  echo "[dev] 生成 WebDeck.app（源 Electron ${SRC_VER}）…"
  rm -rf "$DIST"
  mkdir -p "$ROOT/dist"
  cp -R "$SRC" "$DIST"
  PLIST="$DIST/Contents/Info.plist"
  plutil -replace CFBundleName -string WebDeck "$PLIST"
  plutil -replace CFBundleDisplayName -string WebDeck "$PLIST"
  plutil -replace CFBundleIdentifier -string com.webdeck.app "$PLIST"
  plutil -replace CFBundleExecutable -string WebDeck "$PLIST"
  mv "$DIST/Contents/MacOS/Electron" "$DIST/Contents/MacOS/WebDeck"
  echo "$SRC_VER" > "$MARKER"
fi

exec "$DIST/Contents/MacOS/WebDeck" "$ROOT" "$@"
