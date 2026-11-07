<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { EditorContent, useEditor } from '@tiptap/vue-3'
import { Fragment, type Node as ProseMirrorNode } from '@tiptap/pm/model'
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
import type { Article, CanvasItem, QuizQuestion } from '../types'

const route = useRoute()
const router = useRouter()
const articleId = computed(() => String(route.params.id ?? ''))
const isNew = computed(() => route.path.endsWith('/new'))
const title = ref('')
const summary = ref('')
const category = ref('テクノロジー')
const tagsInput = ref('')
const cover = ref('')
const autoSummaryEnabled = ref(true)
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
const paperSheet = ref<HTMLElement>()
const hoveredBlock = ref<{ top: number; left: number; index: number } | null>(null)
const blockDragState = ref<{ index: number } | null>(null)
const activeCanvasItemId = ref<string | null>(null)
const quizQuestions = ref<QuizQuestion[]>([])
const dragState = ref<{ id: string; offsetX: number; offsetY: number } | null>(null)
const resizeState = ref<{ id: string; corner: string; startX: number; startY: number; x: number; y: number; w: number; h: number } | null>(null)
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
    quiz: { w: 300, h: 220, content: '' },
  }
  const base = presets[type]
  const paperRect = paperSheet.value?.getBoundingClientRect()
  const contentRect = editor.value?.view.dom.getBoundingClientRect()
  const defaultY = paperRect && contentRect
    ? Math.max(260, contentRect.bottom - paperRect.top + 24) + canvasItems.value.length * 22
    : 260 + canvasItems.value.length * 42
  return {
    id: crypto.randomUUID(),
    type,
    x: overrides.x ?? 24 + (canvasItems.value.length % 4) * 55,
    y: overrides.y ?? defaultY,
    w: overrides.w ?? base.w,
    h: overrides.h ?? base.h,
    content: overrides.content ?? base.content,
    color: overrides.color ?? (type === 'shape' ? '#b96c50' : undefined),
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
  activeCanvasItemId.value = next.id
  scheduleSave()
}

