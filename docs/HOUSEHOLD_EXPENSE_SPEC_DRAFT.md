# 家計・交際費機能 仕様書（DRAFT）

> 状態: 設計ドラフト。実装前にClaude/AI Councilレビューを通して確定する。
> 対象: `officekkobe-beep/family-shopping-list`
> 目的: 既存の買い物リストを壊さず、Excel「交際費管理表」の現行運用をスマホ向け家計機能として追加する。

## 1. 基本方針

- 既存の買い物リスト機能（商品134件、カテゴリー、店舗、CSV、Realtime）は変更しない。
- 家計機能は独立テーブル・独立UIとして追加する。
- 下部ナビに「家計」を追加する。
- Phase 1ではExcel 2025/2026の月次集計・精算・プール管理を置き換える。
- Phase 1では個々の支出明細入力は作らない。月次合計入力だけにする。
- 買い物リストの「購入済み」と家計記録はまだ連動しない。
- 既存と同じ共有URL・共有キー・RLS・Realtime方針を使う。

## 2. Excelから確認できた現行ロジック

### 2.1 月予算
```
月予算 = 家計上限 × 10,000円
```

2025年は家計上限26 → 月予算260,000円。
2026年は家計上限25 → 月予算250,000円。

### 2.2 支出
- けんじ支払額
- あさみ支払額 = デビット + 現金
- 総額 = けんじ支払額 + あさみ支払額

### 2.3 負担割合
Excel 2025:
- 2025年1〜3月: けんじ60%、あさみ40%
- 2025年4月以降: けんじ67%、あさみ33%
- 注記: 「4月分から年収割合適用により顕治67％麻美33％に切り替え」

負担割合はハードコードせず、「適用開始月」を持つ履歴設定にする。
利用者は設定画面から将来の負担割合を変更できる。
変更は指定した適用開始月以降にだけ反映し、過去月の計算結果は当時のルールで再現できるようにする。

### 2.4 精算額
けんじ本来負担額:
```
総額 × けんじ負担率
```

あさみ本来負担額:
```
総額 × あさみ負担率
```

けんじ精算額:
```
MAX(0, けんじ本来負担額 - けんじ実支払額)
```

あさみ精算額:
```
MAX(0, あさみ本来負担額 - あさみ実支払額)
```

通常はどちらか一方だけが正数になる。

### 2.5 プール
```
当月プール増減 = 月予算 - 総額
当月プール残高 = 前月プール残高 + 当月プール増減
```

2025年の前年繰越残: 160,039円。
2026年の前年繰越残: 80,618円。

### 2.6 実際の送金と「けんじプール分」
Excelには「けんじ→あさみ」と「けんじプール分」がある。

Excel式:
```
当月けんじプール分
= あさみ精算額
- けんじ精算額
+ 当月けんじ→あさみ
+ 前月けんじプール分
```

ここで「けんじ→あさみ」は符号付き入力。
Excelでは負数入力も存在するため、アプリでは「送金方向」と「金額」を分けて入力し、内部で符号変換する方が安全。

## 3. 画面構成

### 3.1 下部ナビ
現行:
- 選ぶ
- かご
- コピー
- 管理

変更:
- 選ぶ
- かご
- 家計
- コピー
- 管理

5分割。スマホ幅でラベルが収まることを確認する。

### 3.2 家計トップ
初期表示は「今月」。

上部:
- 前月ボタン
- 「2026年11月」
- 翌月ボタン
- 「年間一覧」ボタン
- 「設定」ボタン

KPIカード:
- 月予算
- 総支出
- 今月の余り/超過
- プール残高

### 3.3 今月の入力
入力欄:
1. 家計上限（回）
2. けんじ支払額（円）
3. あさみ デビット（円）
4. あさみ 現金（円）
5. 実際の送金
   - 方向: けんじ→あさみ / あさみ→けんじ / なし
   - 金額

自動表示:
- あさみ支払合計
- 総支出
- 適用負担割合
- けんじ本来負担額
- あさみ本来負担額
- 精算方向
- 精算すべき金額
- 当月プール増減
- 当月プール残高
- 未精算残高

保存ボタン:
- 「今月を保存」

入力は整数円。
負数直接入力は禁止。方向で符号を管理する。

### 3.4 精算結果表示
例:
```
精算結果
あさみ → けんじ
58,181円
```

差額0円:
```
今月の精算はありません
```

### 3.5 年間一覧
12か月の表:
- 月
- 予算
- 総支出
- けんじ支払
- あさみ支払
- 精算
- プール増減
- プール残

スマホでは横スクロールではなく、月ごとのカードか主要4列＋詳細展開を優先する。

年間集計:
- 年間予算
- 年間総支出
- 年間余剰/超過
- 年末プール残

### 3.6 設定
- 1回あたり予算単価（初期値10,000円）
- 年度開始時プール残
- 負担割合履歴
  - 適用開始年月
  - けんじ%
  - あさみ%
- 2人の合計が100%でなければ保存不可

負担割合履歴例:
- 2025-01: 60 / 40
- 2025-04: 67 / 33

## 4. データ構造案

### 4.1 household_settings
家計全体設定。

- id uuid PK
- unit_budget_yen integer NOT NULL default 10000
- created_at
- updated_at

1レコードのみ想定。

### 4.2 household_share_rules
負担割合履歴。

- id uuid PK
- effective_from date NOT NULL
- kenji_percent numeric(5,2) NOT NULL
- asami_percent numeric(5,2) NOT NULL
- created_at
- updated_at
- CHECK (kenji_percent + asami_percent = 100)

