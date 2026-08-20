import { readSettings } from "./settings.js";

/**
 * 发邮件。走 Resend 的 REST 接口，刻意不装它的 SDK ——
 * 需要用到的只是一个 POST，装个包进函数产物不划算，也少一个要跟着升的依赖。
 *
 * 三件事分开放，因为它们的变更成本完全不同：
 * - **API key**（`RESEND_API_KEY`）：机密，只进环境变量
 * - **发件地址**（`EMAIL_FROM`）：改它必须同时在 Resend 里验证新域名的 DNS，
 *   那不是后台点一下能完成的事，所以也放环境变量。没有默认值，见 fromAddress()
 * - **显示名和回复地址**：纯文案，放站点设置，随时能改，不用发版
 */
const RESEND_ENDPOINT = "https://api.resend.com/emails";

export type SendEmailInput = {
  to: string;
  subject: string;
  /** 纯文本是必须的：不少邮件客户端（和垃圾邮件评分）都要看它 */
  text: string;
  html?: string;
};

export type SendEmailResult =
  | { status: "sent"; id: string | null }
  | { status: "skipped"; reason: "not_configured" }
  | { status: "failed"; message: string };

/**
 * 发件地址。**刻意没有默认值。**
 *
 * 这里原本兜底到一个写死的域名，那是个陷阱：只要有人配了 RESEND_API_KEY
 * 却忘了配 EMAIL_FROM，发信就会悄悄用上那个域名 —— 而它在 Resend 里没验证过的话，
 * 每封信都会被 403 挡掉，界面上只有一句语焉不详的失败。
 * （一个没注册过的域名会永远验证不过，而那种失败在日志里只是一句 403。）
 *
 * 没配就当作「没配邮件服务」，和缺 API key 一个待遇 —— 这是能一眼看懂的状态。
 */
function fromAddress(): string | null {
  return process.env.EMAIL_FROM?.trim() || null;
}

/** 两个都齐了才算配好：光有 key 没有发件地址是发不出信的 */
export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim()) && fromAddress() !== null;
}

/**
 * 发一封邮件。
 *
 * **没配全时不发，只记日志并返回 skipped** —— 这不是偷懒：
 * 本地开发和测试都跑在没有 key 的环境里，如果这里抛错，
 * 那些「顺带发封通知」的地方就会连主流程一起失败（下单成功了却因为发信失败而报错）。
 * 调用方要按「发信是尽力而为」来对待返回值。
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = fromAddress();
  if (!apiKey || !from) {
    // 说清楚缺的是哪一个，不然只能挨个环境变量去猜
    const missing = [!apiKey && "RESEND_API_KEY", !from && "EMAIL_FROM"]
      .filter(Boolean)
      .join(" 和 ");
    console.warn(`[email] 未配置 ${missing}，跳过发送：${input.subject} → ${input.to}`);
    return { status: "skipped", reason: "not_configured" };
  }

  const settings = await readSettings();
  const name = settings.emailFromName.trim();
  const replyTo = settings.emailReplyTo.trim();

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        // 显示名里有中文，用引号包起来避免某些客户端解析出问题
        from: name ? `"${name}" <${from}>` : from,
        to: [input.to],
        subject: input.subject,
        text: input.text,
        ...(input.html ? { html: input.html } : {}),
        // 不设回复地址时不带这个字段，用户点回复会发回 noreply
        ...(replyTo ? { reply_to: replyTo } : {}),
      }),
    });

    if (!res.ok) {
      /**
       * Resend 的错误信息对排查很关键（域名没验证、地址不合法、超额度都是不同的话），
       * 原样带出去给调用方，别吞掉。
       */
      const body = (await res.json().catch(() => null)) as { message?: string } | null;
      const message = body?.message ?? `HTTP ${res.status}`;
      console.error(`[email] 发送失败：${message}`);
      return { status: "failed", message };
    }

    const body = (await res.json().catch(() => null)) as { id?: string } | null;
    return { status: "sent", id: body?.id ?? null };
  } catch (err) {
    // 网络层失败同样不该把主流程带崩
    const message = err instanceof Error ? err.message : String(err);
    console.error("[email] 发送异常：", err);
    return { status: "failed", message };
  }
}
