# 轻便工具箱（微信小程序）

按 `工具箱小程序集合/设计.png` 搭建的原生微信小程序界面，包含首页、工具市场和“我的”三个页面。工具入口暂时统一提示“开发中”；分类筛选和工具搜索可以使用。当前不需要服务器、域名或登录。

## 开始使用

1. 安装并打开[微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)。
2. 选择“导入项目”，项目目录选择本文件夹。
3. 将 `project.config.json` 中的 `touristappid` 替换为你的小程序 AppID。不要把 AppSecret 写入代码仓库。
4. 编译并在模拟器或真机预览。发布前在微信公众平台确认小程序备案、类目和隐私保护指引等要求。

## 添加工具

1. 在 `utils/tool-data.js` 的 `tools` 列表添加工具标题、分类和图标。
2. 在 `pages/index/index.js` 和 `pages/market/index.js` 中调整首页快捷工具或市场分类展示。
3. 将入口绑定的 `showDeveloping` 替换为实际工具页面或处理逻辑。
4. 有用户数据访问或使用微信 API 时，再补充对应隐私说明与授权流程。

## 域名、服务器和费用

- 纯本地工具（计算器、格式转换、文本处理等）不需要服务端，也不需要配置 `request` 合法域名。
- GitHub 用于版本管理与备份，不是小程序 API 服务器。GitHub Pages 面向静态网页，也不等同于合规的小程序后端 API。
- 若需要云同步、账号或服务端密钥，优先评估微信云开发/CloudBase。免费体验环境和额度可能随产品政策调整；上线前确认当前配额、计费与备案要求，并设置预算提醒。
- 小程序请求公网 API 通常需在微信公众平台配置 HTTPS 合法域名；面向中国大陆提供互联网信息服务还可能涉及 ICP 备案。不要把免费子域名或 `github.io` 直接当成必然可用的生产 API 域名。
- 当前建议：先用本地计算功能发布验证需求；确定必须有后端后，再选择有稳定域名和备案路径的云服务。免费主机不等于免费合规域名。

## GitHub 管理

本目录已连接到 `djm961112-cn/wechat-toolbox-miniprogram`。提交本地更改后执行：

```sh
git add .
git commit -m "feat: update toolbox design"
git push
```

后续日常提交：

```sh
git add .
git commit -m "feat: add a mini program tool"
git push
```

不要提交 `project.private.config.json`、AppSecret、用户数据或云服务密钥。

## 图标资源

工具入口统一使用 `assets/icons/` 中 144×144 的 PNG 图标，文件名与 `utils/tool-data.js` 的工具记录对应；工具市场分类图标在 `pages/market/index.js` 配置。新增工具时，将资源放入该目录并在工具数据中填写绝对小程序路径，如 `/assets/icons/image-compress.png`。
