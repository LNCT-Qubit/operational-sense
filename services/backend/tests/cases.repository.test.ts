
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { CaseRepository } from '../src/modules/cases/case.repository';
import type { PoolClientLike, PoolLike, QueryResult } from '../src/database/tenant';

const ORG_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CASE_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

class FakePool implements PoolLike {
  calls: { sql: string; values?: unknown[] }[] = [];
  released = false;
  releaseError: unknown;
  failSql: string | null = null;
  failRollback = false;
  updateReturnsCase = false;

  async connect(): Promise<PoolClientLike> {
    const self = this;

    return {
      query: async (sql: string, values?: unknown[]): Promise<QueryResult> => {
        self.calls.push({ sql, values });

        if (self.failSql && sql.includes(self.failSql)) {
          throw new Error('Simulated database error');
        }

        if (sql === 'ROLLBACK' && self.failRollback) {
          throw new Error('Rollback failed');
        }

        if (
          sql.includes('UPDATE operational_case') &&
          self.updateReturnsCase
        ) {
          return {
            rows: [{ case_id: CASE_ID, case_status: 'SUBMITTED' }],
            rowCount: 1,
          };
        }

        return { rows: [], rowCount: 0 };
      },

      release: (err?: unknown) => {
        self.released = true;
        self.releaseError = err;
      },
    };
  }
}

test('list: starts tenant transaction and scopes query to organization', async () => {
  const pool = new FakePool();
  const repository = new CaseRepository(pool);

  await repository.list(ORG_ID);

  const select = pool.calls.find((call) =>
    call.sql.includes('SELECT * FROM operational_case'),
  );

  assert.ok(select);
  assert.match(select.sql, /organization_id = \$1/);
  assert.equal(select.values?.[0], ORG_ID);

  assert.equal(pool.calls[0].sql, 'BEGIN');
  assert.match(pool.calls[1].sql, /set_config/);
  assert.equal(pool.calls.at(-1)?.sql, 'COMMIT');
  assert.equal(pool.released, true);
});

test('findById: filters by organization and case ID', async () => {
  const pool = new FakePool();
  const repository = new CaseRepository(pool);

  const result = await repository.findById(ORG_ID, CASE_ID);

  assert.equal(result, null);

  const select = pool.calls.find((call) =>
    call.sql.includes('SELECT * FROM operational_case'),
  );

  assert.ok(select);
  assert.match(select.sql, /organization_id = \$1 AND case_id = \$2/);
  assert.deepEqual(select.values, [ORG_ID, CASE_ID]);
});

test('submit: returns null when no editable case is found', async () => {
  const pool = new FakePool();
  const repository = new CaseRepository(pool);

  const result = await repository.submit(ORG_ID, 'tech-1', CASE_ID);

  assert.equal(result, null);

  assert.equal(
    pool.calls.some((call) => call.sql.includes('INSERT INTO audit_log')),
    false,
  );

  assert.equal(pool.calls.at(-1)?.sql, 'COMMIT');
});

test('submit: records audit entry after successful submission', async () => {
  const pool = new FakePool();
  pool.updateReturnsCase = true;

  const repository = new CaseRepository(pool);

  const result = await repository.submit(ORG_ID, 'tech-1', CASE_ID);

  assert.ok(result);
  assert.equal(result.case_id, CASE_ID);

  const audit = pool.calls.find((call) =>
    call.sql.includes('INSERT INTO audit_log'),
  );

  assert.ok(audit);
  assert.deepEqual(audit.values, [
    ORG_ID,
    'tech-1',
    'CASE_SUBMITTED',
    CASE_ID,
  ]);

  assert.equal(pool.calls.at(-1)?.sql, 'COMMIT');
});

test('database error: rolls back transaction and releases connection', async () => {
  const pool = new FakePool();
  pool.failSql = 'SELECT * FROM operational_case';

  const repository = new CaseRepository(pool);

  await assert.rejects(repository.list(ORG_ID));

  assert.ok(pool.calls.some((call) => call.sql === 'ROLLBACK'));
  assert.equal(pool.released, true);
});

test('rollback failure: connection is released with error', async () => {
  const pool = new FakePool();
  pool.failSql = 'SELECT * FROM operational_case';
  pool.failRollback = true;

  const repository = new CaseRepository(pool);

  await assert.rejects(repository.list(ORG_ID));

  assert.equal(pool.released, true);
  assert.ok(pool.releaseError);
});

test('invalid organization UUID: rejects before connecting', async () => {
  const pool = new FakePool();
  const repository = new CaseRepository(pool);

  await assert.rejects(repository.list('invalid-org'));

  assert.equal(pool.calls.length, 0);
  assert.equal(pool.released, false);
});
