<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { EditorContent, useEditor } from '@tiptap/vue-3'
import { Blockquote } from '@tiptap/extension-blockquote'
import Image from '@tiptap/extension-image'
import Table from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableHeader from '@tiptap/extension-table-header'
import TableCell from '@tiptap/extension-table-cell'
import StarterKit from '@tiptap/starter-kit'
import type { JSONContent } from '@tiptap/core'
import {
  ArrowLeft, ArrowRight, Bold, Blocks, BookOpen, Check, ChevronDown, Code2, Eye, ImagePlus, Italic,
  List, ListOrdered, MessageSquareQuote, Plus, Redo2,
  Save, Sparkles, Table2, Undo2, X,
} from 'lucide-vue-next'
import { getArticle, getCurrentUser, saveArticle, slugify, uploadArticleImage } from '../lib/articles'
import type { Article } from '../types'

const route = useRoute()
const router = useRouter()
const articleId = computed(() => String(route.params.id ?? ''))
const isNew = computed(() => route.path.endsWith('/new'))
const title = ref('')
const summary = ref('')
const category = ref('テクノロジー')
const tagsInput = ref('')
const cover = ref('')
const authorId = ref<string>()
const preview = ref(false)
const saving = ref(false)
const saveMessage = ref('保存しました')
const saveError = ref('')
const publishedUrl = ref('')
const ready = ref(false)
const fileInput = ref<HTMLInputElement>()
const coverInput = ref<HTMLInputElement>()
let saveTimer: ReturnType<typeof setTimeout> | undefined

const SpeechBlockquote = Blockquote.extend({
  addAttributes() {
    return {
      kind: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-kind'),
        renderHTML: (attributes) => attributes.kind ? { 'data-kind': attributes.kind } : {},
      },
    }
  },
})

const editor = useEditor({
  content: '<p>ここから記事を書き始めましょう。テキストを選択してツールバーから見出しや装飾を追加できます。</p>',
  extensions: [
    StarterKit.configure({ blockquote: false }),
    SpeechBlockquote,
    Image.configure({ inline: false, allowBase64: true }),
    Table.configure({ resizable: true }),
    TableRow,
    TableHeader,
    TableCell,
  ],
  editorProps: {
    attributes: {
      class: 'tiptap-editor',
      'aria-label': '記事本文の編集エリア',
    },
  },
  onUpdate: () => {
    if (ready.value) scheduleSave()
  },
})

const tags = computed(() => tagsInput.value.split(',').map((tag) => tag.trim()).filter(Boolean))

onMounted(async () => {
  try {
    authorId.value = (await getCurrentUser())?.id ?? 'local-user'
    if (!isNew.value) {
      const existing = await getArticle(articleId.value)
      if (existing) {
        title.value = existing.title
        summary.value = existing.summary
        category.value = existing.category
        tagsInput.value = existing.tags.join(', ')
        cover.value = existing.cover
        authorId.value = existing.authorId ?? authorId.value
        editor.value?.commands.setContent(existing.content as JSONContent)
      } else {
        saveError.value = '記事が見つかりません。新しい記事として作成します。'
      }
    } else {
      const template = String(route.query.template ?? '')
      if (template === 'explain') {
        title.value = '〇〇のしくみをやさしく解説'
        summary.value = 'この記事でわかることを、ひとことで紹介しましょう。'
        editor.value?.commands.setContent('<h2>〇〇ってなに？</h2><p>まずは基本から説明してみましょう。</p><h2>どんな仕組み？</h2><p>身近なたとえを使って、順番に解説します。</p><blockquote data-kind="speech"><p>💬 ここで大事なポイントをまとめましょう。</p></blockquote><h2>まとめ</h2><p>覚えておきたいことを整理します。</p>')
      } else if (template === 'guide') {
        title.value = '手を動かして学ぶチュートリアル'
        summary.value = '完成するものと、学べるポイントを紹介しましょう。'
        editor.value?.commands.setContent('<h2>今回つくるもの</h2><p>完成イメージと必要な環境を書きましょう。</p><h2>準備</h2><p>必要なツールやセットアップ手順を説明します。</p><h2>実装してみよう</h2><pre><code>// ここにサンプルコードを追加\n</code></pre><h2>動作を確認する</h2><p>期待する結果や、つまずきやすい点を紹介しましょう。</p><h2>まとめ</h2><p>今回のポイントを振り返ります。</p>')
      } else if (template === 'summary') {
        title.value = '〇〇を図解でまとめる'
        summary.value = '要点を短く紹介して、全体像を見せましょう。'
        editor.value?.commands.setContent('<h2>まず全体像</h2><p>テーマの全体像を短く説明します。</p><h2>ポイント 1</h2><p>ひとつ目の要点と、その理由を書きます。</p><h2>ポイント 2</h2><p>ふたつ目の要点を、具体例と一緒に紹介します。</p><h2>ポイント 3</h2><p>最後の要点を整理します。</p><blockquote><p>✳ ここに大切なまとめを入れましょう。</p></blockquote>')
      }
    }
  } catch (error) {
    saveError.value = error instanceof Error ? error.message : '記事を読み込めませんでした。'
  }
  ready.value = true
})

