<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { ArrowLeft, Bookmark, Heart, MessageCircle, Share2 } from 'lucide-vue-next'
import { generateHTML } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import TableRow from '@tiptap/extension-table-row'
import { getArticle, listArticles } from '../lib/articles'
import { markdownToHtml } from '../lib/markdown'
import { EditableTable, StyledTableCell, StyledTableHeader } from '../lib/tableExtensions'
import { TextStyleMark, UnderlineMark } from '../lib/textStyle'
import type { Article, CanvasItem, CommentEntry, GlossaryEntry, QuizQuestion } from '../types'

const route = useRoute()
const article = ref<Article>()
const loading = ref(true)
const errorText = ref('')
const summaryOpen = ref(true)
const liked = ref(false)
const bookmarked = ref(false)
const followed = ref(false)
const likesCount = ref(124)
const comments = ref<CommentEntry[]>([
  { id: 'demo-1', author: 'なし', body: 'わかりやすい説明で、実装のイメージがつきました。', createdAt: '2026-11-05T09:15:00.000Z' },
  { id: 'demo-2', author: 'ケース', body: '次は実例のコードまで見るとさらに助かります。', createdAt: '2026-11-06T10:10:00.000Z' },
])
const commentDraft = ref('')
const selectedTerm = ref<GlossaryEntry | null>(null)
const savedGlossary = ref<string[]>([])
const recentReads = ref<string[]>([])
const related = ref<Article[]>([])

const glossary = ref<GlossaryEntry[]>([
  { term: 'コンポーネント', definition: 'UIを独立した部品として再利用できるようにした設計単位です。' },
  { term: '状態管理', definition: 'UIの値や表示が変わるときに、その変化を管理する考え方です。' },
  { term: 'API', definition: 'アプリと外部サービスのやり取りをつなぐ窓口です。' },
  { term: 'SSR', definition: 'サーバー側でHTMLを生成して返すレンダリング方式です。' },
])

const quizQuestions = ref<QuizQuestion[]>([])
const quizResponses = ref<Record<string, { selectedIndex: number | null; text: string; submitted: boolean }>>({})

const articleId = computed(() => String(route.params.slug))
const contentHtml = computed(() => article.value ? generateHTML(article.value.content, [StarterKit, TextStyleMark, UnderlineMark, Image, EditableTable, TableRow, StyledTableHeader, StyledTableCell]) : '')
const articleCanvasItems = computed(() => {
  const items = [...(article.value?.canvas?.items ?? [])]
  const placedQuestions = new Set(items.map((item) => item.questionId).filter((id): id is string => Boolean(id)))
  let nextY = Math.max(520, ...items.map((item) => item.y + item.h + 24))
  for (const question of publicQuizQuestions.value) {
    if (placedQuestions.has(question.id)) continue
    items.push({
      id: `quiz-${question.id}`,
      type: 'quiz',
      questionId: question.id,
      x: 24,
      y: nextY,
      w: 300,
      h: 220,
      content: '',
    })
    nextY += 244
  }
  return items
})
const articleCanvasHeight = computed(() => Math.max(
  article.value?.canvas?.body ? article.value.canvas.body.y + article.value.canvas.body.h + 58 : 0,
  ...articleCanvasItems.value.map((item) => item.y + item.h + 24),
))
const articleBodyStyle = computed(() => {
  const body = article.value?.canvas?.body
  return body ? {
    position: 'absolute' as const,
    left: `${body.x}px`,
    top: `${body.y}px`,
    width: `${body.w}px`,
    minHeight: `${body.h}px`,
    padding: '0',
  } : undefined
})
const publicQuizQuestions = computed(() => quizQuestions.value.filter((question) => {
  if (!question.prompt.trim()) return false
  if (question.type === 'text') return Boolean(question.answerText?.trim())
  return question.options.length >= 2 && question.options.every((option) => option.trim()) && question.answerIndex >= 0 && question.answerIndex < question.options.length
}))
const summaryEnabled = computed(() => article.value?.autoSummaryEnabled ?? true)
const aiSummary = computed(() => article.value ? `AI要約: ${article.value.title}では、背景の整理 → 重要な仕組みの把握 → 実例に落とし込む流れで理解すると、記憶に残りやすくなります。` : '')
const summaryText = computed(() => article.value ? `この記事の要点: ${article.value.summary}. 1. 背景を理解する 2. 重要な使い方を整理する 3. 実装へ落とし込む` : '')

function getPublicQuizQuestion(item: CanvasItem) {
  const question = quizQuestions.value.find((entry) => entry.id === item.questionId)
  return question && publicQuizQuestions.value.includes(question) ? question : undefined
}

