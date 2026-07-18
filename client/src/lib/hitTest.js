/**
 * 相对坐标 (0~1) 碰撞检测
 * 矩形：AABB；圆形：椭圆方程（支持非正圆的 circle 标注）
 */
export function hitTestAnnotation(uX, uY, item) {
    const r = item?.rect;
    if (!r) return false;

    if (item.shape === 'circle') {
        const cx = r.x + r.w / 2;
        const cy = r.y + r.h / 2;
        const rx = r.w / 2;
        const ry = r.h / 2;
        if (rx <= 0 || ry <= 0) return false;
        const nx = (uX - cx) / rx;
        const ny = (uY - cy) / ry;
        return nx * nx + ny * ny <= 1;
    }

    return uX >= r.x && uX <= r.x + r.w && uY >= r.y && uY <= r.y + r.h;
}
