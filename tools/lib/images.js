'use strict'

const fs = require('fs')
const path = require('path')
const matter = require('gray-matter')
const { PicGo } = require('picgo')

const POSTS_DIR = path.join(__dirname, '..', '..', 'source', '_posts')
const IMAGE_RE = /!\[([^\]]*)\]\(([^)\s]+)(\s+"[^"]*")?\)/g

function postPaths (slug) {
  return {
    postPath: path.join(POSTS_DIR, `${slug}.md`),
    assetDir: path.join(POSTS_DIR, slug)
  }
}

// 本地图片路径（相对 source/_posts）→ 绝对路径；不是本地文件则返回 null
function resolveLocal (src) {
  if (!src || typeof src !== 'string' || /^https?:\/\//i.test(src)) return null
  const abs = path.resolve(POSTS_DIR, src)
  if (!abs.startsWith(POSTS_DIR + path.sep)) return null
  return fs.existsSync(abs) && fs.statSync(abs).isFile() ? abs : null
}

function localCover (content) {
  try {
    const { data } = matter(content)
    return resolveLocal(data.cover) ? data.cover : null
  } catch (e) {
    return null
  }
}

// 正文里的本地图片，加上 front matter 里还是本地路径的封面
function findLocalImageRefs (content) {
  const refs = new Map() // src -> absolute local file path
  for (const m of content.matchAll(IMAGE_RE)) {
    const abs = resolveLocal(m[2])
    if (abs) refs.set(m[2], abs)
  }
  const cover = localCover(content)
  if (cover) refs.set(cover, resolveLocal(cover))
  return refs
}

function escapeRegExp (s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// 只改 front matter 里的 cover 这一行，不重排其余 YAML
function replaceCover (content, src, url) {
  const fm = content.match(/^---\r?\n[\s\S]*?\r?\n---/)
  if (!fm) return content
  const line = new RegExp('^(cover:\\s*)([\'"]?)' + escapeRegExp(src) + '\\2[ \\t]*$', 'm')
  return content.replace(fm[0], fm[0].replace(line, '$1' + url))
}

// 上传某篇文章资源文件夹里所有还没传过的本地图片，把文中链接改写成图床地址。
// 只在明确要发布这篇文章时调用——不会碰其他文章或私人文档。
async function uploadPostImages (slug) {
  const { postPath } = postPaths(slug)
  if (!fs.existsSync(postPath)) {
    throw new Error(`找不到文章: ${postPath}`)
  }

  const content = fs.readFileSync(postPath, 'utf8')
  const localRefs = findLocalImageRefs(content)

  if (localRefs.size === 0) {
    return { total: 0, successCount: 0, items: [] }
  }

  const picgo = new PicGo()
  const githubConfig = picgo.getConfig('picBed.github')
  if (!githubConfig || !githubConfig.repo || !githubConfig.token) {
    throw new Error('图床还没配置好：~/.picgo/config.json 里 picBed.github 缺 repo 或 token，先运行 npx picgo set uploader github')
  }
  picgo.setConfig({ 'picBed.uploader': 'github', 'picBed.current': 'github' })

  const srcList = [...localRefs.keys()]
  const absPaths = [...localRefs.values()]
  const output = await picgo.upload(absPaths)

  let updated = content
  const items = []
  srcList.forEach((src, i) => {
    const info = Array.isArray(output) ? output[i] : null
    if (!info || !info.imgUrl) {
      items.push({ src, ok: false })
      return
    }
    updated = updated.split(`](${src})`).join(`](${info.imgUrl})`)
    updated = replaceCover(updated, src, info.imgUrl)
    items.push({ src, ok: true, url: info.imgUrl })
  })

  const successCount = items.filter(i => i.ok).length
  if (successCount > 0) {
    fs.writeFileSync(postPath, updated, 'utf8')
  }

  return { total: srcList.length, successCount, items }
}

module.exports = { uploadPostImages, postPaths, findLocalImageRefs, resolveLocal, replaceCover, POSTS_DIR }
