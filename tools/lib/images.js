'use strict'

const fs = require('fs')
const path = require('path')
const { PicGo } = require('picgo')

const POSTS_DIR = path.join(__dirname, '..', '..', 'source', '_posts')
const IMAGE_RE = /!\[([^\]]*)\]\(([^)\s]+)(\s+"[^"]*")?\)/g

function postPaths (slug) {
  return {
    postPath: path.join(POSTS_DIR, `${slug}.md`),
    assetDir: path.join(POSTS_DIR, slug)
  }
}

function findLocalImageRefs (content) {
  const refs = new Map() // markdown src -> absolute local file path
  for (const m of content.matchAll(IMAGE_RE)) {
    const src = m[2]
    if (/^https?:\/\//i.test(src)) continue
    const abs = path.resolve(POSTS_DIR, src)
    if (fs.existsSync(abs) && fs.statSync(abs).isFile()) {
      refs.set(src, abs)
    }
  }
  return refs
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
    items.push({ src, ok: true, url: info.imgUrl })
  })

  const successCount = items.filter(i => i.ok).length
  if (successCount > 0) {
    fs.writeFileSync(postPath, updated, 'utf8')
  }

  return { total: srcList.length, successCount, items }
}

module.exports = { uploadPostImages, postPaths, findLocalImageRefs, POSTS_DIR }
