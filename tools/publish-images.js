// 只在"确定要发布某篇文章"时手动运行：
//   npm run publish-images -- <文章slug>
// 把这篇文章本地资源文件夹里用到的图片传到 GitHub 图床仓库，并把文中的本地图片链接
// 改写成对应的 raw.githubusercontent.com 链接。不会碰任何其他文章或本地文档。
'use strict'

const { uploadPostImages } = require('./lib/images')

const slug = process.argv[2]
if (!slug) {
  console.error('用法: npm run publish-images -- <文章slug>')
  console.error('例：文章文件是 source/_posts/attention-is-all-you-need.md，就传 attention-is-all-you-need')
  process.exit(1)
}

uploadPostImages(slug).then(result => {
  if (result.total === 0) {
    console.log('这篇文章里没有找到需要上传的本地图片，无需处理。')
    return
  }

  console.log(`发现 ${result.total} 张本地图片：`)
  for (const item of result.items) {
    if (item.ok) {
      console.log(`  + ${item.src} -> ${item.url}`)
    } else {
      console.error(`  ! ${item.src} 上传失败，跳过替换`)
    }
  }

  if (result.successCount === 0) {
    console.error('\n一张都没传成功，文章没有改动。看看上面的错误信息，多半是 token 权限或 repo 名不对。')
    process.exit(1)
  }

  if (result.successCount < result.total) {
    console.log(`\n${result.successCount}/${result.total} 张传成功，已更新文中对应的链接；失败的那几张还留着本地路径，改好配置后可以再跑一次这个脚本。`)
  } else {
    console.log(`\n已更新文章，${result.successCount} 张图片链接都替换成图床地址了。发布前建议 diff 检查一下再 hexo deploy。`)
  }
}).catch(err => {
  console.error('\n出错了：', err.message || err)
  process.exit(1)
})
