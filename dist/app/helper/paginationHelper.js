// ── Constants ──────────────────────────────────────────────────────────────────
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;
const DEFAULT_SORT_BY = "createdAt";
const DEFAULT_SORT_ORDER = "desc";
// ── Helper ─────────────────────────────────────────────────────────────────────
export function calculatePagination(query = {}, fallbackSortBy = DEFAULT_SORT_BY) {
    const q = query;
    // Page
    let page = Number(q.page);
    if (!Number.isFinite(page) || page < 1)
        page = DEFAULT_PAGE;
    // Limit
    let limit = Number(q.limit);
    if (!Number.isFinite(limit) || limit < 1)
        limit = DEFAULT_LIMIT;
    if (limit > MAX_LIMIT)
        limit = MAX_LIMIT;
    // Skip & Take
    const skip = (page - 1) * limit;
    const take = limit; // ← Added
    // Sort by
    const sortBy = q.sortBy && typeof q.sortBy === "string" && q.sortBy.trim()
        ? q.sortBy.trim()
        : fallbackSortBy;
    // Sort order
    const sortOrder = q.sortOrder?.toLowerCase() === "asc" ? "asc" : DEFAULT_SORT_ORDER;
    return {
        page,
        limit,
        skip,
        take, // ← Now available
        sortBy,
        sortOrder
    };
}
export function buildPaginationMeta(total, { page, limit }) {
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
//# sourceMappingURL=paginationHelper.js.map