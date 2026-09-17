let posts = []
let activeSlug = null

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
      <label>封面图 cover（可留空）</label>
      <input id="f-cover" value="${escapeAttr(post.cover)}">
    </div>
    <div class="field">
      <label>顶部大图 top_img（可留空）</label>
      <input id="f-top_img" value="${escapeAttr(post.top_img)}">
    </div>
    ${post.localImages > 0 ? `<p class="hint">这篇文章里有 ${post.localImages} 张本地图片，点"上传并发布"会先传图床再上线。</p>` : ''}
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
}

function currentFields () {
  return {
    title: document.getElementById('f-title').value,
    categories: document.getElementById('f-categories').value,
    tags: document.getElementById('f-tags').value,
    cover: document.getElementById('f-cover').value,
    top_img: document.getElementById('f-top_img').value
  }
}

function showResult (html) {
  document.getElementById('result').innerHTML = html
}

async function saveMeta (slug, silent) {
  const res = await fetch(`/api/posts/${encodeURIComponent(slug)}/meta`, {
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
    const res = await fetch(`/api/posts/${encodeURIComponent(slug)}/publish`, { method: 'POST' })
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
    const res = await fetch(`/api/posts/${encodeURIComponent(slug)}`, { method: 'DELETE' })
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
    const res = await fetch('/api/posts', {
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
    const res = await fetch(`/api/posts/${encodeURIComponent(slug)}/open`, {
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
