let posts = []
let activeSlug = null

// 写操作统一带 X-Studio 头：服务端据此拒绝其他网站发来的跨域请求
function api (url, opts = {}) {
  const headers = { ...(opts.headers || {}) }
  if (opts.method && opts.method !== 'GET') headers['X-Studio'] = '1'
  return fetch(url, { ...opts, headers })
}

async function loadPosts () {
  const res = await fetch('/api/posts')
  posts = await res.json()
  renderList()
  if (activeSlug) {
    const still = posts.find(p => p.slug === activeSlug)
    if (still) renderDetail(still)
    else { activeSlug = null; document.getElementById('detail').innerHTML = '<p class="empty-hint">从左边选一篇文章</p>' }
  }
}

// 只刷新左侧列表（标签/分类/本地图片数量可能变了），不重建右侧详情面板，
// 这样发布/删除后显示的结果日志不会被立刻冲掉。
async function refreshListOnly () {
  const res = await fetch('/api/posts')
  posts = await res.json()
  renderList()
}

function renderList () {
  const el = document.getElementById('post-list')
  if (posts.length === 0) {
    el.innerHTML = '<p class="empty-hint">source/_posts 里还没有文章</p>'
    return
  }
  el.innerHTML = posts.map(p => `
    <div class="post-item ${p.slug === activeSlug ? 'active' : ''}" data-slug="${escapeAttr(p.slug)}">
      <div class="title">${escapeHtml(p.title)}</div>
      <div class="meta">
        ${p.categories ? `<span class="badge cat">${escapeHtml(p.categories)}</span>` : '<span class="badge">未分类</span>'}
        ${p.localImages > 0 ? `<span class="badge img">${p.localImages} 张本地图</span>` : ''}
      </div>
    </div>
  `).join('')
  el.querySelectorAll('.post-item').forEach(item => {
    item.addEventListener('click', () => {
      activeSlug = item.dataset.slug
      renderList()
      renderDetail(posts.find(p => p.slug === activeSlug))
    })
  })
}

function renderDetail (post) {
  const el = document.getElementById('detail')
  el.innerHTML = `
    <div class="field">
      <label>标题</label>
      <input id="f-title" value="${escapeAttr(post.title)}">
    </div>
    <div class="field">
      <label>分类（论文精读 / 学习笔记，也可以自己填）</label>
      <input id="f-categories" value="${escapeAttr(post.categories)}" list="cat-options">
      <datalist id="cat-options">
        <option value="论文精读">
        <option value="学习笔记">
      </datalist>
    </div>
    <div class="field">
      <label>标签（逗号分隔）</label>
      <input id="f-tags" value="${escapeAttr(post.tags.join(', '))}">
    </div>
    <div class="field">
      <label>封面图（可留空）</label>
      <div class="cover-picker">
        <div class="cover-preview" id="cover-preview" title="把图片拖到这里"></div>
        <div class="cover-side">
          <div class="cover-actions">
            <button type="button" class="btn-cover" id="cover-pick">选择本地图片</button>
            <button type="button" class="btn-cover" id="cover-from-post">从文章图片中选</button>
            <button type="button" class="btn-cover btn-cover-clear" id="cover-clear">清除</button>
            <input type="file" id="cover-file" accept="image/png,image/jpeg,image/gif,image/webp,image/avif,image/bmp" hidden>
          </div>
          <p class="hint">也可以把图片拖进左边的方框，或直接 ⌘V 粘贴截图。<br>本地图片先放在文章文件夹里，点「上传并发布」时才会传到图床。</p>
          <label class="cover-url-label" for="f-cover-url">或粘贴图片链接</label>
          <input id="f-cover-url" value="${/^https?:\/\//i.test(post.cover) ? escapeAttr(post.cover) : ''}" placeholder="https://…">
          <input type="hidden" id="f-cover" value="${escapeAttr(post.cover)}">
        </div>
      </div>
      <div class="cover-grid" id="cover-grid" hidden></div>
    </div>
    ${post.localImages > 0 ? `<p class="hint">这篇文章有 ${post.localImages} 张本地图片（含封面），点"上传并发布"会先传图床再上线。</p>` : ''}
    <div class="actions">
      <button class="btn-open" id="btn-open">用 Typora 打开</button>
      <button class="btn-save" id="btn-save">保存信息</button>
      <button class="btn-publish" id="btn-publish">上传并发布</button>
      <button class="btn-delete" id="btn-delete">删除文章</button>
    </div>
    <div id="result"></div>
  `

  document.getElementById('btn-open').addEventListener('click', () => openInTypora(post.slug))
  document.getElementById('btn-save').addEventListener('click', () => saveMeta(post.slug, false))
  document.getElementById('btn-publish').addEventListener('click', () => publishPost(post.slug))
  document.getElementById('btn-delete').addEventListener('click', () => deletePost(post.slug, post.title))

  bindCoverPicker(post.slug)
  renderCoverPreview(post.cover)
}

