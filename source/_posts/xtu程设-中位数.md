---
title: xtu程设:中位数
date: 2024-04-26 14:05:20
tags:
cover: https://raw.githubusercontent.com/EnterSuper/blog_picture/main/头像.jpg
top_img: https://raw.githubusercontent.com/EnterSuper/blog_picture/main/xtu_oj.png
---

### 题意
<img src="https://raw.githubusercontent.com/EnterSuper/blog_picture/main/中位数.png">

### 思路
- 一开始显然是想维护一个有序序列。但是插入一个数时的开销太大，超时严重.
- 想到中位数，那么可以想到可以把序列分为左右两段。那么可以使用最大堆和最小堆分别维护左序列和右序列.