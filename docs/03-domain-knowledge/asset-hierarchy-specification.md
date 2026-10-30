# Hierarchy and relationships

## Candidate hierarchy

```text
EQUIPMENT_CLASS
    └── classifies ASSET_NODE when equipment_class_id is supplied

ASSET_NODE
    └── parent_asset_id → ASSET_NODE.asset_id
        └── arbitrary-depth parent/child hierarchy

EQUIPMENT_CLASS
    └── M06_EQUIPMENT_COMPONENT_REFERENCE
        └── source subsystem/assembly + component/maintainable item + taxonomy code
```

The hierarchy is represented as an arbitrary-depth adjacency list. The SQL does **not** enforce `Plant → Area → System → Equipment → Component`, because M04 says that rule requires Group 1 approval and Q01 is open. It also does not treat `Subsystem / Assembly` labels as physical nodes. They remain source-backed reference metadata until the team decides otherwise.

## Integrity behavior implemented in candidate SQL

- `asset_node.parent_asset_id` references `asset_node.asset_id`.
- `asset_node.equipment_class_id` references `equipment_class.equipment_class_id`.
- Component-reference rows reference an existing equipment class.
- A node cannot parent itself.
- A trigger walks the prospective parent chain and rejects cycles.
- Parent-link edits take a transaction-scoped advisory lock to serialize cycle checks.
- Foreign keys use `ON UPDATE RESTRICT` and `ON DELETE RESTRICT`.
- Nonblank checks protect required labels and metadata.
- Indexes support parent and equipment-class lookups.

## Not enforced yet

- Allowed `asset_level` values and parent/child level combinations.
- Whether every equipment node must have a class and non-equipment nodes must not.
- Global vs parent-scoped name/site uniqueness.
- Whether `EquipmentModel` is a separate entity. M04 currently places `model_label` and `model_is_illustrative` on `ASSET_NODE`, while the repository README describes a distinct EquipmentModel concept.
- Subsystem-as-node vs metadata.
- Lifecycle status vocabulary.

Those decisions are review blockers, not silent omissions.
