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
  ArrowLeft, ArrowRight, Bold, BookOpen, Check, ChevronDown, Code2, Eye, ImagePlus, Italic,
  List, ListOrdered, MessageSquareQuote, Plus, Redo2,
  Save, Sparkles, Table2, Undo2, X,
} from 'lucide-vue-next'
import { getArticle, getCurrentUser, saveArticle, slugify, uploadArticleImage } from '../lib/articles'
import { markdownToHtml } from '../lib/markdown'
import type { Article, CanvasItem } from '../types'

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
const canvasItems = ref<CanvasItem[]>([])
const canvasSurface = ref<HTMLElement>()
const dragState = ref<{ id: string; offsetX: number; offsetY: number } | null>(null)
const activeDrawingId = ref<string | null>(null)
let saveTimer: ReturnType<typeof setTimeout> | undefined

function createCanvasItem(type: CanvasItem['type'], overrides: Partial<CanvasItem> = {}): CanvasItem {
  const presets: Record<CanvasItem['type'], { w: number; h: number; content: string }> = {
    text: { w: 240, h: 160, content: '## 要点\nここに文章を入力します。**Markdown** に対応しています。' },
    quote: { w: 240, h: 120, content: '大切なメッセージを、読者がすぐ見える位置に置きましょう。' },
    image: { w: 260, h: 150, content: '画像要素はブロック編集から追加できます。' },
    code: { w: 260, h: 150, content: 'const article = "MangaPress";\nconsole.log(article);' },
    shape: { w: 160, h: 110, content: '' },
    drawing: { w: 240, h: 160, content: '', },
  }
  const base = presets[type]
  return {
    id: crypto.randomUUID(),
    type,
    x: overrides.x ?? 24 + (canvasItems.value.length % 4) * 55,
    y: overrides.y ?? 28 + (canvasItems.value.length % 5) * 42,
    w: overrides.w ?? base.w,
    h: overrides.h ?? base.h,
    content: overrides.content ?? base.content,
    color: overrides.color,
    shape: overrides.shape,
    strokes: overrides.strokes ?? (type === 'drawing' ? [] : undefined),
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function addCanvasItem(type: CanvasItem['type'], shape?: CanvasItem['shape']) {
  const next = createCanvasItem(type, { shape })
  canvasItems.value.push(next)
  scheduleSave()
}

function handlePointerMove(event: PointerEvent) {
  if (activeDrawingId.value) {
    const item = canvasItems.value.find((entry) => entry.id === activeDrawingId.value)
    const svg = document.querySelector<SVGSVGElement>(`[data-drawing-id="${activeDrawingId.value}"]`)
    const point = svg ? getDrawingPoint(svg, event) : null
    const strokes = item?.strokes
    const stroke = strokes?.[strokes.length - 1]
    if (point && stroke) stroke.push(point)
    return
  }
  if (!dragState.value || !canvasSurface.value) return
  const rect = canvasSurface.value.getBoundingClientRect()
  const itemIndex = canvasItems.value.findIndex((item) => item.id === dragState.value?.id)
  if (itemIndex < 0) return
  const item = canvasItems.value[itemIndex]
  const nextX = clamp(event.clientX - rect.left - dragState.value.offsetX, 14, Math.max(14, rect.width - item.w - 14))
  const nextY = clamp(event.clientY - rect.top - dragState.value.offsetY, 14, Math.max(14, rect.height - item.h - 14))
  item.x = nextX
  item.y = nextY
}

function stopPointerDrag() {
  dragState.value = null
  activeDrawingId.value = null
}

function startCanvasDrag(item: CanvasItem, event: PointerEvent) {
  const rect = canvasSurface.value?.getBoundingClientRect()
  if (!rect) return
  dragState.value = {
    id: item.id,
    offsetX: event.clientX - rect.left - item.x,
    offsetY: event.clientY - rect.top - item.y,
  }
}

function getDrawingPoint(svg: SVGSVGElement, event: PointerEvent) {
  const rect = svg.getBoundingClientRect()
  return {
    x: clamp(event.clientX - rect.left, 0, rect.width),
    y: clamp(event.clientY - rect.top, 0, rect.height),
  }
}

function startDrawing(item: CanvasItem, event: PointerEvent) {
  const svg = event.currentTarget as SVGSVGElement
  const point = getDrawingPoint(svg, event)
  item.strokes ??= []
  item.strokes.push([point])
  activeDrawingId.value = item.id
  event.preventDefault()
}

function getCanvasTitle() {
  const documentContent = editor.value?.getJSON().content ?? []
  const heading = documentContent.find((node) => node.type === 'heading')
  const headingText = heading?.content?.map((node) => node.text ?? '').join('').trim()
  if (headingText) return headingText.slice(0, 100)
  const text = editor.value?.getText().trim() ?? ''
  return text.split(/\r?\n/).find(Boolean)?.slice(0, 80) || title.value.trim() || '無題の記事'
}

function getCanvasSummary() {
  const text = editor.value?.getText().trim() ?? ''
  return text.split(/[。\n]/).find(Boolean)?.slice(0, 160) || summary.value.trim()
}

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
  window.addEventListener('pointermove', handlePointerMove)
  window.addEventListener('pointerup', stopPointerDrag)
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
        canvasItems.value = existing.canvas?.items ?? []
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
watch(canvasItems, () => {
  if (ready.value) scheduleSave()
}, { deep: true })
function currentArticle(status: Article['status']): Article {
  const content = editor.value?.getJSON() ?? { type: 'doc', content: [] }
  const id = isNew.value ? (route.query.id ? String(route.query.id) : crypto.randomUUID()) : articleId.value
  const publishedAt = status === 'published' ? new Date().toISOString() : undefined
  const canvas = { mode: 'block' as const, items: canvasItems.value }
  return {
    id,
    slug: slugify(getCanvasTitle()),
    title: getCanvasTitle(),
    summary: getCanvasSummary(),
    category: category.value,
    tags: tags.value,
    cover: cover.value,
    content: { ...(content as Record<string, unknown>), canvas },
    status,
    updatedAt: new Date().toISOString(),
    publishedAt,
    authorId: authorId.value,
    canvas,
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
  window.removeEventListener('pointermove', handlePointerMove)
  window.removeEventListener('pointerup', stopPointerDrag)
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
        <div class="editor-auto-meta"><Sparkles :size="14" /><span>タイトルと概要は本文から自動で設定されます。</span></div>
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
          <div class="positioned-block-tools">
            <span>配置ブロック</span>
            <button @click="addCanvasItem('text')"><Plus :size="13" />テキスト / Markdown</button>
            <button @click="addCanvasItem('shape', 'rectangle')">四角</button>
            <button @click="addCanvasItem('shape', 'ellipse')">円</button>
            <button @click="addCanvasItem('shape', 'triangle')">三角</button>
            <button @click="addCanvasItem('shape', 'arrow')">矢印</button>
            <button @click="addCanvasItem('shape', 'line')">線</button>
            <button @click="addCanvasItem('drawing')"><Plus :size="13" />手書き</button>
          </div>
          <div class="canvas-scroll">
            <div v-if="!preview" class="paper-sheet">
              <div class="paper-meta"><span class="paper-category">{{ category }}</span><span>·</span><span>約{{ Math.max(1, Math.ceil((editor?.getText().length ?? 0) / 400)) }}分で読めます</span></div>
              <h1 class="paper-title">{{ getCanvasTitle() }}</h1>
              <div v-if="getCanvasSummary()" class="paper-summary">{{ getCanvasSummary() }}</div>
              <div class="paper-author"><span class="avatar avatar-tiny">M</span><span>あなた</span><span class="paper-date">下書き</span></div>
              <div class="paper-rule"></div>
              <EditorContent v-if="editor" :editor="editor" />
              <button class="add-block-button" @click="editor?.chain().focus('end').insertContent('<p></p>').run()"><Plus :size="16" />ブロックを追加</button>
              <div class="editor-hint"><Sparkles :size="13" /> Enterで次の段落へ。文章を選択すると装飾メニューが使えます。</div>
            </div>
            <section class="positioned-block-section">
              <div class="positioned-block-heading"><div><strong>自由配置ブロック</strong><small>要素の見出しをドラッグして移動。本文ブロックと同じ記事内で使えます。</small></div></div>
              <div ref="canvasSurface" class="canvas-surface positioned-block-surface">
                <div v-for="item in canvasItems" :key="item.id" class="canvas-item" :class="[`canvas-item-${item.type}`, `canvas-shape-${item.shape ?? 'rectangle'}`]" :style="{ left: `${item.x}px`, top: `${item.y}px`, width: `${item.w}px`, height: `${item.h}px` }">
                  <div class="canvas-item-header" @pointerdown="startCanvasDrag(item, $event)">
                    <span>{{ item.type === 'text' ? 'テキスト · Markdown' : item.type === 'quote' ? '吹き出し' : item.type === 'code' ? 'コード' : item.type === 'shape' ? `図形 · ${item.shape}` : item.type === 'drawing' ? '手書きボックス' : '画像' }}</span>
                    <button type="button" class="canvas-item-delete" @pointerdown.stop @click="canvasItems = canvasItems.filter((entry) => entry.id !== item.id); scheduleSave()">削除</button>
                  </div>
                  <textarea v-if="item.type === 'text' || item.type === 'quote' || item.type === 'code' || item.type === 'image'" v-model="item.content" class="canvas-item-editor" :placeholder="item.type === 'code' ? 'コードを記述' : 'ここに内容を入力'" @pointerdown.stop></textarea>
                  <div v-if="item.type === 'text'" class="canvas-markdown-preview" v-html="markdownToHtml(item.content)"></div>
                  <svg v-else-if="item.type === 'shape'" class="canvas-shape" viewBox="0 0 160 100" preserveAspectRatio="none" aria-hidden="true">
                    <rect v-if="item.shape === 'rectangle'" x="12" y="12" width="136" height="76" rx="8" />
                    <ellipse v-else-if="item.shape === 'ellipse'" cx="80" cy="50" rx="66" ry="36" />
                    <polygon v-else-if="item.shape === 'triangle'" points="80,10 148,88 12,88" />
                    <line v-else-if="item.shape === 'line'" x1="12" y1="50" x2="148" y2="50" />
                    <g v-else><line x1="12" y1="50" x2="138" y2="50" /><polyline points="116,28 140,50 116,72" /></g>
                  </svg>
                  <svg v-else class="canvas-drawing" :data-drawing-id="item.id" viewBox="0 0 240 120" preserveAspectRatio="none" aria-label="手書きボックス" @pointerdown="startDrawing(item, $event)">
                    <polyline v-for="(stroke, index) in item.strokes ?? []" :key="index" :points="stroke.map((point) => `${point.x},${point.y}`).join(' ')" />
                  </svg>
                </div>
                <div v-if="!canvasItems.length" class="canvas-empty">上のボタンからテキスト・図形・手書きボックスを追加できます。</div>
              </div>
            </section>
          </div>
          <div class="editor-bottom-bar"><span><span class="green-dot"></span>自動保存オン</span><span>{{ editor?.getText().length ?? 0 }} 文字</span><span class="bottom-spacer"></span><button @click="editor?.chain().focus().setParagraph().run()">標準</button><span class="zoom-label">100%</span></div>
      </section>
    </div>

    <div v-if="preview" class="preview-overlay">
      <header class="preview-header"><button class="back-link" @click="preview = false"><X :size="17" />編集に戻る</button><span>プレビュー <small>読者にはこのように表示されます</small></span><button class="button button-publish" @click="publishArticle">公開する <ArrowRight :size="15" /></button></header>
      <article class="reader preview-reader"><div class="reader-category">{{ category }} <span>·</span> 5分で読める</div><h1>{{ getCanvasTitle() }}</h1><p class="reader-summary">{{ getCanvasSummary() }}</p><div class="reader-author"><span class="avatar">M</span><span><b>あなた</b><small>たった今更新</small></span></div><div v-if="cover" class="reader-cover"><img :src="cover" alt="" /></div><div class="reader-content" v-html="previewHtml()"></div><div class="reader-end"><span>✳</span><p>最後まで読んでいただき、ありがとうございます。</p></div></article>
    </div>

    <div v-if="publishedUrl" class="publish-modal-backdrop" @click.self="publishedUrl = ''">
      <div class="publish-modal"><button class="modal-close" aria-label="閉じる" @click="publishedUrl = ''"><X :size="18" /></button><div class="published-check"><Check :size="24" /></div><div class="eyebrow"><span class="eyebrow-line"></span> IT'S OUT THERE</div><h2>記事を公開しました！</h2><p>あなたの知識が、誰かの「わかった！」になりますように。</p><div class="published-url">{{ publishedUrl }}</div><button class="button button-primary modal-copy" @click="copyPublishedUrl">URLをコピー <ArrowRight :size="15" /></button><RouterLink :to="`/articles/${slugify(getCanvasTitle())}`" class="text-link">公開記事を見る</RouterLink></div>
    </div>
  </div>
</template>
