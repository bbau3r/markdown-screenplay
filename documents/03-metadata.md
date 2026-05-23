# Metadata

`.mdsp` files may include optional YAML frontmatter at the top of the file.

## Example

---

title: The Last Light
author: Brian & Co.
version: 1.0

---

## Author and Authors

You can declare a single author with `author`, or multiple authors with `authors`.

### Single author

---

title: The Last Light
author: Brian & Co.
version: 1.0

---

### Multiple authors

---

title: The Last Light
authors:
  - Brian & Co.
  - Alex Rivera
version: 1.0

---

## Notes

- Metadata is optional
- Metadata should be parsed consistently by all implementations
- The renderer may use title, author, authors, and version information when available
