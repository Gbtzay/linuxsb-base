# 【功能征集】氢 / 氧已进 RC，GA 之前还缺什么

氢和氧已经进入 **RC**（氢 0.1.22、氧 1.0.60）：冻新功能，只修阻断。摘掉 RC、进正式版 / GA 是下一阶段。

不是站点官方出品。数据只在你自己浏览器里。RC 不等于不会再修，只是新功能先停。

## 已经有的

不必再许愿一遍：

- 氢壳（可关）
- 已读置灰
- 首页回位
- 主楼预览
- 用户画像
- 断点续读
- 实时流
- 未读哨兵
- 机会监控
- 签到日历
- 积分趋势
- 称号行情
- AI 总结
- 个人存档
- 年度报告
- 配置迁移

氢壳不喜欢可以关：油猴图标菜单，或氢面板「界面精修」。关了就回到原版界面，其它功能保留。

## 这帖现在收什么

1. RC 冻本上的坑（带氢/氧版本、哪一页、怎么复现）——优先修
2. 进 GA 前必须修掉的问题
3. 现有功能里哪块别扭、多余、或你已经关掉了

许愿不保证做。和站点抢活、要改服务端、或明显会把请求打爆的，这轮不做。新功能等 GA 后再说。

已知问题：[`已知问题-rc.md`](已知问题-rc.md)

## 安装

两个都要装，**先氢后氧**。

1. 浏览器装 [Tampermonkey](https://www.tampermonkey.net/)
2. 安装氢（RC）：https://greasyfork.org/zh-CN/scripts/592914-linux-sb-%E6%B0%A2-beta
3. 安装氧（RC）：https://greasyfork.org/zh-CN/scripts/592915-linux-sb-%E6%B0%A7-beta
4. 打开 linux.sb，右下角出现 **H**，氢面板「插件」里能看到一串模块，就算装上了

作者页：https://greasyfork.org/zh-CN/users/1637325-xb70sr71

Tampermonkey 里脚本名是「LINUX.SB 氢（RC）」和「LINUX.SB 氧（RC）」。冻本：氢 **0.1.22**、氧 **1.0.60**。Greasy Fork 若落后，以油猴 / 氢面板里的版本为准。

源码：https://github.com/Gbtzay/linuxsb-base
Release：https://github.com/Gbtzay/linuxsb-base/releases/tag/v1.0.60

装之前建议先在氢面板里用「配置迁移」导出一份备份（第一次装可以忽略）。

## 怎么反馈

回帖或私信我都可以。请带上：

- 氢、氧版本（面板或 Tampermonkey 里都能看到）
- 浏览器 + Tampermonkey 版本
- 哪一页、哪一步、期望是什么、实际是什么
- 能复现的话更好；氢面板「运行日志」可以一并带上

反馈里不要贴 API Key。