watch([title, summary, category, tagsInput, cover], () => {
  if (ready.value) scheduleSave()
})

function currentArticle(status: Article['status']): Article {
  const content = editor.value?.getJSON() ?? { type: 'doc', content: [] }
  const id = isNew.value ? (route.query.id ? String(route.query.id) : crypto.randomUUID()) : articleId.value
  const publishedAt = status === 'published' ? new Date().toISOString() : undefined
  return {
    id,
    slug: slugify(title.value),
    title: title.value.trim() || 'タイトル未設定',
    summary: summary.value.trim(),
    category: category.value,
    tags: tags.value,
    cover: cover.value,
    content: content as Record<string, unknown>,
    status,
    updatedAt: new Date().toISOString(),
    publishedAt,
    authorId: authorId.value,
  }
}

function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer)
  saveMessage.value = '変更を保存中…'
  saveTimer = setTimeout(() => { void saveDraft() }, 900)
}

async function saveDraft() {
  if (saving.value || !ready.value) return
  if (saveTimer) clearTimeout(saveTimer)
  saving.value = true
  saveError.value = ''
  try {
    const saved = await saveArticle(currentArticle('draft'))
    saveMessage.value = `保存済み · ${new Intl.DateTimeFormat('ja-JP', { hour: '2-digit', minute: '2-digit' }).format(new Date(saved.updatedAt))}`
    if (isNew.value) {
      await router.replace({ path: `/editor/${saved.id}` })
    }
  } catch (error) {
    saveError.value = error instanceof Error ? error.message : '記事を保存できませんでした。'
    saveMessage.value = '保存に失敗しました'
  } finally {
    saving.value = false
  }
}

async function publishArticle() {
  if (!title.value.trim()) {
    saveError.value = '公開する前に、記事タイトルを入力してください。'
    return
  }
  saving.value = true
  if (saveTimer) clearTimeout(saveTimer)
  saveError.value = ''
  try {
    const article = await saveArticle(currentArticle('published'))
    if (isNew.value) await router.replace({ path: `/editor/${article.id}` })
    publishedUrl.value = `${window.location.origin}/articles/${article.slug}`
    saveMessage.value = '記事を公開しました'
  } catch (error) {
    saveError.value = error instanceof Error ? error.message : '記事を公開できませんでした。'
  } finally {
    saving.value = false
  }
}

async function insertImage(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  if (!file.type.startsWith('image/')) {
    saveError.value = '画像ファイルを選択してください。'
    return
  }
  if (file.size > 5 * 1024 * 1024) {
    saveError.value = '画像は5MB以下のファイルを選択してください。'
    return
  }
  saveError.value = ''
  try {
    const src = await uploadArticleImage(file)
    editor.value?.chain().focus().setImage({ src, alt: file.name }).run()
  } catch (error) {
    saveError.value = error instanceof Error ? error.message : '画像をアップロードできませんでした。'
  }
  ;(event.target as HTMLInputElement).value = ''
}

async function setCoverImage(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  if (!file.type.startsWith('image/')) {
    saveError.value = '画像ファイルを選択してください。'
    return
  }
  if (file.size > 5 * 1024 * 1024) {
    saveError.value = '画像は5MB以下のファイルを選択してください。'
    return
  }
  try {
    cover.value = await uploadArticleImage(file)
    saveError.value = ''
  } catch (error) {
    saveError.value = error instanceof Error ? error.message : '画像をアップロードできませんでした。'
  }
  ;(event.target as HTMLInputElement).value = ''
}

function insertSpeechBubble() {
  editor.value?.chain().focus().insertContent('<blockquote data-kind="speech"><p>💬 ここに吹き出しの内容を書いてください。</p></blockquote><p></p>').run()
}

function insertQuiz() {
  editor.value?.chain().focus().insertContent('<blockquote data-kind="quiz"><p>✳ ミニクイズ</p><p>ここに質問を書いて、次の行に答えを追加しましょう。</p></blockquote><p></p>').run()
}

function addTable() {
  editor.value?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
}

