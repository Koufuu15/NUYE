<script setup>
defineProps({
    article: { type: Object, required: true },
    featured: { type: Boolean, default: false },
});
function formattedDate(value) {
    return new Intl.DateTimeFormat('ja-JP', { month: 'short', day: 'numeric' }).format(new Date(value));
}
</script>

<template>
  <RouterLink :to="`/articles/${article.slug}`" class="article-card" :class="{ 'article-card-featured': featured }">
    <div class="card-art" :class="`art-${article.category === 'デザイン' ? 'design' : article.category === 'AI' ? 'ai' : 'code'}`">
      <img v-if="article.cover" :src="article.cover" :alt="article.title" />
      <template v-else>
        <div class="art-orbit orbit-one"></div>
        <div class="art-orbit orbit-two"></div>
        <div class="art-paper">
          <span class="art-eyebrow">{{ article.category || 'TECH JOURNAL' }}</span>
          <strong>{{ article.title }}</strong>
          <span class="art-lines"><i></i><i></i><i></i></span>
          <span class="art-stamp">MP.</span>
        </div>
        <span class="art-sparkle">✳</span>
      </template>
      <span class="card-category">{{ article.category || 'テクノロジー' }}</span>
      <span class="card-open"><ArrowUpRight :size="17" /></span>
    </div>
    <div class="card-copy">
      <div class="card-title-row">
        <h3>{{ article.title || 'タイトル未設定' }}</h3>
      </div>
      <p>{{ article.summary || 'この記事の概要はまだありません。' }}</p>
      <div class="card-meta">
        <span class="avatar avatar-tiny">M</span><span>{{ article.authorId === 'mangapress' ? 'MangaPress編集部' : 'あなた' }}</span>
        <span class="meta-dot">·</span><Clock3 :size="13" /><time>{{ formattedDate(article.publishedAt || article.updatedAt) }}</time>
        <span class="meta-read">5分で読める</span>
      </div>
      <div v-if="article.tags.length" class="tag-row">
        <span v-for="tag in article.tags.slice(0, 3)" :key="tag"># {{ tag }}</span>
      </div>
    </div>
  </RouterLink>
</template>
