# NUYE (ニュイェ)
GUIで記事をつくり、公開できる技術記事プラットフォームです。

## ローカルで起動

```sh
npm install
npm run dev
```

Supabaseの環境変数がない場合はデモモードで動き、記事とログイン状態をブラウザーの`localStorage`に保存します。設定は`.env.example`を参考に`.env.local`へ記載してください。

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
```

Supabaseを使用する場合は、DashboardのSQL Editorで`supabase/migrations/202611050001_initial_schema.sql`を実行してください。マイグレーションは認証プロフィール、記事・構造化ブロック、タグなどのPhase 1/後続Phase用テーブル、RLSポリシー、公開画像バケットを作成します。アプリからの画像アップロードにはSupabase Authへのログインが必要です。フロントエンドにはAnon Keyのみを設定し、Service Role Keyは設定しないでください。

## 実装範囲

- 記事一覧・検索、記事閲覧、テンプレート選択、認証、マイページ
- Tiptapベースのブロック型GUIエディタ。見出し、本文、引用、リスト、表、コード、画像、吹き出しを挿入できます
- ブロック編集内の自由配置要素。Markdownテキスト、複数の図形、移動可能な手書きボックスを配置できます
- 下書きの自動保存、プレビュー、公開URLの発行
- Supabase Auth/PostgreSQL/Storage接続と、未設定時のローカルデモ保存
- 読者向けの用語辞典、要約表示、選択式 / 記述式クイズ、コメント、いいね、ブックマーク、閲覧履歴

## 開発フェーズ

- Phase 1: 認証、記事一覧、GUIエディタ、保存、公開、閲覧
- Phase 2: ブロック編集と併用できる自由配置要素
- Phase 3: 辞書、要約表示、クイズ、コメント、いいね、ブックマーク

AI要約と辞書は現在デモ用の表示です。クイズとコメントのデータもデモ実装で、コメントはブラウザーの`localStorage`に保存されます。外部LLMや本番向けの共有データ保存は未接続です。LLM APIキーはブラウザーに置かず、サーバー側エンドポイント経由で実装してください。
