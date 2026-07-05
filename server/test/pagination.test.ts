import { describe, expect, it } from 'vitest';
import { paginate, paginationQuerySchema } from '../src/common/pagination';

describe('server pagination re-export', () => {
  it('uses shared defaults', () => {
    expect(paginationQuerySchema.parse({})).toEqual({ page: 1, pageSize: 20 });
    expect(paginate([1], 1, { page: 1, pageSize: 20 }).pagination.totalPages).toBe(1);
  });
});
