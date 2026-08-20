import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import "./i18n/index.js";
import "./index.css";
import { initTheme } from "./lib/theme.js";

/*
  主题在 React 挂载之前就贴上去。晚一步的话页面会先按亮色渲染一帧
  再跳成暗色，那一下白闪在暗环境里很刺眼。
*/
initTheme();

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("找不到 #root 挂载点");

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
