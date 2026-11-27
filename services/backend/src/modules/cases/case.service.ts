import { forbidden, notFound } from '../../http/errors';
import type { AuthContext } from '../../middleware/auth';
import type { CaseListFilter, CaseStore, CreateCaseInput, PatchCaseInput } from './case.types';

export class CaseService {
  constructor(private readonly store: CaseStore) {}

  create(ctx: AuthContext, input: CreateCaseInput) {
    if (ctx.role === 'TECHNICIAN' && input.caseStatus && !['DRAFT', 'SUBMITTED'].includes(input.caseStatus)) {
      throw forbidden('Technicians may only create cases with status DRAFT or SUBMITTED.');
    }
    return this.store.createCase(ctx.organizationId, ctx.userId, input);
  }

  list(ctx: AuthContext, filter: CaseListFilter) {
    return this.store.listCases(ctx.organizationId, filter);
  }

  async get(ctx: AuthContext, caseId: string) {
    const item = await this.store.getCase(ctx.organizationId, caseId);
    if (!item) throw notFound('Case not found.', 'CASE_NOT_FOUND');
    return item;
  }

  async patch(ctx: AuthContext, caseId: string, patch: PatchCaseInput) {
    const updated = await this.store.patchCase(ctx.organizationId, ctx.userId, caseId, patch);
    if (!updated) throw notFound('Case not found.', 'CASE_NOT_FOUND');
    return updated;
  }

  async remove(ctx: AuthContext, caseId: string) {
    const deleted = await this.store.softDeleteCase(ctx.organizationId, ctx.userId, caseId);
    if (!deleted) throw notFound('Case not found.', 'CASE_NOT_FOUND');
  }
}
