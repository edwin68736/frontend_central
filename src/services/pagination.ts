export interface PaginatedResponse<T> {
  data: T[]
  page: number
  per_page: number
  total: number
  total_pages: number
}

export const PER_PAGE_OPTIONS = [10, 25, 50, 100] as const

export type PerPageOption = (typeof PER_PAGE_OPTIONS)[number]
