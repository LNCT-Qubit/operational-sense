-- PostgreSQL integration checks. Run only against a disposable database after migration + seed.
BEGIN;

DO $m06_tests$
DECLARE
    root_id BIGINT;
    child_id BIGINT;
    grandchild_id BIGINT;
    descendant_count INTEGER;
BEGIN
    -- Seed preconditions and repeatability outcome are asserted by validation/03.
    IF (SELECT COUNT(*) FROM public.equipment_class WHERE equipment_class_id IN ('EQ-PUMP','EQ-MOTOR','EQ-COMP')) <> 3 THEN
        RAISE EXCEPTION 'Expected all three equipment class seed rows';
    END IF;

    -- Invalid parent must be rejected by FK.
    BEGIN
        INSERT INTO public.asset_node (parent_asset_id, asset_level, asset_name)
        VALUES (9223372036854775000, 'TEST', 'invalid-parent-test');
        RAISE EXCEPTION 'Expected missing parent FK rejection, but insert succeeded';
    EXCEPTION WHEN foreign_key_violation THEN
        NULL;
    END;

    -- A duplicate class ID must be rejected by the primary key.
    BEGIN
        INSERT INTO public.equipment_class
            (equipment_class_id, class_name, description, review_status, source_sheet, source_row_number)
        VALUES ('EQ-PUMP', 'duplicate test', 'duplicate test', 'PENDING_REVIEW', 'test', 2);
        RAISE EXCEPTION 'Expected duplicate class ID rejection, but insert succeeded';
    EXCEPTION WHEN unique_violation THEN
        NULL;
    END;

    -- Invalid class ID in component reference must be rejected by FK.
    BEGIN
        INSERT INTO public.m06_equipment_component_reference
            (equipment_class_id, equipment_class, subsystem_assembly, subsystem_id_source_value,
             component_maintainable_item, taxonomy_code, source_sheet, source_row_number,
             model_information_note, review_status)
        VALUES ('EQ-UNKNOWN', 'Unknown', 'Test subsystem', 'Not defined in taxonomy (no subsystem ID)',
                'Test component', 'TEST.CODE', 'test_fixture', 9001, 'Test only', 'PENDING_REVIEW');
        RAISE EXCEPTION 'Expected component class FK rejection, but insert succeeded';
    EXCEPTION WHEN foreign_key_violation THEN
        NULL;
    END;

    -- Build a three-node tree and assert the recursive query sees all descendants.
    INSERT INTO public.asset_node (asset_level, asset_name, status)
    VALUES ('TEST_ROOT', 'm06-test-root', 'PENDING_REVIEW')
    RETURNING asset_id INTO root_id;

    INSERT INTO public.asset_node (parent_asset_id, asset_level, asset_name, equipment_class_id, status)
    VALUES (root_id, 'TEST_CHILD', 'm06-test-child', 'EQ-PUMP', 'PENDING_REVIEW')
    RETURNING asset_id INTO child_id;

    INSERT INTO public.asset_node (parent_asset_id, asset_level, asset_name, status)
    VALUES (child_id, 'TEST_GRANDCHILD', 'm06-test-grandchild', 'PENDING_REVIEW')
    RETURNING asset_id INTO grandchild_id;

    WITH RECURSIVE descendants(asset_id, depth, path) AS (
        SELECT asset_id, 0, ARRAY[asset_id]::BIGINT[]
        FROM public.asset_node WHERE asset_id = root_id
        UNION ALL
        SELECT child.asset_id, parent.depth + 1, parent.path || child.asset_id
        FROM public.asset_node child
        JOIN descendants parent ON child.parent_asset_id = parent.asset_id
        WHERE NOT child.asset_id = ANY(parent.path)
    )
    SELECT COUNT(*) INTO descendant_count FROM descendants;

    IF descendant_count <> 3 THEN
        RAISE EXCEPTION 'Expected 3 nodes in test hierarchy; found %', descendant_count;
    END IF;

    -- Attempting to set root's parent to its grandchild must be rejected as a cycle.
    BEGIN
        UPDATE public.asset_node SET parent_asset_id = grandchild_id WHERE asset_id = root_id;
        RAISE EXCEPTION 'Expected cycle rejection, but update succeeded';
    EXCEPTION WHEN check_violation THEN
        NULL;
    END;

    -- The rejected update must leave the root node unparented.
    IF (SELECT parent_asset_id FROM public.asset_node WHERE asset_id = root_id) IS NOT NULL THEN
        RAISE EXCEPTION 'Cycle-rejected update unexpectedly changed root parent';
    END IF;

    -- Self-parent check is also explicitly exercised.
    BEGIN
        UPDATE public.asset_node SET parent_asset_id = asset_id WHERE asset_id = root_id;
        RAISE EXCEPTION 'Expected self-parent rejection, but update succeeded';
    EXCEPTION WHEN check_violation THEN
        NULL;
    END;
END
$m06_tests$;

ROLLBACK;
