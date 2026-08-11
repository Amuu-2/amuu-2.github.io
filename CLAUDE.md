# 张理牧个人求职网站

像素 RPG 风格的单页个人网站(黑白 + 磷绿点缀),给 HR/面试官看的求职作品。
**线上地址:https://amuu-2.github.io/ (GitHub Pages,已上线)**

## 怎么跑

纯静态,无构建步骤。本地预览:
```
python -m http.server 8173   # 然后开 http://127.0.0.1:8173/index.html
```

## 技术栈与文件

- 原生 HTML/CSS/JS 三文件:`index.html`(结构+全部 JS)、`style.css`(RPG 皮肤)、`tokens.css`(设计 token,颜色/字体/间距全走 CSS 变量)
- `fonts/fusion-pixel-subset.woff2` — 缝合像素字体简中子集(OFL 开源),自托管,无外部 CDN 依赖;`fonts/make-subset.py` — 子集重生成脚本(硬约束 1 的执行工具)
- `assets/portrait.png` — 像素风肖像;`.hallmark/log.json` — 历次设计迭代记录
- `intro/` — CRT 开场动画模块(intro.css / intro.js / video/*.mp4 共 215KB)。只对新访客播一次;`?intro=force` 重播、`?intro=skip` 跳过、`?intro=debug` 调试面板。与站点只有两点耦合:`window.__introActive` 旗标 + 结束时调 `pixelDissolve` 交接。**视频/矩形坐标的源头是 Blender 项目(`Desktop\intor\files`,含自己的 CLAUDE.md)**,改画面去那边改了重渲,别动仓库里的 mp4。⚠ 改 intro.js/intro.css 后必须把 index.html 里它的 `?v=` +1(静态站无缓存头,浏览器会一直跑旧脚本——已经栽过一次)

## 硬约束(违反必出问题)

1. **改任何页面文案后必须重新生成字体子集**,否则新字符回退系统黑体、像素字里夹黑体字(用户称之为"乱码感")。方法:`C:/python/python.exe fonts/make-subset.py`(扫描源含 intro/ 的 JS/CSS —— **intro 里的 bootLines 等 JS 字符串也是页面文案**),跑完把 `?v=` 版本号 +1(共四处:index.html×2、style.css、tokens.css)。完整字体在 `D:\claude workspace\fusion-pixel-zh_hans-FULL.woff2`,丢了去 TakWolf/fusion-pixel-font releases 重下 12px monospaced zh_hans。⚠ 不要用 PowerShell 管道改这些 UTF-8 文件(PS 5.1 无 BOM 会按 GBK 读,全文变乱码),用编辑器/Edit 工具改
2. **所有数字必须来自用户简历,禁止编造**;案例浮层必须保留「示意重绘 · 非真实界面与数据」标注(在职公司合规红线)
3. **不加辉光/渐变/圆角**——用户明确反感"AI 感",像素语言 = 直角 + 2px 边框 + 反白 hover
4. `html` 上**不要设 `scroll-behavior: smooth`**(会让逐帧翻页动画每帧重启,极卡);翻页动画必须逐帧 `behavior:"instant"`
5. 手机号+邮箱公开是用户 2026-08 明确确认过的,不要自作主张删

## 分支与部署

- `main` = 发布分支,`git push origin main` 后约 1 分钟自动上线
- `kimi-pixel` = 开发分支;草稿页(试衣间/原型)已从两个分支删除,历史里可找回(3e262ee 及更早)
- 流程:在 kimi-pixel 改 → 用户确认 → merge 到 main → push

## 当前状态与下一步

- 已上线 v7(2026-08):整屏翻页(scroll-snap + rAF 滚轮缓动)、世界地图关卡、案例浮层、装备栏
- 用户已知待选方向:翻页手感继续调参、人声文案注入(等用户回答 5 个供料问题)、CHANGELOG 活人痕迹组件、手机真机自测
- 重要决策沿革见 `DECISIONS.md`;设计迭代细节见 `.hallmark/log.json`
