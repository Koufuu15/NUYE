<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { EditorContent, useEditor } from '@tiptap/vue-3'
import { generateHTML, type Editor, type JSONContent } from '@tiptap/core'
import { Blockquote } from '@tiptap/extension-blockquote'
import Image from '@tiptap/extension-image'
import TableRow from '@tiptap/extension-table-row'
import StarterKit from '@tiptap/starter-kit'
import {
  ArrowLeft, ArrowRight, Bold, BookOpen, Check, ChevronDown, Code2, Eye, ImagePlus, Italic, Underline,
  List, ListOrdered, MessageSquareQuote, Plus, Redo2,
  Save, Sparkles, Table2, Undo2, X,
} from 'lucide-vue-next'
import { getArticle, getCurrentUser, saveArticle, slugify, uploadArticleImage } from '../lib/articles'
import { markdownToHtml } from '../lib/markdown'
import { DraggableTableView, EditableTable, selectTableCell, StyledTableCell, StyledTableHeader } from '../lib/tableExtensions'
import { TextStyleMark, UnderlineMark } from '../lib/textStyle'
import type { Article, CanvasItem, QuizQuestion } from '../types'
import CanvasTextEditor from '../components/CanvasTextEditor.vue'

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
const paperScale = ref(1)
const activeCanvasItemId = ref<string | null>(null)
const activeCanvasTextEditor = shallowRef<Editor | null>(null)
const selectedTableEditor = shallowRef<Editor | null>(null)
const tableMenuPosition = ref<{ left: number; top: number } | null>(null)
const tableOutlinePosition = ref<{ left: number; top: number; width: number; height: number } | null>(null)
const bodyCanvasPosition = ref({ x: 70, y: 290, w: 590, h: 430 })
const quizQuestions = ref<QuizQuestion[]>([])
const previewQuizResponses = ref<Record<string, { selectedIndex: number | null; text: string; submitted: boolean }>>({})
const dragState = ref<{ id: string; offsetX: number; offsetY: number } | null>(null)
const resizeState = ref<{ id: string; corner: string; startX: number; startY: number; x: number; y: number; w: number; h: number } | null>(null)
const activeDrawingId = ref<string | null>(null)
let saveTimer: ReturnType<typeof setTimeout> | undefined
let paperResizeObserver: ResizeObserver | undefined
const bodyCanvasId = 'article-body-canvas'
let selectedTableWrapper: HTMLElement | null = null

