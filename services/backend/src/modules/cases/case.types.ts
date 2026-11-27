export type CaseStatus = 'DRAFT' | 'SUBMITTED' | 'VERIFIED' | 'REJECTED' | 'REVOKED';
export type RetrievalEligibility = 'demo_only_until_expert_review' | 'eligible' | 'excluded';
export type SourceReliability = 'A' | 'B' | 'C' | 'D';

export interface OperationalCaseRow {
  case_id: string;
  case_reference: string;
  organization_id: string;
  client_capture_id: string | null;
  equipment_class_id: string;
  subsystem_id: number | null;
  subsystem_source_label: string | null;
  component_name: string | null;
  equipment_model_id: string | null;
  asset_id: number | null;
  plant_facility: string | null;
  production_line: string | null;
  case_title: string | null;
  symptom_category: string | null;
  symptom_text: string;
  symptom_structured: string | null;
  operating_status: string | null;
  symptom_frequency: string | null;
  severity_proposed: string | null;
  primary_suspected_cause: string | null;
  alternative_causes: string | null;
  confirmed_cause: string | null;
  root_cause_confirmation: string | null;
  failure_mechanism: string | null;
  failure_effect: string | null;
  differential_diagnosis: string | null;
  corrective_action_text: string | null;
  required_spares_text: string | null;
  post_repair_verification: string | null;
  acceptance_criteria: string | null;
  recurrence_prevention: string | null;
  early_warning: string | null;
  case_origin: string | null;
  evidence_type: string | null;
  source_reliability: SourceReliability | null;
  is_synthetic: boolean;
  model_is_illustrative: boolean;
  needs_depth_expansion: boolean;
  case_status: CaseStatus;
  retrieval_eligibility: RetrievalEligibility;
  verification_duration_seconds: number | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  rank?: number;
}

export interface CreateCaseInput {
  caseReference?: string;
  clientCaptureId?: string | null;
  equipmentClassId: string;
  subsystemId?: number | null;
  subsystemSourceLabel?: string | null;
  componentName?: string | null;
  equipmentModelId?: string | null;
  assetId?: number | null;
  plantFacility?: string | null;
  productionLine?: string | null;
  caseTitle?: string | null;
  symptomCategory?: string | null;
  symptomText: string;
  symptomStructured?: string | null;
  operatingStatus?: string | null;
  symptomFrequency?: string | null;
  severityProposed?: string | null;
  primarySuspectedCause?: string | null;
  alternativeCauses?: string | null;
  confirmedCause?: string | null;
  rootCauseConfirmation?: string | null;
  failureMechanism?: string | null;
  failureEffect?: string | null;
  differentialDiagnosis?: string | null;
  correctiveActionText?: string | null;
  requiredSparesText?: string | null;
  postRepairVerification?: string | null;
  acceptanceCriteria?: string | null;
  recurrencePrevention?: string | null;
  earlyWarning?: string | null;
  caseOrigin?: string | null;
  evidenceType?: string | null;
  sourceReliability?: SourceReliability | null;
  isSynthetic?: boolean;
  modelIsIllustrative?: boolean;
  needsDepthExpansion?: boolean;
  caseStatus?: CaseStatus;
  retrievalEligibility?: RetrievalEligibility;
}

export type PatchCaseInput = Partial<CreateCaseInput>;

export interface CaseListFilter {
  limit: number;
  offset: number;
  status?: CaseStatus;
  equipmentClassId?: string;
  subsystemId?: number;
  q?: string;
}

export interface CaseStore {
  createCase(
    organizationId: string,
    actorId: string,
    input: CreateCaseInput,
  ): Promise<{ item: OperationalCaseRow; created: boolean }>;
  listCases(organizationId: string, filter: CaseListFilter): Promise<{ items: OperationalCaseRow[]; total: number }>;
  getCase(organizationId: string, caseId: string): Promise<OperationalCaseRow | null>;
  patchCase(organizationId: string, actorId: string, caseId: string, patch: PatchCaseInput): Promise<OperationalCaseRow | null>;
  softDeleteCase(organizationId: string, actorId: string, caseId: string): Promise<boolean>;
}
