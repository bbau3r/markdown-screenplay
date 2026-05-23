# Metadata

`.mdsp` files may include optional YAML frontmatter at the top of the file.

Metadata is define by blocking it between `---`

```text
---
title: The Last Light
author: Brian
version: 1.0
---
```

## Author and Authors

You can declare a single author with `author`, or multiple authors with `authors`.

### Single author

```text
author: Brian
```

### Multiple authors

```text
authors:
- Brian
- Alaa
```

## Extensions

Metadata can be further extended to include additional types, see 04-character-tagging for the types of extensions.

## Notes

- Metadata is optional
- Metadata should be parsed consistently by all implementations
- The renderer may use title, author, authors, and version information when available