function currentFields () {
  return {
    title: document.getElementById('f-title').value,
    categories: document.getElementById('f-categories').value,
    tags: document.getElementById('f-tags').value,
    cover: document.getElementById('f-cover').value.trim()
  }
}

/* ---------- 封面选择 ---------- */
const COVER_TYPES = /^image\/(png|jpeg|gif|webp|avif|bmp)$/

// 本地相对路径走面板的 /asset/ 预览；图床链接直接用
function coverUrl (src) {
  if (!src) return ''
  if (/^https?:\/\//i.test(src)) return src
  return '/asset/' + src.split('/').map(encodeURIComponent).join('/')
}

function renderCoverPreview (src) {
  const box = document.getElementById('cover-preview')
  if (!box) return
  if (!src) {
    box.innerHTML = '<span class="cover-empty">拖入图片<br>或点右侧按钮</span>'
    return
  }
  const local = !/^https?:\/\//i.test(src)
  box.innerHTML = `<img src="${escapeAttr(coverUrl(src))}" alt="封面预览">` +
    (local ? '<span class="cover-badge">本地 · 发布时上传</span>' : '')
}

// 隐藏框存真实值；可见的链接框只显示图床链接，本地路径不显示
function syncCoverFields (src) {
  document.getElementById('f-cover').value = src
  document.getElementById('f-cover-url').value = /^https?:\/\//i.test(src) ? src : ''
  renderCoverPreview(src)
}

async function setCover (slug, src, msg) {
  syncCoverFields(src)
  // 选完立即保存，不用再点一次"保存信息"
  const res = await api(`/api/posts/${encodeURIComponent(slug)}/meta`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cover: src })
  })
  const data = await res.json()
  showResult(data.ok
    ? `<div class="status ok">${escapeHtml(msg)}</div>`
    : `<div class="status err">保存封面失败：${escapeHtml(data.message || '')}</div>`)
  refreshListOnly()
}

async function uploadCover (slug, file) {
  if (!file) return
  if (!COVER_TYPES.test(file.type)) {
    showResult('<div class="status err">只支持 png / jpg / gif / webp / avif / bmp 图片</div>')
    return
  }
  showResult('<div class="status ok">正在保存封面…</div>')
  try {
    const res = await api(`/api/posts/${encodeURIComponent(slug)}/cover`, {
      method: 'POST',
      headers: { 'Content-Type': file.type, 'X-Filename': encodeURIComponent(file.name || 'cover.png') },
      body: file
    })
    const data = await res.json()
    if (!data.ok) throw new Error(data.message || '保存失败')
    syncCoverFields(data.src)
    showResult('<div class="status ok">已设为封面（目前只在本地，发布时自动上传图床）</div>')
    refreshListOnly()
  } catch (e) {
    showResult(`<div class="status err">封面保存失败：${escapeHtml(e.message)}</div>`)
  }
}

