# WWDC 2022: What's New in Endpoint Security

> **Session**: WWDC 2022 - 110345  
> **Speaker**: Daniel (安全工程与架构团队)  
> **主题**: Endpoint Security macOS Ventura 新特性

---

## 目录

1. [概述](#一概述)
2. [新事件类型](#二新事件类型)
3. [静音功能改进](#三静音功能改进)
4. [eslogger 工具](#四eslogger-工具)
5. [总结](#五总结)

---

## 一、概述

### 1.1 Endpoint Security 回顾

Endpoint Security 是 Apple 提供的 C API，用于为 Mac 构建安全产品：

| 产品类型 | 说明 |
|----------|------|
| **防病毒软件** | 恶意软件检测和防护 |
| **EDR 工具** | 端点检测和响应 |
| **DLP 解决方案** | 数据泄露防护 |

### 1.2 历史演进

| 版本 | 里程碑 |
|------|--------|
| **macOS Catalina** | 首次引入 Endpoint Security |
| **macOS Big Sur** | 弃用 OpenBSM 审计跟踪 |
| **macOS Monterey** | 100+ 事件类型，默认静音改进 |
| **macOS Ventura** | 新事件、静音增强、eslogger 工具 |

### 1.3 替代的旧技术

- KAuth KPI（已弃用）
- MAC Kernel 框架（不受支持）
- OpenBSM 审计跟踪（已弃用，将在未来版本删除）

> 参考：WWDC 2020 "构建 Endpoint Security App"

---

## 二、新事件类型

### 2.1 事件扩展方向

截至 macOS Monterey，ES 支持 100+ 事件类型，主要集中在**内核事件**（如进程分叉、文件打开）。

macOS Ventura 扩展到**用户空间安全事件**：

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                    macOS Ventura 新增事件类别                                        │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                     │
│  1. 身份验证事件 (Authentication)                                                    │
│     └── 用户向操作系统进行身份验证                                                    │
│                                                                                     │
│  2. 登录/注销事件 (Login/Logout)                                                     │
│     └── 用户会话的开始和结束                                                         │
│                                                                                     │
│  3. 门禁/XProtect 事件 (Gatekeeper/XProtect)                                        │
│     └── 恶意软件检测和处置                                                           │
│                                                                                     │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 身份验证事件

**用途**：观察可疑访问模式

**覆盖场景**：
- 登录本地用户帐户
- 以管理员身份授权操作
- **Apple Watch 自动解锁**（审计工具不支持）

**优势**：
| 对比项 | OpenBSM 审计 | ES 新事件 |
|--------|--------------|-----------|
| 信息丰富度 | 基础 | 更丰富 |
| Apple Watch 解锁 | ❌ 不支持 | ✅ 支持 |
| 维护状态 | 已弃用 | 活跃开发 |

### 2.3 登录/注销事件

**用途**：观察系统访问，检测横向移动

**覆盖场景**：
- 控制台本地登录
- SSH 远程登录
- 其他受支持的远程访问方式

**事件类型**：
- `ES_EVENT_TYPE_NOTIFY_OPENSSH_LOGIN`
- `ES_EVENT_TYPE_NOTIFY_OPENSSH_LOGOUT`
- `ES_EVENT_TYPE_NOTIFY_LOGIN_LOGIN`
- `ES_EVENT_TYPE_NOTIFY_LOGIN_LOGOUT`

### 2.4 门禁/XProtect 事件

**用途**：获取恶意软件检测和处置的可见性

**覆盖内容**：
- 恶意软件检测事件
- 阻止恶意软件的措施
- 删除恶意软件的措施

> 这些信息以前无法以结构化方式获得，现在通过 ES API 提供。

### 2.5 OpenBSM 迁移建议

> ⚠️ **重要提醒**

OpenBSM 审计跟踪：
- macOS Big Sur 中已弃用
- **将在 macOS 未来版本中删除**

有了这些新事件，大多数 ES 客户端不再需要依赖 OpenBSM。

---

## 三、静音功能改进

### 3.1 静音功能回顾

**静音的作用**：
- 防止死锁
- 防止卡顿
- 防止看门狗超时
- 管理性能影响

**历史演进**：

| 版本 | 静音能力 |
|------|----------|
| **Catalina** | 按审计令牌或可执行路径静音进程 |
| **Monterey** | 默认静音一小组可执行路径的某些事件 |
| **Ventura** | 目标路径静音 + 静音反转 |

### 3.2 macOS Ventura 新增：目标路径静音

**用途**：对不感兴趣的文件路径相关事件进行静音

**API**：
- `es_mute_path` - 静音目标路径
- `es_mute_path_events` - 静音特定路径的特定事件

**示例 1**：静音 /var/log 下的所有事件

```c
// 对日志文件事件不感兴趣时
es_mute_path(client, "/var/log", ES_MUTE_PATH_TYPE_TARGET_PREFIX);
```

**示例 2**：仅静音写入 /dev/null 的事件

```c
// 静音写入单个文件的事件
es_event_type_t events[] = { ES_EVENT_TYPE_NOTIFY_WRITE };
es_mute_path_events(client, "/dev/null", ES_MUTE_PATH_TYPE_TARGET_LITERAL, 
                    events, 1);
```

### 3.3 macOS Ventura 新增：静音反转 (Mute Inversion)

> 🎯 **核心新特性**

**传统模式 (Ignore List)**：
- 默认接收所有事件
- 静音 = 忽略指定的进程/路径

**反转模式 (Watch List)**：
- 默认忽略所有事件
- 静音 = **只接收**匹配的事件

**支持反转的三种静音类型**：

| 静音类型 | API |
|----------|-----|
| 进程（审计令牌） | `es_mute_process` |
| 可执行路径 | `es_mute_path` (ES_MUTE_PATH_TYPE_PREFIX/LITERAL) |
| 目标路径 | `es_mute_path` (ES_MUTE_PATH_TYPE_TARGET_PREFIX/LITERAL) |

**启用反转**：

```c
// 启用目标路径静音反转
es_invert_muting(client, ES_MUTE_INVERSION_ENABLED);
```

**示例：只监控特定持久性位置**

```c
// 1. 启用反转模式
es_invert_muting(client, ES_MUTE_INVERSION_ENABLED);

// 2. 清除之前的静音设置
es_unmute_all_target_paths(client);

// 3. 添加感兴趣的目标路径（在反转模式下 = 监控列表）
es_mute_path(client, "/Library/LaunchAgents", ES_MUTE_PATH_TYPE_TARGET_PREFIX);
es_mute_path(client, "/Library/LaunchDaemons", ES_MUTE_PATH_TYPE_TARGET_PREFIX);
es_mute_path(client, "~/Library/LaunchAgents", ES_MUTE_PATH_TYPE_TARGET_PREFIX);

// 现在只会收到这些路径下的文件事件
```

### 3.4 静音反转的价值

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                    静音反转的优势                                                    │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                     │
│  传统模式问题：                                                                      │
│  ┌─────────────────────────────────────────────────────────────────────────────┐   │
│  │  • 默认接收所有事件 → 事件量巨大                                              │   │
│  │  • 需要逐个排除不感兴趣的路径 → 配置复杂                                       │   │
│  │  • 性能开销高                                                                │   │
│  └─────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                     │
│  反转模式优势：                                                                      │
│  ┌─────────────────────────────────────────────────────────────────────────────┐   │
│  │  • 默认忽略所有事件 → 零基础开销                                              │   │
│  │  • 只添加感兴趣的路径 → 配置简单                                              │   │
│  │  • 类 Scalpel 的精确度 → 性能最优                                            │   │
│  └─────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                     │
│  Apple 期望：大大改进静音策略，让 ES 产品更轻松地提供出色的用户体验                    │
│                                                                                     │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 四、eslogger 工具

### 4.1 概述

**eslogger** 是 macOS Ventura 新增的命令行工具，无需编写原生客户端即可使用 ES 事件流。

**特点**：
- 随 OS 一起提供
- 已获得 ES 授权
- 支持所有 80 个 NOTIFY 事件
- 输出 JSON 格式

### 4.2 运行要求

| 要求 | 说明 |
|------|------|
| **超级用户** | 必须以 root 身份运行 |
| **全盘访问** | 负责进程（如 Terminal.app 或 SSH）需要全盘访问权限 |

### 4.3 使用示例

**订阅 SSH 登录/注销事件**：

```bash
# 订阅事件并输出到文件
sudo eslogger openssh_login openssh_logout > /tmp/ssh_events.json

# 在另一个终端进行 SSH 登录测试
ssh localhost
exit

# 中断 eslogger (Ctrl+C)
# 查看事件数据
cat /tmp/ssh_events.json | jq .
```

**输出示例**：

```json
{
  "event_type": "openssh_login",
  "process": {
    "executable": {
      "path": "/usr/sbin/sshd"
    },
    "audit_token": {
      "pid": 12345
    }
  },
  "event": {
    "openssh_login": {
      "success": true,
      "username": "daniel"
    }
  }
}
```

### 4.4 使用场景

| 场景 | 说明 |
|------|------|
| **恶意软件行为观察** | 快速查看恶意软件的系统活动 |
| **检测方法原型** | 快速构建和测试检测规则 |
| **安全分析** | 安全分析师观察安全相关事件 |
| **学习和调试** | 了解 ES 事件结构 |

### 4.5 重要限制

> ⚠️ **eslogger 不适用于生产应用**

| 限制 | 说明 |
|------|------|
| **非 App 设计** | 不是为应用程序使用而设计 |
| **输出可能变化** | 输出格式可能因软件更新而改变 |
| **性能特征不同** | 不提供与原生 API 相同的性能 |
| **功能集不同** | 不提供与原生 API 相同的功能集 |

**结论**：App 应继续使用原生 ES 接口。

---

## 五、总结

### 5.1 macOS Ventura ES 新特性一览

| 特性 | 说明 |
|------|------|
| **身份验证事件** | 用户认证、Apple Watch 解锁 |
| **登录/注销事件** | SSH、控制台登录，横向移动检测 |
| **门禁/XProtect 事件** | 恶意软件检测和处置 |
| **目标路径静音** | 按文件路径静音事件 |
| **静音反转** | Watch List 模式，精确监控 |
| **eslogger** | 命令行 ES 事件查看工具 |

### 5.2 API 版本要求

| API | 最低版本 |
|-----|----------|
| `es_mute_process` | macOS 10.15 (Catalina) |
| `es_mute_path` | macOS 12.0 (Monterey) |
| `es_mute_path_events` | macOS 13.0 (Ventura) |
| `es_invert_muting` | macOS 13.0 (Ventura) |
| 新身份验证/登录事件 | macOS 13.0 (Ventura) |
| eslogger | macOS 13.0 (Ventura) |

### 5.3 迁移建议

1. **从 OpenBSM 迁移**：使用新的身份验证和登录事件
2. **优化性能**：使用目标路径静音和静音反转
3. **快速原型**：使用 eslogger 进行测试和学习

---

## 附录：静音 API 速查表

### A.1 进程静音

```c
// 按审计令牌静音进程
es_mute_process(client, &audit_token);
es_unmute_process(client, &audit_token);
es_unmute_all_processes(client);
```

### A.2 路径静音

```c
// 按可执行路径静音
es_mute_path(client, "/path/to/executable", ES_MUTE_PATH_TYPE_PREFIX);
es_mute_path(client, "/path/to/executable", ES_MUTE_PATH_TYPE_LITERAL);

// 按目标路径静音 (macOS 12+)
es_mute_path(client, "/path/to/target", ES_MUTE_PATH_TYPE_TARGET_PREFIX);
es_mute_path(client, "/path/to/target", ES_MUTE_PATH_TYPE_TARGET_LITERAL);

// 取消静音
es_unmute_path(client, path, type);
es_unmute_all_paths(client);
es_unmute_all_target_paths(client);
```

### A.3 按事件类型静音 (macOS 13+)

```c
// 静音特定路径的特定事件
es_event_type_t events[] = { ES_EVENT_TYPE_NOTIFY_WRITE };
es_mute_path_events(client, "/path", ES_MUTE_PATH_TYPE_TARGET_LITERAL, events, 1);

// 取消静音
es_unmute_path_events(client, "/path", ES_MUTE_PATH_TYPE_TARGET_LITERAL, events, 1);
```

### A.4 静音反转 (macOS 13+)

```c
// 启用反转（Watch List 模式）
es_invert_muting(client, ES_MUTE_INVERSION_ENABLED);

// 禁用反转（恢复 Ignore List 模式）
es_invert_muting(client, ES_MUTE_INVERSION_DISABLED);
```

---

*文档整理自 WWDC 2022 Session 110345: What's New in Endpoint Security*  
*整理日期: 2026-01-09*
