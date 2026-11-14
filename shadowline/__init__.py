"""SHADOWLINE: NFL Combine-to-Game movement intelligence pipeline.

Research pipeline for the NFL Big Data Bowl 2027 competition
("Combine to NFL Performance", https://www.kaggle.com/competitions/nfl-big-data-bowl-2027).

Design contract
---------------
* Every analytical claim originates from the actual competition datasets.
* When a required dataset is absent, the pipeline emits a machine-readable
  "gated_on_data" status and produces NO statistical claims.
* Synthetic fixtures are used ONLY for unit/integration tests of mathematical
  functions and for a clearly-labelled algorithm demonstration; they are never
  presented as NFL results.
* All outputs are versioned, checksummed and deterministic (fixed seeds).
"""

PIPELINE_NAME = "shadowline"
PIPELINE_VERSION = "1.0.0"
METRIC_VERSION = "mri-1.0"  # Mirror Response Index metric family version
ARTIFACT_SCHEMA_VERSION = 1
