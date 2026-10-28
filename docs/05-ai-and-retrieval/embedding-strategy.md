# Embedding Strategy

Embed approved, normalized text chunks with source metadata and stable identifiers. Avoid including raw criticality scores in embedding text by default; expose `final_category` and `criticality_index` as structured metadata instead. Version the embedding model, preprocessing, chunking, and index build so retrieval results can be reproduced.
