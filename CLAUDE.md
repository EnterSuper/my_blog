# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Personal blog (site title "EnterSuper", content focus: 论文精读 / 学习笔记) built with [Hexo](https://hexo.io) 7.x and the [Butterfly](https://butterfly.js.org/) theme (vendored in full under `themes/butterfly/`, not an npm package). Markdown in `source/_posts/` → static HTML in `public/` (git-ignored) → deployed to the separate `EnterSuper/EnterSuper.github.io` Pages repo via `hexo-deployer-git`.

Note the two-repo split: pushing this repo only backs up the source. The live site only changes when `hexo deploy` runs.

## Commands

Run from `my_blog/` (the Hexo project root — the outer `blog/` directory is not a git repo).

```bash
npm run server          # local dev server
npm run build           # hexo generate
npm run clean           # remove public/ and cache
npm run publish         # clean + generate + deploy  (this is what makes the live site change)
npm run studio          # local publishing dashboard on http://127.0.0.1:4321
npm run new-paper "标题" # new post from the 论文精读 scaffold
npm run new-note  "标题" # new post from the 学习笔记 scaffold
npm run publish-images -- <slug>   # upload one post's local images to the image bed
```

No lint or test setup.

## Writing / publishing workflow

Typora writes directly into `source/_posts/`. Its global image setting is "copy to `./${filename}`", which lands images in the post's Hexo asset folder (`post_asset_folder: true`) and never uploads anything — important, because the same Typora setting also applies to private notes.

Images only leave the machine on an explicit step: `npm run publish-images -- <slug>` (or the studio's publish button) uploads that one post's local images to the `EnterSuper/blog_picture` GitHub repo via picgo and rewrites the links to `raw.githubusercontent.com` URLs.

picgo credentials live in `~/.picgo/config.json`, outside this repo. Never commit a token.

## Architecture

- **`_config.yml`** — Hexo site config. Uses `hexo-renderer-markdown-it`; math is pre-rendered at build time by the `@renbaoshuo/markdown-it-katex` plugin registered under `markdown.plugins`, so themes only need to ship KaTeX's CSS. `post_asset_folder: true`.
- **`_config.butterfly.yml`** — theme overrides (menu, card feed layout, excerpt length, aside cards, search, KaTeX, asset injection). Banners are off site-wide (`disable_top_img`).
- **`source/css/custom.css`** — the real visual design, injected after the theme's own stylesheet so it wins on equal specificity. Overrides Butterfly's CSS variables wholesale (warm paper ground, vermilion accent, 4px radii, hard `3px 3px 0` offset shadows, serif headings). Sidebar rules are scoped `:is(#aside-content, .es-rail)` because the JS below moves cards out of `#aside-content` and then removes that container.
- **`source/js/es-layout.js`** — moves Butterfly's single aside into left/right rails (three-column layout), and renders the GitHub-style contribution heatmap and the clock/calendar card.
- **`scripts/activity.js`** — Hexo generator producing `/activity.json` (post counts per day) for the heatmap. Anything in `scripts/` is auto-loaded by Hexo as a plugin — do not put standalone CLI scripts there (that is why the tooling lives in `tools/`).
- **`tools/lib/images.js`** — shared image-bed upload logic, used by both the CLI and the studio server.
- **`tools/studio/`** — local-only publishing dashboard (binds 127.0.0.1): list posts, edit front matter, upload images + deploy, delete, open in Typora.
- **`themes/butterfly/`** — vendored theme source. Prefer overriding via `_config.butterfly.yml` / `custom.css` / `es-layout.js` rather than editing theme files, so the theme stays updatable.
- **`public/`** — generated output, git-ignored.
