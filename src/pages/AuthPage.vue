<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { hasSupabaseConfig, signIn, signUp } from '../lib/articles';
const router = useRouter();
const mode = ref('signup');
const name = ref('');
const email = ref('');
const password = ref('');
const errorText = ref('');
const busy = ref(false);
const showPassword = ref(false);
const notice = ref('');
async function submit() {
    errorText.value = '';
    notice.value = '';
    if (!email.value.trim() || !password.value) {
        errorText.value = 'メールアドレスとパスワードを入力してください。';
        return;
    }
    busy.value = true;
    try {
        if (mode.value === 'signup') {
            if (!name.value.trim()) {
                errorText.value = 'お名前を入力してください。';
                return;
            }
            await signUp(name.value.trim(), email.value.trim(), password.value);
            if (hasSupabaseConfig()) {
                notice.value = '確認メールを送信しました。メール内のリンクから登録を完了してください。';
                return;
            }
        }
        else {
            await signIn(email.value.trim(), password.value);
        }
        await router.push('/me');
    }
    catch (error) {
        errorText.value = error instanceof Error ? error.message : '認証に失敗しました。入力内容をご確認ください。';
    }
    finally {
        busy.value = false;
    }
}
</script>

<template>
  <section class="auth-page">
    <div class="auth-illustration">
      <RouterLink to="/" class="brand auth-brand"><span class="brand-mark"><BookOpen :size="18" /></span><span>Manga<span class="brand-accent">Press</span></span></RouterLink>
      <div class="auth-art">
        <span class="auth-art-sun">✳</span><div class="auth-art-sheet"><span>YOUR IDEAS</span><strong>知識を、<br /><em>物語に。</em></strong><i>✳</i><small>DRAW · WRITE · SHARE</small></div>
        <span class="auth-art-note">ひらめきを<br />かたちにしよう。</span>
      </div>
      <p>むずかしいことを、<br />あなたらしい伝え方で。</p>
    </div>
    <div class="auth-form-side">
      <RouterLink to="/" class="auth-back"><ArrowLeft :size="15" />トップに戻る</RouterLink>
      <div class="auth-form-wrap">
        <span class="form-kicker"><Sparkles :size="14" /> WELCOME TO MANGAPRESS</span>
        <h1>{{ mode === 'signup' ? '知識を届けよう。' : 'おかえりなさい。' }}</h1>
        <p>{{ mode === 'signup' ? 'アカウントをつくって、最初の記事を書きましょう。' : 'ログインして、記事づくりを続けましょう。' }}</p>
        <div v-if="!hasSupabaseConfig()" class="demo-mode-note"><span class="demo-pulse"></span>デモモード — アカウント情報はこのブラウザ内に保存されます</div>
        <form @submit.prevent="submit" class="auth-form">
          <label v-if="mode === 'signup'" for="name">お名前</label><input v-if="mode === 'signup'" id="name" v-model="name" autocomplete="name" placeholder="例：山田 花子" />
          <label for="email">メールアドレス</label><input id="email" v-model="email" type="email" autocomplete="email" placeholder="you@example.com" />
          <label for="password">パスワード</label><div class="password-field"><input id="password" v-model="password" :type="showPassword ? 'text' : 'password'" autocomplete="current-password" placeholder="8文字以上" minlength="8" /><button type="button" :aria-label="showPassword ? 'パスワードを隠す' : 'パスワードを表示'" @click="showPassword = !showPassword"><Eye v-if="!showPassword" :size="17" /><EyeOff v-else :size="17" /></button></div>
          <div v-if="errorText" class="form-error" role="alert">{{ errorText }}</div><div v-if="notice" class="form-success" role="status">{{ notice }}</div>
          <button class="button button-primary auth-submit" :disabled="busy">{{ busy ? '処理中…' : mode === 'signup' ? '無料でアカウントを作成' : 'ログインする' }}<ArrowRight :size="16" /></button>
        </form>
        <div class="auth-switch"><span>{{ mode === 'signup' ? 'すでにアカウントをお持ちですか？' : 'はじめての方はこちら' }}</span><button @click="mode = mode === 'signup' ? 'login' : 'signup'; errorText = ''; notice = ''">{{ mode === 'signup' ? 'ログイン' : '新規登録' }}</button></div>
        <small class="auth-terms">登録することで、利用規約とプライバシーポリシーに同意したものとみなされます。</small>
      </div>
    </div>
  </section>
</template>
