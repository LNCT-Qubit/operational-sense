-- Operational Sense: illustrative asset hierarchy seed
-- All records are synthetic and PENDING_REVIEW.
-- Safe to rerun: matching demo assets are reused.

BEGIN;

SET LOCAL app.current_org_id =
    'b2a7dce7-b449-4381-ba3b-b520f2c88c2e';

-- M09 fix: these three models used to be referenced by hard-coded UUIDs that only existed in the
-- author's database (gen_random_uuid() values). Create them here (same designations as Step 4.5, which
-- skips them via ON CONFLICT) and look them up by class + designation.
INSERT INTO public.equipment_model (equipment_class_id, model_designation, is_illustrative) VALUES
    ('EQ-PUMP', 'KSB MegaCPK', TRUE),
    ('EQ-MOTOR', 'Siemens 1LE1', TRUE),
    ('EQ-COMP', 'Atlas Copco GA-37', TRUE)
ON CONFLICT (equipment_class_id, model_designation) DO NOTHING;

DO $seed$
DECLARE
    v_org_id uuid := 'b2a7dce7-b449-4381-ba3b-b520f2c88c2e';
    v_site_id bigint;
BEGIN
    -- Create or find the demo site.
    SELECT asset_id INTO v_site_id
    FROM public.asset_node
    WHERE organization_id = v_org_id
      AND asset_level = 'SITE'
      AND site_identifier = 'SITE-OS-001'
    ORDER BY asset_id
    LIMIT 1;

    IF v_site_id IS NULL THEN
        INSERT INTO public.asset_node (
            organization_id, parent_asset_id, asset_level,
            asset_name, model_is_illustrative,
            site_identifier, status, hierarchy_path
        )
        VALUES (
            v_org_id, NULL, 'SITE',
            'Demo Site - Operational Sense', TRUE,
            'SITE-OS-001', 'PENDING_REVIEW', '/SITE-OS-001'
        )
        RETURNING asset_id INTO v_site_id;
    END IF;

    -- Create the illustrative pump.
    IF NOT EXISTS (
        SELECT 1 FROM public.asset_node
        WHERE organization_id = v_org_id
          AND parent_asset_id = v_site_id
          AND asset_name = 'Demo Pump P-001'
    ) THEN
        INSERT INTO public.asset_node (
            organization_id, parent_asset_id, asset_level,
            asset_name, equipment_class_id, equipment_model_id,
            model_label, model_is_illustrative, status, hierarchy_path
        )
        VALUES (
            v_org_id, v_site_id, 'EQUIPMENT',
            'Demo Pump P-001', 'EQ-PUMP',
            (SELECT equipment_model_id FROM public.equipment_model WHERE equipment_class_id = 'EQ-PUMP' AND model_designation = 'KSB MegaCPK'),
            'KSB MegaCPK', TRUE, 'PENDING_REVIEW',
            '/SITE-OS-001/P-001'
        );
    END IF;

    -- Create the illustrative motor.
    IF NOT EXISTS (
        SELECT 1 FROM public.asset_node
        WHERE organization_id = v_org_id
          AND parent_asset_id = v_site_id
          AND asset_name = 'Demo Motor M-001'
    ) THEN
        INSERT INTO public.asset_node (
            organization_id, parent_asset_id, asset_level,
            asset_name, equipment_class_id, equipment_model_id,
            model_label, model_is_illustrative, status, hierarchy_path
        )
        VALUES (
            v_org_id, v_site_id, 'EQUIPMENT',
            'Demo Motor M-001', 'EQ-MOTOR',
            (SELECT equipment_model_id FROM public.equipment_model WHERE equipment_class_id = 'EQ-MOTOR' AND model_designation = 'Siemens 1LE1'),
            'Siemens 1LE1', TRUE, 'PENDING_REVIEW',
            '/SITE-OS-001/M-001'
        );
    END IF;

    -- Create the illustrative compressor.
    IF NOT EXISTS (
        SELECT 1 FROM public.asset_node
        WHERE organization_id = v_org_id
          AND parent_asset_id = v_site_id
          AND asset_name = 'Demo Compressor C-001'
    ) THEN
        INSERT INTO public.asset_node (
            organization_id, parent_asset_id, asset_level,
            asset_name, equipment_class_id, equipment_model_id,
            model_label, model_is_illustrative, status, hierarchy_path
        )
        VALUES (
            v_org_id, v_site_id, 'EQUIPMENT',
            'Demo Compressor C-001', 'EQ-COMP',
            (SELECT equipment_model_id FROM public.equipment_model WHERE equipment_class_id = 'EQ-COMP' AND model_designation = 'Atlas Copco GA-37'),
            'Atlas Copco GA-37', TRUE, 'PENDING_REVIEW',
            '/SITE-OS-001/C-001'
        );
    END IF;
END
$seed$;

COMMIT;
