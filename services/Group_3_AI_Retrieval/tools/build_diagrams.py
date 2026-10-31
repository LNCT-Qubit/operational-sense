"""Regenerate diagrams/architecture.png and diagrams/data_flow.png (needs matplotlib)."""
import os
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "diagrams")
COL = {"impl": "#d9ead3", "design": "#fff2cc", "ext": "#f4cccc"}


def box(ax, x, y, w, h, text, kind="impl", fs=8.5):
    ax.add_patch(FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0.02", fc=COL[kind], ec="#444", lw=1))
    ax.text(x + w / 2, y + h / 2, text, ha="center", va="center", fontsize=fs)


def arrow(ax, x1, y1, x2, y2):
    ax.annotate("", xy=(x2, y2), xytext=(x1, y1), arrowprops=dict(arrowstyle="->", color="#333"))


def legend(ax):
    for i, (k, t) in enumerate([("impl", "implemented + offline-tested"), ("design", "written; DB executed on scratch PG with MOCK vectors; real model NOT executed"), ("ext", "pending external review")]):
        ax.add_patch(FancyBboxPatch((0.2 + i * 5.3, 0.1), 0.3, 0.3, boxstyle="round,pad=0.01", fc=COL[k], ec="#444"))
        ax.text(0.6 + i * 5.3, 0.25, t, fontsize=7, va="center")


def data_flow():
    fig, ax = plt.subplots(figsize=(13, 4.6)); ax.set_xlim(0, 14); ax.set_ylim(0, 5); ax.axis("off")
    steps = [("Technician\nobservation\n(Hinglish text)", "impl"), ("Structured case\nJSON v1.0.0\n(M07 schema)", "impl"), ("Validation\nschema + semantic\n+ dataset", "impl"),
             ("Embedding text\n(symptom-side-v2)\n+ metadata (M08)", "impl"), ("Embedding\nmultilingual-e5-small\n384-d (provisional)", "design"),
             ("Vector store\nhistorical_case\npgvector (RLS)", "design"), ("Similarity query\ncosine <=> top-3\n+ filters", "design"), ("Original case\nreference + metadata\n(not a diagnosis)", "design")]
    w, g = 1.45, 0.25
    for i, (t, k) in enumerate(steps):
        x = 0.2 + i * (w + g); box(ax, x, 2.2, w, 1.6, t, k, 8)
        if i: arrow(ax, x - g, 3.0, x, 3.0)
    box(ax, 0.2, 0.8, 5.0, 0.9, "M09: 50 synthetic cases (DRAFT, demo-only) -> JSON export", "impl")
    arrow(ax, 2.7, 1.7, 2.7, 2.2)
    box(ax, 6.0, 0.8, 7.7, 0.9, "Filters kept structured (not embedded): class, subsystem, model, taxonomy, status, synthetic, review", "impl", 8)
    arrow(ax, 9.8, 1.7, 9.8, 2.2)
    ax.text(0.2, 4.5, "Data flow (Sprint 1): similarity is NOT diagnosis", fontsize=11, weight="bold")
    legend(ax); fig.savefig(os.path.join(OUT, "data_flow.png"), dpi=140, bbox_inches="tight"); plt.close(fig)


def architecture():
    fig, ax = plt.subplots(figsize=(12, 6)); ax.set_xlim(0, 13); ax.set_ylim(0, 7); ax.axis("off")
    ax.text(0.2, 6.6, "Group 3 AI & Retrieval: components", fontsize=11, weight="bold")
    box(ax, 0.3, 4.6, 3.6, 1.4, "M07  case_schema/\ncanonical_schema.json v1.0.0\nvalidator + semantic rules\nsample valid/invalid cases", "impl")
    box(ax, 4.7, 4.6, 3.6, 1.4, "M09  synthetic_dataset/\n50 cases / 350 steps (JSON)\nm09/ audit + tools/ export\nunresolved register (280)", "impl")
    box(ax, 9.1, 4.6, 3.6, 1.4, "M08  retrieval/\ntext_builder, embedder, ingest\nsearch, evaluate (NOT RUN)", "impl")
    box(ax, 2.4, 2.6, 8.2, 1.2, "integration/  mapping (JSON -> DB rows, fail-closed) + pipeline + offline runner", "impl")
    box(ax, 0.3, 0.7, 5.6, 1.3, "database/ (Group 2 baseline, migrations 001-007)\noperational_case, troubleshooting_step, historical_case vector(384)\nRLS policies; load scripts", "design")
    box(ax, 6.6, 0.7, 6.1, 1.3, "PostgreSQL 16 + pgvector (Docker)\npoc/ SQL + run_poc.sh  - Docker path NOT executed; SQL run on scratch PG (mock vectors)", "design")
    box(ax, 10.7, 2.6, 2.2, 1.2, "Expert review\n(Group 1 / QA)\nPENDING", "ext")
    for (x1, y1, x2, y2) in [(2.1, 4.6, 4.5, 3.8), (6.5, 4.6, 6.5, 3.8), (10.9, 4.6, 8.5, 3.8), (4.0, 2.6, 3.1, 2.0), (8.0, 2.6, 9.0, 2.0)]:
        arrow(ax, x1, y1, x2, y2)
    legend(ax); fig.savefig(os.path.join(OUT, "architecture.png"), dpi=140, bbox_inches="tight"); plt.close(fig)


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True); architecture(); data_flow(); print("diagrams written")
