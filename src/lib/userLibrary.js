export const glossaryEntries = [
    { term: 'コンポーネント', definition: 'UIを独立した部品として再利用できるようにした設計単位です。' },
    { term: '状態管理', definition: 'UIの値や表示が変わるときに、その変化を管理する考え方です。' },
    { term: 'API', definition: 'アプリと外部サービスのやり取りをつなぐ窓口です。' },
    { term: 'SSR', definition: 'サーバー側でHTMLを生成して返すレンダリング方式です。' },
];
const HISTORY_KEY = 'mangapress.history.v1';
const GLOSSARY_KEY = 'mangapress.saved-glossary.v1';
export function getRecentArticles() {
    const stored = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]');
    if (!Array.isArray(stored))
        throw new Error('閲覧履歴の形式が正しくありません。');
    return stored.map((item) => {
        if (typeof item === 'string') {
            const separator = item.lastIndexOf('|');
            if (separator < 0)
                throw new Error('閲覧履歴の形式が正しくありません。');
            return { title: item.slice(0, separator), slug: item.slice(separator + 1) };
        }
        if (item && typeof item === 'object' && 'title' in item && 'slug' in item &&
            typeof item.title === 'string' && typeof item.slug === 'string') {
            return {
                title: item.title,
                slug: item.slug,
                ...('readAt' in item && typeof item.readAt === 'string' ? { readAt: item.readAt } : {}),
            };
        }
        throw new Error('閲覧履歴の形式が正しくありません。');
    });
}
export function recordRecentArticle(article) {
    const recent = getRecentArticles().filter((item) => item.slug !== article.slug);
    recent.unshift({ ...article, readAt: new Date().toISOString() });
    localStorage.setItem(HISTORY_KEY, JSON.stringify(recent));
}
export function getSavedGlossaryTerms() {
    const stored = JSON.parse(localStorage.getItem(GLOSSARY_KEY) ?? '[]');
    if (!Array.isArray(stored) || stored.some((term) => typeof term !== 'string')) {
        throw new Error('保存した用語の形式が正しくありません。');
    }
    return stored;
}
export function toggleSavedGlossaryTerm(term) {
    const saved = getSavedGlossaryTerms();
    const next = saved.includes(term) ? saved.filter((item) => item !== term) : [...saved, term];
    localStorage.setItem(GLOSSARY_KEY, JSON.stringify(next));
    return next;
}
