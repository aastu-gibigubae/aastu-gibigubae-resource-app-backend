// FR-3.5 — offset pagination for GET /courses and
// GET /courses/:id/resources. Deliberately two small pure functions
// rather than one that also runs the query: this file has no Prisma
// import and no dependency on any module — it doesn't know what's
// being paginated, only how to turn { page, limit } into Prisma's
// { skip, take } shape, and how to turn a known total into the
// { page, limit, total, total_pages } envelope. The caller (catalog
// module) runs its own findMany + count and wires the two together.

export interface PageParams {
  page: number;
  limit: number;
}

export interface PrismaSkipTake {
  skip: number;
  take: number;
}

export interface PaginationEnvelope {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
}

export const toSkipTake = ({ page, limit }: PageParams): PrismaSkipTake => ({
  skip: (page - 1) * limit,
  take: limit,
});

// Math.ceil, not integer division — 21 items at limit 20 is 2 pages,
// not 1. total_pages is 0 (not 1) when total is 0 — an empty result
// set has zero pages of results, not one empty page.
export const buildPaginationEnvelope = (
  { page, limit }: PageParams,
  total: number,
): PaginationEnvelope => ({
  page,
  limit,
  total,
  total_pages: total === 0 ? 0 : Math.ceil(total / limit),
});