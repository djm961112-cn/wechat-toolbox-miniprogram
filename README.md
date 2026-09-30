# 轻便工具箱（微信小程序）

一个原生微信小程序起步框架：工具目录首页 + 可运行的 BMI 计算器示例。计算逻辑在客户端本地执行，当前不需要服务器、域名、登录或用户数据存储。

## 开始使用

1. 安装并打开[微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)。
2. 选择“导入项目”，项目目录选择本文件夹。
3. 将 `project.config.json` 中的 `touristappid` 替换为你的小程序 AppID。不要把 AppSecret 写入代码仓库。
4. 编译并在模拟器或真机预览。发布前在微信公众平台确认小程序备案、类目和隐私保护指引等要求。

## 添加工具

1. 在 `pages/tool/<tool-id>/` 新增 `index.js`、`index.json`、`index.wxml`、`index.wxss`。
2. 在 `app.json` 的 `pages` 注册页面路径。
3. 在 `pages/index/index.js` 的 `tools` 列表加入 `{ id, title, description, icon, path }`。
4. 有用户数据访问或使用微信 API 时，再补充对应隐私说明与授权流程。

## 域名、服务器和费用

- 纯本地工具（计算器、格式转换、文本处理等）不需要服务端，也不需要配置 `request` 合法域名。
- GitHub 用于版本管理与备份，不是小程序 API 服务器。GitHub Pages 面向静态网页，也不等同于合规的小程序后端 API。
- 若需要云同步、账号或服务端密钥，优先评估微信云开发/CloudBase。免费体验环境和额度可能随产品政策调整；上线前确认当前配额、计费与备案要求，并设置预算提醒。
- 小程序请求公网 API 通常需在微信公众平台配置 HTTPS 合法域名；面向中国大陆提供互联网信息服务还可能涉及 ICP 备案。不要把免费子域名或 `github.io` 直接当成必然可用的生产 API 域名。
- 当前建议：先用本地计算功能发布验证需求；确定必须有后端后，再选择有稳定域名和备案路径的云服务。免费主机不等于免费合规域名。

## GitHub 管理

本目录已作为独立 Git 仓库初始化。创建一个 GitHub 私有仓库（先不要添加 README、License 或 `.gitignore`），然后在本目录执行：

```sh
git remote add origin https://github.com/<你的账号>/<仓库名>.git
git push -u origin main
```

后续日常提交：

```sh
git add .
git commit -m "feat: add a mini program tool"
git push
```

不要提交 `project.private.config.json`、AppSecret、用户数据或云服务密钥。
