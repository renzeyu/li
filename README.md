# 李家族谱

这是李氏／朱氏家族的独立族谱页面，也是未来家庭成员个人页面可以共用的中央数据源。

线上地址：<https://renzeyu.github.io/li/>

## 更新族谱

人物姓名和关系的唯一数据源是 `public/family-tree.json`。

数据采用规范化的家族图结构：`people` 中每个人只定义一次，`families` 记录配偶与子女关系，`rootFamilyIds` 指定李氏与朱氏两条祖源。页面会从这份数据生成可展开的族谱；同一个人出现在娘家与成家两处时，仍使用同一个稳定人物 ID。

`history.sections[]` 保存按时期整理的家族历史。每节使用段落数组，并通过 `personIds` 关联已有的重要人物；人物卡片只保留简短事实，完整经历集中在家族历史中。

`migration.routes[].stops[]` 保存家族出生地、迁居与单位沿革。`personIds` 只引用 `people` 中已有的稳定 ID，页面据此生成相关人物姓名，不另存第二份姓名。

迁徙地图也读取同一份文件。`migration.map.places` 用`located`、`regional-anchor`与`unlocated`区分具体地点、区域锚点和尚待定位的地点，`stops[].placeIds` 把故事连接到地点，`migration.map.views` 控制地图范围。坐标必须使用WGS84，并记录`coordinateSource`；城市或行政区中心只能标为区域锚点，不能写成具体住址。地图使用本地保存的MapLibre运行时与OpenFreeMap底图，底图不可用时，迁徙文字记录仍会完整显示。

每次更新时：

1. 在 `people` 中修改人物，在 `families` 中修改关系；已经使用的稳定人物 `id` 不要改名或复用。
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
