# 语料打包说明

这个目录用于放置随公开仓库一起发布的语料。

`data/corpus/texts/` 收录德文和英文黑格尔文本，主要用于公开版本的原典检索。

程序运行时会根据这些文本生成本地索引：

```text
data/corpus/generated/manifest.json
data/corpus/generated/chunks.json
```

这些生成文件属于运行时产物，不提交到仓库。

`data/corpus/chinese/` 收录中文语料、中文整理文本、光学识别文本和来源说明。这些材料整理自互联网上可公开访问的资料，用于公开版本的中文语料入口。

如果以后新增私人资料、课堂资料、购买资料或来源不确定的材料，不要放进公开仓库；请放在 `local-resources/`，只在私有部署中使用。
