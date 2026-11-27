
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { CaseService } from '../src/modules/cases/case.service';
import type { CaseRepository } from '../src/modules/cases/case.repository';
import type {
  CaseRecord,
  CreateCaseInput,
  CaseReviewInput,
} from '../src/modules/cases/case.types';

import { ORG_A, ORG_B, ctx } from './helpers/fakes';

const CASE_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const input: CreateCaseInput = {
  case_reference: 'CASE-001',
  equipment_class_id: 'PUMP',
  symptom_text: 'Pump vibration is excessive',
};

function makeRecord(orgId = ORG_A): CaseRecord {
  return {
    case_id: CASE_ID,
    case_reference: 'CASE-001',
    organization_id: orgId,
    client_capture_id: null,
    equipment_class_id: 'PUMP',
    subsystem_id: null,
    subsystem_source_label: null,
    component_name: null,
    equipment_model_id: null,
    asset_id: null,
    plant_facility: null,
    production_line: null,
    symptom_category: null,
    symptom_text: 'Pump vibration is excessive',
    symptom_structured: null,
    operating_status: null,
    symptom_frequency: null,
    severity_proposed: null,
    primary_suspected_cause: null,
    alternative_causes: null,
    confirmed_cause: null,
    root_cause_confirmation: null,
    failure_mechanism: null,
    failure_effect: null,
    differential_diagnosis: null,
    corrective_action_text: null,
    required_spares_text: null,
    post_repair_verification: null,
    acceptance_criteria: null,
    recurrence_prevention: null,
    early_warning: null,
    case_origin: null,
    evidence_type: null,
    source_reliability: null,
    is_synthetic: true,
    model_is_illustrative: true,
    needs_depth_expansion: false,
    case_status: 'DRAFT',
    retrieval_eligibility: 'demo_only_until_expert_review',
    verification_duration_seconds: null,
    created_at: new Date(),
    updated_at: new Date(),
  };
}

function makeService() {
  const calls: { method: string; args: unknown[] }[] = [];
  const record = makeRecord();

  const repository = {
    create: async (...args: unknown[]) => {
      calls.push({ method: 'create', args });
      return record;
    },
    findById: async (...args: unknown[]) => {
      calls.push({ method: 'findById', args });
      return record;
    },
    list: async (...args: unknown[]) => {
      calls.push({ method: 'list', args });
      return [record];
    },
    update: async (...args: unknown[]) => {
      calls.push({ method: 'update', args });
      return record;
    },
    submit: async (...args: unknown[]) => {
      calls.push({ method: 'submit', args });
      return record;
    },
    review: async (...args: unknown[]) => {
      calls.push({ method: 'review', args });
      return { verification_id: 1, case_id: CASE_ID };
    },
  };

  const service = new CaseService(
    repository as unknown as CaseRepository,
  );

  return { service, calls, record };
}

test('create: valid case is created using authenticated organization and user', async () => {
  const { service, calls, record } = makeService();

  const result = await service.create(ctx(), input);

  assert.equal(result, record);
  assert.equal(calls[0].method, 'create');
  assert.equal(calls[0].args[0], ORG_A);
  assert.equal(calls[0].args[1], 'tech-1');
});

test('create: missing case reference is rejected', async () => {
  const { service } = makeService();

  await assert.rejects(
    service.create(ctx(), { ...input, case_reference: ' ' }),
  );
});

test('create: missing equipment class is rejected', async () => {
  const { service } = makeService();

  await assert.rejects(
    service.create(ctx(), { ...input, equipment_class_id: '' }),
  );
});

test('create: missing symptom description is rejected', async () => {
  const { service } = makeService();

  await assert.rejects(
    service.create(ctx(), { ...input, symptom_text: ' ' }),
  );
});

test('create: client cannot provide confirmed diagnosis', async () => {
  const { service, calls } = makeService();

  await assert.rejects(
    service.create(ctx(), {
      ...input,
      confirmed_cause: 'Bearing failure',
    }),
  );

  assert.equal(calls.length, 0);
});

test('get: case lookup uses authenticated organization', async () => {
  const { service, calls, record } = makeService();

  const result = await service.get(ctx({ organizationId: ORG_B }), CASE_ID);

  assert.equal(result, record);
  assert.deepEqual(calls[0].args, [ORG_B, CASE_ID]);
});

test('list: organization scope and filters are forwarded', async () => {
  const { service, calls } = makeService();

  await service.list(ctx({ organizationId: ORG_B }), {
    status: 'DRAFT',
    equipment_class_id: 'PUMP',
    limit: 10,
    offset: 0,
  });

  assert.equal(calls[0].method, 'list');
  assert.equal(calls[0].args[0], ORG_B);
  assert.deepEqual(calls[0].args[1], {
    status: 'DRAFT',
    equipment_class_id: 'PUMP',
    limit: 10,
    offset: 0,
  });
});

test('update: confirmed diagnosis fields are rejected', async () => {
  const { service, calls } = makeService();

  await assert.rejects(
    service.update(ctx(), CASE_ID, {
      confirmed_cause: 'Bearing failure',
    }),
  );

  assert.equal(calls.length, 0);
});

test('update: empty update is rejected without calling repository', async () => {
  const { service, calls } = makeService();

  await assert.rejects(
    service.update(ctx(), CASE_ID, {}),
  );

  assert.equal(calls.length, 0);
});

test('update: valid update uses organization and actor identity', async () => {
  const { service, calls } = makeService();

  await service.update(ctx(), CASE_ID, {
    symptom_text: 'Pump vibration increased',
  });

  assert.equal(calls[0].method, 'update');
  assert.deepEqual(calls[0].args, [
    ORG_A,
    'tech-1',
    CASE_ID,
    { symptom_text: 'Pump vibration increased' },
  ]);
});

test('submit: case submission uses authenticated organization', async () => {
  const { service, calls } = makeService();

  await service.submit(ctx({ organizationId: ORG_B }), CASE_ID);

  assert.equal(calls[0].method, 'submit');
  assert.deepEqual(calls[0].args, [
    ORG_B,
    'tech-1',
    CASE_ID,
  ]);
});

test('review: technician cannot review a case', async () => {
  const { service, calls } = makeService();

  await assert.rejects(
    service.review(ctx({ role: 'TECHNICIAN' }), CASE_ID, {
      decision: 'APPROVED',
    }),
  );

  assert.equal(calls.length, 0);
});

test('review: supervisor can approve a submitted case', async () => {
  const { service, calls } = makeService();

  const review: CaseReviewInput = {
    decision: 'APPROVED',
    comments: 'Technical details verified',
  };

  await service.review(
    ctx({ role: 'SUPERVISOR' }),
    CASE_ID,
    review,
  );

  assert.equal(calls[0].method, 'review');
  assert.deepEqual(calls[0].args, [
    ORG_A,
    'tech-1',
    CASE_ID,
    review,
  ]);
});

test('review: reliability engineer can reject a case', async () => {
  const { service, calls } = makeService();

  await service.review(
    ctx({ role: 'RELIABILITY_ENGINEER' }),
    CASE_ID,
    { decision: 'REJECTED' },
  );

  assert.equal(calls[0].method, 'review');
});

test('review: invalid decision is rejected', async () => {
  const { service, calls } = makeService();

  await assert.rejects(
    service.review(
      ctx({ role: 'ADMIN' }),
      CASE_ID,
      { decision: 'PENDING' } as unknown as CaseReviewInput,
    ),
  );

  assert.equal(calls.length, 0);
});
