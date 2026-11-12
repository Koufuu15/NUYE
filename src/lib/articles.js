import { supabase } from './supabase';
const STORAGE_KEY = 'NUYE.articles.v1';
const SESSION_KEY = 'NUYE.local-user.v1';
const demoArticles = [
    {
        id: 'welcome-article',
        slug: 'welcome-to-NUYE',
        title: '「伝わる技術記事」を、もっと自由につくろう。',
        summary: '文章だけじゃない。図やコード、ストーリーを組み合わせて、あなたの知識を読みやすいかたちに。',
        category: 'お知らせ',
        tags: ['NUYE', 'はじめに'],
        cover: '',
        content: {
            type: 'doc',
            content: [
                { type: 'paragraph', content: [{ type: 'text', text: 'NUYEへようこそ！ここでは、技術を「伝わるかたち」にするための新しい記事体験を紹介します。' }] },
                { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '書くことに、もっと夢中になれる場所' }] },
                { type: 'paragraph', content: [{ type: 'text', text: 'テキストを入力して、見出しや画像、コードをツールバーから追加。Markdownを覚えなくても、直感的な操作だけで記事がつくれます。' }] },
                { type: 'blockquote', content: [{ type: 'paragraph', content: [{ type: 'text', text: '知識をシェアすることが、誰かの「わかった！」につながる。' }] }] },
                { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'あなたの記事をつくってみよう' }] },
                { type: 'paragraph', content: [{ type: 'text', text: '「記事を書く」からエディタを開いて、最初の一歩を。記事は自動で保存され、公開前にプレビューで確認できます。' }] },
            ],
        },
        status: 'published',
        updatedAt: new Date().toISOString(),
        publishedAt: new Date().toISOString(),
        authorId: 'NUYE',
    },
];
function readLocal() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (!saved)
            return demoArticles;
        const articles = JSON.parse(saved);
        return articles.length ? articles : demoArticles;
    }
    catch (error) {
        console.error('記事データを読み込めませんでした。', error);
        return demoArticles;
    }
}
function writeLocal(articles) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(articles));
}
function toArticle(row, tags = []) {
    const contentJson = row.content_json ?? { type: 'doc', content: [] };
    return {
        id: String(row.id),
        slug: String(row.slug ?? row.id),
        title: String(row.title ?? ''),
        summary: String(row.summary ?? ''),
        category: String(row.category ?? 'テクノロジー'),
        tags,
        cover: String(row.cover_url ?? ''),
        content: contentJson,
        status: row.status === 'published' ? 'published' : 'draft',
        updatedAt: String(row.updated_at ?? new Date().toISOString()),
        publishedAt: row.published_at ? String(row.published_at) : undefined,
        authorId: row.user_id ? String(row.user_id) : undefined,
        canvas: contentJson.canvas ?? { mode: 'block', items: [] },
        quizQuestions: Array.isArray(contentJson.quizQuestions) ? contentJson.quizQuestions : [],
        autoSummaryEnabled: typeof contentJson.autoSummaryEnabled === 'boolean' ? contentJson.autoSummaryEnabled : true,
    };
}
async function loadRemoteArticles() {
    if (!supabase)
        return readLocal();
    const { data, error } = await supabase
        .from('articles')
        .select('*, article_tags(tags(name))')
        .eq('status', 'published')
        .order('published_at', { ascending: false });
    if (error)
        throw error;
    return (data ?? []).map((row) => {
        const names = row.article_tags
            ?.map((item) => item.tags?.name).filter((name) => Boolean(name)) ?? [];
        return toArticle(row, names);
    });
}
export async function listArticles(includeDrafts = false) {
    if (!supabase) {
        return readLocal().filter((article) => includeDrafts || article.status === 'published');
    }
    if (includeDrafts) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user)
            return loadRemoteArticles();
        const { data, error } = await supabase
            .from('articles')
            .select('*')
            .eq('user_id', user.id)
            .order('updated_at', { ascending: false });
        if (error)
            throw error;
        return (data ?? []).map((row) => toArticle(row));
    }
    return loadRemoteArticles();
}
export async function getArticle(idOrSlug) {
    if (!supabase)
        return readLocal().find((article) => article.id === idOrSlug || article.slug === idOrSlug);
    const { data, error } = await supabase.from('articles').select('*').or(`id.eq.${idOrSlug},slug.eq.${idOrSlug}`).maybeSingle();
    if (error)
        throw error;
    return data ? toArticle(data) : undefined;
}
export async function saveArticle(article) {
    const now = new Date().toISOString();
    const canvas = article.canvas ?? article.content?.canvas ?? { mode: 'block', items: [] };
    const normalizedContent = {
        ...(article.content ?? {}),
        canvas,
        quizQuestions: article.quizQuestions ?? [],
        autoSummaryEnabled: article.autoSummaryEnabled ?? true,
    };
    const next = { ...article, content: normalizedContent, canvas, updatedAt: now };
    if (!supabase) {
        const articles = readLocal();
        const index = articles.findIndex((item) => item.id === article.id);
        if (index >= 0)
            articles[index] = next;
        else
            articles.unshift(next);
        writeLocal(articles);
        return next;
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user)
        throw new Error('記事を保存するにはログインしてください。');
    const payload = {
        id: article.id,
        user_id: user.id,
        slug: article.slug,
        title: article.title,
        summary: article.summary,
        category: article.category,
        cover_url: article.cover,
        content_json: normalizedContent,
        status: article.status,
        updated_at: now,
        published_at: article.status === 'published' ? (article.publishedAt ?? now) : null,
    };
    const { data, error } = await supabase.from('articles').upsert(payload).select().single();
    if (error)
        throw error;
    if (article.tags.length) {
        const tagRows = article.tags.map((name) => ({ name, slug: slugify(name) }));
        const { error: tagError } = await supabase.from('tags').upsert(tagRows, { onConflict: 'slug', ignoreDuplicates: true });
        if (tagError)
            throw tagError;
    }
    const { data: tagData, error: tagReadError } = article.tags.length
        ? await supabase.from('tags').select('id').in('slug', article.tags.map(slugify))
        : { data: [], error: null };
    if (tagReadError)
        throw tagReadError;
    const { error: tagDeleteError } = await supabase.from('article_tags').delete().eq('article_id', article.id);
    if (tagDeleteError)
        throw tagDeleteError;
    if (tagData?.length) {
        const { error: linkError } = await supabase.from('article_tags').insert(tagData.map((tag) => ({ article_id: article.id, tag_id: tag.id })));
        if (linkError)
            throw linkError;
    }
    const blocks = extractBlocks(article.content);
    const { error: deleteError } = await supabase.from('article_blocks').delete().eq('article_id', article.id);
    if (deleteError)
        throw deleteError;
    if (blocks.length) {
        const { error: insertError } = await supabase.from('article_blocks').insert(blocks.map((block, index) => ({
            article_id: article.id,
            block_type: block.type,
            content: block.content,
            position: index,
            layout: block.layout,
        })));
        if (insertError)
            throw insertError;
    }
    return toArticle(data, article.tags);
}
export async function uploadArticleImage(file) {
    if (!supabase) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('画像を読み込めませんでした。'));
            reader.onerror = () => reject(new Error('画像を読み込めませんでした。'));
            reader.readAsDataURL(file);
        });
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user)
        throw new Error('画像をアップロードするにはログインしてください。');
    const extension = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'image';
    const path = `${user.id}/${crypto.randomUUID()}.${extension}`;
    const { error } = await supabase.storage.from('article-images').upload(path, file, { upsert: false, contentType: file.type });
    if (error)
        throw error;
    return supabase.storage.from('article-images').getPublicUrl(path).data.publicUrl;
}
export async function deleteArticle(id) {
    if (!supabase) {
        writeLocal(readLocal().filter((article) => article.id !== id));
        return;
    }
    const { error } = await supabase.from('articles').delete().eq('id', id);
    if (error)
        throw error;
}
function extractBlocks(content) {
    const children = Array.isArray(content.content) ? content.content : [];
    return children.map((node, position) => ({
        id: `${position}`,
        type: String(node.type ?? 'paragraph'),
        content: node,
        position,
        layout: {},
    }));
}
export function slugify(text) {
    const slug = text.toLowerCase().trim().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '');
    return slug || `article-${Date.now()}`;
}
export async function signIn(email, password) {
    if (!supabase) {
        const user = { id: 'local-user', email, name: email.split('@')[0] || 'あなた' };
        localStorage.setItem(SESSION_KEY, JSON.stringify(user));
        return user;
    }
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error)
        throw error;
    return { id: data.user.id, email: data.user.email ?? email, name: data.user.user_metadata.name ?? email.split('@')[0] };
}
export async function signUp(name, email, password) {
    if (!supabase) {
        const user = { id: 'local-user', email, name };
        localStorage.setItem(SESSION_KEY, JSON.stringify(user));
        return user;
    }
    const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { name } } });
    if (error)
        throw error;
    if (!data.user)
        throw new Error('アカウントを作成できませんでした。');
    return { id: data.user.id, email: data.user.email ?? email, name };
}
export async function getCurrentUser() {
    if (!supabase) {
        try {
            return JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null');
        }
        catch (error) {
            console.error('ログイン情報を読み込めませんでした。', error);
            return null;
        }
    }
    const { data, error } = await supabase.auth.getUser();
    if (error && error.name !== 'AuthSessionMissingError')
        throw error;
    if (!data.user)
        return null;
    return {
        id: data.user.id,
        email: data.user.email ?? '',
        name: data.user.user_metadata.name ?? data.user.email?.split('@')[0] ?? 'ユーザー',
    };
}
export async function signOut() {
    if (!supabase) {
        localStorage.removeItem(SESSION_KEY);
        return;
    }
    const { error } = await supabase.auth.signOut();
    if (error)
        throw error;
}
export function hasSupabaseConfig() {
    return Boolean(supabase);
}
