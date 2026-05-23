# markdown-screenplay-transformers

Shared transformer utilities for Markdown Screenplay (`.mdsp`) parsing and rendering support.

## Purpose

This package contains the transformation logic used by the Vue app and any future consumers that need to parse or transform `.mdsp` content.

## Public API

The package currently exports:

- `MarkupTransformer`
- `HTMLTransformTarget`
- `TransformTarget`
- `TransformResult`
- `YAMLTreeNode`
- `SceneData`

## Usage

```ts
import {
  HTMLTransformTarget,
  MarkupTransformer,
} from "markdown-screenplay-transformers";

const transformer = new MarkupTransformer(new HTMLTransformTarget());

for (const line of content.split(/\r?\n/)) {
  transformer.next(line);
}

const result = transformer.compose();
```

## Notes

- This package currently exposes source files directly.
- If you want a cleaner separation later, you can publish a compiled build and switch the app to a package import path.
- The app currently consumes the package through the `@transformers` alias during local development.
