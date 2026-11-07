import { createRouter, createWebHistory } from 'vue-router'
import HomePage from './pages/HomePage.vue'
import LibraryPage from './pages/LibraryPage.vue'
import ArticlePage from './pages/ArticlePage.vue'
import EditorPage from './pages/EditorPage.vue'
import AuthPage from './pages/AuthPage.vue'

const router = createRouter({
  history: createWebHistory(),
  scrollBehavior: () => ({ top: 0 }),
  routes: [
    { path: '/', component: HomePage },
    { path: '/articles', component: LibraryPage },
    { path: '/articles/:slug', component: ArticlePage },
    { path: '/editor/new', component: EditorPage },
    { path: '/editor/:id', component: EditorPage },
    { path: '/templates', component: LibraryPage },
    { path: '/auth', component: AuthPage },
    { path: '/me', component: LibraryPage },
    { path: '/profile/:id', component: LibraryPage },
    { path: '/search', component: LibraryPage },
  ],
})

export default router
