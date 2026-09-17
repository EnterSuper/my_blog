#!/bin/bash
# 双击本文件即可启动博客发布面板，并自动打开浏览器。
# 关闭终端窗口或按 Ctrl+C 即可停止。

# Finder 双击运行的是非交互 shell，不会加载 .zshrc，
# 默认 PATH 里没有 Homebrew，必须手动补上，否则找不到 npm。
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

# 切到脚本所在目录（即 Hexo 项目根目录），这样从任何地方双击都能用
cd "$(dirname "$0")" || exit 1

PORT=4321
URL="http://localhost:$PORT"

if ! command -v npm >/dev/null 2>&1; then
  echo "✗ 找不到 npm。请确认 Node.js 已安装（brew install node）。"
  echo "按任意键关闭…"; read -r -n 1; exit 1
fi

# 已经在运行就直接开浏览器，不重复启动一个
if curl -s -o /dev/null --max-time 2 "$URL"; then
  echo "发布面板已经在运行：$URL"
  open "$URL"
  exit 0
fi

echo "正在启动博客发布面板…"
echo

# 后台等端口就绪后再打开浏览器，避免开得太早白屏
(
  for _ in $(seq 1 60); do
    if curl -s -o /dev/null --max-time 1 "$URL"; then
      open "$URL"
      exit 0
    fi
    sleep 0.25
  done
  echo "⚠ 等待服务启动超时，请手动打开 $URL"
) &

# 前台运行，终端里能看到日志；Ctrl+C 停止
npm run studio