適用ルール:
対象月の月初日以下のeffective_fromのうち最新1件。

### 4.3 household_years
年度繰越設定。

- year integer PK
- opening_pool_yen integer NOT NULL
- created_at
- updated_at

2026:
`opening_pool_yen = 80618`

### 4.4 household_months
月次入力値のみを保存し、計算値は原則クライアント/SQLで再計算する。

- id uuid PK
- year integer NOT NULL
- month integer NOT NULL CHECK 1..12
- household_limit_count integer NOT NULL default 0
- kenji_paid_yen integer NOT NULL default 0
- asami_debit_yen integer NOT NULL default 0
- asami_cash_yen integer NOT NULL default 0
- actual_transfer_direction text NOT NULL default 'none'
  - none
  - kenji_to_asami
  - asami_to_kenji
- actual_transfer_yen integer NOT NULL default 0
- created_at
- updated_at
- UNIQUE(year, month)

支出・精算・プール等の派生値は保存しない。
履歴再計算で常に同じ結果になるようにする。

## 5. 計算仕様

対象年月について負担率を取得。

```
unit_budget = household_settings.unit_budget_yen
monthly_budget = household_limit_count * unit_budget

asami_paid = asami_debit_yen + asami_cash_yen
total_paid = kenji_paid_yen + asami_paid

kenji_target = total_paid * kenji_percent / 100
asami_target = total_paid * asami_percent / 100

kenji_settlement = max(0, round(kenji_target) - kenji_paid_yen)
asami_settlement = max(0, round(asami_target) - asami_paid)

pool_delta = monthly_budget - total_paid
pool_balance = opening_pool + sum(pool_delta from Jan through target month)
```

### 5.1 丸め
精算額など1円未満の端数は四捨五入し、1円単位で扱う。
表示・保存・精算結果は整数円に統一する。

### 5.2 実送金の符号
内部計算用:
- けんじ→あさみ: 正数
- あさみ→けんじ: 負数
- なし: 0

```
unsettled_balance_current
= asami_settlement
- kenji_settlement
+ signed_actual_transfer
+ previous_kenji_pool_share
```

## 6. Realtime / セキュリティ

- 既存の共有キー認証をそのまま利用。
- 新テーブルすべてRLS有効。
- SELECT/INSERT/UPDATE/DELETEは `private.valid_family_share_key()` 必須。
- householdテーブル自体をRealtime購読しない。
- 既存のcontentlessイベント方式を拡張する。
- `shopping_events` を汎用化するか、`family_events` を新設するかは実装時レビュー。
- 通知受信後に共有キー付きRESTで再取得。
- 15秒ポーリング fallbackを維持。
- service role keyは使わない。

## 7. Excel移行

Phase 1ではExcel全年度の自動移行は必須としない。

最初に必要:
- 2026年 opening_pool = 80,618円
- 負担割合履歴
- 2026年各月入力値

2021〜2025の過去データ移行は後工程。
必要ならExcelからCSV/JSON変換ツールを作る。

## 8. 既存買い物リストへの影響禁止

以下は変更しない:
- categories
- stores
- products
- replace_shopping_master
- 商品134件
- CSV商品マスタ形式
- 選択/購入済みロジック
- PWA共有URL
- FAMILY_SHARE_KEY方式

家計機能のDB変更失敗時でも買い物リストが通常利用できること。

## 9. 実装工程

### Phase 1-A: DB土台
- household_settings
- household_share_rules
- household_years
- household_months
- RLS
- updated_at trigger
- 通知trigger
- seed

テスト:
- 既存shoppingテーブル件数不変
- 共有キーなし拒否
- 正しい共有キーでCRUD可

### Phase 1-B: 計算ライブラリ
純粋関数で実装:
- 月予算
- 支出合計
- 負担額
- 精算額
- プール増減
- プール残
- 未精算残高

Excel既存値をfixtureにして一致テスト。

### Phase 1-C: 家計画面
- 下部ナビ追加
- 今月入力
- 自動計算
- 保存
- 前月/翌月

### Phase 1-D: 年間一覧・設定
- 年間一覧
- 負担割合履歴
- 年度繰越
- 単価設定

### Phase 1-E: Realtime
- 2端末同期
- fallbackポーリング
- エラー時再取得

## 10. テスト基準

既存:
- npm run lint
- npm run build
- 既存買い物リストの全主要操作

家計:
- 2025年Excelの既知月を使い計算一致
- 月予算
- 60/40期間
- 67/33期間
- プール赤字月
- プール黒字月
- 送金方向両方
- 0円
- 年跨ぎ
- 2端末Realtime

## 11. 未確定・要レビュー

### D-1 負担割合
負担割合は設定画面から変更可能とする。
適用開始年月を指定し、過去月のルールは履歴として保持する。
初期登録する割合は実装前に最終確認する。

### D-2 端数処理
確定:
- 1円未満は四捨五入
- 表示・保存・精算結果は1円単位

### D-3 名称
確定:
- Excelの「けんじプール分」は、アプリUIでは「未精算残高」と表示する。
- 内部計算ロジックはExcelの考え方を維持する。

### D-4 固定費
確定:
- 最近利用していないため、今回の設計対象から外す。
- 2021〜2024の固定費積立はPhase 1へ持ち込まない。

## 12. 完了条件

Phase 1完了:
- 家計タブが追加される
- 2026年の月次入力・精算・プール管理がExcelなしでできる
- 2端末同期する
- 年間一覧が見られる
- 負担割合変更が過去月を壊さない
- 商品134件を含む既存買い物リストに回帰不具合がない
- lint/build/tests成功
