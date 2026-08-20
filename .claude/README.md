# .claude

`settings.json` 会进 git，是**这个项目共享的**配置：把高频、只读或幂等的命令
加进允许清单，少一半权限确认弹窗。

刻意没有放进去的是**写操作** —— `git commit`、`git push`、`pnpm db:migrate`、
任何 `rm`。这类命令每次都该由人点一下：迁移不可回滚，推送收不回来，
而省下的那一下点击不值这个风险。

个人的授权记录落在 `settings.local.json`，那个文件在 `.gitignore` 里，不进 git。

用法见 [../docs/new-project.md](../docs/new-project.md)。