function getCanvasTextHtml(item: CanvasItem) {
  return item.richContent
    ? generateHTML(item.richContent, [StarterKit, TextStyleMark, UnderlineMark, Image, EditableTable, TableRow, StyledTableHeader, StyledTableCell])
    : markdownToHtml(item.content)
}

onMounted(async () => {
  try {
    article.value = await getArticle(articleId.value)
    if (!article.value || article.value.status !== 'published') {
      errorText.value = 'この記事は見つかりませんでした。'
      return
    }
    quizQuestions.value = article.value.quizQuestions ?? []
    quizResponses.value = Object.fromEntries(quizQuestions.value.map((question) => [
      question.id,
      { selectedIndex: null, text: '', submitted: false },
    ]))

    const storedRecent = JSON.parse(localStorage.getItem('mangapress.history.v1') ?? '[]') as string[]
    const currentRead = `${article.value.title}|${article.value.slug}`
    recentReads.value = [currentRead, ...storedRecent.filter((item) => item !== currentRead)].slice(0, 4)
    localStorage.setItem('mangapress.history.v1', JSON.stringify(recentReads.value))

    const storedGlossary = JSON.parse(localStorage.getItem('mangapress.saved-glossary.v1') ?? '[]') as string[]
    savedGlossary.value = storedGlossary

    const storedComments = JSON.parse(localStorage.getItem(`mangapress.comments.${article.value.id}`) ?? 'null') as CommentEntry[] | null
    if (storedComments && storedComments.length) comments.value = storedComments

    const allArticles = await listArticles()
    related.value = allArticles.filter((item) => item.id !== article.value?.id && item.category === article.value?.category).slice(0, 3)
    if (!related.value.length) {
      related.value = allArticles.filter((item) => item.id !== article.value?.id).slice(0, 3)
    }
  } catch (error) {
    errorText.value = error instanceof Error ? error.message : '記事を読み込めませんでした。'
  } finally {
    loading.value = false
  }
})

async function copyLink() {
  try {
    await navigator.clipboard.writeText(window.location.href)
    window.alert('記事URLをコピーしました。')
  } catch (error) {
    console.error('URLをコピーできませんでした。', error)
  }
}

function chooseTerm(term: string) {
  const found = glossary.value.find((entry) => entry.term === term)
  selectedTerm.value = found ?? null
}

function saveTerm(term: string) {
  const next = [...new Set([...savedGlossary.value, term])]
  savedGlossary.value = next
  localStorage.setItem('mangapress.saved-glossary.v1', JSON.stringify(next))
}

function toggleLike() {
  liked.value = !liked.value
  likesCount.value += liked.value ? 1 : -1
}

function toggleBookmark() {
  bookmarked.value = !bookmarked.value
}

function toggleFollow() {
  followed.value = !followed.value
}

function addComment() {
  if (!commentDraft.value.trim()) return
  comments.value.unshift({
    id: crypto.randomUUID(),
    author: 'あなた',
    body: commentDraft.value.trim(),
    createdAt: new Date().toISOString(),
  })
  localStorage.setItem(`mangapress.comments.${article.value?.id ?? articleId.value}`, JSON.stringify(comments.value))
  commentDraft.value = ''
}

function submitQuiz(question: QuizQuestion) {
  const response = quizResponses.value[question.id]
  if (!response) return
  response.submitted = true
}

function isQuizCorrect(question: QuizQuestion) {
  const response = quizResponses.value[question.id]
  if (!response) return false
  return question.type === 'text'
    ? response.text.trim().toLocaleLowerCase() === (question.answerText ?? '').trim().toLocaleLowerCase()
    : response.selectedIndex === question.answerIndex
}
</script>

