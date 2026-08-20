/**
 * 生成式头像：姓名首字 + 由 id 定出来的底色。
 *
 * 刻意**不做头像上传**。上传意味着要处理不当内容 —— 而这个站没有专职运营，
 * 一张露骨图片挂在那里没人发现，代价远大于「用户能换头像」带来的收益。
 * 生成式头像零上传、零存储、零审核，而且每个人的颜色是稳定的，
 * 认得出「那个绿色的是我」。
 *
 * 底色从一组定死的品牌邻近色里取，不用随机 HSL —— 随机会撞出
 * 刺眼的荧光色和对比度不足的浅色，而这几个是挑过的。
 */
const PALETTE = [
  { bg: "#1f2937", fg: "#ffffff" }, // 深灰
  { bg: "#065f46", fg: "#ffffff" }, // 墨绿
  { bg: "#7c2d12", fg: "#ffffff" }, // 赭
  { bg: "#1e3a5f", fg: "#ffffff" }, // 藏蓝
  { bg: "#4c1d95", fg: "#ffffff" }, // 紫
  { bg: "#78350f", fg: "#ffffff" }, // 棕
];

/** 稳定哈希：同一个 id 永远得到同一个颜色，换设备换浏览器都一样 */
function paletteOf(seed: string): (typeof PALETTE)[number] {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) | 0;
  }
  return PALETTE[Math.abs(h) % PALETTE.length]!;
}

/**
 * 取首字。中文取第一个汉字，英文取首字母大写。
 *
 * 用 Array.from 而不是 name[0]：emoji 和部分汉字是代理对，
 * 按 UTF-16 码元切会切出半个字符，渲染成一个方框。
 */
function initialOf(name: string): string {
  const first = Array.from(name.trim())[0];
  return first ? first.toUpperCase() : "?";
}

export function Avatar({
  name,
  seed,
  size = 40,
}: {
  name: string;
  /** 决定颜色的稳定标识，通常传 userId */
  seed: string;
  size?: number;
}) {
  const { bg, fg } = paletteOf(seed);

  return (
    <span
      aria-hidden="true"
      className="inline-flex shrink-0 select-none items-center justify-center rounded-full font-medium"
      style={{
        width: size,
        height: size,
        backgroundColor: bg,
        color: fg,
        fontSize: Math.round(size * 0.42),
      }}
    >
      {initialOf(name)}
    </span>
  );
}
