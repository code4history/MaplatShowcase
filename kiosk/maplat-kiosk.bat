@echo off
rem Maplat Showcase キオスク起動（Windows）
rem ダブルクリックで: スリープ/画面オフを無効化 + Chrome を全画面キオスクで起動。
rem 終了は Alt+F4。電源設定は元に戻らないので、常用PCなら下の powercfg 2行を消して
rem 「設定 > システム > 電源」で会期中だけ「なし」にする運用でもよい。
set URL=https://code4history.dev/MaplatShowcase/foss4g_hiroshima_2026.html

rem ---- 表示するディスプレイの選択 ----------------------------------------
rem 仮想デスクトップ上の座標を1点指定すると、その点が乗っているディスプレイで
rem 全画面になる。座標系は「設定 > システム > ディスプレイ」の配置に対応:
rem   メイン画面の左上が 0,0（「識別」ボタンで番号を確認できる）。
rem   例) 幅1920のメインの右に外部ディスプレイ → set POS=1920,0
rem   例) メインの左に外部ディスプレイ(幅2560) → set POS=-2560,0
set POS=0,0

powercfg /change standby-timeout-ac 0
powercfg /change monitor-timeout-ac 0

set CHROME="C:\Program Files\Google\Chrome\Application\chrome.exe"
if not exist %CHROME% set CHROME="C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"

%CHROME% --kiosk --window-position=%POS% --user-data-dir="%LOCALAPPDATA%\maplat-kiosk-profile" ^
  --no-first-run --disable-session-crashed-bubble --noerrdialogs %URL%
