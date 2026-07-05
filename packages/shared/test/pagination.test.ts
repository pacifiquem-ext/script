import { describe, expect, it } from 'vitest';
import { paginate, paginationQuerySchema, toSkipTake } from '../src/pagination';

describe('pagination', () => {
  it('parses defaults', () => {
    expect(paginationQuerySchema.parse({})).toEqual({ page: 1, pageSize: 20 });
  });

  it('maps page to skip/take', () => {
    expect(toSkipTake({ page: 3, pageSize: 10 })).toEqual({ skip: 20, take: 10 });
  });

  it('builds paginated envelopes', () => {
    expect(paginate(['a'], 25, { page: 2, pageSize: 10 })).toEqual({
      data: ['a'],
      pagination: { page: 2, pageSize: 10, total: 25, totalPages: 3 },
    });
  });
});
