# 文字麻将 · 组字成句

用单字组句学语言的游戏。玩家从字库抽牌，自由把字拼成句子，提交后由 DeepSeek 判定是否通顺。

## 玩法

1. 系统从字库随机发 10 张手牌
2. 点手牌选中一个字 → 点句子区的空位（`＋`）插入到任意位置
3. 点句子区已放的字可移除回手牌
4. 觉得拼好了点「提交判定」，DeepSeek 判断整句是否通顺
5. 通顺：句子区字被用掉 + 得分（基础 10 + 每字 2），自动补牌
6. 不通顺：扣 5 分，句子保留可继续改，并给出参考正确句

## 运行

```bash
npm install
npm start
```

打开 http://localhost:3000

## 配置

`.env` 文件：

```
DEEPSEEK_API_KEY=你的key
PORT=3000
```

## 说明

- 字库在 `chars.js`，分基础/进阶两档，高频字重复多次以提高可组句性
- 判定 prompt 在 `server.js`，返回 `{fluent, score, reason, corrected}`
- key 放在后端 `.env`，不暴露给前端；`.env` 已被 `.gitignore` 忽略
