<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { ArrowLeft, Bookmark, Heart, MessageCircle, Share2 } from 'lucide-vue-next'
import { generateHTML } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import Table from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableHeader from '@tiptap/extension-table-header'
import TableCell from '@tiptap/extension-table-cell'
import { getArticle, listArticles } from '../lib/articles'
import { markdownToHtml } from '../lib/markdown'
import type { Article, CommentEntry, GlossaryEntry, QuizQuestion } from '../types'

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

const quizQuestions = ref<QuizQuestion[]>([
  {
    id: 'quiz-1',
    prompt: 'コンポーネントの強みとして最も適切なのはどれですか？',
    options: ['再利用しやすく見通しがよくなる', 'CSSを一切書かなくてよくなる', 'データベースを不要にする', '設計の自由度がなくなる'],
    answerIndex: 0,
    explanation: 'コンポーネントは責務を分割しやすく、再利用と保守性を高めます。',
    type: 'choice',
  },
  {
    id: 'quiz-2',
    prompt: 'コンポーネント化で得られる利点を一つ、記述してください。',
    options: [],
    answerIndex: 0,
    answerText: 'UIを再利用しやすくなり、保守性が高まります。',
    explanation: 'UIを小さな責務に分けることで、再利用や変更がしやすくなります。',
    type: 'text',
  },
])
const quizResponses = ref<Record<string, { selectedIndex: number | null; text: string; submitted: boolean }>>({
  'quiz-1': { selectedIndex: null, text: '', submitted: false },
  'quiz-2': { selectedIndex: null, text: '', submitted: false },
})
const quizMode = ref<'choice' | 'text'>('choice')

const articleId = computed(() => String(route.params.slug))
const contentHtml = computed(() => article.value ? generateHTML(article.value.content, [StarterKit, Image, Table, TableRow, TableHeader, TableCell]) : '')
const articleCanvasItems = computed(() => article.value?.canvas?.items ?? [])
const articleCanvasHeight = computed(() => Math.max(340, ...articleCanvasItems.value.map((item) => item.y + item.h + 24)))
const articleCanvasWidth = computed(() => Math.max(320, ...articleCanvasItems.value.map((item) => item.x + item.w + 24)))
const aiSummary = computed(() => article.value ? `AI要約: ${article.value.title}では、背景の整理 → 重要な仕組みの把握 → 実例に落とし込む流れで理解すると、記憶に残りやすくなります。` : '')
const summaryText = computed(() => article.value ? `この記事の要点: ${article.value.summary}. 1. 背景を理解する 2. 重要な使い方を整理する 3. 実装へ落とし込む` : '')

