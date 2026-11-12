<script setup>
import { computed, onMounted, ref } from 'vue';
import { listArticles } from '../lib/articles';
const articles = ref([]);
const loading = ref(true);
const featured = computed(() => articles.value[0]);
onMounted(async () => {
    try {
        articles.value = await listArticles();
    }
    catch (error) {
        console.error('記事一覧を読み込めませんでした。', error);
    }
    finally {
        loading.value = false;
    }
});
</script>

<template>
  <div>
    <section class="hero-shell">
      <div class="hero-content">
        <div class="eyebrow"><span class="eyebrow-line"></span> A NEW WAY TO SHARE KNOWLEDGE</div>
        <h1>技術を、もっと<br /><em>伝わるかたち</em>に。</h1>
        <p class="hero-lead">文章だけじゃない。図やコード、ストーリーを組み合わせて、<br class="desktop-break" />あなたの知識を、誰かの「わかった！」に変えよう。</p>
        <div class="hero-cta">
          <RouterLink to="/editor/new" class="button button-primary button-large">記事を書いてみる <ArrowRight :size="17" /></RouterLink>
          <RouterLink to="/articles" class="text-link">記事を見てみる <ArrowUpRight :size="15" /></RouterLink>
        </div>
        <div class="hero-proof"><span class="proof-avatars"><i>あ</i><i>技</i><i>✦</i></span><span>書く人も、読む人も。みんなのための技術メディア</span></div>
      </div>
      <div class="hero-visual" aria-label="記事づくりをイメージしたイラスト">
        <div class="visual-wash"></div>
        <div class="float-label label-top"><Sparkles :size="14" /> VISUAL EDITOR</div>
        <div class="editor-preview">
          <div class="preview-top"><span></span><span></span><span></span><b>Untitled — NUYE</b></div>
          <div class="preview-content">
            <div class="preview-title">APIってなに？<br /><i>3分でわかるしくみ</i></div>
            <div class="preview-speech"><span>💡</span><b>アプリ同士の「窓口」だよ！</b></div>
            <div class="preview-code"><span>const</span> hello = <em>'world'</em><br /><small>→ APIがデータを届ける</small></div>
            <div class="preview-sticker">なるほど！</div>
          </div>
          <div class="preview-tools"><span>✦</span><span>▤</span><span>⌘</span><span>⊞</span><span>＋</span></div>
        </div>
        <div class="float-label label-bottom"><Blocks :size="14" /> YOUR IDEAS, IN BLOCKS</div>
        <div class="hero-doodle">↗</div>
      </div>
      <a href="#discover" class="scroll-cue"><ArrowDown :size="14" /> SCROLL TO EXPLORE</a>
    </section>

    <section class="feature-strip" aria-label="NUYEの特徴">
      <div><span class="feature-icon"><PenLine :size="17" /></span><span><b>かんたんに書ける</b><small>操作はボタンを選ぶだけ</small></span></div>
      <div><span class="feature-icon"><Blocks :size="17" /></span><span><b>自由に組み合わせる</b><small>文章・画像・コード・吹き出し</small></span></div>
      <div><span class="feature-icon"><Sparkles :size="17" /></span><span><b>伝わる記事ができる</b><small>あなたらしい表現で届けよう</small></span></div>
    </section>

    <section id="discover" class="discover-section section-wrap">
      <div class="section-heading">
        <div><div class="eyebrow"><span class="eyebrow-line"></span> DISCOVER</div><h2>知りたい、つくりたい。</h2><p>技術をもっと身近にする、みんなの記事。</p></div>
        <RouterLink to="/articles" class="text-link">すべての記事を見る <ArrowRight :size="15" /></RouterLink>
      </div>
      <div v-if="loading" class="loading-note">記事を読み込んでいます…</div>
      <div v-else-if="featured" class="featured-layout">
        <ArticleCard :article="featured" featured />
        <div class="featured-note">
          <div class="note-label"><span class="note-star">✳</span> EDITOR'S PICK</div>
          <h3>むずかしいことを、<br />やさしく伝える。</h3>
          <p>図や漫画、コードの力を借りて、技術の「なるほど」をつくる。ここには、そんなアイデアが集まっています。</p>
          <RouterLink to="/templates" class="text-link">テンプレートから始める <ArrowRight :size="15" /></RouterLink>
          <span class="note-decoration">伝わるって、<br />たのしい。</span>
        </div>
      </div>
      <div v-else class="empty-state"><p>まだ記事がありません。最初の記事をつくりませんか？</p><RouterLink to="/editor/new" class="button button-primary">記事を書く</RouterLink></div>
    </section>

    <section class="cta-band">
      <div class="cta-sun">✳</div><div class="cta-copy"><span>YOUR KNOWLEDGE DESERVES A CANVAS</span><h2>その「知ってる」を、<br />誰かの「わかった！」へ。</h2></div>
      <RouterLink to="/editor/new" class="button button-light">さっそく書いてみる <ArrowRight :size="16" /></RouterLink>
    </section>
  </div>
</template>
