# 家族アプリ

家族で同じ専用URLを開いて使う、スマートフォン向けの共有Webアプリです。

現在の機能:
- 買い物
- 家計

共有URL直下では家族用ホームを表示し、使う機能を選びます。

## 買い物

- 「選ぶ」「かご」「コピー」「管理」
- 商品行全体のタップで買う予定を切り替え
- 買い物かごで購入済みにすると即時非表示
- 直前の購入済み操作を「元に戻す」
- 店舗別・カテゴリー別コピー
- 商品・カテゴリー・店舗管理
- CSV出力・CSV全件上書き
- Supabase Realtimeによる家族端末間同期

商品件数は本番データを正とし、READMEには固定件数を持ちません。

## 家計

- 1か月単位で未確定データを入力
- けんじ支払額、あさみのデビット・現金を分けて入力
- 負担割合に基づく本来負担額を自動計算
- 確定後は費用・負担割合・計算結果を変更不可
- 未精算残高を表示
- 任意タイミングで全額・一部精算
- 予算上限との差額を「予算繰越残高」として累積
- 負担割合・月上限は未確定月以降から変更可能
- 精算履歴を保持

## 環境変数

`.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-legacy-anon-jwt-key
FAMILY_SHARE_KEY=replace-with-a-random-32-plus-character-share-key
```

`FAMILY_SHARE_KEY` はサーバー側だけで使います。
`NEXT_PUBLIC_FAMILY_SHARE_KEY` は設定しません。

共有URL:

```text
https://xxxxx.vercel.app/f/<FAMILY_SHARE_KEY>
```

## Supabase設定

1. `supabase/schema.sql` を実行
2. `private.app_config` に `family_share_key` を登録
3. `supabase/seed.sql` を実行
4. `supabase/household.sql` を実行

家計テーブルも既存と同じ共有キーRLSで保護します。

Realtimeは既存の `shopping_events` を変更通知専用として使い、通知受信後に共有キー付きREST/RPCで再取得します。実データのテーブルは直接購読しません。

## セキュリティ

- 公開テーブルはRLS有効
- REST/RPCは `x-family-share-key` をDB側で検証
- service role keyはブラウザやVercel公開環境へ出さない
- 確定済み家計期間はDBトリガーでも更新・削除を拒否
- 精算履歴は更新・削除不可
- 共有キーはクライアントバンドルへ直接埋め込まない

## Vercel

GitHubのproduction branchへ反映すると、Git連携済みVercelが自動デプロイします。

## ローカル確認

```bash
npm install
npm run lint
npm run build
```