<template>
  <section v-if="loading" class="article-loading">記事を読み込んでいます…</section>
  <section v-else-if="errorText || !article" class="article-loading">
    <p>{{ errorText }}</p>
    <RouterLink to="/articles" class="text-link"><ArrowLeft :size="15" />記事一覧へ戻る</RouterLink>
  </section>
  <article v-else class="reader">
    <RouterLink to="/articles" class="back-link"><ArrowLeft :size="15" />記事一覧へ戻る</RouterLink>
    <div class="reader-article-sheet" :style="{ minHeight: `${articleCanvasHeight}px` }">
      <div class="reader-category">{{ article.category }} <span>·</span> 5分で読める</div>
      <h1>{{ article.title }}</h1>
      <p class="reader-summary">{{ article.summary }}</p>

      <div class="reader-author">
        <span class="avatar">M</span>
        <span>
          <b>{{ article.authorId === 'mangapress' ? 'MangaPress編集部' : 'あなた' }}</b>
          <small>{{ new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(article.publishedAt || article.updatedAt)) }}に公開</small>
        </span>
        <button class="follow-button" :class="{ active: followed }" @click="toggleFollow">{{ followed ? 'フォロー中' : 'フォロー' }}</button>
      </div>

      <div v-if="article.cover" class="reader-cover"><img :src="article.cover" :alt="article.title" /></div>
      <div v-else class="reader-cover reader-cover-art"><div class="cover-note"><span>TECH JOURNAL</span><strong>{{ article.title }}</strong><i>✳</i></div></div>

      <div class="reader-toolbar">
        <button :class="{ active: liked }" @click="toggleLike"><Heart :size="18" />{{ liked ? `${likesCount} いいね` : `${likesCount} いいね` }}</button>
        <button :class="{ active: bookmarked }" @click="toggleBookmark"><Bookmark :size="17" />{{ bookmarked ? '保存済み' : '保存' }}</button>
        <button @click="copyLink"><Share2 :size="17" />シェア</button>
      </div>

      <div v-if="article.tags.length" class="reader-tags">
        <span v-for="tag in article.tags" :key="tag"># {{ tag }}</span>
      </div>

      <details v-if="summaryEnabled" class="summary-box" :open="summaryOpen">
        <summary @click.prevent="summaryOpen = !summaryOpen">記事の要約</summary>
        <p>{{ aiSummary }}</p>
        <p class="summary-note">{{ summaryText }}</p>
      </details>

      <div class="reader-content" :style="articleBodyStyle" v-html="contentHtml"></div>
      <div v-if="articleCanvasItems.length" class="reader-canvas">
      <div v-for="(item, index) in articleCanvasItems" :key="item.id" class="reader-canvas-item" :class="[`canvas-item-${item.type}`, `canvas-shape-${item.shape ?? 'rectangle'}`]" :style="{ left: `${item.x}px`, top: `${item.y}px`, width: `${item.w}px`, height: `${item.h}px`, zIndex: item.zIndex ?? index + 1, maxWidth: '100%', color: item.textColor || '#3a3430', fontSize: `${item.fontSize ?? 14}px` }">
        <div v-if="item.type === 'text' || item.type === 'quote' || item.type === 'table'" class="reader-canvas-markdown canvas-markdown-preview" :style="{ color: item.textColor || '#3a3430', fontSize: `${item.fontSize ?? 14}px` }" v-html="getCanvasTextHtml(item)"></div>
        <pre v-else-if="item.type === 'code'">{{ item.content }}</pre>
        <img v-else-if="item.type === 'image' && item.content.startsWith('data:image/')" class="canvas-image-preview" :src="item.content" alt="" />
        <div v-else-if="item.type === 'image'" class="reader-canvas-placeholder">{{ item.content }}</div>
        <svg v-else-if="item.type === 'shape'" class="canvas-shape" :style="{ stroke: item.color || '#b96c50', fill: item.fillColor || 'rgba(198,111,81,.08)', strokeWidth: item.strokeWidth ?? 2 }" viewBox="0 0 160 100" preserveAspectRatio="none" aria-hidden="true">
          <rect v-if="item.shape === 'rectangle'" x="12" y="12" width="136" height="76" :rx="item.cornerRadius ?? 8" />
          <ellipse v-else-if="item.shape === 'ellipse'" cx="80" cy="50" rx="66" ry="36" />
          <polygon v-else-if="item.shape === 'triangle'" points="80,10 148,88 12,88" />
          <line v-else-if="item.shape === 'line'" x1="12" y1="50" x2="148" y2="50" />
          <g v-else><line x1="12" y1="50" x2="138" y2="50" /><polyline points="116,28 140,50 116,72" /></g>
        </svg>
        <svg v-else-if="item.type === 'drawing'" class="reader-canvas-drawing" viewBox="0 0 240 120" preserveAspectRatio="none" aria-label="手書きボックス">
          <polyline v-for="(stroke, index) in item.strokes ?? []" :key="index" :points="stroke.map((point) => `${point.x},${point.y}`).join(' ')" />
        </svg>
        <div v-if="item.type === 'quiz' && getPublicQuizQuestion(item)" class="reader-canvas-quiz">
          <span>クイズ · {{ getPublicQuizQuestion(item)!.type === 'text' ? '短答式' : '選択肢式' }}</span>
          <p>{{ getPublicQuizQuestion(item)!.prompt }}</p>
          <div v-if="getPublicQuizQuestion(item)!.type !== 'text'" class="quiz-options">
            <button
              v-for="(option, index) in getPublicQuizQuestion(item)!.options"
              :key="index"
              :class="{ selected: quizResponses[getPublicQuizQuestion(item)!.id]?.selectedIndex === index, correct: quizResponses[getPublicQuizQuestion(item)!.id]?.submitted && index === getPublicQuizQuestion(item)!.answerIndex, wrong: quizResponses[getPublicQuizQuestion(item)!.id]?.submitted && quizResponses[getPublicQuizQuestion(item)!.id]?.selectedIndex === index && index !== getPublicQuizQuestion(item)!.answerIndex }"
              :disabled="quizResponses[getPublicQuizQuestion(item)!.id]?.submitted"
              @click="quizResponses[getPublicQuizQuestion(item)!.id].selectedIndex = index"
            >{{ option }}</button>
          </div>
          <textarea v-else v-model="quizResponses[getPublicQuizQuestion(item)!.id].text" class="quiz-answer-input" rows="2" placeholder="回答を入力してください" :disabled="quizResponses[getPublicQuizQuestion(item)!.id]?.submitted"></textarea>
          <button class="button button-primary quiz-submit" :disabled="quizResponses[getPublicQuizQuestion(item)!.id]?.submitted || (getPublicQuizQuestion(item)!.type === 'text' ? !quizResponses[getPublicQuizQuestion(item)!.id]?.text.trim() : quizResponses[getPublicQuizQuestion(item)!.id]?.selectedIndex === null)" @click="submitQuiz(getPublicQuizQuestion(item)!)">
            {{ quizResponses[getPublicQuizQuestion(item)!.id]?.submitted ? '提出済み' : '提出' }}
          </button>
          <div v-if="quizResponses[getPublicQuizQuestion(item)!.id]?.submitted" class="quiz-feedback">
            <strong>{{ isQuizCorrect(getPublicQuizQuestion(item)!) ? '正解です！' : '不正解です。' }}</strong>
            <span>答え：{{ getPublicQuizQuestion(item)!.type === 'text' ? getPublicQuizQuestion(item)!.answerText : getPublicQuizQuestion(item)!.options[getPublicQuizQuestion(item)!.answerIndex] }}</span>
            <span>{{ getPublicQuizQuestion(item)!.explanation }}</span>
          </div>
        </div>
      </div>
      </div>
    </div>

    <section class="glossary-panel">
      <div class="panel-header"><MessageCircle :size="17" /><h3>用語辞典</h3></div>
      <div class="term-chips">
        <button v-for="entry in glossary" :key="entry.term" class="term-chip" @click="chooseTerm(entry.term)">{{ entry.term }}</button>
      </div>
      <div v-if="selectedTerm" class="glossary-bubble">
        <div class="glossary-bubble-top"><strong>{{ selectedTerm.term }}</strong><button @click="saveTerm(selectedTerm.term)">{{ savedGlossary.includes(selectedTerm.term) ? '保存済み' : 'この言葉を保存' }}</button></div>
        <p>{{ selectedTerm.definition }}</p>
      </div>
    </section>

    <section class="comments-panel">
      <div class="panel-header"><MessageCircle :size="17" /><h3>コメント</h3></div>
      <div class="comment-form">
        <textarea v-model="commentDraft" rows="3" maxlength="500" placeholder="この記事への感想や質問を共有しましょう"></textarea>
        <div class="comment-form-footer"><small>{{ commentDraft.length }} / 500</small><button class="button button-primary" :disabled="!commentDraft.trim()" @click="addComment">コメントを投稿</button></div>
      </div>
      <ul class="comment-list">
        <li v-for="comment in comments" :key="comment.id">
          <span class="comment-avatar">{{ comment.author.slice(0, 1) }}</span>
          <div class="comment-body"><div class="comment-meta"><span>{{ comment.author }}</span><time>{{ new Intl.DateTimeFormat('ja-JP', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(comment.createdAt)) }}</time></div>
          <p>{{ comment.body }}</p>
          </div>
        </li>
      </ul>
    </section>

    <section class="related-panel">
      <div class="panel-header"><span class="badge">※</span><h3>関連記事</h3></div>
      <div class="related-list">
        <RouterLink v-for="item in related" :key="item.id" :to="`/articles/${item.slug}`" class="related-item">
          <span>{{ item.category }}</span>
          <strong>{{ item.title }}</strong>
          <small>{{ item.summary }}</small>
        </RouterLink>
      </div>
    </section>

    <section class="history-panel" v-if="recentReads.length">
      <div class="panel-header"><span class="badge">◌</span><h3>閲覧履歴</h3></div>
      <ul class="history-list">
        <li v-for="item in recentReads" :key="item"><span>{{ item.split('|')[0] }}</span></li>
      </ul>
    </section>

    <div class="reader-end">
      <span>✳</span>
      <p>最後まで読んでいただき、ありがとうございます。</p>
      <div>
        <button :class="{ active: liked }" @click="toggleLike"><Heart :size="18" /> いいね</button>
        <button :class="{ active: bookmarked }" @click="toggleBookmark"><Bookmark :size="17" /> 保存</button>
      </div>
    </div>

    <RouterLink to="/articles" class="back-link bottom-back"><ArrowLeft :size="15" />ほかの記事を読む</RouterLink>
  </article>
</template>
