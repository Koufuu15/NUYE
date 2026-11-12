<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { getCurrentUser, listArticles } from '../lib/articles';
import { getRecentArticles, getSavedGlossaryTerms, toggleSavedGlossaryTerm } from '../lib/userLibrary';
const route = useRoute();
const articles = ref([]);
const user = ref(null);
const recentArticles = ref([]);
const savedGlossaryTerms = ref([]);
const libraryError = ref('');
const loading = ref(true);
const query = computed(() => String(route.query.q ?? ''));
const isTemplates = computed(() => route.path === '/templates');
const isMe = computed(() => route.path === '/me');
const title = computed(() => isTemplates.value ? 'テンプレート' : isMe.value ? 'マイページ' : query.value ? `「${query.value}」の検索結果` : '記事を読む');
const filtered = computed(() => {
    const source = isMe.value ? articles.value.filter((article) => article.authorId === user.value?.id || article.status === 'draft') : articles.value;
    if (!query.value)
        return source;
    const term = query.value.toLowerCase();
    return source.filter((article) => `${article.title} ${article.summary} ${article.tags.join(' ')}`.toLowerCase().includes(term));
});
onMounted(async () => {
    try {
        ;
        [articles.value, user.value] = await Promise.all([listArticles(true), getCurrentUser()]);
        if (isMe.value) {
            recentArticles.value = getRecentArticles();
            savedGlossaryTerms.value = getSavedGlossaryTerms();
        }
    }
    catch (error) {
        libraryError.value = error instanceof Error ? error.message : 'マイページのデータを読み込めませんでした。';
        console.error('マイページのデータを読み込めませんでした。', error);
    }
    finally {
        loading.value = false;
    }
});
function toggleGlossaryTerm(term) {
    try {
        savedGlossaryTerms.value = toggleSavedGlossaryTerm(term);
    }
    catch (error) {
        libraryError.value = error instanceof Error ? error.message : '用語の保存状態を更新できませんでした。';
        console.error('用語の保存状態を更新できませんでした。', error);
    }
}
</script>

<template>
  <section class="library-page section-wrap">
    <div class="eyebrow"><span class="eyebrow-line"></span>{{ isTemplates ? 'START WITH A TEMPLATE' : isMe ? 'YOUR WORKSPACE' : 'THE KNOWLEDGE SHELF' }}</div>
    <div class="library-title-row"><div><h1>{{ title }}<span v-if="isMe && user">、{{ user.name }}さん</span></h1><p>{{ isTemplates ? '目的に合わせた型を選んで、すぐに書き始めよう。' : isMe ? '記事、用語辞典、閲覧履歴をまとめて確認できます。' : '技術の「なるほど」に出会える記事を集めました。' }}</p></div><RouterLink to="/editor/new" class="button button-primary"><FilePlus2 :size="16" />記事を書く</RouterLink></div>
    <div v-if="isTemplates" class="template-options">
      <RouterLink v-for="template in [{ title: '技術解説', description: 'むずかしい仕組みを順番に解説', icon: '✳', color: 'template-peach', route: '/editor/new?template=explain' }, { title: 'コードチュートリアル', description: '手を動かしながら学ぶガイド', icon: '〈〉', color: 'template-lilac', route: '/editor/new?template=guide' }, { title: '図解・まとめ', description: '図と短い文章でポイントを整理', icon: '▦', color: 'template-sage', route: '/editor/new?template=summary' }]" :key="template.title" :to="template.route" class="template-card" :class="template.color"><span>{{ template.icon }}</span><div><h3>{{ template.title }}</h3><p>{{ template.description }}</p></div><ArrowRight :size="17" /></RouterLink>
    </div>
    <div v-if="!isTemplates" class="filter-row">
      <form class="filter-search" @submit.prevent="$router.push({ path: '/search', query: { q: ($event.target).querySelector('input')?.value } })"><Search :size="16" /><input :value="query" placeholder="キーワード、タグで検索" /><button aria-label="検索"><ArrowRight :size="16" /></button></form>
      <span class="result-count">{{ filtered.length }} 件の記事</span>
    </div>
    <p v-if="libraryError" class="personal-library-error" role="alert">{{ libraryError }}</p>
    <div v-if="loading" class="loading-note">記事を読み込んでいます…</div>
    <div v-else-if="filtered.length" class="article-grid">
      <ArticleCard v-for="article in filtered" :key="article.id" :article="article" />
    </div>
    <div v-else-if="!isMe" class="empty-state"><span class="empty-icon">✳</span><h2>記事が見つかりませんでした</h2><p>別のキーワードで探してみてください。</p><RouterLink to="/articles" class="text-link">記事一覧に戻る</RouterLink></div>
    <div v-if="isMe" class="personal-library">
      <div v-if="!loading && !filtered.length" class="empty-state personal-articles-empty"><span class="empty-icon">✳</span><h2>まだ記事がありません</h2><p>あなたの知識を、最初の記事にしてみませんか？</p><RouterLink to="/editor/new" class="button button-primary">記事を書く</RouterLink></div>
      <section class="personal-library-section">
        <div class="personal-library-heading"><h2>用語辞典</h2><span>{{ glossaryEntries.length }} 件</span></div>
        <ul class="personal-glossary-list">
          <li v-for="entry in glossaryEntries" :key="entry.term">
            <div><h3>{{ entry.term }}</h3><p>{{ entry.definition }}</p></div>
            <button type="button" :class="{ saved: savedGlossaryTerms.includes(entry.term) }" @click="toggleGlossaryTerm(entry.term)">{{ savedGlossaryTerms.includes(entry.term) ? '保存済み' : '用語を保存' }}</button>
          </li>
        </ul>
      </section>
      <section class="personal-library-section">
        <div class="personal-library-heading"><h2>閲覧履歴</h2><span>{{ recentArticles.length }} 件</span></div>
        <ul v-if="recentArticles.length" class="personal-history-list">
          <li v-for="item in recentArticles" :key="item.slug">
            <RouterLink :to="`/articles/${item.slug}`">{{ item.title }}</RouterLink>
            <time v-if="item.readAt">{{ new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(item.readAt)) }}</time>
          </li>
        </ul>
        <p v-else class="personal-library-empty">記事を読むと、ここに履歴が表示されます。</p>
      </section>
    </div>
  </section>
</template>
