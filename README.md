# Coding Agent Bakeoff Tasks

この記事で使った比較タスクと、比較用の最小コードベースを公開するためのフォルダです。

- `task-a.md`: 既存バグ修正
- `task-b.md`: 小機能追加 + テスト更新
- `task-c.md`: 難問版。retroactive correction / reversal / snapshot invalidation / incremental replay
- `task-c-prime.md`: `Task C` の派生版。snapshot invalidation を外し、rebuild と incremental の完全一致に絞った版

このフォルダには次が入っています。

- `task-a.md` などの記事向け task 文面
- `src/` 以下の比較用 JavaScript コード
- `test/` 以下の通常テスト
- `eval/` 以下の hidden checker 相当スクリプト
- `tasks/` 以下の内部管理で使っていた元の task 文面

記事中の `Task C` / `Task C'` という呼び名に合わせつつ、再現したい人向けにコード一式も置いてあります。

記事と合わせて読む前提なので、必要なら task 文面はそのまま各 CLI に貼り付けて使えます。

## License

This repository is released under the MIT License. See [`LICENSE`](./LICENSE).

## Notes

- These tasks are intended for reproducible local benchmarking, but identical results are not guaranteed across dates, model versions, rate limits, or tool updates.
- Hidden checker scripts are included for local verification, but benchmark outcomes can still vary depending on execution environment and provider-side behavior.
