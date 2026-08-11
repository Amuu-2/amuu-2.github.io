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
- `intro/` — CRT 开场动画模块(intro.css / intro.js / video/*.mp4 共 215KB)。**每次访问都播**(不想看的点右下角跳过,它在待机 0.8s 后浮现);`?intro=skip` 直接跳过、`?intro=debug` 调试面板。与站点只有两点耦合:`window.__introActive` 旗标 + 结束时调 `pixelDissolve` 交接。**动手前先读 intro.js 文件头那五条**(它自带"改这个文件前先读这段")。**视频/矩形坐标的源头是 Blender 项目(`Desktop\intor\files`,含自己的 CLAUDE.md)**,改画面去那边改了重渲,别动仓库里的 mp4。⚠ 改 intro.js/intro.css 后必须把 index.html 里它的 `?v=` +1(静态站无缓存头,浏览器会一直跑旧脚本——已经栽过一次)
- 开场结尾"屏幕里长出网站"的预览层,是 iframe 加载本站自己(`?intro=skip` 防递归),**不是截图**。所以站点怎么改版都不用同步维护它;曾试过"实时截取 DOM + 开场同款抖动"的方案,视觉差别用户看不出,却要跟着站点结构维护且失败时静默降级,已否决(见 DECISIONS)

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
- **手机端(≤48rem)是场景化重构过的,不是桌面版硬搬**:三个板块各 `min-height:100dvh` 撑满并垂直居中(恢复"一屏一场景",但不加 scroll-snap 以免劫持原生滚动),角色面板改居中角色卡、装备栏 grid 三列,世界地图改视口驱动+百分比关卡定位。**两个坑写在 style.css 注释里,改之前先看**:①不要给 `.world` 加 `display:flex`(会让带 `margin-inline:auto` 的画布塌成 0 宽)②路牌宽度必须用 `min(150px,40vw)`(固定值在 320 宽屏上会让左右两列相撞)。改关卡百分比要同步改 index.html 里 `.path--m` 的 polyline 坐标
- **移动端**:开场舞台比例按视口自适应(桌面 16:9 → 手机竖屏收窄到 0.9 并横向居中裁切),裁切做在 WebGL 采样坐标上(CSS object-fit 管不到画布,直接改会把画面拉扁);竖屏下画面占视口 51%、开机文字 16.9px(改之前是 26% / 4px 不可读)。触控目标 ≥44px。**调试提示**:浏览器面板隐藏时 CSS 动画/过渡会冻在起始帧,量 getBoundingClientRect 会得到错值(跳过按钮 opacity=0、浮层 scale=0.97 都是这个假象),要临时禁掉动画再量
- 用户已知待选方向:翻页手感继续调参、人声文案注入(等用户回答 5 个供料问题)、CHANGELOG 活人痕迹组件、手机真机自测
- 重要决策沿革见 `DECISIONS.md`;设计迭代细节见 `.hallmark/log.json`
