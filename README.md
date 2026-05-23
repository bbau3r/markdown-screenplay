# Markdown Screenplay

## Overview

`Markdown Screenplay` is a lightweight way to write screenplays using a Markdown-like syntax. The goal is to make screenplay creation easier by keeping the authoring format simple, readable, and portable while still supporting structured rendering in a viewer.

This project combines a Vue-based viewer with a shared transformer package so `.mdsp` content can be parsed consistently and rendered in the browser.

This format can also be implemented for other viewers and editors and expanded upon.

## Vuer

The `markdown-screenplay-vuer` app is the user-facing viewer for `.mdsp` files. It handles loading content, rendering screenplay output, and surfacing the viewer experience for local files and browser-based usage.

### Live Deployment

You can check out a live deployment of the app by navigating to [m-screend.web.app](https://m-screend.web.app)

### What you need to work on it

- Node.js 22+
- npm

### Development

Install dependencies from the repository root:

```sh
npm install
```

Run the app locally:

```sh
npm run dev
```

Run the full build:

```sh
npm run build
```

Run the app tests:

```sh
npm run test:unit
```

Run type checking across the workspace:

```sh
npm run type-check
```

Run linting for the app package:

```sh
npm run lint
```

## Documentation

The `documents/` folder contains the `.mdsp` specification and implementation notes. This is the shared reference for syntax, metadata, character tagging, and implementation expectations so the viewer and transformer package can stay aligned.

## Contribution

If you are working on transformer behavior, update the relevant documentation in `documents/` as well.

If you are working on UI behavior, keep changes in `apps/markdown-screenplay-vuer` and reuse the shared transformer package wherever possible.

If you want to clean up the remaining migration work, use the checklist in the transformer package README or create a focused follow-up task.
