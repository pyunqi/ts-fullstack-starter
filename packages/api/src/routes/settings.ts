import { Hono } from "hono";
import { readSettings } from "../lib/settings.js";

/**
 * 公开的站点设置。
 *
 * 里面的每一项都是前台渲染要用的（站点名、横幅文案），本来就会呈现在页面上，
 * 所以不做鉴权。**要放敏感配置的话不能加在这个 schema 里** ——
 * 整份设置是原样吐给匿名请求的。
 */
export const settings = new Hono();

settings.get("/", async (c) => c.json(await readSettings()));
