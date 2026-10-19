# 配件规格校准与拆箱交互

2026-09-28

## 当前行为

- 新建房间选配后，八类商品以各自包装盒进入推车；旧存档保持原有裸件状态。
- 左键盒身拿起，左键支撑面放下，R 旋转；左键盒盖打开，再对准盒内的具体零件左键拿起。
- 拿起的零件跟随视角，可以直接安装，也可以放在有效支撑面。成功落位才提交拆箱状态；放置失败时保留手持和盒内记录。
- 内存两条分别取出，散热器本体、两只风扇及支架分别取出。机箱侧板和预装件保留装配关系，原卡座随主板取出。
- 空盒保留，可继续搬动。当前未实现逐层拆塑封、真实抽出动画和重新装箱。
- 可选 `unpackedParts` 记录已落位物品；尚未落位的手持状态不写入存档，刷新后仍在盒中。原有 open/empty 存档保持兼容。
- 包装比例为教学简化值，不作为商品运输尺寸。内盒陈列使用对应商品模型的缩放展示；取出后的装配模型尺寸保持不变。
- 包装状态和位置纳入现有存档校验；新建房间使用 `packages` 字段，字段缺省表示旧版裸件房间。

## 配件数据

保留原 ID 以兼容存档。名称与模型相符，旧演示价格改为未录入，避免显示伪报价。

| 商品 | 校准值 | 依据 |
| --- | --- | --- |
| LANCOOL 216X | 机箱 235 × 491.7 × 480.9 mm；显卡 392 mm；风冷 180.5 mm；E-ATX PCB 宽度上限 280 mm | [LIAN LI 官方规格](https://lian-li.com/product/lancool-216/)及 assets/case/README.md |
| RTX 4090 AERO OC 24G | 显卡长 342 mm，厚 75 mm，高 150 mm；24GB | [GIGABYTE 官方规格](https://www.gigabyte.com/za/Graphics-Card/GV-N4090AERO-OC-24GD/sp) |
| Phantom Spirit 120 SE | 塔体高 154 mm；125 × 110 mm 横截面 | [Thermalright 官方规格](https://www.thermalright.com/tw/product/phantom-spirit-120-se/) |
| RM1000x 2024 | 1000W，壳体 150 × 86 × 160 mm | [CORSAIR 2024 型号](https://www.corsair.com/us/en/p/psu/cp-9020271-na/rmx-series-rm1000x-fully-modular-power-supply-cp-9020271-na)及 assets/psu/README.md |
| VENGEANCE RGB DDR5 | 每条 135 × 44 × 8 mm | assets/ram/README.md 内厂商尺寸参考与本地模型验证 |
| 9800X3D / B850-F / 990 EVO | AM5 / DDR5 ATX / M.2 NVMe；CPU 与 PCB 坐标按现有模型接入记录 | 各资产 README、validation.json、docs/model-integration.md |

`shared/compatibility.js` 统一 CPU 插槽、内存代际、主板尺寸、显卡长度、散热器高度五项判断，选配检查与实际安装复用。选配可暂存冲突；安装阶段仅在相关动作发生时阻止，例如超高散热器允许在打开侧板时装配，合板时检查。

这些是商品名义规格和教学代理，不是完整 CAD 干涉检测。散热器前风扇为避让高内存的抬升、接口近似及教学安装位仍遵循 docs/model-integration.md，不据此保证真实商品所有装配场景兼容。

## 验证

覆盖八类商品任意一种先拆、未开盒隔空操作拦截、旋转搬运、空盒移动、选配增删、旧版房间、API 状态往返、实际机箱尺寸边界。浏览器验证推荐配件入车、电源开盒取出、空盒拿起旋转与放下。
