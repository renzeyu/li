# 李家族谱

这是李氏／朱氏家族的独立族谱页面，也是未来家庭成员个人页面可以共用的中央数据源。

线上地址：<https://renzeyu.github.io/li/>

## 更新族谱

人物姓名和关系的唯一数据源是 `public/family-tree.json`。

每次更新时：

1. 修改人物或关系；已经使用的稳定人物 `id` 不要改名或复用。
2. 更新顶层 `updatedAt` 和 `revision`。
3. 运行 `npm test`。
4. 提交重新生成的 `docs/` 并推送到 `main`。

页面直接呈现家人确认的姓名与关系，不附加资料审查式标签，也不另设不自然的排行。

## 接入未来个人页面

个人页面应保留一份构建时的静态族谱作为无脚本回退，再从本页读取最新中央数据：

```html
<div
  data-family-interactive-tree
  data-li-family-tree
  data-family-source="https://renzeyu.github.io/li/family-tree.json"
  data-family-focus-person="人物的稳定ID"
  data-family-profile-links="false"
>
  <!-- 构建时保存的静态族谱 -->
</div>

<script
  defer
  data-static-interaction
  src="https://renzeyu.github.io/li/family-tree.js"
></script>
```

需要直接复用本页样式时，在容器上增加 `data-family-load-styles`。独立族谱站暂不显示人物个人页面链接；将来可在数据中保留链接，并由各页面自行决定是否显示。

## 本地构建

```bash
npm test
python3 -m http.server 3000 -d docs
```

GitHub Pages 从 `main` 分支的 `/docs` 发布。
