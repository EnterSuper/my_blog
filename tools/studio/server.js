// 本地博客发布面板：只监听 127.0.0.1，不对外网暴露。
//   npm run studio
'use strict'

const http = require('http')
const fs = require('fs')
const path = require('path')
const { exec, execFile } = require('child_process')
const matter = require('gray-matter')
const { uploadPostImages, findLocalImageRefs, POSTS_DIR } = require('../lib/images')

const PROJECT_ROOT = path.join(__dirname, '..', '..')
const PUBLIC_DIR = path.join(__dirname, 'public')
const PORT = process.env.PORT || 4321

function listPosts () {
  const files = fs.readdirSync(POSTS_DIR).filter(f => f.endsWith('.md'))
  return files.map(file => {
    const slug = file.slice(0, -3)
    const full = path.join(POSTS_DIR, file)
    const raw = fs.readFileSync(full, 'utf8')
    const { data } = matter(raw)
    const localImages = findLocalImageRefs(raw).size
    return {
      slug,
      title: data.title || slug,
      date: data.date ? String(data.date) : '',
      categories: data.categories || '',
      tags: Array.isArray(data.tags) ? data.tags : (data.tags ? [data.tags] : []),
      cover: data.cover || '',
      top_img: data.top_img || '',
      localImages
    }
  }).sort((a, b) => (a.date < b.date ? 1 : -1))
}

function updatePostMeta (slug, fields) {
  const full = path.join(POSTS_DIR, `${slug}.md`)
  if (!fs.existsSync(full)) throw new Error('文章不存在')
  const raw = fs.readFileSync(full, 'utf8')
  const parsed = matter(raw)
  const data = { ...parsed.data }
  if (fields.title !== undefined) data.title = fields.title
  if (fields.categories !== undefined) data.categories = fields.categories
  if (fields.tags !== undefined) {
    data.tags = String(fields.tags)
      .split(',')
      .map(t => t.trim())
      .filter(Boolean)
  }
  if (fields.cover !== undefined) data.cover = fields.cover
  if (fields.top_img !== undefined) data.top_img = fields.top_img
  const out = matter.stringify(parsed.content, data)
  fs.writeFileSync(full, out, 'utf8')
}

const POST_TYPES = new Set(['paper', 'note'])

// 用 execFile 而不是 exec，标题作为独立参数传给 hexo，不经过 shell 拼接，
// 避免标题里出现 & ; ` 这类字符时被当成 shell 命令的一部分。
function createPost (type, title) {
  if (!POST_TYPES.has(type)) return Promise.reject(new Error('未知的文章类型'))
  if (!title || !title.trim()) return Promise.reject(new Error('标题不能为空'))
  return new Promise((resolve, reject) => {
    execFile('npx', ['hexo', 'new', type, title], {
      cwd: PROJECT_ROOT,
      maxBuffer: 1024 * 1024 * 5
    }, (err, stdout, stderr) => {
      const log = `${stdout}\n${stderr}`
      if (err) return reject(Object.assign(new Error('创建失败'), { log }))
      const m = log.match(/Created:\s*(.+\.md)/)
      if (!m) return reject(Object.assign(new Error('创建成功但没能解析出文件名'), { log }))
      resolve(path.basename(m[1].trim(), '.md'))
    })
  })
}

function openInApp (slug, target) {
  const full = path.join(POSTS_DIR, `${slug}.md`)
  if (!fs.existsSync(full)) return Promise.reject(new Error('文章不存在'))
  if (process.platform !== 'darwin') return Promise.reject(new Error('这个功能目前只支持 macOS'))
  const args = target === 'finder' ? ['-R', full] : ['-a', 'Typora', full]
  return new Promise((resolve, reject) => {
    execFile('open', args, err => {
      if (err) return reject(Object.assign(new Error('打开失败，Typora 可能没装或者不叫这个名字'), { log: String(err) }))
      resolve()
    })
  })
}

