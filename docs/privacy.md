---
layout: page
title: 隐私政策
lede: LexiBridge 没有服务器，不需要账号，不收集、也不上传任何个人信息。你的词库和设置只保存在你自己的浏览器里。
description: LexiBridge 不收集任何个人信息，所有数据只保存在本地浏览器中。
---

## 保存在你浏览器里的数据

LexiBridge 用浏览器的扩展存储（`chrome.storage.local`）保存以下内容，它们不会离开你的设备：

- 你的词库：单词和释义
- 你选择的英语水平
- 禁用的网站列表
- 高亮样式设置

你可以随时在 **单词库** 页面导出或清空词库。卸载扩展时，这些数据会一并删除。

## 权限说明

| 权限 | 用途 |
| --- | --- |
| 读取网页内容 | 在你打开的网页上找出词库里的单词并标出来。网页内容只在你的浏览器里处理，不会被发送到任何地方。 |
| `storage` | 保存上面列出的词库和设置。 |
| `tabs` | 在扩展的弹出面板里显示当前网站，用于开关该网站的标记，并统计本页的生词数。 |
| `tts` | 朗读单词。发音由浏览器的语音合成功能完成，使用的是浏览器和操作系统提供的语音。 |

## 网络请求

LexiBridge 自己不发出任何网络请求，释义来自扩展内置的词表。只有在你点击导入对话框里的示例词表链接时，浏览器才会从 GitHub 下载对应的文件。

LexiBridge 不包含广告，也不包含任何统计或分析代码。

## 本网站

本网站托管在 GitHub Pages 上，不使用 Cookie，也不包含统计代码。GitHub 可能会记录访问日志，详见 [GitHub 隐私声明](https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement)。

## 联系方式

关于隐私的任何问题，请发邮件到 [chan.mo@outlook.com](mailto:chan.mo@outlook.com)，或在 [GitHub]({{ site.github_url }}/issues) 上反馈。

本政策如有更新，会在这个页面上发布。

<p class="updated">最后更新：2026 年 10 月</p>
