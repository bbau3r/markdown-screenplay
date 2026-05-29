# Character Tagging

Character tagging enables enhanced rendering, highlighting, and rehearsal workflows.

## Characters in metadata

You can define characters in the YAML metadata so tools can recognize them consistently.

```yaml
characters:
  - Morgan V
    color: "#ffffff"
  - Elia
    color: "#11d311"
```

Each character entry can include a `color` value for UI highlighting or visual cues.

## Supported forms

- `@Name` for direct character references
- `@(Name With Spaces)` for names containing spaces
- `[Alias](Reference)` for display aliases linked to a canonical name
