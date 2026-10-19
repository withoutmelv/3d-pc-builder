# LIAN LI LANCOOL 216X · 黑色无光版

2026-09-20 · 首版参考建模 · Blender 5.2 + 本地 blender-mcp

[Blender 源文件](case.blend) · [GLB](case.glb) · [验证结果](validation.json)

![预览](previews/hero.png)

[hero](previews/hero.png) · [interior](previews/interior.png) · [rear](previews/rear.png)

## 内容与准确度

- Official overall dimensions 235 W × 480.9 D × 491.7 H mm. Black non-RGB LANCOOL 216X.
- Two 160 mm front fans and one 140 mm rear fan. Side, front and top panels and 7 PCIe covers are separate groups.
- ATX tray, standoffs, rear I/O/PSU openings, drive sleds and front-I/O cable anchors are represented.
- Interior panel folds, exact hole map, grille pattern and connector geometry are approximate. Mount alignment must be calibrated against the project motherboard before integration.
- Interior preview temporarily hides glass and front mesh; GLB and blend include them.

## 接入约定

- glTF 使用米；Blender 坐标转换为 glTF `(x,z,-y)`。
- 单一模型根节点；风扇转子、可拆部件及 ANCHOR 节点保持独立。名字与属性见 model-manifest.json。
- 部件可拆分是建模准备，不代表网站已经实现这些交互。
- 本次没有修改已有装机流程、安装顺序或网站代码。
- 接入前需要统一各资产坐标、安装位与碰撞代理，并验证高内存与散热器前风扇的净空。

## 来源与验证

[官方产品来源](https://lian-li.com/product/lancool-216/) · [参考记录](reference/sources.json)

Three.js 实际加载通过；62 个网格、15,975 个三角形；Blender 文件重新打开并保存为独立文档。

几何由脚本生成；没有解包或导入 assets 下第三方 ZIP 模型，参考照片没有用作 GLB 纹理。品牌文字是视觉识别细节，来源记录不构成素材授权证明。

## 网站接入更新 · 2026-09-20

已接入货架与工作台。原文“未接入”描述的是建模交付时状态；当前运行时适配、教学简化及验证范围见[接入记录](../../docs/model-integration.md)。
