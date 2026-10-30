# Relationship diagram notes

The diagram represents a provisional M06 candidate, not an approved ERD.

- `equipment_class` provides the three Group 1 class identifiers.
- `asset_node` uses an adjacency list and a self-FK; a trigger rejects cycles.
- `m06_equipment_component_reference` preserves 30 source mapping rows under a class FK.
- Subsystem/assembly labels are metadata, because the source provides no subsystem IDs and M04 Q01 remains open.
- M04 approval, M05 schema integration, and the backend stack discrepancy remain unresolved.
