---
title: First Article
---

### 自建博客参考链接：
- https://pdpeng.github.io/2022/01/19/setup-personal-blog/#Butterfly%E9%85%8D%E7%BD%AE

### butterfly主题文档：
- https://butterfly.js.org/posts/4aa8abbe/

### 项目上传到github以及同步部署到pages
```shell
# 个人理解项目链接到仓库，你就可以在本地修改后用git命令同步到仓库。然后github pages是一个静态站点托管服务。用它托管你的仓库，用hexo命令同步
git add . # 将所有修改过的地方保存在暂存区
git commit -m"something" # 提交已经添加到暂存区的修改
git push # 将本地的提交推送（上传）到远程仓库,直接用git push需要你已经将你的本地分支与一个远程分支进行了关联（git remote add ...）

hexo clean # 在重新生成静态网站之前，先清理掉旧的生成文件，以避免旧文件对新生成文件的影响。
hexo g # 生成静态网站文件。具体来说，它会根据你的 Hexo 配置文件和文章内容生成静态的 HTML 文件，并存储到指定的目录中，以便最终发布到 Web 服务器上。
hexo d # 将生成的静态网站文件部署到远程服务器或者静态托管服务上
```

### 新建文章
```shell
hexo n <title> # hexo new <title>
```
<!-- 还有我的私货喔：LYN & PJK 爱你宝贝！！！ -->