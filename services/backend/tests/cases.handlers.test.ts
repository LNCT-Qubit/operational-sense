
import test from 'node:test';
import assert from 'node:assert/strict';

import { createCaseHandlers } from '../src/modules/cases/case.handlers';
import type { CaseService } from '../src/modules/cases/case.service';
import { errorMiddleware } from '../src/http/errors';
import { silentLogger } from '../src/http/logger';
import { ctx } from './helpers/fakes';

const CASE_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

function rig() {
  const calls: { method: string; args: unknown[] }[] = [];

  const service = {
    create: async (...args: unknown[]) => {
      calls.push({ method: 'create', args });
      return { case_id: CASE_ID, case_status: 'DRAFT' };
    },
    get: async (...args: unknown[]) => {
      calls.push({ method: 'get', args });
      return { case_id: CASE_ID };
    },
    list: async (...args: unknown[]) => {
      calls.push({ method: 'list', args });
      return [{ case_id: CASE_ID }];
    },
    update: async (...args: unknown[]) => {
      calls.push({ method: 'update', args });
      return { case_id: CASE_ID };
    },
    submit: async (...args: unknown[]) => {
      calls.push({ method: 'submit', args });
      return { case_id: CASE_ID, case_status: 'SUBMITTED' };
    },
    review: async (...args: unknown[]) => {
      calls.push({ method: 'review', args });
      return { verification_id: 1, case_id: CASE_ID };
    },
  };

  const handlers = createCaseHandlers(service as unknown as CaseService);

  return { handlers, calls };
}

async function call(handler: any, req: Partial<any> = {}) {
  const out: any = { status: 200, body: undefined };

  const res = {
    status(code: number) {
      out.status = code;
      return res;
    },
    json(body: unknown) {
      out.body = body;
      return res;
    },
    setHeader() {
      return res;
    },
  };

  const full = {
    method: 'POST',
    headers: {},
    params: {},
    query: {},
    body: {},
    auth: ctx(),
    correlationId: 'corr-12345678',
    ...req,
  };

  await new Promise<void>((resolve) => {
    handler(full, res, (err: unknown) => {
      errorMiddleware(silentLogger)(
        err,
        full as any,
        res as any,
        () => {},
      );
      resolve();
    });

    const tick = setInterval(() => {
      if (out.body !== undefined) {
        clearInterval(tick);
        resolve();
      }
    }, 1);
  });

  return out;
}

test('create: valid request returns 201 and case', async () => {
  const { handlers, calls } = rig();

  const r = await call(handlers.create, {
    body: {
      case_reference: 'CASE-001',
      equipment_class_id: 'PUMP',
      symptom_text: 'Pump vibration',
    },
  });

  assert.equal(r.status, 201);
  assert.equal(r.body.case.case_id, CASE_ID);
  assert.equal(calls[0].method, 'create');
});

test('create: invalid body returns 400', async () => {
  const { handlers } = rig();

  const r = await call(handlers.create, { body: null });

  assert.equal(r.status, 400);
  assert.equal(r.body.error.code, 'INVALID_BODY');
});

test('get: malformed case ID returns 400', async () => {
  const { handlers, calls } = rig();

  const r = await call(handlers.get, {
    params: { id: 'invalid-id' },
  });

  assert.equal(r.status, 400);
  assert.equal(r.body.error.code, 'INVALID_ID');
  assert.equal(calls.length, 0);
});

test('get: valid case ID returns 200', async () => {
  const { handlers, calls } = rig();

  const r = await call(handlers.get, {
    params: { id: CASE_ID },
  });

  assert.equal(r.status, 200);
  assert.equal(r.body.case.case_id, CASE_ID);
  assert.equal(calls[0].method, 'get');
});

test('list: invalid status returns 400', async () => {
  const { handlers, calls } = rig();

  const r = await call(handlers.list, {
    query: { status: 'INVALID' },
  });

  assert.equal(r.status, 400);
  assert.equal(r.body.error.code, 'INVALID_STATUS');
  assert.equal(calls.length, 0);
});

test('list: invalid pagination returns 400', async () => {
  const { handlers, calls } = rig();

  for (const query of [
    { limit: '0' },
    { limit: '101' },
    { limit: 'abc' },
    { offset: '-1' },
  ]) {
    const r = await call(handlers.list, { query });

    assert.equal(r.status, 400);
    assert.equal(r.body.error.code, 'INVALID_QUERY');
  }

  assert.equal(calls.length, 0);
});

test('list: valid filters return 200', async () => {
  const { handlers, calls } = rig();

  const r = await call(handlers.list, {
    query: {
      status: 'DRAFT',
      equipment_class_id: 'PUMP',
      limit: '10',
      offset: '0',
    },
  });

  assert.equal(r.status, 200);
  assert.equal(r.body.count, 1);
  assert.equal(calls[0].method, 'list');
});

test('update: invalid body returns 400', async () => {
  const { handlers, calls } = rig();

  const r = await call(handlers.update, {
    params: { id: CASE_ID },
    body: null,
  });

  assert.equal(r.status, 400);
  assert.equal(r.body.error.code, 'INVALID_BODY');
  assert.equal(calls.length, 0);
});

test('update: valid request returns 200', async () => {
  const { handlers, calls } = rig();

  const r = await call(handlers.update, {
    params: { id: CASE_ID },
    body: { symptom_text: 'Updated pump vibration' },
  });

  assert.equal(r.status, 200);
  assert.equal(r.body.case.case_id, CASE_ID);
  assert.equal(calls[0].method, 'update');
});

test('submit: valid case ID returns 200', async () => {
  const { handlers, calls } = rig();

  const r = await call(handlers.submit, {
    params: { id: CASE_ID },
  });

  assert.equal(r.status, 200);
  assert.equal(r.body.case.case_status, 'SUBMITTED');
  assert.equal(calls[0].method, 'submit');
});

test('review: invalid body returns 400', async () => {
  const { handlers, calls } = rig();

  const r = await call(handlers.review, {
    params: { id: CASE_ID },
    body: null,
  });

  assert.equal(r.status, 400);
  assert.equal(r.body.error.code, 'INVALID_BODY');
  assert.equal(calls.length, 0);
});

test('review: valid request returns 200', async () => {
  const { handlers, calls } = rig();

  const r = await call(handlers.review, {
    params: { id: CASE_ID },
    body: {
      decision: 'APPROVED',
      comments: 'Verified',
    },
  });

  assert.equal(r.status, 200);
  assert.equal(r.body.review.verification_id, 1);
  assert.equal(calls[0].method, 'review');
});
