# Architecture & Entity-Relationship Diagrams

This directory contains the canonical architecture, ER diagrams, and editable diagram sources for Operational Sense.

---

## 1. Entity-Relationship Diagrams (ERDs)

Derived from M04 Database Architecture v1.2:

| Diagram | Description | Formats |
|---|---|---|
| **Core Operational Case ERD** | Authoritative model for `operational_case`, `troubleshooting_step`, and case mappings. | [PNG](M04_ERD_Core.png) \| [SVG](M04_ERD_Core.svg) \| [DOT](M04_ERD_Core.dot) |
| **Reference Entities ERD** | Source references, safety procedures, measurements, and spare parts. | [PNG](M04_ERD_References.png) \| [SVG](M04_ERD_References.svg) \| [DOT](M04_ERD_References.dot) |
| **Assessment & Status ERD** | Case verification lifecycle, inspection tiers, and audit log models. | [PNG](M04_ERD_Assessment.png) \| [SVG](M04_ERD_Assessment.svg) \| [DOT](M04_ERD_Assessment.dot) |
| **Unified Mermaid ERD** | Editable cross-module Mermaid definition. | [MMD](M04_ERD_Editable_Mermaid.mmd) |

---

## 2. Equipment Hierarchy & Taxonomy Diagrams

Derived from M06 Asset Hierarchy Metadata v2.0:

| Diagram | Description | Formats |
|---|---|---|
| **Equipment Hierarchy** | Physical plant asset DAG (`asset_node`) and taxonomy mapping (`class_subsystem`). | [PNG](equipment_hierarchy.png) \| [SVG](equipment_hierarchy.svg) \| [MMD](equipment_hierarchy.mmd) \| [DOT](equipment_hierarchy.dot) |
| **Relationship Notes** | Semantic definitions and cycle-prevention rules. | [Notes](relationship_notes.md) |
