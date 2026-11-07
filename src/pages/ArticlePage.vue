<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { ArrowLeft, Bookmark, Heart, MessageCircle, Share2 } from 'lucide-vue-next'
import { generateHTML } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import Table from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableHeader from '@tiptap/extension-table-header'
import TableCell from '@tiptap/extension-table-cell'
import { getArticle } from '../lib/articles'
import type { Article } from '../types'

const route = useRoute()
const article = ref<Article>()
const loading = ref(true)
const errorText = ref('')
const contentHtml = computed(() => article.value ? generateHTML(article.value.content, [StarterKit, Image, Table, TableRow, TableHeader, TableCell]) : '')

onMounted(async () => {
  try {
    article.value = await getArticle(String(route.params.slug))
    if (!article.value || article.value.status !== 'published') errorText.value = 'この記事は見つかりませんでした。'
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
</script>

<template>
  <section v-if="loading" class="article-loading">記事を読み込んでいます…</section>
  <section v-else-if="errorText || !article" class="article-loading"><p>{{ errorText }}</p><RouterLink to="/articles" class="text-link"><ArrowLeft :size="15" />記事一覧へ戻る</RouterLink></section>
  <article v-else class="reader">
    <RouterLink to="/articles" class="back-link"><ArrowLeft :size="15" />記事一覧へ戻る</RouterLink>
    <div class="reader-category">{{ article.category }} <span>·</span> 5分で読める</div>
    <h1>{{ article.title }}</h1>
    <p class="reader-summary">{{ article.summary }}</p>
    <div class="reader-author"><span class="avatar">M</span><span><b>{{ article.authorId === 'mangapress' ? 'MangaPress編集部' : 'あなた' }}</b><small>{{ new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(article.publishedAt || article.updatedAt)) }}に公開</small></span>    <button class="follow-button" disabled title="フォロー機能はPhase 3で追加予定です">フォロー</button></div>
    <div v-if="article.cover" class="reader-cover"><img :src="article.cover" :alt="article.title" /></div>
    <div v-else class="reader-cover reader-cover-art"><div class="cover-note"><span>TECH JOURNAL</span><strong>{{ article.title }}</strong><i>✳</i></div></div>
    <div class="reader-toolbar"><button disabled title="いいね機能はPhase 3で追加予定です"><Heart :size="18" />いいね</button><button disabled title="ブックマーク機能はPhase 3で追加予定です"><Bookmark :size="17" />保存</button><button @click="copyLink"><Share2 :size="17" />シェア</button></div>
    <div v-if="article.tags.length" class="reader-tags"><span v-for="tag in article.tags" :key="tag"># {{ tag }}</span></div>
    <div class="reader-content" v-html="contentHtml"></div>
    <div class="reader-end"><span>✳</span><p>最後まで読んでいただき、ありがとうございます。</p><div><button disabled title="いいね機能はPhase 3で追加予定です"><Heart :size="18" /> いいね</button><button disabled title="ブックマーク機能はPhase 3で追加予定です"><Bookmark :size="17" /> 保存</button></div></div>
    <section class="comments-placeholder"><div><MessageCircle :size="18" /><b>コメント</b><span>Phase 3で追加予定</span></div><p>記事を読んだ感想や質問を、気軽にシェアできる場所を準備中です。</p></section>
    <RouterLink to="/articles" class="back-link bottom-back"><ArrowLeft :size="15" />ほかの記事を読む</RouterLink>
  </article>
</template>
