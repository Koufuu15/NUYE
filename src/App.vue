<script setup>
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { getCurrentUser } from './lib/articles';
import logoUrl from './assets/NUYE_logo.ico';
const route = useRoute();
const user = ref(null);
const isEditor = computed(() => route.path.startsWith('/editor/'));
watch(() => route.fullPath, async () => {
    try {
        user.value = await getCurrentUser();
    }
    catch (error) {
        console.error('ログイン状態を取得できませんでした。', error);
    }
}, { immediate: true });
</script>

<template>
  <div class="min-h-screen bg-paper text-ink">
    <header v-if="!isEditor" class="site-header">
      <div class="header-inner">
        <RouterLink to="/" class="brand" aria-label="NUYE トップ">
          <img class="brand-mark" :src="logoUrl" alt="" />
          <span>NU<span class="brand-accent">Y</span>E</span>
        </RouterLink>
        <nav class="main-nav" aria-label="メインナビゲーション">
          <RouterLink to="/articles">記事を読む</RouterLink>
          <RouterLink to="/templates">テンプレート</RouterLink>
          <RouterLink to="/me">マイページ</RouterLink>
        </nav>
        <div class="header-actions">
          <RouterLink to="/search" class="search-pill" aria-label="記事を検索">
            <Search :size="16" />
            <span>記事を検索</span>
            <kbd>⌘ K</kbd>
          </RouterLink>
          <RouterLink to="/editor/new" class="button button-primary header-create"><FilePlus2 :size="16" />記事を書く</RouterLink>
          <RouterLink v-if="user" to="/me" class="avatar avatar-small" :aria-label="`${user.name}のマイページ`">{{ user.name.slice(0, 1) }}</RouterLink>
          <RouterLink v-else to="/auth" class="login-link">ログイン <ChevronDown :size="14" /></RouterLink>
        </div>
      </div>
    </header>
    <main>
      <RouterView />
    </main>
    <footer v-if="!isEditor" class="site-footer">
      <RouterLink to="/" class="brand footer-brand"><img class="brand-mark" :src="logoUrl" alt="" /><span>NU<span class="brand-accent">Y</span>E</span></RouterLink>
      <span>知識を、伝わるかたちに。</span>
      <span class="footer-note"><Sparkles :size="14" /> Built for curious minds</span>
    </footer>
  </div>
</template>
