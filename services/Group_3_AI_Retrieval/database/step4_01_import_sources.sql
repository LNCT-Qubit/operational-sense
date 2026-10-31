-- Operational Sense Step 4.1: import source reference records
-- Generated from the workbook's Sources sheet (14 rows).
-- Safe to rerun: existing source_id values are left unchanged.
-- This does NOT mark any source as verified; the DB default remains not_verified.

BEGIN;

INSERT INTO public.source_reference
    (source_id, title, publisher, identifier, url, access_level, reliability_class, supports)
VALUES
    ('S01', 'ISO 14224:2016 Petroleum, petrochemical and natural gas industries - Collection and exchange of reliability and maintenance data for equipment', 'ISO', 'ISO 14224:2016', 'https://www.iso.org/standard/64076.html', 'URL taken from project Source_Register; full text NOT inspected', 'A', 'FMEA/taxonomy structure (informs, not formally complied with)'),
    ('S02', 'IEC 60812:2018 Failure modes and effects analysis (FMEA and FMECA)', 'IEC', 'IEC 60812:2018', 'https://webstore.iec.ch/en/publication/26359', 'URL taken from project Source_Register; full text NOT inspected', 'A', 'Separation of failure mode / effect / cause / action'),
    ('S03', 'ISO 20816-1:2016 Mechanical vibration - Measurement and evaluation of machine vibration - Part 1: General guidelines', 'ISO', 'ISO 20816-1:2016', 'https://www.iso.org/standard/63180.html', 'Scope/abstract read via web search this session; clauses and zone limits NOT read', 'A', 'Vibration measurement/evaluation approach (no numeric limits used)'),
    ('S04', 'ISO 20816-3:2022 Mechanical vibration - Measurement and evaluation of machine vibration - Part 3: Industrial machinery with power above 15 kW and speeds 120-30 000 r/min', 'ISO', 'ISO 20816-3:2022', 'URL not verified this session', 'Title confirmed from search snippet; content NOT inspected', 'A', 'Applicable vibration evaluation for larger machines'),
    ('S05', 'ISO 281 Rolling bearings - Dynamic load ratings and rating life', 'ISO', 'ISO 281', 'URL not verified this session', 'Cited in project FMEA_Taxonomy source column; NOT inspected', 'A', 'Bearing life/lubrication principles'),
    ('S06', 'ISO 21049 / API 682 Pumps - Shaft sealing systems for centrifugal and rotary pumps', 'ISO / API', 'ISO 21049; API 682', 'URL not verified this session', 'Cited in project FMEA_Taxonomy source column; NOT inspected', 'A', 'Mechanical seal practice'),
    ('S07', 'IEEE Std 43 Recommended Practice for Testing Insulation Resistance of Electric Machinery', 'IEEE', 'IEEE Std 43 (edition to be confirmed)', 'URL not verified this session', 'Identifier recalled, NOT verified or inspected; edition/year to be confirmed', 'A', 'Insulation resistance/PI test method; limits must be taken from licensed copy/OEM'),
    ('S08', 'ANSI/HI 9.6.1 Rotodynamic Pumps - Guideline for NPSH Margin', 'Hydraulic Institute', 'ANSI/HI 9.6.1 (edition to be confirmed)', 'URL not verified this session', 'Identifier recalled, NOT verified or inspected', 'A', 'NPSH margin principle for cavitation cases'),
    ('S09', 'ISO 8573-1 Compressed air - Contaminants and purity classes', 'ISO', 'ISO 8573-1', 'URL not verified this session', 'Identifier recalled, NOT verified or inspected', 'A', 'Oil/water purity classes for downstream air checks'),
    ('S10', '29 CFR 1910.147 The control of hazardous energy (lockout/tagout)', 'OSHA', '29 CFR 1910.147', 'https://www.osha.gov/laws-regs/regulations/standardnumber/1910/1910.147', 'URL from general knowledge, NOT fetched this session; site/legal procedure governs in India', 'A', 'LOTO principle (general guidance only)'),
    ('S11', 'NFPA 70E Standard for Electrical Safety in the Workplace', 'NFPA', 'NFPA 70E', 'URL not verified this session', 'Identifier recalled, NOT verified or inspected', 'A', 'Electrical work safety principle'),
    ('S12', 'G1_Failure_Mode_and_FMEA_Taxonomy_v1.0.xlsx (project taxonomy)', 'Team LNCT Qubit G1', 'Project file', 'n/a (internal)', 'Fully read; all rows are Engineering Assumption / pending domain review', 'D', 'Taxonomy source of truth'),
    ('S13', 'G1_Equipment_Wise_Symptom_Cause_Action_Reference_v1.0.xlsx (original cases)', 'Team LNCT Qubit G1', 'Project file', 'n/a (internal)', 'Fully read; seed/synthetic', 'D', 'Original 34 cases'),
    ('S14', 'Engineering interpretation by author of this workbook (general rotating-machinery reliability principles)', 'This workbook', NULL, NULL, 'No OEM manual consulted for any case', 'D', 'Case narratives, differential diagnosis, corrective-action outlines')
ON CONFLICT (source_id) DO NOTHING;

-- Verify source count after import.
SELECT COUNT(*) AS source_reference_rows
FROM public.source_reference;

COMMIT;
