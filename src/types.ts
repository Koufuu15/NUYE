export type ArticleStatus = 'draft' | 'published'

export interface ArticleBlock {
  id: string
  type: string
  content: Record<string, unknown>
  position: number
  layout: Record<string, unknown>
}

export interface Article {
  id: string
  slug: string
  title: string
  summary: string
  category: string
  tags: string[]
  cover: string
  content: Record<string, unknown>
  status: ArticleStatus
  updatedAt: string
  publishedAt?: string
  authorId?: string
}

export interface AuthUser {
  id: string
  email: string
  name: string
}
