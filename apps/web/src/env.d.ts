/**
 * 构建期注入的常量，定义在 apps/web/vite.config.ts 的 define 里。
 * 它们在运行时不存在于任何对象上 —— vite 是把这几个标识符做文本替换，
 * 所以只能这样直接引用，不能写成 window.__APP_VERSION__ 或解构出来。
 */
declare const __APP_VERSION__: string;
/** 7 位短提交号；拿不到时是字符串 "unknown" */
declare const __APP_COMMIT__: string;
/** 构建时刻的 ISO 8601 字符串 */
declare const __APP_BUILT_AT__: string;