function handlePointerMove(event: PointerEvent) {
  if (blockDragState.value) return
  if (resizeState.value && canvasSurface.value) {
    const state = resizeState.value
    const item = canvasItems.value.find((entry) => entry.id === state.id)
    if (!item) return
    const dx = event.clientX - state.startX
    const dy = event.clientY - state.startY
    const east = state.corner.includes('e')
    const south = state.corner.includes('s')
    const west = state.corner.includes('w')
    const north = state.corner.includes('n')
    const nextWidth = Math.max(70, state.w + (east ? dx : west ? -dx : 0))
    const nextHeight = Math.max(54, state.h + (south ? dy : north ? -dy : 0))
    item.w = nextWidth
    item.h = nextHeight
    item.x = west ? Math.max(0, state.x + state.w - nextWidth) : state.x
    item.y = north ? Math.max(0, state.y + state.h - nextHeight) : state.y
    return
  }
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

function stopPointerDrag(event?: MouseEvent) {
  if (blockDragState.value && event) finishBlockDrag(event)
  blockDragState.value = null
  dragState.value = null
  resizeState.value = null
  activeDrawingId.value = null
}

function handleCanvasOutsidePointerDown(event: PointerEvent) {
  const target = event.target
  if (!(target instanceof Element) || !target.closest('.canvas-item')) activeCanvasItemId.value = null
}

function selectCanvasItem(item: CanvasItem, event: PointerEvent) {
  activeCanvasItemId.value = item.id
  const target = event.target
  if (!(target instanceof Element) || target.closest('textarea, input, select, button, .canvas-resize-handle, .canvas-item-header')) return
  if (item.type === 'drawing') return
  startCanvasDrag(item, event)
}

function getEditorBlocks() {
  const editorDom = editor.value?.view.dom
  return editorDom
    ? Array.from(editorDom.children).filter((child) => !child.classList.contains('ProseMirror-widget'))
    : []
}

function updateBlockHandle(event: PointerEvent) {
  if (blockDragState.value || !paperSheet.value) return
  const target = event.target
  if (!(target instanceof Element) || target.closest('.block-drag-handle')) return
  const block = target.closest('.tiptap-editor > *')
  const editorDom = editor.value?.view.dom
  const paperRect = paperSheet.value.getBoundingClientRect()
  if (!block || !editorDom?.contains(block)) {
    hoveredBlock.value = null
    return
  }
  const rect = block.getBoundingClientRect()
  const index = getEditorBlocks().indexOf(block)
  if (index < 0) {
    hoveredBlock.value = null
    return
  }
  hoveredBlock.value = {
    left: Math.max(2, rect.left - paperRect.left - 27),
    top: rect.top - paperRect.top + 2,
    index,
  }
}

function startBlockDrag(event: PointerEvent) {
  const index = hoveredBlock.value?.index
  if (index === undefined || index >= (editor.value?.state.doc.childCount ?? 0)) return
  blockDragState.value = { index }
  event.preventDefault()
}

function finishBlockDrag(event: MouseEvent) {
  const state = blockDragState.value
  const editorInstance = editor.value
  if (!state || !editorInstance) return
  const editorDom = editorInstance.view.dom
  const blocks = getEditorBlocks()
  const target = blocks.find((block) => {
    const rect = block.getBoundingClientRect()
    return event.clientY >= rect.top && event.clientY <= rect.bottom
  }) ?? blocks.reduce< Element | null>((nearest, block) => {
    if (!nearest) return block
    const rect = block.getBoundingClientRect()
    const nearestRect = nearest.getBoundingClientRect()
    const distance = Math.max(rect.top - event.clientY, 0, event.clientY - rect.bottom)
    const nearestDistance = Math.max(nearestRect.top - event.clientY, 0, event.clientY - nearestRect.bottom)
    return distance < nearestDistance ? block : nearest
  }, null)
  if (!target) return
  const targetIndex = blocks.indexOf(target)
  const targetRect = target.getBoundingClientRect()
  const insertIndex = targetIndex + (event.clientY > targetRect.top + targetRect.height / 2 ? 1 : 0)
  if (insertIndex === state.index || insertIndex === state.index + 1) return

  const doc = editorInstance.state.doc
  const nodes: ProseMirrorNode[] = []
  doc.forEach((node) => nodes.push(node))
  const movedNode = nodes.splice(state.index, 1)[0]
  if (!movedNode) return
  nodes.splice(insertIndex > state.index ? insertIndex - 1 : insertIndex, 0, movedNode)
  const transaction = editorInstance.state.tr.replaceWith(0, doc.content.size, Fragment.fromArray(nodes))
  editorInstance.view.dispatch(transaction)
}

function startCanvasDrag(item: CanvasItem, event: PointerEvent) {
  const rect = canvasSurface.value?.getBoundingClientRect()
  if (!rect) return
  activeCanvasItemId.value = item.id
  dragState.value = {
    id: item.id,
    offsetX: event.clientX - rect.left - item.x,
    offsetY: event.clientY - rect.top - item.y,
  }
  event.preventDefault()
}

function startCanvasResize(item: CanvasItem, corner: string, event: PointerEvent) {
  event.preventDefault()
  event.stopPropagation()
  activeCanvasItemId.value = item.id
  resizeState.value = {
    id: item.id,
    corner,
    startX: event.clientX,
    startY: event.clientY,
    x: item.x,
    y: item.y,
    w: item.w,
    h: item.h,
  }
}

function deleteCanvasItem(item: CanvasItem) {
  canvasItems.value = canvasItems.value.filter((entry) => entry.id !== item.id)
  if (item.questionId) quizQuestions.value = quizQuestions.value.filter((question) => question.id !== item.questionId)
  if (activeCanvasItemId.value === item.id) activeCanvasItemId.value = null
  scheduleSave()
}

function createQuizQuestion(): QuizQuestion {
  return {
    id: crypto.randomUUID(),
    type: 'choice',
    prompt: '',
    options: ['', '', '', ''],
    answerIndex: 0,
    answerText: '',
    explanation: '',
  }
}

function addQuizQuestion() {
  const question = createQuizQuestion()
  quizQuestions.value.push(question)
  const item = createCanvasItem('quiz', { content: '', w: 300, h: 220 })
  item.questionId = question.id
  canvasItems.value.push(item)
  activeCanvasItemId.value = item.id
  scheduleSave()
}

function getQuizQuestion(item: CanvasItem) {
  return quizQuestions.value.find((question) => question.id === item.questionId)
}

function getDrawingPoint(svg: SVGSVGElement, event: PointerEvent) {
  const rect = svg.getBoundingClientRect()
  return {
    x: clamp((event.clientX - rect.left) / rect.width * 240, 0, 240),
    y: clamp((event.clientY - rect.top) / rect.height * 120, 0, 120),
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
const paperSheetHeight = computed(() => Math.max(0, ...canvasItems.value.map((item) => item.y + item.h + 58)))

onMounted(async () => {
  window.addEventListener('pointermove', handlePointerMove)
  window.addEventListener('pointerup', stopPointerDrag)
  window.addEventListener('mouseup', stopPointerDrag)
  document.addEventListener('pointerdown', handleCanvasOutsidePointerDown, true)
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
        quizQuestions.value = existing.quizQuestions ?? []
        for (const question of quizQuestions.value) {
          if (!canvasItems.value.some((item) => item.questionId === question.id)) {
            const item = createCanvasItem('quiz')
            item.questionId = question.id
            canvasItems.value.push(item)
          }
        }
        autoSummaryEnabled.value = existing.autoSummaryEnabled ?? true
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

watch([title, summary, category, tagsInput, cover, autoSummaryEnabled], () => {
  if (ready.value) scheduleSave()
})
watch(canvasItems, () => {
  if (ready.value) scheduleSave()
}, { deep: true })
watch(quizQuestions, () => {
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
    content: {
      ...(content as Record<string, unknown>),
      canvas,
      quizQuestions: quizQuestions.value,
      autoSummaryEnabled: autoSummaryEnabled.value,
    },
    status,
    updatedAt: new Date().toISOString(),
    publishedAt,
    authorId: authorId.value,
    canvas,
    quizQuestions: quizQuestions.value,
    autoSummaryEnabled: autoSummaryEnabled.value,
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
  window.removeEventListener('mouseup', stopPointerDrag)
  document.removeEventListener('pointerdown', handleCanvasOutsidePointerDown, true)
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
        <label class="summary-setting">
          <input v-model="autoSummaryEnabled" type="checkbox" />
          <span><Sparkles :size="14" /><b>AIによる自動概要作成</b></span>
          <small>{{ autoSummaryEnabled ? '有効' : '無効' }}</small>
        </label>
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
              <button title="クイズを追加" @click="addQuizQuestion"><Sparkles :size="16" /></button>
              <button title="画像を追加" @click="fileInput?.click()"><ImagePlus :size="17" /></button>
            </div>
          </div>
          <div class="sheet-item-tools">
            <span>シートに追加</span>
            <button @click="addCanvasItem('text')"><Plus :size="13" />テキスト</button>
            <button @click="addCanvasItem('shape', 'rectangle')">四角</button>
            <button @click="addCanvasItem('shape', 'ellipse')">円</button>
            <button @click="addCanvasItem('shape', 'triangle')">三角</button>
            <button @click="addCanvasItem('shape', 'arrow')">矢印</button>
            <button @click="addCanvasItem('shape', 'line')">線</button>
            <button @click="addCanvasItem('drawing')"><Plus :size="13" />手書き</button>
            <button @click="addCanvasItem('quote')">吹き出し</button>
          </div>
          <div class="canvas-scroll">
            <div v-if="!preview" ref="paperSheet" class="paper-sheet" :style="{ '--paper-content-height': `${paperSheetHeight}px` }" @pointermove="updateBlockHandle" @pointerleave="hoveredBlock = null">
              <div class="paper-meta"><span class="paper-category">{{ category }}</span><span>·</span><span>約{{ Math.max(1, Math.ceil((editor?.getText().length ?? 0) / 400)) }}分で読めます</span></div>
              <h1 class="paper-title">{{ getCanvasTitle() }}</h1>
              <div v-if="getCanvasSummary()" class="paper-summary">{{ getCanvasSummary() }}</div>
              <div class="paper-author"><span class="avatar avatar-tiny">M</span><span>あなた</span><span class="paper-date">下書き</span></div>
              <div class="paper-rule"></div>
              <EditorContent v-if="editor" :editor="editor" />
              <div v-if="hoveredBlock" class="block-drag-handle" :style="{ left: `${hoveredBlock.left}px`, top: `${hoveredBlock.top}px` }" title="ドラッグしてブロックを移動" aria-label="ブロックをドラッグして移動" @pointerdown.prevent.stop="startBlockDrag" @dragstart.prevent>
                <span>⠿</span>
              </div>
              <button class="add-block-button" @click="editor?.chain().focus('end').insertContent('<p></p>').run()"><Plus :size="16" />ブロックを追加</button>
              <div class="editor-hint"><Sparkles :size="13" /> Enterで次の段落へ。文章を選択すると装飾メニューが使えます。</div>
              <div ref="canvasSurface" class="canvas-surface paper-canvas" @pointerdown.self="activeCanvasItemId = null">
                <div v-for="item in canvasItems" :key="item.id" class="canvas-item" :class="[`canvas-item-${item.type}`, `canvas-shape-${item.shape ?? 'rectangle'}`, { selected: activeCanvasItemId === item.id }]" :style="{ left: `${item.x}px`, top: `${item.y}px`, width: `${item.w}px`, height: `${item.h}px` }" @pointerdown="selectCanvasItem(item, $event)">
                  <div v-if="activeCanvasItemId === item.id" class="canvas-item-header" @pointerdown.stop="startCanvasDrag(item, $event)">
                    <span title="ドラッグで位置を調整" aria-label="ドラッグで位置を調整">⠿</span>
                    <template v-if="item.type === 'shape'">
                      <select v-model="item.shape" aria-label="図形の種類" @pointerdown.stop>
                        <option value="rectangle">四角</option><option value="ellipse">円</option><option value="triangle">三角</option><option value="arrow">矢印</option><option value="line">線</option>
                      </select>
                      <input :value="item.color || '#b96c50'" type="color" aria-label="図形の色" @input="item.color = ($event.target as HTMLInputElement).value" @pointerdown.stop />
                    </template>
                    <button type="button" class="canvas-item-delete" @pointerdown.stop @click="deleteCanvasItem(item)">削除</button>
                  </div>
                  <textarea v-if="(item.type === 'text' || item.type === 'quote' || item.type === 'code' || item.type === 'image') && activeCanvasItemId === item.id" v-model="item.content" class="canvas-item-editor" :placeholder="item.type === 'code' ? 'コードを記述' : 'ここに内容を入力'" @pointerdown.stop></textarea>
                  <div v-else-if="item.type === 'text' || item.type === 'quote'" class="canvas-markdown-preview" v-html="markdownToHtml(item.content)"></div>
                  <pre v-else-if="item.type === 'code'" class="canvas-code-preview">{{ item.content }}</pre>
                  <img v-else-if="item.type === 'image' && item.content.startsWith('data:image/')" class="canvas-image-preview" :src="item.content" alt="" />
                  <div v-else-if="item.type === 'image'" class="canvas-image-placeholder">画像URLを設定</div>
                  <svg v-else-if="item.type === 'shape'" class="canvas-shape" :style="{ stroke: item.color || '#b96c50' }" viewBox="0 0 160 100" preserveAspectRatio="none" aria-hidden="true">
                    <rect v-if="item.shape === 'rectangle'" x="12" y="12" width="136" height="76" rx="8" />
                    <ellipse v-else-if="item.shape === 'ellipse'" cx="80" cy="50" rx="66" ry="36" />
                    <polygon v-else-if="item.shape === 'triangle'" points="80,10 148,88 12,88" />
                    <line v-else-if="item.shape === 'line'" x1="12" y1="50" x2="148" y2="50" />
                    <g v-else><line x1="12" y1="50" x2="138" y2="50" /><polyline points="116,28 140,50 116,72" /></g>
                  </svg>
                  <svg v-else-if="item.type === 'drawing'" class="canvas-drawing" :data-drawing-id="item.id" viewBox="0 0 240 120" preserveAspectRatio="none" aria-label="手書きボックス" @pointerdown="startDrawing(item, $event)">
                    <polyline v-for="(stroke, index) in item.strokes ?? []" :key="index" :points="stroke.map((point) => `${point.x},${point.y}`).join(' ')" />
                  </svg>
                  <div v-else-if="item.type === 'quiz' && getQuizQuestion(item)" class="canvas-quiz-editor" @pointerdown.stop="activeCanvasItemId = item.id">
                    <select v-model="getQuizQuestion(item)!.type" aria-label="クイズの回答形式" @pointerdown.stop>
                      <option value="choice">選択肢式</option><option value="text">短答式</option>
                    </select>
                    <textarea v-model="getQuizQuestion(item)!.prompt" rows="2" placeholder="問題文を入力" aria-label="クイズの問題文"></textarea>
                    <template v-if="getQuizQuestion(item)!.type === 'choice'">
                      <label v-for="(option, optionIndex) in getQuizQuestion(item)!.options" :key="optionIndex" class="canvas-quiz-option">
                        <input v-model="getQuizQuestion(item)!.answerIndex" type="radio" :name="`canvas-answer-${getQuizQuestion(item)!.id}`" :value="optionIndex" :aria-label="`選択肢${optionIndex + 1}を正解にする`" />
                        <input v-model="getQuizQuestion(item)!.options[optionIndex]" :placeholder="`選択肢 ${optionIndex + 1}`" />
                      </label>
                      <button type="button" class="canvas-quiz-add-option" @click="getQuizQuestion(item)!.options.push('')">選択肢を追加</button>
                    </template>
                    <input v-else v-model="getQuizQuestion(item)!.answerText" class="canvas-quiz-short-answer" placeholder="答えを入力" />
                    <input v-model="getQuizQuestion(item)!.explanation" class="canvas-quiz-explanation" placeholder="解説（任意）" />
                  </div>
                  <template v-if="activeCanvasItemId === item.id">
                    <span v-for="corner in ['nw', 'ne', 'sw', 'se']" :key="corner" class="canvas-resize-handle" :class="`resize-${corner}`" :aria-label="`サイズ変更 ${corner}`" @pointerdown="startCanvasResize(item, corner, $event)"></span>
                  </template>
                </div>
              </div>
            </div>
          </div>
          <div class="editor-bottom-bar"><span><span class="green-dot"></span>自動保存オン</span><span>{{ editor?.getText().length ?? 0 }} 文字</span><span class="bottom-spacer"></span><button @click="editor?.chain().focus().setParagraph().run()">標準</button><span class="zoom-label">100%</span></div>
      </section>
    </div>

    <div v-if="preview" class="preview-overlay">
      <header class="preview-header"><button class="back-link" @click="preview = false"><X :size="17" />編集に戻る</button><span>プレビュー <small>読者にはこのように表示されます</small></span><button class="button button-publish" @click="publishArticle">公開する <ArrowRight :size="15" /></button></header>
      <article class="reader preview-reader">
        <div class="paper-sheet preview-sheet" :style="{ '--paper-content-height': `${paperSheetHeight}px` }">
          <div class="paper-meta"><span class="paper-category">{{ category }}</span><span>·</span><span>約{{ Math.max(1, Math.ceil((editor?.getText().length ?? 0) / 400)) }}分で読めます</span></div>
          <h1 class="paper-title">{{ getCanvasTitle() }}</h1>
          <div v-if="getCanvasSummary()" class="paper-summary">{{ getCanvasSummary() }}</div>
          <div class="paper-author"><span class="avatar avatar-tiny">M</span><span>あなた</span><span class="paper-date">プレビュー</span></div>
          <div class="paper-rule"></div>
          <div v-if="cover" class="reader-cover"><img :src="cover" alt="" /></div>
          <div class="reader-content" v-html="previewHtml()"></div>
          <div class="preview-canvas">
            <div v-for="item in canvasItems" :key="item.id" class="reader-canvas-item" :class="[`canvas-item-${item.type}`, `canvas-shape-${item.shape ?? 'rectangle'}`]" :style="{ left: `${item.x}px`, top: `${item.y}px`, width: `${item.w}px`, height: `${item.h}px` }">
              <div v-if="item.type === 'text' || item.type === 'quote'" class="reader-canvas-markdown" v-html="markdownToHtml(item.content)"></div>
              <pre v-else-if="item.type === 'code'">{{ item.content }}</pre>
              <img v-else-if="item.type === 'image' && item.content.startsWith('data:image/')" class="canvas-image-preview" :src="item.content" alt="" />
              <div v-else-if="item.type === 'image'" class="reader-canvas-placeholder">{{ item.content || '画像' }}</div>
              <svg v-else-if="item.type === 'shape'" class="canvas-shape" :style="{ stroke: item.color || '#b96c50' }" viewBox="0 0 160 100" preserveAspectRatio="none" aria-hidden="true">
                <rect v-if="item.shape === 'rectangle'" x="12" y="12" width="136" height="76" rx="8" />
                <ellipse v-else-if="item.shape === 'ellipse'" cx="80" cy="50" rx="66" ry="36" />
                <polygon v-else-if="item.shape === 'triangle'" points="80,10 148,88 12,88" />
                <line v-else-if="item.shape === 'line'" x1="12" y1="50" x2="148" y2="50" />
                <g v-else><line x1="12" y1="50" x2="138" y2="50" /><polyline points="116,28 140,50 116,72" /></g>
              </svg>
              <svg v-else-if="item.type === 'drawing'" class="reader-canvas-drawing" viewBox="0 0 240 120" preserveAspectRatio="none" aria-label="手書き">
                <polyline v-for="(stroke, index) in item.strokes ?? []" :key="index" :points="stroke.map((point) => `${point.x},${point.y}`).join(' ')" />
              </svg>
              <div v-else-if="item.type === 'quiz' && getQuizQuestion(item)" class="reader-canvas-quiz">
                <span>クイズ · {{ getQuizQuestion(item)!.type === 'text' ? '短答式' : '選択肢式' }}</span>
                <p>{{ getQuizQuestion(item)!.prompt || '問題文' }}</p>
                <ul v-if="getQuizQuestion(item)!.type !== 'text'">
                  <li v-for="(option, index) in getQuizQuestion(item)!.options" :key="index">{{ option || `選択肢 ${index + 1}` }}</li>
                </ul>
                <div v-else class="preview-short-answer">短答式の回答欄</div>
              </div>
            </div>
          </div>
        </div>
        <div class="reader-end"><span>✳</span><p>最後まで読んでいただき、ありがとうございます。</p></div>
      </article>
    </div>

    <div v-if="publishedUrl" class="publish-modal-backdrop" @click.self="publishedUrl = ''">
      <div class="publish-modal"><button class="modal-close" aria-label="閉じる" @click="publishedUrl = ''"><X :size="18" /></button><div class="published-check"><Check :size="24" /></div><div class="eyebrow"><span class="eyebrow-line"></span> IT'S OUT THERE</div><h2>記事を公開しました！</h2><p>あなたの知識が、誰かの「わかった！」になりますように。</p><div class="published-url">{{ publishedUrl }}</div><button class="button button-primary modal-copy" @click="copyPublishedUrl">URLをコピー <ArrowRight :size="15" /></button><RouterLink :to="`/articles/${slugify(getCanvasTitle())}`" class="text-link">公開記事を見る</RouterLink></div>
    </div>
  </div>
</template>
