# SafeSpot 品牌资产

> 对齐实验室范式：见鹿 / 听默 / 鹿溪志愿 / VectorStream / IQS  
> 实验室主 LOGO 源文件：`Obsidian/departments/lab/鹿溪联合实验室/LUXI LAB.svg`

## 双层结构

```
┌─────────────────────────────────────────────┐
│  产品层                                      │
│    /safespot.svg · /safespot-logo.svg        │
│    观测场 / 找隐患                           │
├─────────────────────────────────────────────┤
│  实验室层（出品方，全产品统一）                 │
│    luxi-lab-main.svg ← 官方 LUXI LAB.svg     │
└─────────────────────────────────────────────┘
```

| 文件 | 用途 |
|------|------|
| `../safespot.svg` | 产品 favicon / 顶栏方标 |
| `../safespot-logo.svg` | 产品横版字锁 |
| **`luxi-lab-main.svg`** | **★ 实验室主 LOGO（网页用）** |
| `LUXI LAB.svg` | 官方文件名副本（未改内容） |
| `luxi-lab-main-v2.svg` | 官方 Version 2 备用 |

网页主标相对官方稿只改：`preserveAspectRatio="xMidYMid meet"`、渐变 id 去冲突。勿把听默几何 Y+L 当作鹿溪主 LOGO。

## 同步

```bash
cp "/Users/kwangwah/Obsidian/departments/lab/鹿溪联合实验室/LUXI LAB.svg" \
   client/public/brand/"LUXI LAB.svg"
# 再按 IQS / 志愿工程同样方式生成 luxi-lab-main.svg
```
