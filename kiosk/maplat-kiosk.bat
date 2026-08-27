@echo off
rem Maplat Showcase キオスク起動（Windows）
rem ダブルクリックで: スリープ/画面オフを無効化 + Chrome を全画面キオスクで起動。
rem 終了は Alt+F4。電源設定は元に戻らないので、常用PCなら下の powercfg 2行を消して
rem 「設定 > システム > 電源」で会期中だけ「なし」にする運用でもよい。
set URL=https://code4history.dev/MaplatShowcase/foss4g_hiroshima_2026.html

powercfg /change standby-timeout-ac 0
powercfg /change monitor-timeout-ac 0

set CHROME="C:\Program Files\Google\Chrome\Application\chrome.exe"
if not exist %CHROME% set CHROME="C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"

%CHROME% --kiosk --user-data-dir="%LOCALAPPDATA%\maplat-kiosk-profile" ^
  --no-first-run --disable-session-crashed-bubble --noerrdialogs %URL%
