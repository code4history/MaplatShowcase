#!/bin/bash
# Maplat Showcase キオスク起動（macOS）
# ダブルクリックで: 画面スリープ抑止 + Chrome を全画面キオスクで起動。
# Chrome を終了（⌘Q）するとスリープ抑止も解除される。
URL="https://code4history.dev/MaplatShowcase/foss4g_hiroshima_2026.html"

# ディスプレイ(-d)・システム(-i,-s)・強制起床(-u)を抑止。Chrome終了まで維持して後始末する
caffeinate -disu &
CAF=$!
trap 'kill $CAF 2>/dev/null' EXIT

# -n: 既存Chromeと別インスタンス（既存が動いていると --kiosk が無視されるため
#     専用プロファイルで分離する） / -W: そのインスタンスの終了まで待つ
# フラグは連結しないこと: open の -a は同一トークンの残りを引数として食うため、
# -naW と書くと「-a W」と解釈されて "Google Chrome" がファイル名扱いになる（実障害 2026-08-28）
open -n -W -a "Google Chrome" --args \
  --kiosk \
  --user-data-dir="$HOME/.maplat-kiosk-profile" \
  --no-first-run --disable-session-crashed-bubble --noerrdialogs \
  "$URL"
