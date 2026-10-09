# PurpleLog（仮）MVP 段階1

犬のてんかん管理アプリ。設計案 v3（`../仕様設計案_v3_2026-09-19.md`）の ①〜⑩ を、まず端末内だけで動く形（ローカル優先）で実装したもの。サーバー（Supabase）は未接続。

## 動かす

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # dist/ に PWA を出力
npm run preview    # ビルド結果の確認
```

初回起動で Toby のサンプルデータ（`src/seed/toby.json`。`../Tobyデータ/*.csv` から生成）が読み込まれる。設定画面の「Tobyのサンプルデータを読み直す」で再読込できる。

## できること（MVP ①の10機能との対応）

| # | 機能 | 実装 |
|---|---|---|
| 1 | 犬プロフィール | 設定画面。複数頭、体重履歴 |
| 2 | 発作記録（2タップ＋録画） | `/seizure`。開始→タイマー→終了。設定で録画オン時は MediaRecorder で同時録画、Wake Lock で画面維持。5分超で注意表示 |
| 3 | いつもと違う日 | ホーム下の黄色ボタン → 詳細で項目チェック |
| 4 | 投薬管理 | 一般名・1回量・回数・変更履歴。体重から mg/kg 自動計算 |
| 5 | 血中濃度・検査値 | 検査機関ごとの基準範囲で標準化。IVETF 2015 の採血規則（`src/lib/monitoring.ts`）でトラフ判定と次回測定の目安 |
| 6 | 長期経過グラフ | 3層（発作・群発／血中濃度＋投薬変更／モニタリング）。月次と日次を期間で切替 |
| 7 | 気象の自動取得 | Open-Meteo（`src/lib/weather.ts`）。地域は 0.25° 格子だけ保存。できごと詳細で取得、開発者画面で背景の日次取得 |
| 8 | Vet Report | `/report`。印刷→PDF |
| 9 | 集計と示唆の計算 | `src/lib/stats.ts`。段階閾値・解析可能判定・気圧変化の比較 |
| ⑫ | 発作が長引いたときの手順 | 設定で主治医と決めた手順を登録。タイマーが設定分数（既定5分）を超えると「落ち着きましょう」パネルで順に表示。アプリは薬・量を示さない。確認した手順はできごとに記録 |
| 10 | 基盤 | 日英切替（`src/i18n.ts`）、同意2種、エクスポート/削除、開発者プレビュー（設定で切替） |

## 共有（2026-10-09）

claude.ai のページとして開くと、`db` capability による共有データベースに同期する（`src/lib/cloud.ts`）。ローカルの Dexie が常に正、保存のたびにフックで共有DBへ送り、共有DBの変更は onSnapshot でローカルに反映する。動画（Blob）は端末に残す。

- 書けるのは所有者と、メール招待された編集者。外部の編集者は「リンクを知っている全員」の公開がオフのときだけ書ける
- 投薬の実施記録（`doseLogs`）、投薬時刻（`Medication.scheduleTimes`）、入力者（`by`）を追加
- 選択できる薬は `src/screens/shared.tsx` の `GENERICS`（PB／ゾニサミド／レベチラセタム／ガバペンチン）

## プッシュ通知と写真読み取り（2026-10-09）

- **プッシュ通知**: `public/push-sw.js` を Service Worker に取り込み（`vite.config.ts` の `importScripts`）、設定画面の「プッシュ通知」で端末を登録する（`src/lib/push.ts` → `push_subscriptions`）。iPhone はホーム画面に追加したアイコンから開いたときだけ登録できる
- **送信側**: Edge Function `dose-reminders`（`supabase/functions/dose-reminders/`）。Supabase Cron が5分ごとに呼び、未記録の予定を `REMIND_MIN`（既定30）分おきに全端末へ送る。間引きは `reminder_state` 表（`supabase/reminders.sql`）。呼び出しは公開キーの Authorization と `x-cron-secret` ヘッダ
- **写真読み取り**: Edge Function `lab-ocr` が Claude API（`ANTHROPIC_API_KEY`）で報告書画像を JSON にする。利用者の確認は関数内（`x-user-token`）。鍵が未設定のときは 503 → アプリは「未設定」と表示して手入力に戻る
- 秘密情報（VAPID 秘密鍵・CRON_SECRET・ANTHROPIC_API_KEY）は Supabase の Edge Function Secrets にだけ置く。リポジトリには入れない

## 構成

- `src/db.ts` Dexie（IndexedDB）のテーブル定義。設計案⑤のテーブルに対応
- `src/lib/episodes.ts` 群発（24時間以内に2回以上）と重積の判定
- `src/lib/normalize.ts` 標準化値 = (値 − 下限) ÷ (上限 − 下限)
- `src/lib/monthly.ts` 月次集計（2021〜2025はスプレッドシートの月次、2026〜は記録から）
- `src/screens/` 画面 A〜H と開発者用 J・K

## 受け入れテスト（段階1）

- 長期経過グラフの全期間で、Toby の図と同じ比較（月ごとの発作数、群発バッジの大きさ＝持続時間、PB/KBr の標準化折れ線）ができる → **確認済み（2026-09-19）**
- 標準化値がスプレッドシートの `*_norm` 列と一致する → 投薬・検査画面の括弧内の値で確認済み（例: 2023-06-22 KBr 1.8 → 1.00、2025-08-02 KBr 0.3 → −0.50）
- 録画オプションは実機（スマホ）で要確認

## 次の段階

- Supabase 接続（認証・同期・日次バッチ）
- Community Map と示唆表示の一般公開ロジック（開発者画面で挙動を見てから）
- Capacitor でのストア配布（録画の制約解消）
