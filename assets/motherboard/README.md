# 主板参考建模

基于用户提供的正面、背面、斜视三张图片，在 Blender 5.2.2 中通过 blender-mcp 的 `execute_blender_code` 创建。模型用于装机教学，不是厂商 CAD 或精确电子设计。

## 文件

- `motherboard.blend`：可编辑场景，含模型、摄影灯光、相机、打包的参考图片。
- `motherboard.glb`：仅模型与定位节点；不包含摄影灯光、相机、参考图片。
- `previews/hero.png`、`front.png`、`back.png`、`exploded.png`：实际 Blender 渲染。
- `model-manifest.json`：三角面数、文件体积、42 个定位点。
- `validation.json`：使用项目现有 Three.js GLTFLoader 实际加载验证的结果；检查单场景、有限几何坐标、42 个定位节点、9 个 PCB 贯穿孔，以及没有嵌入参考图片。
- `reference/`：用户提供的原图，仅作建模依据，不用作模型贴图。
- `../../scripts/blender/build_motherboard.py`、`review_motherboard.py`：构建与材质/渲染脚本。在本项目路径下，依次交给 Blender 的 Python 环境执行。

## 还原范围与精度

图片呈现 B850-F NEO 风格的 ATX 主板。参考 ASUS 官方产品列表对该系列 AM5、DDR5、ATX、四个 M.2 的描述，外观布局优先依据用户图片。PCB 采用 **244 × 305 × 1.6 mm** 的建模尺寸；这并非通过图片测量得到的实物制造尺寸。

已建立：深色 PCB、分层 VRM 散热结构、一体式后置 I/O 挡板及接口、AM5 插座与金属压盖/压杆、四条 DIMM、两条全长 PCIe、三块可分离的 M.2 散热盖、CPU 背板、24-pin、双 8-pin EPS、USB/风扇/音频/前面板针座、SATA、CMOS 电池和贯穿固定孔。

以下属于**近似或教学简化**：器件高度、孔位坐标、背面走线和焊盘、后置接口细节、遮挡下的 M.2 排布及快拆机构、内存卡扣运动、PCIe 释放结构。针脚阵列是视觉表达，不能作为真实针脚定义。丝印和装甲装饰做了简化，不是原图商标/宣传图的逐像素复刻。未模拟螺纹、公差、真实电气连接、弹性和完整碰撞。

## 教程对应

依据仓库 `docs/video-transcript/transcript.txt`、`summary.md` 和已有核对记录：

| 教程时间 | 模型结构 | 后续可绑定动作 |
|---|---|---|
| 06:33–11:32 | `AM5_Socket`、`Socket_LoadPlate`、`Socket_Lever`、定位三角 | 释放压杆、打开压盖、对向落 CPU、扣回；不混用 AM4 结构 |
| 11:32–13:17 | `DIMM_A1/A2/B1/B2`、`DIMM_Clip_*`、偏置防呆键 | 插入方向、下压和扣合分别表达；A2/B2 仅为推荐标记 |
| 13:17–19:07 | `M2_Socket_*`、`M2_Q_Latch_*`、`M2_Cover_*`、导热垫与保护膜 | 拆盖、斜插、下压、尾部固定、撕膜、装回 |
| 20:50–23:08 | `Cooler_Bracket_*`、独立螺丝、`AM5_Backplate` | 卡座拆卸和支架固定；AM5 背板保留 |
| 27:17–31:33 | `IO_Shroud`、9 个贯穿孔及 `ANCHOR_mount_*` | 一体式 I/O 不要求另装独立挡板；机箱铜柱须对应孔位 |
| 53:58–62:28 | 供电插孔、缺针、导向壁、命名针座 | 接头匹配、落位与锁扣，不以教程章节限制顺序 |
| 62:28–70:47 | PCIe 凹槽、偏置键和独立释放件 | 显卡对位/落位/释放；具体快拆运动仍待该型号资料校准 |

用户已明确要求的“未涂硅脂禁止安装散热器”仍由现有应用逻辑负责，本次模型不改变这条规则。

## Three.js 接入约定

- Blender 使用米作为对象坐标；PCB 在 XY 平面，+Z 为元件面，-X 为后置 I/O，+Y 为板顶。
- glTF 标准坐标转换后：+Y 为元件面，-Z 为板顶，-X 仍为后置 I/O。
- `model-manifest.json` 的 anchors 为 **Blender 坐标、毫米**；转换成 Three.js 米坐标时为 `[x/1000, z/1000, -y/1000]`。也可以直接读取 GLB 的命名节点世界坐标。
- 根节点 `Motherboard`。可动部件为独立父节点，子网格随其一起移动；压盖和压杆原点在铰接端，内存卡扣原点在底部。
- `kind`、`axis`、`open_angle_degrees` 等自定义属性导出到 glTF extras；`axis` 按 Blender 局部轴定义，接入时需转换。
- 当前交付是闭合的模型和拆解预览，没有预烘焙动画，也没有绑定网页左键交互。预览拆解姿态在渲染结束后恢复。
- 没有全局步骤锁；安装位由命名节点定义，最终遮挡、兼容性和自由操作仍由应用状态系统决定。
- 这是细节模型。接入前应合并可合并的静态材质批次、制作 LOD，并在用户的 Windows 集显设备上验证；本次没有声称已完成网页性能验收。

## 来源

- 用户提供的三张图片（保存在 reference 下）。未从 Sketchfab 导入模型。
- [ASUS 官方 B850 产品列表](https://www.asus.com/motherboards-components/motherboards/prime/filter?Category=AMD&Spec=599&SubSpec=345788)
- [Blender MCP 上游](https://github.com/ahujasid/blender-mcp)
- 本次本地 MCP 桥接使用上游提交 `6f992ffbca3cb715d111fc640b737b808632273c`，本地 127.0.0.1 连接，遥测关闭。
- 原图及品牌元素不因本次重新建模而自动获得新的授权；本记录不是商业授权证明。

本轮只生成模型资产和脚本，未替换网站现有主板，未启动网站服务。

## 网站接入更新 · 2026-09-20

已接入货架与工作台。原文“未接入”描述的是建模交付时状态；当前运行时适配、教学简化及验证范围见[接入记录](../../docs/model-integration.md)。