function createCanvasItem(type: CanvasItem['type'], overrides: Partial<CanvasItem> = {}): CanvasItem {
  const presets: Record<CanvasItem['type'], { w: number; h: number; content: string }> = {
    text: { w: 240, h: 160, content: '## 要点\nここに文章を入力します。**Markdown** に対応しています。' },
    quote: { w: 240, h: 120, content: '大切なメッセージを、読者がすぐ見える位置に置きましょう。' },
    table: { w: 320, h: 180, content: '' },
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
    ? Math.max(260, (contentRect.bottom - paperRect.top) / paperScale.value + 24) + canvasItems.value.length * 22
    : 260 + canvasItems.value.length * 42
  const defaultZIndex = Math.max(0, ...canvasItems.value.map((item) => item.zIndex ?? 0)) + 1
  return {
    id: crypto.randomUUID(),
    type,
    x: overrides.x ?? 24 + (canvasItems.value.length % 4) * 55,
    y: overrides.y ?? defaultY,
    w: overrides.w ?? base.w,
    h: overrides.h ?? base.h,
    zIndex: overrides.zIndex ?? defaultZIndex,
    content: overrides.content ?? base.content,
    color: overrides.color ?? (type === 'shape' ? '#b96c50' : undefined),
    fillColor: overrides.fillColor,
    strokeWidth: overrides.strokeWidth ?? 2,
    cornerRadius: overrides.cornerRadius ?? 8,
    textColor: overrides.textColor ?? '#3a3430',
    fontSize: overrides.fontSize ?? 14,
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
  if (resizeState.value && canvasSurface.value) {
    const state = resizeState.value
    const item = state.id === bodyCanvasId ? bodyCanvasPosition.value : canvasItems.value.find((entry) => entry.id === state.id)
    if (!item) return
    const dx = (event.clientX - state.startX) / paperScale.value
    const dy = (event.clientY - state.startY) / paperScale.value
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
  const item = dragState.value.id === bodyCanvasId
    ? bodyCanvasPosition.value
    : canvasItems.value.find((entry) => entry.id === dragState.value?.id)
  if (!item) return
  const nextX = clamp((event.clientX - rect.left) / paperScale.value - dragState.value.offsetX, 14, Math.max(14, rect.width / paperScale.value - item.w - 14))
  const nextY = clamp((event.clientY - rect.top) / paperScale.value - dragState.value.offsetY, 14, Math.max(14, rect.height / paperScale.value - item.h - 14))
  item.x = nextX
  item.y = nextY
}

function stopPointerDrag(event?: MouseEvent) {
  if (dragState.value || resizeState.value) scheduleSave()
  dragState.value = null
  resizeState.value = null
  activeDrawingId.value = null
}

function handleCanvasOutsidePointerDown(event: PointerEvent) {
  const target = event.target
  if (!(target instanceof Element) || !target.closest('.canvas-item, .editor-toolbar, .sheet-item-tools, .table-floating-menu')) {
    activeCanvasItemId.value = null
    activeCanvasTextEditor.value = null
    selectedTableWrapper?.classList.remove('table-selected')
    selectedTableWrapper = null
    selectedTableEditor.value = null
    tableMenuPosition.value = null
    tableOutlinePosition.value = null
  }
}

function selectCanvasItem(item: CanvasItem, event: PointerEvent) {
  activeCanvasItemId.value = item.id
  const canvasEditor = event.currentTarget instanceof HTMLElement
    ? event.currentTarget.querySelector<HTMLElement>('.canvas-item-editor[contenteditable="true"]')
    : null
  if (!canvasEditor) activeCanvasTextEditor.value = null
  const target = event.target
  if (!(target instanceof Element) || target.closest('textarea, input, select, button, .canvas-resize-handle, .canvas-item-header, [contenteditable="true"]')) return
  if (item.type === 'drawing') return
  startCanvasDrag(item, event)
}

function startCanvasDrag(item: CanvasItem, event: PointerEvent) {
  const rect = canvasSurface.value?.getBoundingClientRect()
  if (!rect) return
  activeCanvasItemId.value = item.id
  dragState.value = {
    id: item.id,
    offsetX: (event.clientX - rect.left) / paperScale.value - item.x,
    offsetY: (event.clientY - rect.top) / paperScale.value - item.y,
  }
  event.preventDefault()
}

function startBodyCanvasDrag(event: PointerEvent) {
  event.preventDefault()
  event.stopPropagation()
  activeCanvasItemId.value = bodyCanvasId
  activeCanvasTextEditor.value = null
  const rect = canvasSurface.value?.getBoundingClientRect()
  if (!rect) return
  dragState.value = {
    id: bodyCanvasId,
    offsetX: (event.clientX - rect.left) / paperScale.value - bodyCanvasPosition.value.x,
    offsetY: (event.clientY - rect.top) / paperScale.value - bodyCanvasPosition.value.y,
  }
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

function startBodyCanvasResize(corner: string, event: PointerEvent) {
  event.preventDefault()
  event.stopPropagation()
  activeCanvasItemId.value = bodyCanvasId
  resizeState.value = {
    id: bodyCanvasId,
    corner,
    startX: event.clientX,
    startY: event.clientY,
    ...bodyCanvasPosition.value,
  }
}

function updateTableMenu(currentEditor: Editor) {
  const paperRect = paperSheet.value?.getBoundingClientRect()
  if (!paperRect || !currentEditor.isActive('table')) {
    selectedTableWrapper?.classList.remove('table-selected')
    selectedTableWrapper = null
    selectedTableEditor.value = null
    tableMenuPosition.value = null
    tableOutlinePosition.value = null
    return
  }
  const selectionNode = currentEditor.view.domAtPos(currentEditor.state.selection.from).node
  const selectionElement = selectionNode instanceof Element ? selectionNode : selectionNode.parentElement
  const wrapper = selectionElement?.closest<HTMLElement>('.tableWrapper')
  if (!wrapper) {
    selectedTableWrapper?.classList.remove('table-selected')
    selectedTableWrapper = null
    selectedTableEditor.value = null
    tableMenuPosition.value = null
    tableOutlinePosition.value = null
    return
  }
  showTableMenu(wrapper, currentEditor, paperRect)
}

function showTableMenu(wrapper: HTMLElement, currentEditor?: Editor, paperRect = paperSheet.value?.getBoundingClientRect()) {
  if (!paperRect) return
  selectedTableWrapper?.classList.remove('table-selected')
  wrapper.classList.add('table-selected')
  selectedTableWrapper = wrapper
  if (currentEditor) selectedTableEditor.value = currentEditor
  const rect = wrapper.getBoundingClientRect()
  tableMenuPosition.value = {
    left: clamp((rect.left - paperRect.left) / paperScale.value, 8, Math.max(8, paperRect.width / paperScale.value - 290)),
    top: clamp((rect.bottom - paperRect.top) / paperScale.value + 8, 8, Math.max(8, paperRect.height / paperScale.value - 44)),
  }
  tableOutlinePosition.value = {
    left: (rect.left - paperRect.left) / paperScale.value - 4,
    top: (rect.top - paperRect.top) / paperScale.value - 4,
    width: rect.width / paperScale.value + 8,
    height: rect.height / paperScale.value + 8,
  }
}

function selectTableAtPointer(event: PointerEvent) {
  const target = event.target
  if (!(target instanceof Element)) return
  const wrapper = target.closest<HTMLElement>('.tableWrapper')
  if (wrapper) {
    const canvasItem = wrapper.closest('.canvas-item')
    const currentEditor = canvasItem?.classList.contains('canvas-item-body') ? editor.value : undefined
    if (currentEditor) selectTableCell(currentEditor, event.clientX, event.clientY)
    showTableMenu(wrapper, currentEditor)
  }
}

function selectCanvasTable(item: CanvasItem, currentEditor: Editor, wrapper: HTMLElement) {
  activeCanvasItemId.value = item.id
  activeCanvasTextEditor.value = currentEditor
  showTableMenu(wrapper, currentEditor)
}

function activateBodyEditor() {
  activeCanvasItemId.value = bodyCanvasId
  activeCanvasTextEditor.value = null
}

function activateCanvasTextEditor(item: CanvasItem, currentEditor: Editor) {
  activeCanvasItemId.value = item.id
  activeCanvasTextEditor.value = currentEditor
}

function updateCanvasTableMenu(item: CanvasItem, currentEditor: Editor) {
  if (activeCanvasItemId.value === item.id) updateTableMenu(currentEditor)
}

function deleteCanvasItem(item: CanvasItem) {
  canvasItems.value = canvasItems.value.filter((entry) => entry.id !== item.id)
  if (item.questionId) quizQuestions.value = quizQuestions.value.filter((question) => question.id !== item.questionId)
  if (activeCanvasItemId.value === item.id) activeCanvasItemId.value = null
  scheduleSave()
}

function removeQuizOption(question: QuizQuestion, optionIndex: number) {
  if (question.options.length <= 2) return
  question.options.splice(optionIndex, 1)
  if (question.answerIndex === optionIndex) {
    question.answerIndex = Math.min(optionIndex, question.options.length - 1)
  } else if (question.answerIndex > optionIndex) {
    question.answerIndex--
  }
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

function getPreviewQuizResponse(question: QuizQuestion) {
  previewQuizResponses.value[question.id] ??= { selectedIndex: null, text: '', submitted: false }
  return previewQuizResponses.value[question.id]
}

function isPreviewQuizCorrect(question: QuizQuestion) {
  const response = getPreviewQuizResponse(question)
  return question.type === 'text'
    ? response.text.trim().toLocaleLowerCase() === (question.answerText ?? '').trim().toLocaleLowerCase()
    : response.selectedIndex === question.answerIndex
}

function submitPreviewQuiz(question: QuizQuestion) {
  getPreviewQuizResponse(question).submitted = true
}

function applyBodyTextStyle(attribute: 'color' | 'fontSize', event: Event) {
  const input = event.target as HTMLInputElement
  if (attribute === 'fontSize') {
    const fontSize = Number(input.value)
    if (!Number.isFinite(fontSize) || fontSize < 1 || fontSize > 200) return
    formattingEditor.value?.chain().focus().setMark('textStyle', { fontSize }).run()
    return
  }
  formattingEditor.value?.chain().focus().setMark('textStyle', { color: input.value }).run()
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
  if (title.value.trim()) return title.value.trim()
  const documentContent = editor.value?.getJSON().content ?? []
  const heading = documentContent.find((node) => node.type === 'heading')
  const headingText = heading?.content?.map((node) => node.text ?? '').join('').trim()
  if (headingText) return headingText.slice(0, 100)
  const text = editor.value?.getText().trim() ?? ''
  return text.split(/\r?\n/).find(Boolean)?.slice(0, 80) || title.value.trim() || '無題の記事'
}

function getCanvasSummary() {
  if (summary.value.trim()) return summary.value.trim()
  if (!autoSummaryEnabled.value) return ''
  const text = editor.value?.getText().trim() ?? ''
  return text.split(/[。\n]/).find(Boolean)?.slice(0, 160) ?? ''
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
  content: '<p></p>',
  extensions: [
    StarterKit.configure({ blockquote: false }),
    SpeechBlockquote,
    TextStyleMark,
    UnderlineMark,
    Image.configure({ inline: false, allowBase64: true }),
    EditableTable.configure({ resizable: true, allowTableNodeSelection: true, View: DraggableTableView }),
    TableRow,
    StyledTableHeader,
    StyledTableCell,
  ],
  editorProps: {
    attributes: {
      class: 'canvas-body-editor',
      'aria-label': '記事本文',
    },
  },
  onFocus: activateBodyEditor,
  onCreate: ({ editor: currentEditor }) => {
    currentEditor.view.dom.classList.toggle('is-empty', currentEditor.isEmpty)
  },
  onSelectionUpdate: ({ editor: currentEditor }) => {
    if (activeCanvasItemId.value === bodyCanvasId) updateTableMenu(currentEditor)
  },
  onUpdate: ({ editor: currentEditor }) => {
    currentEditor.view.dom.classList.toggle('is-empty', currentEditor.isEmpty)
    if (activeCanvasItemId.value === bodyCanvasId) updateTableMenu(currentEditor)
    if (ready.value) scheduleSave()
  },
})

const formattingEditor = computed(() => activeCanvasTextEditor.value ?? editor.value)
const tags = computed(() => tagsInput.value.split(',').map((tag) => tag.trim()).filter(Boolean))
const paperSheetHeight = computed(() => Math.max(
  bodyCanvasPosition.value.y + bodyCanvasPosition.value.h + 58,
  ...canvasItems.value.map((item) => item.y + item.h + 58),
))
const paperFrameStyle = computed(() => ({
  '--paper-content-height': `${paperSheetHeight.value}px`,
  '--paper-scale': paperScale.value,
  height: `${Math.max(830, paperSheetHeight.value) * paperScale.value}px`,
}))
const previewBodyStyle = computed(() => ({
  position: 'absolute' as const,
  left: `${bodyCanvasPosition.value.x}px`,
  top: `${bodyCanvasPosition.value.y}px`,
  width: `${bodyCanvasPosition.value.w}px`,
  minHeight: `${bodyCanvasPosition.value.h}px`,
  padding: '0',
}))

function canvasTextHtml(item: CanvasItem) {
  return item.richContent
    ? generateHTML(item.richContent, [StarterKit, TextStyleMark, UnderlineMark, Image, EditableTable, TableRow, StyledTableHeader, StyledTableCell])
    : markdownToHtml(item.content)
}

onMounted(async () => {
  paperResizeObserver = new ResizeObserver(updatePaperScale)
  observePaperSheet(paperSheet.value)
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
        if (existing.canvas?.body) bodyCanvasPosition.value = { ...existing.canvas.body }
        canvasItems.value = (existing.canvas?.items ?? []).map((item, index) => ({
          ...item,
          zIndex: item.zIndex ?? index + 1,
        }))
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
  const canvas = { mode: 'block' as const, items: canvasItems.value, body: bodyCanvasPosition.value }
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
  formattingEditor.value?.chain().focus().insertContent('<blockquote data-kind="speech"><p>💬 ここに吹き出しの内容を書いてください。</p></blockquote><p></p>').run()
}

function addTable() {
  const item = createCanvasItem('table')
  item.richContent = {
    type: 'doc',
    content: [{
      type: 'table',
      content: Array.from({ length: 3 }, (_, row) => ({
        type: 'tableRow',
        content: Array.from({ length: 3 }, () => ({
          type: row === 0 ? 'tableHeader' : 'tableCell',
          content: [{ type: 'paragraph' }],
        })),
      })),
    }],
  }
  canvasItems.value.push(item)
  activeCanvasItemId.value = item.id
  activeCanvasTextEditor.value = null
  scheduleSave()
}

function previewHtml() {
  return editor.value?.isEmpty ? '' : editor.value?.getHTML() ?? ''
}

function updatePaperScale() {
  const parent = paperSheet.value?.parentElement
  if (!parent) {
    paperScale.value = 1
    return
  }
  const style = getComputedStyle(parent)
  const availableWidth = parent.clientWidth - Number.parseFloat(style.paddingLeft) - Number.parseFloat(style.paddingRight)
  paperScale.value = Math.min(1, Math.max(0.01, availableWidth / 730))
}

function observePaperSheet(sheet?: HTMLElement) {
  paperResizeObserver?.disconnect()
  if (!sheet?.parentElement || !paperResizeObserver) return
  paperResizeObserver.observe(sheet.parentElement)
  updatePaperScale()
}

watch(paperSheet, observePaperSheet, { flush: 'post' })

async function copyPublishedUrl() {
  try {
    await navigator.clipboard.writeText(publishedUrl.value)
    saveMessage.value = '公開URLをコピーしました'
  } catch (error) {
    console.error('公開URLをコピーできませんでした。', error)
  }
}

onBeforeUnmount(() => {
  paperResizeObserver?.disconnect()
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
              <button title="元に戻す" :disabled="!formattingEditor?.can().undo()" @mousedown.prevent @click="formattingEditor?.chain().focus().undo().run()"><Undo2 :size="17" /></button>
              <button title="やり直す" :disabled="!formattingEditor?.can().redo()" @mousedown.prevent @click="formattingEditor?.chain().focus().redo().run()"><Redo2 :size="17" /></button><span class="toolbar-separator"></span>
              <select aria-label="テキストスタイル" @change="(event) => { const val = (event.target as HTMLSelectElement).value; if (val === 'p') formattingEditor?.chain().focus().setParagraph().run(); else formattingEditor?.chain().focus().toggleHeading({ level: Number(val) as 1 | 2 | 3 }).run() }"><option value="p">本文</option><option value="1">見出し 1</option><option value="2">見出し 2</option><option value="3">見出し 3</option></select>
              <span class="toolbar-separator"></span>
              <button title="太字" :class="{ selected: formattingEditor?.isActive('bold') }" @mousedown.prevent @click="formattingEditor?.chain().focus().toggleBold().run()"><Bold :size="17" /></button>
              <button title="斜体" :class="{ selected: formattingEditor?.isActive('italic') }" @mousedown.prevent @click="formattingEditor?.chain().focus().toggleItalic().run()"><Italic :size="17" /></button>
              <button title="下線" :class="{ selected: formattingEditor?.isActive('underline') }" @mousedown.prevent @click="formattingEditor?.chain().focus().toggleUnderline().run()"><Underline :size="17" /></button>
              <label class="text-style-control" title="本文の文字色"><span>文字色</span><input type="color" aria-label="本文の文字色" value="#46413c" @input="applyBodyTextStyle('color', $event)" /></label>
              <label class="text-style-control" title="文字サイズ（px）"><span>文字サイズ</span><input type="number" min="1" max="200" value="16" aria-label="文字サイズ（ピクセル）" @change="applyBodyTextStyle('fontSize', $event)" /><span>px</span></label>
              <button title="箇条書き" :class="{ selected: formattingEditor?.isActive('bulletList') }" @mousedown.prevent @click="formattingEditor?.chain().focus().toggleBulletList().run()"><List :size="17" /></button>
              <button title="番号付きリスト" :class="{ selected: formattingEditor?.isActive('orderedList') }" @mousedown.prevent @click="formattingEditor?.chain().focus().toggleOrderedList().run()"><ListOrdered :size="17" /></button>
              <span class="toolbar-separator"></span>
              <button title="引用" @mousedown.prevent @click="formattingEditor?.chain().focus().toggleBlockquote().run()"><MessageSquareQuote :size="17" /></button>
              <button title="コードブロック" @mousedown.prevent @click="formattingEditor?.chain().focus().toggleCodeBlock().run()"><Code2 :size="17" /></button>
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
            <button title="独立した表を追加" @mousedown.prevent @click="addTable"><Table2 :size="13" />表</button>
          </div>
          <div class="canvas-scroll">
            <div v-if="!preview" class="paper-sheet-frame" :style="paperFrameStyle">
            <div ref="paperSheet" class="paper-sheet">
              <div class="paper-meta"><span class="paper-category">{{ category }}</span><span>·</span><span>約{{ Math.max(1, Math.ceil((editor?.getText().length ?? 0) / 400)) }}分で読めます</span></div>
              <textarea v-model="title" class="paper-title" rows="2" placeholder="記事タイトル" aria-label="記事タイトル"></textarea>
              <textarea v-model="summary" class="paper-summary" rows="2" placeholder="記事の概要" aria-label="記事の概要"></textarea>
              <div class="paper-author"><span class="avatar avatar-tiny">M</span><span>あなた</span><span class="paper-date">下書き</span></div>
              <div class="paper-rule"></div>
              <div ref="canvasSurface" class="canvas-surface paper-canvas" @pointerdown.capture="selectTableAtPointer" @pointerdown.self="activeCanvasItemId = null">
                <div class="canvas-item canvas-item-body" :class="{ selected: activeCanvasItemId === bodyCanvasId }" :style="{ left: `${bodyCanvasPosition.x}px`, top: `${bodyCanvasPosition.y}px`, width: `${bodyCanvasPosition.w}px`, height: `${bodyCanvasPosition.h}px`, zIndex: 1 }" @pointerdown="activeCanvasItemId = bodyCanvasId">
                  <div v-if="activeCanvasItemId === bodyCanvasId" class="canvas-item-header" @pointerdown.stop="startBodyCanvasDrag">
                    <span title="ドラッグして本文を移動" aria-label="ドラッグして本文を移動">⠿ 本文</span>
                  </div>
                  <EditorContent v-if="editor" :editor="editor" />
                  <template v-if="activeCanvasItemId === bodyCanvasId">
                    <span v-for="corner in ['nw', 'ne', 'sw', 'se']" :key="corner" class="canvas-resize-handle" :class="`resize-${corner}`" :aria-label="`本文のサイズ変更 ${corner}`" @pointerdown="startBodyCanvasResize(corner, $event)"></span>
                  </template>
                </div>
                <div v-if="tableOutlinePosition" class="table-selection-outline" :style="{ left: `${tableOutlinePosition.left}px`, top: `${tableOutlinePosition.top}px`, width: `${tableOutlinePosition.width}px`, height: `${tableOutlinePosition.height}px` }" aria-hidden="true"></div>
                <div v-if="tableMenuPosition" class="table-floating-menu" :style="{ left: `${tableMenuPosition.left}px`, top: `${tableMenuPosition.top}px` }" aria-label="表の編集" @pointerdown.stop>
                  <button type="button" title="行を上に追加" @pointerdown.prevent @click="selectedTableEditor?.chain().focus().addRowBefore().run()">行＋上</button>
                  <button type="button" title="行を下に追加" @pointerdown.prevent @click="selectedTableEditor?.chain().focus().addRowAfter().run()">行＋下</button>
                  <button type="button" title="選択行を削除" @pointerdown.prevent @click="selectedTableEditor?.chain().focus().deleteRow().run()">行－</button>
                  <button type="button" title="列を左に追加" @pointerdown.prevent @click="selectedTableEditor?.chain().focus().addColumnBefore().run()">列＋左</button>
                  <button type="button" title="列を右に追加" @pointerdown.prevent @click="selectedTableEditor?.chain().focus().addColumnAfter().run()">列＋右</button>
                  <button type="button" title="選択列を削除" @pointerdown.prevent @click="selectedTableEditor?.chain().focus().deleteColumn().run()">列－</button>
                  <label title="選択セルの塗りつぶし色">塗<input type="color" value="#ffffff" @pointerdown.stop @input="selectedTableEditor?.chain().focus().setCellAttribute('backgroundColor', ($event.target as HTMLInputElement).value).run()" /></label>
                  <label title="選択セルの枠線の太さ">枠<input type="number" min="0" max="20" value="1" @pointerdown.stop @change="selectedTableEditor?.chain().focus().setCellAttribute('borderWidth', Number(($event.target as HTMLInputElement).value)).run()" />px</label>
                  <button type="button" title="表を削除" @pointerdown.prevent @click="selectedTableEditor?.chain().focus().deleteTable().run()">表－</button>
                </div>
                <div v-for="(item, index) in canvasItems" :key="item.id" class="canvas-item" :class="[`canvas-item-${item.type}`, `canvas-shape-${item.shape ?? 'rectangle'}`, { selected: activeCanvasItemId === item.id }]" :style="{ left: `${item.x}px`, top: `${item.y}px`, width: `${item.w}px`, height: `${item.h}px`, zIndex: item.zIndex ?? index + 1 }" @pointerdown="selectCanvasItem(item, $event)">
                  <div v-if="activeCanvasItemId === item.id" class="canvas-item-header" @pointerdown.stop="startCanvasDrag(item, $event)">
                    <span title="ドラッグで位置を調整" aria-label="ドラッグで位置を調整">⠿</span>
                    <template v-if="item.type === 'shape'">
                      <select v-model="item.shape" aria-label="図形の種類" @pointerdown.stop>
                        <option value="rectangle">四角</option><option value="ellipse">円</option><option value="triangle">三角</option><option value="arrow">矢印</option><option value="line">線</option>
                      </select>
                      <label title="枠線の色"><span>枠</span><input :value="item.color || '#b96c50'" type="color" aria-label="図形の枠線の色" @input="item.color = ($event.target as HTMLInputElement).value" @pointerdown.stop /></label>
                      <label title="塗りつぶし"><span>塗り</span><input :value="item.fillColor || '#ffffff'" type="color" aria-label="図形の塗りつぶし色" @input="item.fillColor = ($event.target as HTMLInputElement).value" @pointerdown.stop /></label>
                      <label title="枠線の太さ"><span>太さ</span><input v-model.number="item.strokeWidth" type="number" min="0" max="30" aria-label="枠線の太さ" @pointerdown.stop /></label>
                      <label title="角の丸さ"><span>角</span><input v-model.number="item.cornerRadius" type="number" min="0" max="100" aria-label="角の丸さ" @pointerdown.stop /></label>
                    </template>
                    <template v-else-if="item.type === 'text' || item.type === 'quote' || item.type === 'code'">
                      <label title="文字色"><span>文字</span><input :value="item.textColor || '#3a3430'" type="color" aria-label="テキストボックスの文字色" @input="item.textColor = ($event.target as HTMLInputElement).value" @pointerdown.stop /></label>
                      <label title="文字サイズ（px）"><span>サイズ</span><input v-model.number="item.fontSize" type="number" min="1" max="200" aria-label="テキストボックスの文字サイズ（ピクセル）" @pointerdown.stop /></label>
                    </template>
                    <label title="重なり順"><span>前後</span><input v-model.number="item.zIndex" type="number" step="1" aria-label="要素の重なり順" @pointerdown.stop /></label>
                    <button type="button" class="canvas-item-delete" @pointerdown.stop @click="deleteCanvasItem(item)">削除</button>
                  </div>
                  <CanvasTextEditor v-if="item.type === 'text' || item.type === 'quote' || item.type === 'table'" :item="item" :style="{ color: item.textColor || '#3a3430', fontSize: `${item.fontSize ?? 14}px` }" @activate="activateCanvasTextEditor(item, $event)" @selection-update="updateCanvasTableMenu(item, $event)" @table-pointer-down="(currentEditor, wrapper) => selectCanvasTable(item, currentEditor, wrapper)" />
                  <textarea v-else-if="(item.type === 'code' || item.type === 'image') && activeCanvasItemId === item.id" v-model="item.content" class="canvas-item-editor" :placeholder="item.type === 'code' ? 'コードを記述' : 'ここに内容を入力'" @pointerdown.stop></textarea>
                  <div v-else-if="item.type === 'code'" class="canvas-code-preview" :style="{ color: item.textColor || '#efede5', fontSize: `${item.fontSize ?? 14}px` }">{{ item.content }}</div>
                  <img v-else-if="item.type === 'image' && item.content.startsWith('data:image/')" class="canvas-image-preview" :src="item.content" alt="" />
                  <div v-else-if="item.type === 'image'" class="canvas-image-placeholder">画像URLを設定</div>
                  <svg v-else-if="item.type === 'shape'" class="canvas-shape" :style="{ stroke: item.color || '#b96c50', fill: item.fillColor || 'rgba(198,111,81,.08)', strokeWidth: item.strokeWidth ?? 2 }" viewBox="0 0 160 100" preserveAspectRatio="none" aria-hidden="true">
                    <rect v-if="item.shape === 'rectangle'" x="12" y="12" width="136" height="76" :rx="item.cornerRadius ?? 8" />
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
                        <button type="button" class="canvas-quiz-remove-option" :disabled="getQuizQuestion(item)!.options.length <= 2" :aria-label="`選択肢${optionIndex + 1}を削除`" @click="removeQuizOption(getQuizQuestion(item)!, optionIndex)">×</button>
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
          </div>
          <div class="editor-bottom-bar"><span><span class="green-dot"></span>自動保存オン</span><span>{{ editor?.getText().length ?? 0 }} 文字</span><span class="bottom-spacer"></span><button @mousedown.prevent @click="formattingEditor?.chain().focus().setParagraph().run()">標準</button><span class="zoom-label">100%</span></div>
      </section>
    </div>

    <div v-if="preview" class="preview-overlay">
      <header class="preview-header"><button class="back-link" @click="preview = false"><X :size="17" />編集に戻る</button><span>プレビュー <small>読者にはこのように表示されます</small></span><button class="button button-publish" @click="publishArticle">公開する <ArrowRight :size="15" /></button></header>
      <article class="reader preview-reader">
        <div class="paper-sheet-frame preview-sheet-frame" :style="paperFrameStyle">
        <div ref="paperSheet" class="paper-sheet preview-sheet">
          <div class="paper-meta"><span class="paper-category">{{ category }}</span><span>·</span><span>約{{ Math.max(1, Math.ceil((editor?.getText().length ?? 0) / 400)) }}分で読めます</span></div>
          <h1 class="paper-title">{{ getCanvasTitle() }}</h1>
          <div v-if="getCanvasSummary()" class="paper-summary">{{ getCanvasSummary() }}</div>
          <div class="paper-author"><span class="avatar avatar-tiny">M</span><span>あなた</span><span class="paper-date">プレビュー</span></div>
          <div class="paper-rule"></div>
          <div v-if="cover" class="reader-cover"><img :src="cover" alt="" /></div>
          <div class="reader-content" :style="previewBodyStyle" v-html="previewHtml()"></div>
          <div v-if="canvasItems.length" class="preview-canvas">
            <div v-for="(item, index) in canvasItems" :key="item.id" class="reader-canvas-item" :class="[`canvas-item-${item.type}`, `canvas-shape-${item.shape ?? 'rectangle'}`]" :style="{ left: `${item.x}px`, top: `${item.y}px`, width: `${item.w}px`, height: `${item.h}px`, zIndex: item.zIndex ?? index + 1, maxWidth: '100%', color: item.textColor || '#3a3430', fontSize: `${item.fontSize ?? 14}px` }">
              <div v-if="item.type === 'text' || item.type === 'quote' || item.type === 'table'" class="canvas-item-editor reader-canvas-markdown canvas-markdown-preview" :style="{ color: item.textColor || '#3a3430', fontSize: `${item.fontSize ?? 14}px` }" v-html="canvasTextHtml(item)"></div>
              <pre v-else-if="item.type === 'code'">{{ item.content }}</pre>
              <img v-else-if="item.type === 'image' && item.content.startsWith('data:image/')" class="canvas-image-preview" :src="item.content" alt="" />
              <div v-else-if="item.type === 'image'" class="reader-canvas-placeholder">{{ item.content || '画像' }}</div>
              <svg v-else-if="item.type === 'shape'" class="canvas-shape" :style="{ stroke: item.color || '#b96c50', fill: item.fillColor || 'rgba(198,111,81,.08)', strokeWidth: item.strokeWidth ?? 2 }" viewBox="0 0 160 100" preserveAspectRatio="none" aria-hidden="true">
                <rect v-if="item.shape === 'rectangle'" x="12" y="12" width="136" height="76" :rx="item.cornerRadius ?? 8" />
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
                <div v-if="getQuizQuestion(item)!.type !== 'text'" class="quiz-options">
                  <button
                    v-for="(option, index) in getQuizQuestion(item)!.options"
                    :key="index"
                    :class="{ selected: getPreviewQuizResponse(getQuizQuestion(item)!).selectedIndex === index, correct: getPreviewQuizResponse(getQuizQuestion(item)!).submitted && index === getQuizQuestion(item)!.answerIndex, wrong: getPreviewQuizResponse(getQuizQuestion(item)!).submitted && getPreviewQuizResponse(getQuizQuestion(item)!).selectedIndex === index && index !== getQuizQuestion(item)!.answerIndex }"
                    :disabled="getPreviewQuizResponse(getQuizQuestion(item)!).submitted"
                    @click="getPreviewQuizResponse(getQuizQuestion(item)!).selectedIndex = index"
                  >{{ option || `選択肢 ${index + 1}` }}</button>
                </div>
                <input v-else v-model="getPreviewQuizResponse(getQuizQuestion(item)!).text" class="quiz-answer-input" placeholder="回答を入力してください" :disabled="getPreviewQuizResponse(getQuizQuestion(item)!).submitted" />
                <button class="button button-primary quiz-submit" :disabled="getPreviewQuizResponse(getQuizQuestion(item)!).submitted || (getQuizQuestion(item)!.type === 'text' ? !getPreviewQuizResponse(getQuizQuestion(item)!).text.trim() : getPreviewQuizResponse(getQuizQuestion(item)!).selectedIndex === null)" @click="submitPreviewQuiz(getQuizQuestion(item)!)">
                  {{ getPreviewQuizResponse(getQuizQuestion(item)!).submitted ? '提出済み' : '提出' }}
                </button>
                <div v-if="getPreviewQuizResponse(getQuizQuestion(item)!).submitted" class="quiz-feedback">
                  <strong>{{ isPreviewQuizCorrect(getQuizQuestion(item)!) ? '正解です！' : '不正解です。' }}</strong>
                  <span>答え：{{ getQuizQuestion(item)!.type === 'text' ? getQuizQuestion(item)!.answerText : getQuizQuestion(item)!.options[getQuizQuestion(item)!.answerIndex] }}</span>
                  <span>{{ getQuizQuestion(item)!.explanation }}</span>
                </div>
              </div>
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
