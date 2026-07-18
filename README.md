# 家族の買い物リスト

家族で同じ専用URLを開いて使う、スマートフォン向けの買い物リストWebアプリです。ログイン、暗証番号、数量、価格、購入履歴はありません。

## 主な機能

- 「選ぶ」「かご」「コピー」「管理」の下部ナビゲーション
- 商品行全体のタップで買う予定を切り替え
- 買い物かごで購入済みにすると即時非表示
- 直前の購入済み操作を「元に戻す」
- 店舗別、カテゴリー別のコピー
- 商品、カテゴリー、店舗の管理
- CSV出力とCSV全件上書き
- Supabase Realtimeによる家族端末間同期
- PWA、robots noindex対応

## MHT移行結果

MHTファイルから確実に抽出できた初期データを同梱しています。

- 商品: 13件
- カテゴリー: 13件
- 店舗: 7件
- 買う予定: 13件
- 重複: 0件

画面統計では全134件、未選択121件が確認できましたが、MHT内に未選択121件の商品行データは含まれていなかったため、推測補完はしていません。

## 環境変数

`.env.local` を作成します。

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-legacy-anon-jwt-key
FAMILY_SHARE_KEY=replace-with-a-random-32-plus-character-share-key
```

`FAMILY_SHARE_KEY` は32文字以上の推測されにくい文字列にしてください。これはサーバー側だけで使います。`NEXT_PUBLIC_FAMILY_SHARE_KEY` は設定しないでください。

共有URLは次の形です。

```text
https://xxxxx.vercel.app/f/<FAMILY_SHARE_KEY>
```

## Supabase設定

1. Supabase Dashboardでプロジェクトを作成します。
2. Project Settings > API で Project URL と legacy anon JWT key を確認します。
3. SQL Editorで `supabase/schema.sql` を実行します。
4. SQL Editorで次を実行し、アプリと同じ共有キーをDBへ登録します。

```sql
insert into private.app_config(key, value)
values ('family_share_key', 'replace-with-a-random-32-plus-character-share-key')
on conflict (key) do update set value = excluded.value;
```

5. SQL Editorで `supabase/seed.sql` を実行します。

Realtime publication は `shopping_events` のみです。`categories`、`stores`、`products` は直接購読しません。実データは共有キー付きREST/RPCで再取得します。

同期の調査が必要なときだけ、共有URLの末尾に `?debugSync=1` を付けてブラウザの開発者ツールを開きます。Realtime購読状態、通知受信、再取得理由を確認できます。通常の本番利用では同期ログを出力しません。

## セキュリティ構成

- `categories`、`stores`、`products` はRLS有効
- REST/RPCは `x-family-share-key` ヘッダーをDB側で検証
- CSV全件上書きRPCもDB側で共有キーを検証
- `shopping_events` は中身を持たない変更通知だけをRealtime配信
- Supabase service role key はブラウザにもVercel環境変数にも設定しません
- 共有キーはクライアントバンドルへ入れません

## Vercel公開

1. GitHubへ `family-shopping-list` をpushします。
2. VercelでNext.jsプロジェクトとしてImportします。
3. Root Directory は、このフォルダをリポジトリ直下に置くなら未設定です。親フォルダごとpushする場合は `family-shopping-list` を指定します。
4. Environment Variables に `.env.local` と同じ3項目を設定します。
5. Deployします。
6. 家族には `/f/<FAMILY_SHARE_KEY>` のURLだけを共有します。

## ローカル実行

```bash
npm install
npm run dev
```

確認:

```bash
npm run lint
npm run build
```
