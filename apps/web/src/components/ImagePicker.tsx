import { useState, type ChangeEvent } from "react";
import { useTranslation } from "react-i18next";
import { errorMessageOf } from "../lib/errors.js";
import { ArrowLeftIcon, ArrowRightIcon } from "./Icons.js";
import { Button, ErrorBox } from "./ui.js";
import { adminApi } from "../lib/apiClient.js";
import { compressImage, isAcceptedImage } from "../lib/imageResize.js";

export type PickedImage = {
  url: string;
  blobKey?: string;
  contentType?: string;
  sizeBytes?: number;
};

/**
 * 图片选择与上传。选中文件后先在浏览器里压缩再传 ——
 * Netlify Functions 请求体上限约 6MB，手机原图直传必失败。
 *
 * multiple=false 时当作单张封面用，选新图直接替换旧的。
 */
export function ImagePicker({
  value,
  onChange,
  multiple = false,
  max = 10,
}: {
  value: PickedImage[];
  onChange: (next: PickedImage[]) => void;
  multiple?: boolean;
  max?: number;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFiles(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    // 清空 input，否则连续选同一个文件不会再触发 change
    e.target.value = "";
    if (files.length === 0) return;

    setError(null);
    setBusy(true);

    try {
      const room = multiple ? max - value.length : 1;
      const accepted: PickedImage[] = [];

      for (const file of files.slice(0, Math.max(room, 0))) {
        if (!isAcceptedImage(file)) {
          setError(t("image.unsupported"));
          continue;
        }
        const blob = await compressImage(file);
        const uploaded = await adminApi.uploadImage(blob);
        accepted.push({
          url: uploaded.url,
          blobKey: uploaded.key,
          contentType: uploaded.contentType,
          sizeBytes: uploaded.sizeBytes,
        });
      }

      if (accepted.length > 0) {
        onChange(multiple ? [...value, ...accepted] : accepted.slice(0, 1));
      }
    } catch (err) {
      setError(errorMessageOf(err, t));
    } finally {
      setBusy(false);
    }
  }

  function move(index: number, delta: number) {
    const next = [...value];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target]!, next[index]!];
    onChange(next);
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <label className="cursor-pointer rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
          {busy ? t("image.uploading") : t("image.choose")}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple={multiple}
            className="hidden"
            disabled={busy}
            onChange={(e) => void onFiles(e)}
          />
        </label>
        {multiple && (
          <span className="text-xs text-gray-500">
            {t("image.count", { count: value.length, max })}
          </span>
        )}
      </div>

      {error && <ErrorBox message={error} />}

      {value.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {value.map((img, i) => (
            <div key={img.url} className="relative">
              <img
                src={img.url}
                alt=""
                className="h-24 w-24 rounded-lg border border-gray-200 object-cover"
              />
              <div className="mt-1 flex justify-center gap-1">
                {multiple && (
                  <>
                    {/*
                      **叫「前移/后移」而不是「左移/右移」。** 缩略图是
                      flex-wrap 排的，一行放不下就换行 —— 这时候某张图的
                      「上一位」在它的右上方，说「左移」是错的。
                      而它实际改的是详情页里的展示顺序，前后才是那件事本身。

                      原来这两个按钮只有一个 ← 字符，没有任何无障碍名字，
                      读屏软件念不出它是干什么的。
                    */}
                    <button
                      type="button"
                      className="dense-target flex items-center px-1 text-gray-500 hover:text-gray-900 disabled:opacity-30"
                      disabled={i === 0}
                      title={t("common.moveEarlier")}
                      onClick={() => move(i, -1)}
                    >
                      <ArrowLeftIcon className="size-4" />
                      <span className="sr-only">{t("common.moveEarlier")}</span>
                    </button>
                    <button
                      type="button"
                      className="dense-target flex items-center px-1 text-gray-500 hover:text-gray-900 disabled:opacity-30"
                      disabled={i === value.length - 1}
                      title={t("common.moveLater")}
                      onClick={() => move(i, 1)}
                    >
                      <ArrowRightIcon className="size-4" />
                      <span className="sr-only">{t("common.moveLater")}</span>
                    </button>
                  </>
                )}
                <button
                  type="button"
                  className="px-1 text-xs text-red-600 hover:underline"
                  onClick={() => onChange(value.filter((_, j) => j !== i))}
                >
                  {t("common.delete")}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** 上传按钮之外，仍允许直接粘贴站外图片链接 */
export function ImageUrlInput({
  onAdd,
  className = "",
}: {
  onAdd: (url: string) => void;
  className?: string;
}) {
  const { t } = useTranslation();
  const [url, setUrl] = useState("");

  return (
    <div className={`flex gap-2 ${className}`}>
      <input
        type="url"
        placeholder="https://"
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-900 focus:ring-1 focus:ring-gray-900"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
      />
      <Button
        type="button"
        variant="ghost"
        onClick={() => {
          const v = url.trim();
          if (!v) return;
          onAdd(v);
          setUrl("");
        }}
      >
        {t("image.addUrl")}
      </Button>
    </div>
  );
}
