# Rendering and Implementation

All implementations should interpret `.mdsp` consistently. This includes supporting markdown inline formatting.

## Rendering expectations

- Scene headings should render as scene headings
- Scene transitions should render as transitions
- Dialogue should render as dialogue
- Parentheticals should render as parentheticals
- Inline formatting should support:
  - bold: `**text**`
  - italic: `*text*`
  - underline: `_text_`
  - strikeout: `~text~`
  - superscript: `^[text]`
  - subscript: `_[text]`
- `/` Can be used to escape any special characters to prevent interpretation
