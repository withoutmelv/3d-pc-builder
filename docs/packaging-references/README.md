# 商品包装参考与简化重绘

核对日期：2026-09-22。仅对应已交付的八类模型。网站使用 Canvas 重绘的贴图和低面数盒体，不在线加载参考照片。保留商品名称、主配色、正面构图与盒型；产品插图、字体、标志、侧背面和折缝作教学级简化，不是官方印刷文件或精密盒型尺寸。

| 场景中的商品 | 所采用的参考版本 | 来源 |
| --- | --- | --- |
| AMD Ryzen 7 9800X3D | 黑底、橙银几何边框、芯片展示窗、右下数字 7 | [盒装实拍](https://www.alktech.co/articles/review-amd-ryzen-7-9800x3d-am5-processor)、[AMD 官方开箱](https://www.youtube.com/watch?v=buOOBo4f4hU) |
| ROG STRIX B850-F GAMING WIFI7 NEO | 深灰红紫背景、主板插图、底部型号与橙色 B850 | [ASUS 官方图库](https://rog.asus.com/tw/motherboards/rog-strix/rog-strix-b850-f-gaming-wifi7-neo/gallery/)、[带盒产品图](https://www.jumbo-computer.com/en/products/asus-rog-strix-b850-f-gaming-wifi7-neo-ddr5-socket-am5-matx-motherboard-mb-bb85sfn)；商家标题将板型写成 mATX，此处仅参考照片，板型仍依据已有 ATX 模型 |
| CORSAIR VENGEANCE RGB DDR5 | 黄色纸盒版、居中的内存图、底部 VENGEANCE RGB DDR5 | [纸盒实拍](https://www.ebay.com/p/13061228854)、[包装评测](https://www.techpowerup.com/review/corsair-vengeance-rgb-ddr5-7000-cl34-2x-16-gb/2.html)；采用既有黄色纸盒版本，不表示所有批次均使用此包装 |
| GIGABYTE RTX 4090 AERO OC 24G | 白色横盒、左侧大型 AERO 字形、绿色底带、右下 RTX 4090 黑绿标 | [对应型号空盒实拍](https://www.ebay.com/itm/267175452288) |
| Samsung 990 EVO 1TB | 蓝色竖盒、中央 SSD 插图、底部 990 EVO 与 1TB | [三星官方商品图](https://www.samsung.com/sec/memory-storage/990-evo-ssd/MZ-V9E1T0BW/) |
| Thermalright Phantom Spirit 120 SE | 牛皮纸盒、黑色双塔散热器线稿 | [非 ARGB 版包装实拍](https://www.ebay.com/itm/336496605205)、[型号核对](https://www.thermalright.com/product/phantom-spirit-120-se/) |
| CORSAIR RM1000x (2024) | 黄色横盒、中央电源图、左下 RM1000x、右上 ATX 3.1 | [2024 版开箱图](https://vietgame.asia/corsair-rmx-series-rm1000x-tren-tay-va-danh-gia-nhanh/)、[2024 包装核对](https://hwbusters.com/psus/corsair-rm1000x-atx-v3-1-psu-review/2/)；未使用旧款 80 PLUS 包装或 SHIFT 包装 |
| LIAN LI LANCOOL 216X | 牛皮纸箱、左侧前面板线稿、右侧 LANCOOL 216 | [LANCOOL 216 包装实拍](https://www.tweaktown.com/reviews/10283/lian-li-lancool-216-mid-tower-chassis/index.html)；参考照片为同系列 RGB 版，黑色无光版重绘省略 RGB 标，非声称已找到 216X 独立版本的全套印刷面 |

## 实现

- `shared/product-identity.js` 将既有存档 ID 映射到模型对应的展示名称，不迁移存档或改变装机规则。内部尺寸、价格和兼容性字段仍是既有教学数据，本轮不是商品规格数据库迁移。
- `web/src/three/packaging-art.js` 按商品分别绘制正面和简化侧面。盒面不含伪造序列号、保修贴或条码。
- `web/src/three/retail-packaging.js` 将 16 张面图合入一张 2048 × 2048 纹理图集，正面、侧面与背面共用材质。盒体保留厚度和封口折缝。
- 每格左侧包装、右侧裸件；货架拾取范围覆盖两者。仍只有八款，选配流程不变。
