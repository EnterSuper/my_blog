// 本地博客发布面板：只监听 127.0.0.1，不对外网暴露。
//   npm run studio
'use strict'

const http = require('http')
const fs = require('fs')
const path = require('path')
const { exec, execFile } = require('child_process')
const matter = require('gray-matter')
const { uploadPostImages, findLocalImageRefs, resolveLocal, POSTS_DIR } = require('../lib/images')

const PROJECT_ROOT = path.join(__dirname, '..', '..')
const PUBLIC_DIR = path.join(__dirname, 'public')
const PORT = process.env.PORT || 4321
const ALLOWED_HOSTS = new Set([`127.0.0.1:${PORT}`, `localhost:${PORT}`])

const IMAGE_MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp'
}
// SVG 故意不在列表里：它能内嵌脚本，从本面板同源提供会有 XSS 风险
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024

function httpError (status, message) {
  return Object.assign(new Error(message), { status })
}

// URL 里的文章名只能是单个文件名，不能带路径，防止 ../ 跳出 source/_posts
function slugFrom (raw) {
  const slug = decodeURIComponent(raw)
  if (!slug || /[/\\\0]/.test(slug) || slug === '.' || slug === '..') {
    throw httpError(400, '非法的文章名')
  }
  return slug
}

function listPosts () {
  const files = fs.readdirSync(POSTS_DIR).filter(f => f.endsWith('.md'))
  return files.map(file => {
    const slug = file.slice(0, -3)
    const full = path.join(POSTS_DIR, file)
    const raw = fs.readFileSync(full, 'utf8')
    const { data } = matter(raw)
    const localImages = findLocalImageRefs(raw).size
    // front matter 没写 date 时用文件修改时间兜底，和 Hexo 构建时的行为一致
    const date = data.date ? new Date(data.date) : fs.statSync(full).mtime
    return {
      slug,
      title: data.title || slug,
      date: date.toISOString(),
      categories: data.categories || '',
      tags: Array.isArray(data.tags) ? data.tags : (data.tags ? [data.tags] : []),
      cover: data.cover || '',
      localImages
    }
  // 按时间戳倒序。不能比较 String(date)：JS 日期字符串以星期开头
  // （"Thu Apr 25..." / "Fri Sep 18..."），字符串比较会变成按星期排序。
  }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
}

function updatePostMeta (slug, fields) {
  const full = path.join(POSTS_DIR, `${slug}.md`)
  if (!fs.existsSync(full)) throw httpError(404, '文章不存在')
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
  if (fields.cover !== undefined) {
    if (fields.cover) data.cover = fields.cover
    else delete data.cover
  }
  const out = matter.stringify(parsed.content, data)
  fs.writeFileSync(full, out, 'utf8')
}

// 文章资源文件夹里现有的图片（Typora 贴图就存在这里），供挑选封面
function listPostImages (slug) {
  const dir = path.join(POSTS_DIR, slug)
  if (!fs.existsSync(dir)) return []
  const out = []
  const walk = (d, depth) => {
    for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
      const abs = path.join(d, ent.name)
      if (ent.isDirectory() && depth < 2) walk(abs, depth + 1)
      else if (ent.isFile() && IMAGE_MIME[path.extname(ent.name).toLowerCase()]) {
        out.push(path.relative(POSTS_DIR, abs).split(path.sep).join('/'))
      }
    }
  }
  walk(dir, 0)
  return out.sort()
}

// 把选中的本地图片存进文章资源文件夹，封面先记成本地相对路径；
// 真正上传图床要等"上传并发布"，和正文图片同一时机，私人内容不会提前外传
function saveCover (slug, filename, buffer) {
  if (!fs.existsSync(path.join(POSTS_DIR, `${slug}.md`))) throw httpError(404, '文章不存在')
  const ext = path.extname(filename || '').toLowerCase()
  if (!IMAGE_MIME[ext]) throw httpError(400, '只支持 png / jpg / gif / webp / avif / bmp 图片')
  const dir = path.join(POSTS_DIR, slug)
  fs.mkdirSync(dir, { recursive: true })
  const name = `cover-${Date.now()}${ext}`
  fs.writeFileSync(path.join(dir, name), buffer)
  const src = `${slug}/${name}`
  updatePostMeta(slug, { cover: src })
  return src
}

const POST_TYPES = new Set(['paper', 'note'])