async function toggleCoverGrid (slug) {
  const grid = document.getElementById('cover-grid')
  if (!grid.hidden) { grid.hidden = true; return }
  grid.hidden = false
  grid.innerHTML = '<p class="hint">读取中…</p>'
  const res = await fetch(`/api/posts/${encodeURIComponent(slug)}/images`)
  const list = await res.json()
  if (!Array.isArray(list) || list.length === 0) {
    grid.innerHTML = '<p class="hint">这篇文章还没有本地图片。在 Typora 里贴图后，图片会出现在这里。</p>'
    return
  }
  grid.innerHTML = list.map(src => `
    <button type="button" class="cover-thumb" data-src="${escapeAttr(src)}" title="${escapeAttr(src)}">
      <img src="${escapeAttr(coverUrl(src))}" alt="${escapeAttr(src.split('/').pop())}" loading="lazy">
    </button>`).join('')
  grid.querySelectorAll('.cover-thumb').forEach(btn => {
    btn.addEventListener('click', () => {
      grid.hidden = true
      setCover(slug, btn.dataset.src, '已设为封面（目前只在本地，发布时自动上传图床）')
    })
  })
}

function bindCoverPicker (slug) {
  const fileInput = document.getElementById('cover-file')
  const preview = document.getElementById('cover-preview')
  const urlInput = document.getElementById('f-cover-url')
  const coverField = document.getElementById('f-cover')

  document.getElementById('cover-pick').addEventListener('click', () => fileInput.click())
  fileInput.addEventListener('change', () => {
    uploadCover(slug, fileInput.files[0])
    fileInput.value = ''
  })
  document.getElementById('cover-from-post').addEventListener('click', () => toggleCoverGrid(slug))
  document.getElementById('cover-clear').addEventListener('click', () => setCover(slug, '', '已清除封面'))
  urlInput.addEventListener('change', () => {
    const v = urlInput.value.trim()
    if (v) {
      coverField.value = v
      renderCoverPreview(v)
    } else if (/^https?:\/\//i.test(coverField.value)) {
      // 清空了链接框，且原来的封面就是链接 → 视为去掉封面；本地封面不受影响
      coverField.value = ''
      renderCoverPreview('')
    }
  })

  preview.addEventListener('dragover', e => { e.preventDefault(); preview.classList.add('is-drag') })
  preview.addEventListener('dragleave', () => preview.classList.remove('is-drag'))
  preview.addEventListener('drop', e => {
    e.preventDefault()
    preview.classList.remove('is-drag')
    uploadCover(slug, e.dataTransfer.files[0])
  })
}

// ⌘V 粘贴截图直接当封面；只拦截"剪贴板里是图片"的粘贴，粘文字不受影响
document.addEventListener('paste', e => {
  if (!activeSlug || !document.getElementById('cover-preview')) return
  const item = [...(e.clipboardData ? e.clipboardData.items : [])]
    .find(i => i.kind === 'file' && COVER_TYPES.test(i.type))
  if (!item) return
  e.preventDefault()
  uploadCover(activeSlug, item.getAsFile())
})

function showResult (html) {
  document.getElementById('result').innerHTML = html
}

async function saveMeta (slug, silent) {
  const res = await api(`/api/posts/${encodeURIComponent(slug)}/meta`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(currentFields())
  })
  const data = await res.json()
  if (!silent) {
    showResult(data.ok ? '<div class="status ok">已保存</div>' : `<div class="status err">保存失败：${escapeHtml(data.message || '')}</div>`)
  }
  await refreshListOnly()
  return data.ok
}

