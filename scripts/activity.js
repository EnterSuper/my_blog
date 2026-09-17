/* 生成 /activity.json：按日期统计文章发布与更新次数，供首页热力图使用。
   放在 scripts/ 下会被 Hexo 自动当作插件加载。 */
'use strict'

hexo.extend.generator.register('activity', function (locals) {
  const counts = {}

  const bump = date => {
    if (!date) return
    const key = typeof date.format === 'function'
      ? date.format('YYYY-MM-DD')
      : new Date(date).toISOString().slice(0, 10)
    counts[key] = (counts[key] || 0) + 1
  }

  locals.posts.forEach(post => {
    bump(post.date)
    // 更新日和发布日不是同一天时，也算一次活动
    const created = post.date && post.date.format ? post.date.format('YYYY-MM-DD') : null
    const updated = post.updated && post.updated.format ? post.updated.format('YYYY-MM-DD') : null
    if (updated && updated !== created) bump(post.updated)
  })

  return {
    path: 'activity.json',
    data: JSON.stringify({
      total: Object.values(counts).reduce((a, b) => a + b, 0),
      days: counts
    })
  }
})