// 用 execFile 而不是 exec，标题作为独立参数传给 hexo，不经过 shell 拼接，
// 避免标题里出现 & ; ` 这类字符时被当成 shell 命令的一部分。
function createPost (type, title) {
  if (!POST_TYPES.has(type)) return Promise.reject(httpError(400, '未知的文章类型'))
  if (!title || !title.trim()) return Promise.reject(httpError(400, '标题不能为空'))
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
  if (!fs.existsSync(full)) return Promise.reject(httpError(404, '文章不存在'))
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

function readRaw (req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', chunk => {
      size += chunk.length
      if (size > limit) {
        reject(httpError(413, '图片太大（上限 20MB）'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

async function readBody (req) {
  const buf = await readRaw(req, 1024 * 1024)
  if (!buf.length) return {}
  try {
    return JSON.parse(buf.toString('utf8'))
  } catch (e) {
    throw httpError(400, '请求体不是合法 JSON')
  }
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

// 面板里预览本地图片用，只放行 source/_posts 下的图片文件
function serveAsset (res, rel) {
  const abs = resolveLocal(rel)
  const type = abs && IMAGE_MIME[path.extname(abs).toLowerCase()]
  if (!type) {
    res.writeHead(404)
    res.end('Not found')
    return
  }
  res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' })
  fs.createReadStream(abs).pipe(res)
}

const server = http.createServer(async (req, res) => {
  // 防 DNS rebinding：只认本机地址
  if (!ALLOWED_HOSTS.has(req.headers.host)) {
    res.writeHead(403)
    res.end('Forbidden')
    return
  }

  const url = new URL(req.url, `http://127.0.0.1:${PORT}`)
  const pathname = url.pathname

  try {
    // 写操作必须带自定义头。浏览器里其他网站跨域发不出这个头（会触发预检，
    // 而本服务不返回任何 CORS 头），这样别的网页就没法偷偷触发发布/删除
    if (req.method !== 'GET' && req.headers['x-studio'] !== '1') {
      throw httpError(403, '缺少 X-Studio 请求头')
    }

    if (pathname === '/api/posts' && req.method === 'GET') {
      return sendJson(res, 200, listPosts())
    }

    if (pathname === '/api/posts' && req.method === 'POST') {
      const body = await readBody(req)
      const slug = await createPost(body.type, body.title)
      if (body.tags) updatePostMeta(slug, { tags: body.tags })
      return sendJson(res, 200, { ok: true, slug })
    }

    if (pathname.startsWith('/asset/') && req.method === 'GET') {
      return serveAsset(res, decodeURIComponent(pathname.slice('/asset/'.length)))
    }

    const imagesMatch = pathname.match(/^\/api\/posts\/([^/]+)\/images$/)
    if (imagesMatch && req.method === 'GET') {
      return sendJson(res, 200, listPostImages(slugFrom(imagesMatch[1])))
    }

    const coverMatch = pathname.match(/^\/api\/posts\/([^/]+)\/cover$/)
    if (coverMatch && req.method === 'POST') {
      const slug = slugFrom(coverMatch[1])
      const filename = decodeURIComponent(req.headers['x-filename'] || '')
      const buf = await readRaw(req, MAX_UPLOAD_BYTES)
      if (!buf.length) throw httpError(400, '没有收到图片数据')
      return sendJson(res, 200, { ok: true, src: saveCover(slug, filename, buf) })
    }

    const openMatch = pathname.match(/^\/api\/posts\/([^/]+)\/open$/)
    if (openMatch && req.method === 'POST') {
      const slug = slugFrom(openMatch[1])
      const body = await readBody(req)
      await openInApp(slug, body.target)
      return sendJson(res, 200, { ok: true })
    }

    const metaMatch = pathname.match(/^\/api\/posts\/([^/]+)\/meta$/)
    if (metaMatch && req.method === 'PUT') {
      const slug = slugFrom(metaMatch[1])
      const body = await readBody(req)
      updatePostMeta(slug, body)
      return sendJson(res, 200, { ok: true })
    }

    const publishMatch = pathname.match(/^\/api\/posts\/([^/]+)\/publish$/)
    if (publishMatch && req.method === 'POST') {
      const slug = slugFrom(publishMatch[1])
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
      const slug = slugFrom(postMatch[1])
      deletePost(slug)
      const log = await runDeployPipeline()
      return sendJson(res, 200, { ok: true, log })
    }

    if (req.method === 'GET') {
      return serveStatic(req, res, pathname)
    }

    sendJson(res, 404, { ok: false, message: 'not found' })
  } catch (err) {
    sendJson(res, err.status || 500, { ok: false, message: err.message, log: err.log || '' })
  }
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`博客发布面板: http://127.0.0.1:${PORT}`)
})