async function publishPost (slug) {
  const btn = document.getElementById('btn-publish')
  btn.disabled = true
  showResult('<div class="status ok">保存信息中…</div>')
  const saved = await saveMeta(slug, true)
  if (!saved) {
    showResult('<div class="status err">文章信息保存失败，已停止</div>')
    btn.disabled = false
    return
  }
  showResult('<div class="status ok">上传图片 + 生成 + 部署中，可能要一两分钟…</div>')
  try {
    const res = await api(`/api/posts/${encodeURIComponent(slug)}/publish`, { method: 'POST' })
    const data = await res.json()
    if (data.ok) {
      showResult(`<div class="status ok">发布成功，线上已更新</div><div class="log">${escapeHtml(data.log || '')}</div>`)
    } else {
      showResult(`<div class="status err">${escapeHtml(data.message || '发布失败')}</div><div class="log">${escapeHtml((data.log) || JSON.stringify(data.imgResult || {}, null, 2))}</div>`)
    }
  } catch (e) {
    showResult(`<div class="status err">请求失败：${escapeHtml(e.message)}</div>`)
  } finally {
    btn.disabled = false
    refreshListOnly()
  }
}

async function deletePost (slug, title) {
  const typed = prompt(`这会删掉《${title}》这篇文章，并把它从线上博客下线（本地文件不在了，但历史内容还在 git 里，能找回）。\n\n确认的话，请输入这篇文章的标题：`)
  if (typed === null) return
  if (typed.trim() !== title) {
    alert('输入的标题不匹配，已取消删除。')
    return
  }
  const btn = document.getElementById('btn-delete')
  btn.disabled = true
  showResult('<div class="status ok">删除 + 重新部署中…</div>')
  try {
    const res = await api(`/api/posts/${encodeURIComponent(slug)}`, { method: 'DELETE' })
    const data = await res.json()
    if (data.ok) {
      showResult(`<div class="status ok">已删除并同步到线上</div><div class="log">${escapeHtml(data.log || '')}</div>`)
      activeSlug = null
    } else {
      showResult(`<div class="status err">${escapeHtml(data.message || '删除失败')}</div>`)
    }
  } catch (e) {
    showResult(`<div class="status err">请求失败：${escapeHtml(e.message)}</div>`)
  } finally {
    btn.disabled = false
    refreshListOnly()
  }
}

async function createNewPost () {
  const title = document.getElementById('new-title').value.trim()
  const type = document.getElementById('new-type').value
  const tags = document.getElementById('new-tags').value.trim()
  const btn = document.getElementById('btn-new')
  const resultEl = document.getElementById('new-post-result')
  if (!title) {
    resultEl.innerHTML = '<div class="status err">标题不能为空</div>'
    return
  }
  btn.disabled = true
  resultEl.innerHTML = '<div class="status ok">创建中…</div>'
  try {
    const res = await api('/api/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, type, tags })
    })
    const data = await res.json()
    if (data.ok) {
      resultEl.innerHTML = `
        <div class="status ok">已创建 source/_posts/${escapeHtml(data.slug)}.md</div>
        <button class="btn-open" id="btn-open-new" style="margin-top:6px">用 Typora 打开</button>
      `
      document.getElementById('btn-open-new').addEventListener('click', () => openInTypora(data.slug))
      document.getElementById('new-title').value = ''
      document.getElementById('new-tags').value = ''
      activeSlug = data.slug
      await loadPosts()
    } else {
      resultEl.innerHTML = `<div class="status err">${escapeHtml(data.message || '创建失败')}</div>`
    }
  } catch (e) {
    resultEl.innerHTML = `<div class="status err">请求失败：${escapeHtml(e.message)}</div>`
  } finally {
    btn.disabled = false
  }
}

async function openInTypora (slug) {
  try {
    const res = await api(`/api/posts/${encodeURIComponent(slug)}/open`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target: 'typora' })
    })
    const data = await res.json()
    if (!data.ok) alert(data.message || '打开失败')
  } catch (e) {
    alert('请求失败：' + e.message)
  }
}

// 只在点按钮时创建，不监听回车——中文输入法确认候选字也会触发 Enter，
// 之前会导致字还没打完就被当成提交了。
document.getElementById('btn-new').addEventListener('click', createNewPost)

function escapeHtml (s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}
function escapeAttr (s) { return escapeHtml(s) }

loadPosts()
