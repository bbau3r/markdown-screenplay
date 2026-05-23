# Compatibility and Versioning

The `.mdsp` format should evolve in a backward-compatible way.

## Compatibility

- Existing syntax should remain readable across versions
- New features should be additive where possible
- Implementations should avoid breaking existing `.mdsp` files unexpectedly

## Versioning

- The metadata `version` field can be used by tools that need to track document evolution
- New document features should be documented here before being adopted widely
