/* EnterSuper 自定义前端增强
   1) 把 Butterfly 单个侧栏拆成左右两栏（用 JS 真实移动节点，比纯 CSS 网格技巧可靠）
   2) 首页渲染 GitHub 风格的创作热力图，数据来自 /activity.json
*/
(function () {
  'use strict'

  /* ---------- 1. 三栏布局 ---------- */
  function buildRails () {
    const layout = document.querySelector('.layout')
    const aside = document.querySelector('#aside-content')
    if (!layout || !aside || layout.querySelector('.es-rail')) return

    const pick = sel => aside.querySelector(sel)
    const leftCards = ['.card-info', '.card-categories', '.card-tags'].map(pick).filter(Boolean)
    const rightCards = ['.card-recent-post', '.card-archives', '.card-webinfo'].map(pick).filter(Boolean)
    if (!leftCards.length && !rightCards.length) return

    const left = document.createElement('aside')
    left.className = 'es-rail es-rail-left'
    leftCards.forEach(c => left.appendChild(c))

    const right = document.createElement('aside')
    right.className = 'es-rail es-rail-right'
    rightCards.forEach(c => right.appendChild(c))

    // 名单之外的卡片（文章页的目录等）不能丢。放在右栏最前面——
    // 读长文时目录比"最新文章"有用得多。
    const leftovers = [...aside.querySelectorAll('.card-widget')]
      .filter(card => !left.contains(card) && !right.contains(card))
    leftovers.reverse().forEach(card => right.insertBefore(card, right.firstChild))

    const main = layout.querySelector('#recent-posts, #post, #page, #archive, #tag, #category')
    if (left.children.length) layout.insertBefore(left, main || layout.firstChild)
    if (right.children.length) layout.appendChild(right)

    aside.remove()
    layout.classList.add('es-three-col')
  }

  /* ---------- 2. 创作热力图 ---------- */
  const WEEKS = 53
  const DAY_MS = 86400000

  function ymd (d) {
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0')
  }

  function levelFor (n) {
    if (!n) return 0
    if (n === 1) return 1
    if (n === 2) return 2
    if (n <= 4) return 3
    return 4
  }

  function renderHeatmap (data) {
    const host = document.querySelector('#recent-posts')
    if (!host || document.querySelector('.es-heatmap-card')) return

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const mondayOffset = (today.getDay() + 6) % 7          // 周一为一周起点
    const thisMonday = new Date(today.getTime() - mondayOffset * DAY_MS)
    const start = new Date(thisMonday.getTime() - (WEEKS - 1) * 7 * DAY_MS)

    const card = document.createElement('div')
    card.className = 'es-heatmap-card'

    const activeDays = Object.keys(data.days || {}).length
    card.innerHTML =
      '<div class="es-heatmap-head">' +
        '<div>' +
          '<div class="es-heatmap-title">创作记录</div>' +
          '<div class="es-heatmap-sub">' + ymd(start).replace(/-/g, '.').slice(0, 7) +
            ' – ' + ymd(today).replace(/-/g, '.').slice(0, 7) +
            ' · ' + activeDays + ' 个活跃日</div>' +
        '</div>' +
        '<div class="es-heatmap-total"><b>' + (data.total || 0) + '</b> 次更新</div>' +
      '</div>' +
      '<div class="es-heatmap-scroll"><div class="es-heatmap-months"></div>' +
      '<div class="es-heatmap-body"><div class="es-heatmap-dows">' +
        '<span>一</span><span></span><span>三</span><span></span><span>五</span><span></span><span>日</span>' +
      '</div><div class="es-heatmap-grid"></div></div></div>' +
      '<div class="es-heatmap-foot"><span>文章发布与更新</span></div>'

    const grid = card.querySelector('.es-heatmap-grid')
    const months = card.querySelector('.es-heatmap-months')
    let lastMonth = -1

    for (let w = 0; w < WEEKS; w++) {
      const weekStart = new Date(start.getTime() + w * 7 * DAY_MS)
      const label = document.createElement('span')
      if (weekStart.getMonth() !== lastMonth) {
        lastMonth = weekStart.getMonth()
        label.textContent = (lastMonth + 1) + '月'
      }
      months.appendChild(label)

      for (let d = 0; d < 7; d++) {
        const cur = new Date(weekStart.getTime() + d * DAY_MS)
        const cell = document.createElement('i')
        if (cur > today) {
          cell.className = 'es-cell es-cell-future'
        } else {
          const key = ymd(cur)
          const n = (data.days || {})[key] || 0
          cell.className = 'es-cell'
          cell.dataset.l = levelFor(n)
          cell.title = key + '：' + (n ? n + ' 次更新' : '无更新')
        }
        cell.style.gridRow = d + 1
        cell.style.gridColumn = w + 1
        grid.appendChild(cell)
      }
    }

    host.insertBefore(card, host.firstChild)
    const scroll = card.querySelector('.es-heatmap-scroll')
    if (scroll) scroll.scrollLeft = scroll.scrollWidth
  }

  function initHeatmap () {
    if (!document.querySelector('#recent-posts')) return   // 只在首页
    fetch('/activity.json')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d) renderHeatmap(d) })
      .catch(() => {})
  }

  /* ---------- 3. 本地时间 + 日历卡片 ---------- */
  const WEEK_CN = ['日', '一', '二', '三', '四', '五', '六']

  function buildClockCard () {
    const rail = document.querySelector('.es-rail-right')
    if (!rail || rail.querySelector('.es-clock-card')) return

    const card = document.createElement('div')
    card.className = 'card-widget es-clock-card'
    card.innerHTML =
      '<div class="item-headline"><i class="fas fa-clock"></i><span>本地时间</span></div>' +
      '<div class="es-clock-time"></div>' +
      '<div class="es-clock-date"></div>' +
      '<div class="es-cal"></div>'

    // 排在右栏最前面（"最新文章"之上）；文章页的目录例外，目录仍然置顶，
    // 读长文时导航比时钟重要。
    const anchor = [...rail.children].find(el => el.id !== 'card-toc')
    if (anchor) rail.insertBefore(card, anchor)
    else rail.appendChild(card)

    const timeEl = card.querySelector('.es-clock-time')
    const dateEl = card.querySelector('.es-clock-date')

    const tick = () => {
      const n = new Date()
      const p = v => String(v).padStart(2, '0')
      timeEl.textContent = p(n.getHours()) + ':' + p(n.getMinutes()) + ':' + p(n.getSeconds())
      dateEl.textContent = n.getFullYear() + '年' + (n.getMonth() + 1) + '月' + n.getDate() + '日 周' + WEEK_CN[n.getDay()]
    }
    tick()
    setInterval(tick, 1000)

    renderCalendar(card.querySelector('.es-cal'), new Date())
  }

  function renderCalendar (host, ref) {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const year = ref.getFullYear()
    const month = ref.getMonth()

    const first = new Date(year, month, 1)
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const lead = (first.getDay() + 6) % 7          // 周一为一周起点

    let html = '<div class="es-cal-head">' + year + '年' + (month + 1) + '月</div>' +
      '<div class="es-cal-grid">'
    ;['一', '二', '三', '四', '五', '六', '日'].forEach((d, i) => {
      html += '<span class="es-cal-dow' + (i >= 5 ? ' es-cal-weekend' : '') + '">' + d + '</span>'
    })
    for (let i = 0; i < lead; i++) html += '<span></span>'
    for (let d = 1; d <= daysInMonth; d++) {
      const cur = new Date(year, month, d)
      const dow = (cur.getDay() + 6) % 7
      const isToday = cur.getTime() === today.getTime()
      html += '<span class="es-cal-day' +
        (isToday ? ' es-cal-today' : '') +
        (dow >= 5 ? ' es-cal-weekend' : '') + '">' + d + '</span>'
    }
    html += '</div>'
    host.innerHTML = html
  }

  function init () {
    buildRails()
    initHeatmap()
    buildClockCard()
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init)
  } else {
    init()
  }
})()
