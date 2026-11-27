
export type CaseStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'VERIFIED'
  | 'REJECTED'
  | 'REVOKED';

export type RetrievalEligibility =
  | 'demo_only_until_expert_review'
  | 'eligible'
  | 'excluded';

export type SourceReliability = 'A' | 'B' | 'C' | 'D';

export type ReviewDecision =
  | 'PENDING'
  | 'APPROVED'
  | 'APPROVED WITH CHANGES'
  | 'REJECTED';

export interface CaseRecord {
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
  created_at: Date | string;
  updated_at: Date | string;
}

export type CreateCaseInput = {
  case_reference: string;
  equipment_class_id: string;
  symptom_text: string;

  client_capture_id?: string | null;
  subsystem_id?: number | null;
  subsystem_source_label?: string | null;
  component_name?: string | null;
  equipment_model_id?: string | null;
  asset_id?: number | null;
  plant_facility?: string | null;
  production_line?: string | null;

  symptom_category?: string | null;
  symptom_structured?: string | null;
  operating_status?: string | null;
  symptom_frequency?: string | null;
  severity_proposed?: string | null;

  primary_suspected_cause?: string | null;
  alternative_causes?: string | null;
  confirmed_cause?: string | null;
  root_cause_confirmation?: string | null;
  failure_mechanism?: string | null;
  failure_effect?: string | null;
  differential_diagnosis?: string | null;
  corrective_action_text?: string | null;
  required_spares_text?: string | null;
  post_repair_verification?: string | null;
  acceptance_criteria?: string | null;
  recurrence_prevention?: string | null;
  early_warning?: string | null;

  case_origin?: string | null;
  evidence_type?: string | null;
  source_reliability?: SourceReliability | null;
  is_synthetic?: boolean;
  model_is_illustrative?: boolean;
  needs_depth_expansion?: boolean;
};

export type UpdateCaseInput = Partial<CreateCaseInput>;

export interface CaseListFilters {
  status?: CaseStatus;
  equipment_class_id?: string;
  asset_id?: number;
  limit?: number;
  offset?: number;
}

export interface CaseReviewInput {
  decision: Exclude<ReviewDecision, 'PENDING'>;
  comments?: string | null;
  technical_accuracy_status?: string;
  taxonomy_mapping_status?: string | null;
  source_verification_status?: string;
  safety_review_status?: string;
  measurement_validation_status?: string;
}

export interface CaseReviewRecord {
  verification_id: number;
  case_id: string;
  reviewer: string | null;
  review_date: string | null;
  technical_accuracy_status: string;
  taxonomy_mapping_status: string | null;
  source_verification_status: string;
  safety_review_status: string;
  measurement_validation_status: string;
  overall_decision: ReviewDecision;
  comments: string | null;
}
