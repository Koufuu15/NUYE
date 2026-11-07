# MangaPress

GUIで記事をつくり、公開できる技術記事プラットフォームのPhase 1実装です。

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
- Tiptapベースのブロック型GUIエディタ。見出し、本文、引用、リスト、表、コード、画像、吹き出し、クイズブロックを挿入できます
- 下書きの自動保存、プレビュー、公開URLの発行
- Supabase Auth/PostgreSQL/Storage接続と、未設定時のローカルデモ保存

## 開発フェーズ

- Phase 1: 認証、記事一覧、GUIエディタ、保存、公開、閲覧
- Phase 2: 自由配置キャンバス、編集履歴
- Phase 3: 辞書、要約、クイズ機能、コメント、いいね、ブックマーク

AI要約や外部LLMは未接続です。Phase 3で追加するAI機能は、LLM APIキーをブラウザーに置かず、サーバー側エンドポイント経由で実装してください。
