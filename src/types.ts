export type ArticleStatus = 'draft' | 'published'

export interface ArticleBlock {
  id: string
  type: string
  content: Record<string, unknown>
  position: number
  layout: Record<string, unknown>
}

export interface CanvasItem {
  id: string
  type: 'text' | 'quote' | 'image' | 'code' | 'shape' | 'drawing' | 'quiz'
  x: number
  y: number
  w: number
  h: number
  content: string
  color?: string
  shape?: 'rectangle' | 'ellipse' | 'triangle' | 'arrow' | 'line'
  strokes?: Array<Array<{ x: number; y: number }>>
  questionId?: string
}

export interface ArticleCanvas {
  mode: 'block' | 'canvas'
  items: CanvasItem[]
}

export interface RevisionEntry {
  id: string
  title: string
  createdAt: string
  summary: string
}

export interface GlossaryEntry {
  term: string
  definition: string
}

export interface CommentEntry {
  id: string
  author: string
  body: string
  createdAt: string
}

export interface QuizQuestion {
  id: string
  prompt: string
  options: string[]
  answerIndex: number
  explanation: string
  type?: 'choice' | 'text'
  answerText?: string
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
  canvas?: ArticleCanvas
  quizQuestions?: QuizQuestion[]
  autoSummaryEnabled?: boolean
  revisions?: RevisionEntry[]
}

export interface AuthUser {
  id: string
  email: string
  name: string
}
