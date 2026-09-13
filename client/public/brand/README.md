# 审微 · ShenWei 品牌资产

对齐 [LUXI Design System v1.1](https://github.com/itrilogy/LUCY-DESIGN)。

## 两层标识（产品 UI 只用这两层）

```
产品层                         实验室 LOGO（出品方 · 界面）
/safespot.svg                  /brand/luxi-lab.svg
鹿溪绿圆角砖 + 光学分划         符号标（Y + 一横，无方框）
+ 水平溪流 + 金色源启星         按底材取差异色
```

写实主标 `luxi-lab-main.svg` / `LUXI LAB.svg` **不进产品 UI、README、关于页、页脚**，仅工商 / 法务 / 对外正式件。

## 文件

| 文件 | 用途 |
| :--- | :--- |
| `../safespot.svg` | 产品方标 / favicon / 顶栏（同构线稿） |
| `../safespot-logo.svg` | 产品横版字锁 |
| **`luxi-lab.svg`** | **实验室界面 LOGO 几何源。UI 内联后随主题取色：浅色鹿溪绿+进化蓝，深色源启白+进化蓝** |
| `luxi-lab-inverse.svg` | 绿底反白（物料） |
| `luxi-lab-gold.svg` | 深底烫金（物料；产品 UI 不用） |
| `safespot-observatory.svg` | 旧观测场写实稿，应用图标变体，不进矩阵方标位 |
| `luxi-lab-main.svg` / `LUXI LAB.svg` | 写实主标归档（正式件） |

符号标几何以 LUCY-DESIGN `<symbol id="luxi-symbol-mark">` 为准，不得自绘变体、不得加方框。

## 同步符号标

```bash
cp /path/to/LUCY-DESIGN/assets/luxi-lab.svg        client/public/brand/luxi-lab.svg
cp /path/to/LUCY-DESIGN/assets/luxi-lab-inverse.svg client/public/brand/luxi-lab-inverse.svg
cp /path/to/LUCY-DESIGN/assets/luxi-lab-gold.svg    client/public/brand/luxi-lab-gold.svg
```
