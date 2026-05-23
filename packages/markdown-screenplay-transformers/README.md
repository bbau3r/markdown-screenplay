# markdown-screenplay-transformers

Shared transformer utilities for Markdown Screenplay (`.mdsp`) parsing and rendering support.

## Purpose

This package contains the transformation logic used by viewer, editor, and tooling integrations that need to parse or transform `.mdsp` content.

## Public API

The package exports the core pieces needed to parse and transform `.mdsp` content, including the transformer entry point, target interfaces, and the result models used by consumers.

## Extending

You can create a custom output target by implementing `TransformTarget<T>`. This lets you reuse the parser pipeline while changing how `.mdsp` content is converted into your own output format.

The `MarkupTransformer` remains the same entry point for parsing. You only need to provide a compatible target implementation and the desired output type.

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