function previewHtml() {
  return editor.value?.getHTML() ?? ''
}

async function copyPublishedUrl() {
  try {
    await navigator.clipboard.writeText(publishedUrl.value)
    saveMessage.value = '公開URLをコピーしました'
  } catch (error) {
    console.error('公開URLをコピーできませんでした。', error)
  }
}

onBeforeUnmount(() => {
  if (saveTimer) clearTimeout(saveTimer)
  editor.value?.destroy()
})
</script>

<template>
  <div class="editor-app">
    <header class="editor-topbar">
      <div class="editor-top-left"><RouterLink to="/" class="editor-brand"><span class="brand-mark"><BookOpen :size="17" /></span><b>Manga<span class="brand-accent">Press</span></b></RouterLink><span class="top-divider"></span><RouterLink to="/me" class="editor-back"><ArrowLeft :size="15" /><span>マイページ</span></RouterLink></div>
      <div class="editor-save-status" :class="{ 'save-failed': saveError }"><span class="save-dot"></span>{{ saveError || saveMessage }}</div>
      <div class="editor-top-actions"><button class="editor-preview-button" @click="preview = true"><Eye :size="15" />プレビュー</button><button class="button button-publish" :disabled="saving" @click="publishArticle">公開する <ArrowRight :size="15" /></button></div>
    </header>

    <div class="editor-workspace">
      <aside class="editor-sidebar">
        <div class="sidebar-heading"><span>記事の設定</span><button aria-label="設定を折りたたむ"><ChevronDown :size="15" /></button></div>
        <label class="field-label" for="article-title">タイトル <span>必須</span></label>
        <textarea id="article-title" v-model="title" class="title-input" placeholder="記事のタイトルを入力" rows="2" maxlength="100"></textarea>
        <label class="field-label" for="article-summary">概要</label>
        <textarea id="article-summary" v-model="summary" class="sidebar-textarea" placeholder="記事の内容を短く紹介しましょう" rows="3" maxlength="180"></textarea>
        <label class="field-label" for="article-category">カテゴリ</label>
        <select id="article-category" v-model="category" class="sidebar-select"><option>テクノロジー</option><option>プログラミング</option><option>デザイン</option><option>AI</option><option>お知らせ</option></select>
        <label class="field-label" for="article-tags">タグ <small>カンマ区切り</small></label>
        <input id="article-tags" v-model="tagsInput" class="sidebar-input" placeholder="例: Vue, はじめて" />
        <div v-if="tags.length" class="editor-tags"><span v-for="tag in tags" :key="tag">#{{ tag }}</span></div>
        <div class="side-separator"></div>
        <div class="side-section-title">カバー画像 <span>任意</span></div>
        <button class="cover-upload" @click="coverInput?.click()"><img v-if="cover" :src="cover" alt="カバー画像" /><template v-else><ImagePlus :size="18" /><span>画像を追加</span><small>5MBまで</small></template></button>
        <input ref="coverInput" type="file" accept="image/*" class="hidden" @change="setCoverImage" />
        <input ref="fileInput" type="file" accept="image/*" class="hidden" @change="insertImage" />
        <div class="side-separator"></div>
        <div class="editor-mode-card"><span class="mode-icon"><Blocks :size="16" /></span><div><b>ブロック編集</b><small>文章の流れに合わせて配置</small></div><span class="mode-active">ON</span></div>
        <div class="canvas-soon"><Sparkles :size="14" /><span>自由配置キャンバスは<br /><b>Phase 2</b>で追加予定です</span></div>
        <div class="editor-sidebar-bottom"><button @click="saveDraft" class="side-save"><Save :size="15" />下書きとして保存</button><span>画像はブラウザ内に保存されます</span></div>
      </aside>

      <section class="editor-main">
        <div class="editor-toolbar-wrap">
          <div class="editor-toolbar">
            <button title="元に戻す" :disabled="!editor?.can().undo()" @click="editor?.chain().focus().undo().run()"><Undo2 :size="17" /></button>
            <button title="やり直す" :disabled="!editor?.can().redo()" @click="editor?.chain().focus().redo().run()"><Redo2 :size="17" /></button><span class="toolbar-separator"></span>
            <select aria-label="テキストスタイル" @change="(event) => { const val = (event.target as HTMLSelectElement).value; if (val === 'p') editor?.chain().focus().setParagraph().run(); else editor?.chain().focus().toggleHeading({ level: Number(val) as 1 | 2 | 3 }).run() }"><option value="p">本文</option><option value="1">見出し 1</option><option value="2">見出し 2</option><option value="3">見出し 3</option></select>
            <span class="toolbar-separator"></span>
            <button title="太字" :class="{ selected: editor?.isActive('bold') }" @click="editor?.chain().focus().toggleBold().run()"><Bold :size="17" /></button>
            <button title="斜体" :class="{ selected: editor?.isActive('italic') }" @click="editor?.chain().focus().toggleItalic().run()"><Italic :size="17" /></button>
            <button title="箇条書き" :class="{ selected: editor?.isActive('bulletList') }" @click="editor?.chain().focus().toggleBulletList().run()"><List :size="17" /></button>
            <button title="番号付きリスト" :class="{ selected: editor?.isActive('orderedList') }" @click="editor?.chain().focus().toggleOrderedList().run()"><ListOrdered :size="17" /></button>
            <span class="toolbar-separator"></span>
            <button title="引用" @click="editor?.chain().focus().toggleBlockquote().run()"><MessageSquareQuote :size="17" /></button>
            <button title="コードブロック" @click="editor?.chain().focus().toggleCodeBlock().run()"><Code2 :size="17" /></button>
            <button title="表を追加" @click="addTable"><Table2 :size="17" /></button>
            <button title="吹き出しを追加" @click="insertSpeechBubble"><span class="bubble-tool">•••</span></button>
            <button title="クイズを追加" @click="insertQuiz"><Sparkles :size="16" /></button>
            <button title="画像を追加" @click="fileInput?.click()"><ImagePlus :size="17" /></button>
          </div>
        </div>
        <div class="canvas-scroll">
          <div v-if="!preview" class="paper-sheet">
            <div class="paper-meta"><span class="paper-category">{{ category }}</span><span>·</span><span>約{{ Math.max(1, Math.ceil((editor?.getText().length ?? 0) / 400)) }}分で読めます</span></div>
            <div class="paper-title-placeholder" v-if="!title">タイトルがここに表示されます</div>
            <h1 v-else class="paper-title">{{ title }}</h1>
            <div v-if="summary" class="paper-summary">{{ summary }}</div>
            <div class="paper-author"><span class="avatar avatar-tiny">M</span><span>あなた</span><span class="paper-date">下書き</span></div>
            <div class="paper-rule"></div>
            <EditorContent v-if="editor" :editor="editor" />
            <button class="add-block-button" @click="editor?.chain().focus('end').insertContent('<p></p>').run()"><Plus :size="16" />ブロックを追加</button>
            <div class="editor-hint"><Sparkles :size="13" /> Enterで次の段落へ。文章を選択すると装飾メニューが使えます。</div>
          </div>
        </div>
        <div class="editor-bottom-bar"><span><span class="green-dot"></span>自動保存オン</span><span>{{ editor?.getText().length ?? 0 }} 文字</span><span class="bottom-spacer"></span><button @click="editor?.chain().focus().setParagraph().run()">標準</button><span class="zoom-label">100%</span></div>
      </section>
    </div>

    <div v-if="preview" class="preview-overlay">
      <header class="preview-header"><button class="back-link" @click="preview = false"><X :size="17" />編集に戻る</button><span>プレビュー <small>読者にはこのように表示されます</small></span><button class="button button-publish" @click="publishArticle">公開する <ArrowRight :size="15" /></button></header>
      <article class="reader preview-reader"><div class="reader-category">{{ category }} <span>·</span> 5分で読める</div><h1>{{ title || 'タイトル未設定' }}</h1><p class="reader-summary">{{ summary }}</p><div class="reader-author"><span class="avatar">M</span><span><b>あなた</b><small>たった今更新</small></span></div><div v-if="cover" class="reader-cover"><img :src="cover" alt="" /></div><div class="reader-content" v-html="previewHtml()"></div><div class="reader-end"><span>✳</span><p>最後まで読んでいただき、ありがとうございます。</p></div></article>
    </div>

    <div v-if="publishedUrl" class="publish-modal-backdrop" @click.self="publishedUrl = ''">
      <div class="publish-modal"><button class="modal-close" aria-label="閉じる" @click="publishedUrl = ''"><X :size="18" /></button><div class="published-check"><Check :size="24" /></div><div class="eyebrow"><span class="eyebrow-line"></span> IT'S OUT THERE</div><h2>記事を公開しました！</h2><p>あなたの知識が、誰かの「わかった！」になりますように。</p><div class="published-url">{{ publishedUrl }}</div><button class="button button-primary modal-copy" @click="copyPublishedUrl">URLをコピー <ArrowRight :size="15" /></button><RouterLink :to="`/articles/${slugify(title)}`" class="text-link">公開記事を見る</RouterLink></div>
    </div>
  </div>
</template>
