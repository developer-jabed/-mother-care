import type { FastifyRequest } from "fastify";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface PaginationQuery {
  page?: string | number;
  limit?: string | number;
  sortBy?: string;
  sortOrder?: string;
}

export interface PaginationResult {
  page: number;
  limit: number;
  skip: number;
  take: number;           // ← Added this
  sortBy: string;
  sortOrder: "asc" | "desc";
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;
const DEFAULT_SORT_BY = "createdAt";
const DEFAULT_SORT_ORDER = "desc" as const;

// ── Helper ─────────────────────────────────────────────────────────────────────

export function calculatePagination(
  query: FastifyRequest["query"] | PaginationQuery = {},
  fallbackSortBy: string = DEFAULT_SORT_BY
): PaginationResult {
  const q = query as PaginationQuery;

  // Page
  let page = Number(q.page);
  if (!Number.isFinite(page) || page < 1) page = DEFAULT_PAGE;

  // Limit
  let limit = Number(q.limit);
  if (!Number.isFinite(limit) || limit < 1) limit = DEFAULT_LIMIT;
  if (limit > MAX_LIMIT) limit = MAX_LIMIT;

  // Skip & Take
  const skip = (page - 1) * limit;
  const take = limit;                    // ← Added

  // Sort by
  const sortBy =
    q.sortBy && typeof q.sortBy === "string" && q.sortBy.trim()
      ? q.sortBy.trim()
      : fallbackSortBy;

  // Sort order
  const sortOrder: "asc" | "desc" =
    q.sortOrder?.toLowerCase() === "asc" ? "asc" : DEFAULT_SORT_ORDER;

  return {
    page,
    limit,
    skip,
    take,           // ← Now available
    sortBy,
    sortOrder
  };
}

export function buildPaginationMeta(
  total: number,
  { page, limit }: PaginationResult
): PaginationMeta {
  const totalPages = Math.ceil(total / limit);
  return {
    page,
    limit,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
  };
}