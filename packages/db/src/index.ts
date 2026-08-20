import { drizzle } from "drizzle-orm/libsql/web";
import { client } from "./client.js";
import * as schema from "./schema.js";

// 用 web 版的 drizzle 适配器：它不引入 libsql 的原生驱动，
// 而 node 客户端和 web 客户端实现的是同一套 Client 接口，本地一样能用。
export const db = drizzle(client, { schema });

export { client };
export * from "./schema.js";
export type Database = typeof db;