function deletePost (slug) {
  const full = path.join(POSTS_DIR, `${slug}.md`)
  const assetDir = path.join(POSTS_DIR, slug)
  if (fs.existsSync(full)) fs.unlinkSync(full)
  if (fs.existsSync(assetDir)) fs.rmSync(assetDir, { recursive: true, force: true })
}

function runDeployPipeline () {
  return new Promise((resolve, reject) => {
    exec('npx hexo clean && npx hexo generate && npx hexo deploy', {
      cwd: PROJECT_ROOT,
      maxBuffer: 1024 * 1024 * 20,
      timeout: 5 * 60 * 1000
    }, (err, stdout, stderr) => {
      const log = `${stdout}\n${stderr}`
      if (err) {
        reject(Object.assign(new Error('部署失败'), { log }))
      } else {
        resolve(log)
      }
    })
  })
}

function sendJson (res, status, obj) {
  const body = JSON.stringify(obj)
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(body)
}

function readBody (req) {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', chunk => { data += chunk })
    req.on('end', () => {
      if (!data) return resolve({})
      try {
        resolve(JSON.parse(data))
      } catch (e) {
        reject(e)
      }
    })
    req.on('error', reject)
  })
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' }

function serveStatic (req, res, pathname) {
  const rel = pathname === '/' ? '/index.html' : pathname
  const filePath = path.join(PUBLIC_DIR, rel)
  if (!filePath.startsWith(PUBLIC_DIR) || !fs.existsSync(filePath)) {
    res.writeHead(404)
    res.end('Not found')
    return
  }
  const ext = path.extname(filePath)
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' })
  fs.createReadStream(filePath).pipe(res)
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`)
  const pathname = url.pathname

  try {
    if (pathname === '/api/posts' && req.method === 'GET') {
      return sendJson(res, 200, listPosts())
    }

    if (pathname === '/api/posts' && req.method === 'POST') {
      const body = await readBody(req)
      const slug = await createPost(body.type, body.title)
      if (body.tags) updatePostMeta(slug, { tags: body.tags })
      return sendJson(res, 200, { ok: true, slug })
    }

    const openMatch = pathname.match(/^\/api\/posts\/([^/]+)\/open$/)
    if (openMatch && req.method === 'POST') {
      const slug = decodeURIComponent(openMatch[1])
      const body = await readBody(req)
      await openInApp(slug, body.target)
      return sendJson(res, 200, { ok: true })
    }

    const metaMatch = pathname.match(/^\/api\/posts\/([^/]+)\/meta$/)
    if (metaMatch && req.method === 'PUT') {
      const slug = decodeURIComponent(metaMatch[1])
      const body = await readBody(req)
      updatePostMeta(slug, body)
      return sendJson(res, 200, { ok: true })
    }

    const publishMatch = pathname.match(/^\/api\/posts\/([^/]+)\/publish$/)
    if (publishMatch && req.method === 'POST') {
      const slug = decodeURIComponent(publishMatch[1])
      const imgResult = await uploadPostImages(slug)
      if (imgResult.total > 0 && imgResult.successCount < imgResult.total) {
        return sendJson(res, 207, {
          ok: false,
          stage: 'images',
          message: `${imgResult.successCount}/${imgResult.total} 张图片上传成功，还有失败的，没有继续部署`,
          imgResult
        })
      }
      const log = await runDeployPipeline()
      return sendJson(res, 200, { ok: true, imgResult, log })
    }

    const postMatch = pathname.match(/^\/api\/posts\/([^/]+)$/)
    if (postMatch && req.method === 'DELETE') {
      const slug = decodeURIComponent(postMatch[1])
      deletePost(slug)
      const log = await runDeployPipeline()
      return sendJson(res, 200, { ok: true, log })
    }

    if (req.method === 'GET') {
      return serveStatic(req, res, pathname)
    }

    sendJson(res, 404, { ok: false, message: 'not found' })
  } catch (err) {
    sendJson(res, 500, { ok: false, message: err.message, log: err.log || '' })
  }
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`博客发布面板: http://127.0.0.1:${PORT}`)
})