onMounted(async () => {
  try {
    article.value = await getArticle(articleId.value)
    if (!article.value || article.value.status !== 'published') {
      errorText.value = 'この記事は見つかりませんでした。'
      return
    }

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
</script>

<template>
  <section v-if="loading" class="article-loading">記事を読み込んでいます…</section>
  <section v-else-if="errorText || !article" class="article-loading">
    <p>{{ errorText }}</p>
    <RouterLink to="/articles" class="text-link"><ArrowLeft :size="15" />記事一覧へ戻る</RouterLink>
  </section>
  <article v-else class="reader">
    <RouterLink to="/articles" class="back-link"><ArrowLeft :size="15" />記事一覧へ戻る</RouterLink>
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

    <details class="summary-box" :open="summaryOpen">
      <summary @click.prevent="summaryOpen = !summaryOpen">記事の要約</summary>
      <p>{{ aiSummary }}</p>
      <p class="summary-note">{{ summaryText }}</p>
    </details>

    <div class="reader-content" v-html="contentHtml"></div>
    <div v-if="articleCanvasItems.length" class="reader-canvas" :style="{ minHeight: `${articleCanvasHeight}px`, width: '100%', '--canvas-content-width': `${articleCanvasWidth}px` }">
      <div v-for="item in articleCanvasItems" :key="item.id" class="reader-canvas-item" :class="[`canvas-item-${item.type}`, `canvas-shape-${item.shape ?? 'rectangle'}`]" :style="{ left: `${item.x}px`, top: `${item.y}px`, width: `${item.w}px`, height: `${item.h}px` }">
        <span v-if="item.type !== 'shape' && item.type !== 'drawing'">{{ item.type === 'text' ? 'テキスト' : item.type === 'quote' ? '吹き出し' : item.type === 'code' ? 'コード' : '画像' }}</span>
        <div v-if="item.type === 'text' || item.type === 'quote'" class="reader-canvas-markdown" v-html="markdownToHtml(item.content)"></div>
        <pre v-else-if="item.type === 'code'">{{ item.content }}</pre>
        <div v-else-if="item.type === 'image'" class="reader-canvas-placeholder">{{ item.content }}</div>
        <svg v-else-if="item.type === 'shape'" class="canvas-shape" viewBox="0 0 160 100" preserveAspectRatio="none" aria-hidden="true">
          <rect v-if="item.shape === 'rectangle'" x="12" y="12" width="136" height="76" rx="8" />
          <ellipse v-else-if="item.shape === 'ellipse'" cx="80" cy="50" rx="66" ry="36" />
          <polygon v-else-if="item.shape === 'triangle'" points="80,10 148,88 12,88" />
          <line v-else-if="item.shape === 'line'" x1="12" y1="50" x2="148" y2="50" />
          <g v-else><line x1="12" y1="50" x2="138" y2="50" /><polyline points="116,28 140,50 116,72" /></g>
        </svg>
        <svg v-else class="reader-canvas-drawing" viewBox="0 0 240 120" preserveAspectRatio="none" aria-label="手書きボックス">
          <polyline v-for="(stroke, index) in item.strokes ?? []" :key="index" :points="stroke.map((point) => `${point.x},${point.y}`).join(' ')" />
        </svg>
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

    <section class="quiz-panel">
      <div class="panel-header"><span class="badge">Q</span><h3>クイズ</h3></div>
      <div class="quiz-mode-picker" role="group" aria-label="回答形式">
        <button :class="{ active: quizMode === 'choice' }" @click="quizMode = 'choice'">選択式</button>
        <button :class="{ active: quizMode === 'text' }" @click="quizMode = 'text'">記述式</button>
      </div>
      <div v-for="question in quizQuestions.filter((item) => item.type === quizMode)" :key="question.id" class="quiz-box">
        <div class="quiz-question-heading"><span>{{ question.type === 'text' ? '記述式' : '選択式' }}</span><p>{{ question.prompt }}</p></div>
        <div v-if="question.type !== 'text'" class="quiz-options">
          <button
            v-for="(option, index) in question.options"
            :key="option"
            :class="{ selected: quizResponses[question.id]?.selectedIndex === index, correct: quizResponses[question.id]?.submitted && index === question.answerIndex, wrong: quizResponses[question.id]?.submitted && quizResponses[question.id]?.selectedIndex === index && index !== question.answerIndex }"
            :disabled="quizResponses[question.id]?.submitted"
            @click="quizResponses[question.id].selectedIndex = index"
          >{{ option }}</button>
        </div>
        <textarea v-else v-model="quizResponses[question.id].text" class="quiz-answer-input" rows="3" placeholder="回答を入力してください" :disabled="quizResponses[question.id]?.submitted"></textarea>
        <div class="quiz-submit-row">
          <button class="button button-primary quiz-submit" :disabled="quizResponses[question.id]?.submitted || (question.type === 'text' ? !quizResponses[question.id]?.text.trim() : quizResponses[question.id]?.selectedIndex === null)" @click="submitQuiz(question)">
            {{ quizResponses[question.id]?.submitted ? '提出済み' : '提出' }}
          </button>
        </div>
        <div v-if="quizResponses[question.id]?.submitted" class="quiz-feedback">
          <strong>{{ question.type === 'text' ? '回答を受け付けました' : quizResponses[question.id].selectedIndex === question.answerIndex ? '正解です！' : '不正解です。' }}</strong>
          <span class="quiz-answer-reveal">答え：{{ question.type === 'text' ? question.answerText : question.options[question.answerIndex] }}</span>
          <span>{{ question.explanation }}</span>
        </div>
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
