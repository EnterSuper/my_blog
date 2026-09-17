# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Personal blog (site title "EnterSuper") built with [Hexo](https://hexo.io) 7.x and the [Butterfly](https://butterfly.js.org/) theme (vendored in full under `themes/butterfly/`, not installed as an npm package). Content is authored in Markdown under `source/_posts/`; Hexo renders it to static HTML in `public/` (git-ignored), which is deployed to the `EnterSuper/EnterSuper.github.io` GitHub Pages repo via `hexo-deployer-git`.

## Commands

Run from the `my_blog/` directory (this is the Hexo project root — the outer `blog/` directory is not a git repo).

```bash
npm run server   # hexo server — local dev server with live rendering
npm run build    # hexo generate — build static site into public/
npm run clean    # hexo clean — remove generated public/ and cache
npm run deploy   # hexo deploy — push public/ to the GitHub Pages repo (configured in _config.yml `deploy`)
```

To create a new post: `npx hexo new "<title>"`, which creates `source/_posts/<title>.md` (per `new_post_name: :title.md` in `_config.yml`).

There is no lint/test setup in this repo.

## Architecture

- **`_config.yml`** — main Hexo site config: site metadata, permalink format (`:year/:month/:day/:title/`), theme selection (`theme: butterfly`), and the git deploy target/branch. There is no separate `_config.butterfly.yml`; the theme runs on its own bundled defaults at `themes/butterfly/_config.yml` since no root-level theme override file exists.
- **`source/_posts/`** — all blog posts as Markdown files with YAML front matter (`title`, `date`, `tags`, `cover`, `top_img`, etc.). Post filenames become part of the generated content but permalinks are date/title-based per `_config.yml`.
- **`themes/butterfly/`** — the full theme source (layouts, styles, scripts), vendored directly rather than via `npm install`. Only touch this when customizing theme behavior/appearance beyond what front matter or `_config.yml` can express.
- **`public/`** — generated output, git-ignored; never edit by hand, it's overwritten by `hexo generate`.
- **`.github/dependabot.yml`** — keeps npm dependencies (Hexo core/plugins) updated; there is no CI workflow for building or deploying.
