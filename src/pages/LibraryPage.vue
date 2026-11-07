<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { ArrowRight, FilePlus2, Search } from 'lucide-vue-next'
import ArticleCard from '../components/ArticleCard.vue'
import { getCurrentUser, listArticles } from '../lib/articles'
import type { Article, AuthUser } from '../types'

const route = useRoute()
const articles = ref<Article[]>([])
const user = ref<AuthUser | null>(null)
const loading = ref(true)
const query = computed(() => String(route.query.q ?? ''))
const isTemplates = computed(() => route.path === '/templates')
const isMe = computed(() => route.path === '/me')
const title = computed(() => isTemplates.value ? 'テンプレート' : isMe.value ? 'マイページ' : query.value ? `「${query.value}」の検索結果` : '記事を読む')
const filtered = computed(() => {
  const source = isMe.value ? articles.value.filter((article) => article.authorId === user.value?.id || article.status === 'draft') : articles.value
  if (!query.value) return source
  const term = query.value.toLowerCase()
  return source.filter((article) => `${article.title} ${article.summary} ${article.tags.join(' ')}`.toLowerCase().includes(term))
})

onMounted(async () => {
  try {
    ;[articles.value, user.value] = await Promise.all([listArticles(true), getCurrentUser()])
  } catch (error) {
    console.error('記事を読み込めませんでした。', error)
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <section class="library-page section-wrap">
    <div class="eyebrow"><span class="eyebrow-line"></span>{{ isTemplates ? 'START WITH A TEMPLATE' : isMe ? 'YOUR WORKSPACE' : 'THE KNOWLEDGE SHELF' }}</div>
    <div class="library-title-row"><div><h1>{{ title }}<span v-if="isMe && user">、{{ user.name }}さん</span></h1><p>{{ isTemplates ? '目的に合わせた型を選んで、すぐに書き始めよう。' : isMe ? '公開した記事も、書きかけの下書きもここに。' : '技術の「なるほど」に出会える記事を集めました。' }}</p></div><RouterLink to="/editor/new" class="button button-primary"><FilePlus2 :size="16" />記事を書く</RouterLink></div>
    <div v-if="isTemplates" class="template-options">
      <RouterLink v-for="template in [{ title: '技術解説', description: 'むずかしい仕組みを順番に解説', icon: '✳', color: 'template-peach', route: '/editor/new?template=explain' }, { title: 'コードチュートリアル', description: '手を動かしながら学ぶガイド', icon: '〈〉', color: 'template-lilac', route: '/editor/new?template=guide' }, { title: '図解・まとめ', description: '図と短い文章でポイントを整理', icon: '▦', color: 'template-sage', route: '/editor/new?template=summary' }]" :key="template.title" :to="template.route" class="template-card" :class="template.color"><span>{{ template.icon }}</span><div><h3>{{ template.title }}</h3><p>{{ template.description }}</p></div><ArrowRight :size="17" /></RouterLink>
    </div>
    <div v-if="!isTemplates" class="filter-row">
      <form class="filter-search" @submit.prevent="$router.push({ path: '/search', query: { q: ($event.target as HTMLFormElement).querySelector('input')?.value } })"><Search :size="16" /><input :value="query" placeholder="キーワード、タグで検索" /><button aria-label="検索"><ArrowRight :size="16" /></button></form>
      <span class="result-count">{{ filtered.length }} 件の記事</span>
    </div>
    <div v-if="loading" class="loading-note">記事を読み込んでいます…</div>
    <div v-else-if="filtered.length" class="article-grid">
      <ArticleCard v-for="article in filtered" :key="article.id" :article="article" />
    </div>
    <div v-else class="empty-state"><span class="empty-icon">✳</span><h2>{{ isMe ? 'まだ記事がありません' : '記事が見つかりませんでした' }}</h2><p>{{ isMe ? 'あなたの知識を、最初の記事にしてみませんか？' : '別のキーワードで探してみてください。' }}</p><RouterLink v-if="isMe" to="/editor/new" class="button button-primary">記事を書く</RouterLink><RouterLink v-else to="/articles" class="text-link">記事一覧に戻る</RouterLink></div>
  </section>
</template>
