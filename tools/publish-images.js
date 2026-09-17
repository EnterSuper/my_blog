#!/usr/bin/env node
// 只在"确定要发布某篇文章"时手动运行：
//   npm run publish-images -- <文章slug>
// 把这篇文章本地资源文件夹里用到的图片传到 GitHub 图床仓库，并把文中的本地图片链接
// 改写成对应的 raw.githubusercontent.com 链接。不会碰任何其他文章或本地文档。
'use strict'

const fs = require('fs')
const path = require('path')
const { PicGo } = require('picgo')

const slug = process.argv[2]
if (!slug) {
  console.error('用法: npm run publish-images -- <文章slug>')
  console.error('例：文章文件是 source/_posts/attention-is-all-you-need.md，就传 attention-is-all-you-need')
  process.exit(1)
}

const postsDir = path.join(__dirname, '..', 'source', '_posts')
const postPath = path.join(postsDir, `${slug}.md`)
const assetDir = path.join(postsDir, slug)

if (!fs.existsSync(postPath)) {
  console.error(`找不到文章: ${postPath}`)
  process.exit(1)
}

const IMAGE_RE = /!\[([^\]]*)\]\(([^)\s]+)(\s+"[^"]*")?\)/g

async function main () {
  const content = fs.readFileSync(postPath, 'utf8')

  const matches = [...content.matchAll(IMAGE_RE)]
  const localRefs = new Map() // original markdown src -> absolute local file path

  for (const m of matches) {
    const src = m[2]
    if (/^https?:\/\//i.test(src)) continue // already a remote URL, skip
    const abs = path.resolve(postsDir, src)
    if (fs.existsSync(abs) && fs.statSync(abs).isFile()) {
      localRefs.set(src, abs)
    }
  }

  if (localRefs.size === 0) {
    console.log('这篇文章里没有找到需要上传的本地图片，无需处理。')
    return
  }

  console.log(`发现 ${localRefs.size} 张本地图片，准备上传到图床：`)
  for (const src of localRefs.keys()) console.log(`  - ${src}`)

  const picgo = new PicGo()
  const githubConfig = picgo.getConfig('picBed.github')
  if (!githubConfig || !githubConfig.repo || !githubConfig.token) {
    console.error('\n图床还没配置好：~/.picgo/config.json 里 picBed.github 缺 repo 或 token。')
    console.error('先运行: npx picgo set uploader github')
    console.error('按提示填 repo（如 EnterSuper/blog_picture）、branch、token、path，再重新执行这个脚本。')
    process.exit(1)
  }
  picgo.setConfig({ 'picBed.uploader': 'github', 'picBed.current': 'github' })

  const absPaths = [...localRefs.values()]
  let output
  try {
    output = await picgo.upload(absPaths)
  } catch (err) {
    console.error('\n上传失败：', err.message || err)
    console.error('检查一下 token 是否有效、repo 名是否正确、网络是否正常。')
    process.exit(1)
  }

  if (!Array.isArray(output)) {
    console.error('上传没有返回结果，可能是配置有问题，检查 ~/.picgo/config.json')
    process.exit(1)
  }

  // picgo.upload 的返回顺序和传入的 absPaths 顺序一致
  let updated = content
  let successCount = 0
  const srcList = [...localRefs.keys()]
  srcList.forEach((src, i) => {
    const info = output[i]
    if (!info || !info.imgUrl) {
      console.error(`  ! ${src} 上传失败，跳过替换`)
      return
    }
    updated = updated.split(`](${src})`).join(`](${info.imgUrl})`)
    console.log(`  + ${src} -> ${info.imgUrl}`)
    successCount++
  })

  if (successCount === 0) {
    console.error('\n一张都没传成功，文章没有改动。看看上面的错误信息，多半是 token 权限或 repo 名不对。')
    process.exit(1)
  }

  fs.writeFileSync(postPath, updated, 'utf8')
  if (successCount < srcList.length) {
    console.log(`\n${successCount}/${srcList.length} 张传成功，已更新 ${postPath} 里对应的链接；失败的那几张还留着本地路径，改好配置后可以再跑一次这个脚本。`)
  } else {
    console.log(`\n已更新 ${postPath}，${successCount} 张图片链接都替换成图床地址了。发布前建议 diff 检查一下再 hexo deploy。`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
