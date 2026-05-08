# Training

这个目录是给 GitHub 用户自己扩展优化题集用的。

## 用法

在这里放一个 `prompts.jsonl` 文件。

每一行可以是：

1. 纯字符串

```json
"自由为什么不是任意选择？请显性化前提。"
```

2. 带类型的对象

```json
{"kind":"concept","prompt":"自由为什么不是任意选择？请显性化前提。"}
{"kind":"audit","prompt":"请按严格形式逻辑修订这段文字：……"}
{"kind":"historical","prompt":"请引用历史来理解现实问题，并标出类比边界。"}
```

## 运行

```bash
npm run optimize:90
```

优化脚本会自动读取 `training/prompts.jsonl`，把这些题加入默认题池。

## 建议

- `concept`：概念题
- `audit`：逻辑修订题
- `historical`：现实判断 / 历史引用题

尽量让题目短、清楚、可重复评估。
