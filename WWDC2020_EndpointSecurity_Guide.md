# WWDC 2020: Build an Endpoint Security App

> **Session**: WWDC 2020 - 10159  
> **Speaker**: Matthew (安全工程与架构团队)  
> **主题**: EndpointSecurity 框架深度解析

---

## 目录

1. [框架概述](#一框架概述)
2. [为什么使用 EndpointSecurity](#二为什么使用-endpointsecurity)
3. [系统扩展的优势](#三系统扩展的优势)
4. [核心架构](#四核心架构)
5. [消息结构详解](#五消息结构详解)
6. [NOTIFY 事件](#六notify-事件)
7. [AUTH 事件](#七auth-事件)
8. [Mute 屏蔽机制](#八mute-屏蔽机制)
9. [缓存机制](#九缓存机制)
10. [高级特性](#十高级特性)
11. [最佳实践](#十一最佳实践)
12. [macOS Big Sur 新特性](#十二macos-big-sur-新特性)
13. [资源与链接](#十三资源与链接)

---

## 一、框架概述

### 1.1 什么是 EndpointSecurity

EndpointSecurity (ES) 框架于 **macOS Catalina** 首次引入，用于替代：

| 旧技术 | 问题 |
|--------|------|
| **Kauth KPI** | 难以开发和调试 |
| **内核扩展 (KEXT)** | 维护噩梦，内核接口频繁更改 |
| **OpenBSM 审计轨迹** | 性能和功能限制 |

### 1.2 KEXT 的问题

- 难以开发
- 更难调试
- 维护噩梦（内核接口频繁更改）
- 降低系统整体安全性和稳定性
- 即使小缺陷也常导致内核崩溃

### 1.3 ES 框架的优势

- **无需开发内核扩展**：可以专注实现产品的真正目标
- **普通应用程序接入**：从用户空间接入富事件流
- **丰富的事件类型**：目前支持约 100 种事件，且持续增加
- **C 语言库**：可被 Swift、Objective-C、Rust 等多种语言调用

### 1.4 事件类型分类

| 类型 | 说明 | 特点 |
|------|------|------|
| **NOTIFY** | 告知操作正在进行 | 异步，仅通知 |
| **AUTH** | 授权控制操作是否继续 | 同步，需要响应 |

---

## 二、为什么使用 EndpointSecurity

### 2.1 C 语言设计的原因

1. **更好的内存和性能控制**
2. **快速采用**：现有产品可以快速迁移
3. **多语言支持**：可被 Swift、Objective-C、Rust 等调用

### 2.2 基本代码示例

```c
// 1. 初始化新的事件流
es_client_t *client = NULL;
es_new_client_result_t result = es_new_client(&client, ^(es_client_t *c, const es_message_t *msg) {
    // 事件处理代码块
    printf("Event type: %d\n", msg->event_type);
});

// 2. 设置事件订阅
es_event_type_t events[] = { ES_EVENT_TYPE_NOTIFY_EXEC };
es_subscribe(client, events, sizeof(events) / sizeof(events[0]));

// 3. 错误处理时清理资源
if (result != ES_NEW_CLIENT_RESULT_SUCCESS) {
    es_delete_client(client);
}

// 4. 保持程序运行
dispatch_main();
```

---

## 三、系统扩展的优势

### 3.1 推荐作为系统扩展部署

虽然可以作为独立应用程序分发，但作为系统扩展部署有很多好处：

| 优势 | 说明 |
|------|------|
| **SIP 保护** | 受系统完整性保护功能防护，防止意外或恶意篡改 |
| **高级别保护** | 用户守护进程获得类似系统守护进程的保护级别 |
| **防卸载** | 甚至能阻止 root 用户卸载你的 launchd 作业 |
| **早期启动** | 系统启动期间，在其他第三方应用执行之前执行 |

### 3.2 系统扩展类型

macOS Catalina 引入的系统扩展支持多种类型：

- **网络扩展**：用于 VPN 和内容过滤器
- **DriverKit**：控制硬件
- **EndpointSecurity**：端点检测与响应 (EDR) 产品

> 参考：WWDC 2019《系统扩展与 DriverKit》

---

## 四、核心架构

### 4.1 高层架构图

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                           EndpointSecurity 架构                                      │
└─────────────────────────────────────────────────────────────────────────────────────┘

用户空间
─────────────────────────────────────────────────────────────────────────────────────
┌─────────────────────┐              ┌─────────────────────┐
│   ES 应用程序 A      │              │   ES 应用程序 B      │
│                     │              │                     │
│  ┌───────┐ ┌───────┐│              │  ┌───────┐          │
│  │Client1│ │Client2││              │  │Client3│          │
│  └───┬───┘ └───┬───┘│              │  └───┬───┘          │
└──────┼─────────┼────┘              └──────┼──────────────┘
       │         │                          │
       │    消息队列                         │
       ▼         ▼                          ▼
─────────────────────────────────────────────────────────────────────────────────────
内核空间
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                        EndpointSecurity 子系统                                       │
│                                                                                     │
│   1. 拦截事件                                                                        │
│   2. 丰富事件信息（进程、文件、代码签名等）                                             │
│   3. 封装为消息信封 (es_message_t)                                                   │
│   4. 同时发送给所有订阅的客户端                                                        │
│   5. AUTH 事件：挂起操作直到收到响应                                                   │
│   6. 缓存机制：减少 AUTH 事件消息数量                                                  │
│                                                                                     │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 关键概念

| 概念 | 说明 |
|------|------|
| **ES Client** | 通过 `es_new_client` 创建的事件流通道 |
| **订阅** | 每个客户端可以有自己的订阅集，控制接收哪些事件 |
| **消息队列** | 事件排队等待事件处理代码块处理 |
| **同时传递** | 消息同时发送给所有适当的客户端（Big Sur 改进，之前是串行） |

### 4.3 运行时要求

| 要求 | 说明 |
|------|------|
| **ES 权限** | 必须拥有 EndpointSecurity 权限（受限权限，需申请） |
| **系统扩展权限** | 如果作为系统扩展，包含应用包需要额外权限 |
| **用户同意** | 系统扩展需要用户在安全性与隐私偏好中同意安装 |
| **完全磁盘访问** | 需要用户授予完全磁盘访问权限 |

### 4.4 MDM 部署支持

对于托管设备，可使用两种 MDM 负载：

1. **扩展负载**：定义无需用户同意即可自动安装的扩展
2. **隐私偏好负载**：自动开启完全磁盘访问权限

---

## 五、消息结构详解

### 5.1 es_message_t 结构

每条消息包含三类主要信息：

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                           es_message_t 消息结构                                      │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                     │
│  1. 消息元数据 (Message Metadata)                                                    │
│     ├── event_type      : 事件类型                                                  │
│     ├── time            : 消息生成时间                                               │
│     ├── action_type     : AUTH 或 NOTIFY                                            │
│     ├── version         : 消息版本号（用于兼容性）                                    │
│     ├── seq_num         : 序列号（检测消息丢弃）                                      │
│     └── deadline        : 截止期（仅 AUTH 事件）                                     │
│                                                                                     │
│  2. 进程信息 (Process Info)                                                          │
│     ├── executable      : 可执行文件信息                                             │
│     │   ├── path        : 完整路径                                                  │
│     │   └── stat        : 文件状态信息                                               │
│     ├── audit_token     : 审计令牌（含 PID、UID 等）                                  │
│     ├── ppid            : 父进程 ID                                                 │
│     ├── signing_id      : 签名 ID                                                   │
│     ├── team_id         : 团队 ID                                                   │
│     ├── cdhash          : 代码目录哈希                                               │
│     └── is_es_client    : 是否为 ES 客户端进程                                       │
│                                                                                     │
│  3. 事件特定信息 (Event-Specific Data)                                               │
│     └── event           : 联合体，根据 event_type 访问不同字段                        │
│         ├── exec        : 执行事件（目标文件、参数等）                                 │
│         ├── open        : 打开事件（文件、标志）                                      │
│         ├── signal      : 信号事件（目标进程、信号号）                                 │
│         └── ...         : 其他事件类型                                               │
│                                                                                     │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 事件特定信息示例

| 事件类型 | 包含信息 |
|----------|----------|
| **SIGNAL** | 收到信号的进程信息、信号编号 |
| **EXEC** | 被执行文件、可执行参数 |
| **OPEN** | 被打开文件、打开标志 |
| **CREATE** | 创建的文件、ACL（版本 2+） |
| **EXIT** | 退出状态码 |

### 5.3 TOCTOU 问题警告

> **检查时间/使用时间 (Time-of-Check Time-of-Use, TOCTOU)** 问题非常重要！

ES 消息中提供的信息反映的是**快照时间点**。系统继续并发处理多个线程，在你的应用程序检查消息之前，这些线程可能改变系统状态。

**典型例子**：
1. 检查文件存在
2. 打开文件
3. 如果在步骤 1 和 2 之间文件被删除，可能引发非预期行为

**注意**：消息中某部分的值可能与你自己查询的信息不一样。这与基于内核扩展的产品面对的问题相同。

---

## 六、NOTIFY 事件

### 6.1 特点

| 特性 | 说明 |
|------|------|
| **异步** | 消息排队后，操作立即继续 |
| **总是传递** | 除非进程被屏蔽 |
| **包含结果** | 包含对应 AUTH 消息的 ALLOW/DENY 结果 |
| **无需响应** | 仅通知，不需要响应 |

### 6.2 代码示例

```c
void handle_event(es_client_t *client, const es_message_t *msg) {
    switch (msg->event_type) {
        case ES_EVENT_TYPE_NOTIFY_EXEC: {
            // 获取被执行的文件路径
            const char *path = msg->event.exec.target->executable->path.data;
            pid_t pid = audit_token_to_pid(msg->process->audit_token);
            os_log(OS_LOG_DEFAULT, "EXEC: %{public}s (pid: %d)", path, pid);
            break;
        }
        case ES_EVENT_TYPE_NOTIFY_FORK: {
            pid_t child_pid = audit_token_to_pid(msg->event.fork.child->audit_token);
            os_log(OS_LOG_DEFAULT, "FORK: child pid %d", child_pid);
            break;
        }
        case ES_EVENT_TYPE_NOTIFY_EXIT: {
            int stat = msg->event.exit.stat;
            os_log(OS_LOG_DEFAULT, "EXIT: status %d", stat);
            break;
        }
    }
}
```

### 6.3 NOTIFY 消息的结果字段

NOTIFY 消息包含 EndpointSecurity 应用的结果：
- 如果有 ES 客户端订阅了对应的 AUTH 事件：包含 ALLOW/DENY 结果
- 如果没有客户端订阅 AUTH 事件或事件不存在 AUTH 变体：结果是**隐式允许**



---

## 七、AUTH 事件

### 7.1 特点

| 特性 | 说明 |
|------|------|
| **同步** | 操作在内核中挂起，直到收到响应或过期 |
| **有截止期** | 每条消息都有自己的 deadline |
| **必须响应** | 必须在截止期前响应 |
| **可缓存** | 响应可以被缓存以提高性能 |

### 7.2 截止期 (Deadline) 机制

> ⚠️ **关键警告**

- 每条 AUTH 消息都有自己的截止期（`msg->deadline`）
- **不保证每条消息都有相同的响应时间**
- 这些值可能随时间改变
- **如果客户端无法在截止期前响应，应用程序会被终止**
- 如果是系统扩展，launchd 作业将自动重启

### 7.3 错过截止期的后果

| 情况 | 结果 |
|------|------|
| 错过截止期 | 应用程序被终止 |
| 隐式响应 | 使用 **ALLOW** 作为响应 |
| 缓存 | **不会缓存**结果，以便重新评估将来的操作 |
| 系统扩展 | launchd 自动重启 |

### 7.4 响应 API

#### 7.4.1 es_respond_auth_result

用于大多数 AUTH 事件，响应 ALLOW 或 DENY：

```c
es_respond_result_t es_respond_auth_result(
    es_client_t *client,
    const es_message_t *msg,
    es_auth_result_t result,    // ES_AUTH_RESULT_ALLOW 或 ES_AUTH_RESULT_DENY
    bool cache                   // 是否允许缓存
);
```

#### 7.4.2 es_respond_flags_result

用于有多个选项的事件（目前仅 **AUTH_OPEN**）：

```c
es_respond_result_t es_respond_flags_result(
    es_client_t *client,
    const es_message_t *msg,
    uint32_t authorized_flags,  // 允许的标志位
    bool cache
);
```

**示例**：允许只读但拒绝写入

```c
// 清除 FWRITE 标志，只允许读取
uint32_t allowed_flags = msg->event.open.fflag & ~FWRITE;
es_respond_flags_result(client, msg, allowed_flags, true);
```

### 7.5 多客户端响应合并

> **最严格原则 (Most Restrictive)**

如果系统上多个客户端订阅同一 AUTH 事件：

| 响应类型 | 合并规则 |
|----------|----------|
| **AUTH_RESULT** | 任一 DENY → 最终 DENY |
| **FLAGS_RESULT** | 按位 AND（只允许所有客户端都同意的标志） |

**示例**：
- 4 个客户端响应 ALLOW，1 个响应 DENY → **最终 DENY**
- Client A 允许 READ+WRITE，Client B 只允许 READ → **最终只允许 READ**

### 7.6 自省事件

> ES **不发送自省 AUTH 事件**（即不发送给触发事件的同一进程）

原因：这会导致简单死锁

- AUTH 事件：自动隐式允许
- NOTIFY 事件：仍然会发送

### 7.7 AUTH 事件代码示例

```c
void handle_auth_exec(es_client_t *client, const es_message_t *msg) {
    // 获取目标进程的签名 ID
    const char *signing_id = msg->event.exec.target->signing_id.data;
    
    // 检查是否需要阻止
    if (strcmp(signing_id, "com.apple.TextEdit") == 0) {
        // 拒绝执行
        es_respond_auth_result(client, msg, ES_AUTH_RESULT_DENY, true);
    } else {
        // 允许执行
        es_respond_auth_result(client, msg, ES_AUTH_RESULT_ALLOW, true);
    }
}

void handle_auth_open(es_client_t *client, const es_message_t *msg) {
    const char *path = msg->event.open.file->path.data;
    
    // EICAR 测试文件 - 拒绝所有操作
    if (is_eicar_file(path)) {
        es_respond_flags_result(client, msg, 0, true);  // 全零 = 拒绝所有
        return;
    }
    
    // 保护 /usr/local/bin - 只允许读取
    if (strncmp(path, "/usr/local/bin", 14) == 0) {
        uint32_t allowed = msg->event.open.fflag & ~FWRITE;  // 清除写标志
        es_respond_flags_result(client, msg, allowed, true);
        return;
    }
    
    // 其他文件 - 允许所有操作
    es_respond_flags_result(client, msg, 0xFFFFFFFF, true);
}
```

### 7.8 异步处理 AUTH 事件

> **建议**：不要在事件处理代码块中执行太多任务

```c
// 推荐的异步处理模式
void handle_event(es_client_t *client, const es_message_t *msg) {
    if (msg->event_type == ES_EVENT_TYPE_AUTH_OPEN) {
        // 复制消息以延长寿命
        es_message_t *msg_copy = es_copy_message(msg);
        
        // 异步处理
        dispatch_async(worker_queue, ^{
            // 执行耗时操作（如文件扫描）
            bool should_allow = scan_file(msg_copy);
            
            es_respond_auth_result(client, msg_copy,
                should_allow ? ES_AUTH_RESULT_ALLOW : ES_AUTH_RESULT_DENY,
                true);
            
            // 释放复制的消息
            es_free_message(msg_copy);
        });
    }
}
```

### 7.9 AUTH vs NOTIFY 对比

| 特性 | AUTH | NOTIFY |
|------|------|--------|
| **同步性** | 同步，操作挂起 | 异步，操作立即继续 |
| **传递条件** | 无缓存结果且非自省 | 总是传递 |
| **屏蔽影响** | 不传递 | 不传递 |
| **结果字段** | 无（需要响应） | 包含 ALLOW/DENY 结果 |
| **截止期** | 有 | 无 |
| **响应要求** | 必须响应 | 无需响应 |

---

## 八、Mute 屏蔽机制

### 8.1 概述

Mute 机制让 ES 客户端可以不接收不感兴趣的进程发来的消息。

### 8.2 屏蔽方式

| API | 说明 | 推荐程度 |
|-----|------|----------|
| `es_mute_process` | 按审计令牌屏蔽进程 | ⭐⭐⭐ 推荐 |
| `es_mute_path_literal` | 按完整路径屏蔽 | ⭐⭐ 谨慎使用 |
| `es_mute_path_prefix` | 按路径前缀屏蔽 | ⭐⭐ 谨慎使用 |

### 8.3 进程屏蔽

```c
// 从消息中获取审计令牌并屏蔽
es_mute_process(client, &msg->process->audit_token);

// ES 子系统会自动跟踪进程退出，从屏蔽集中移除
// 不必手动调用 es_unmute_process，除非想重新接收消息
```

### 8.4 路径屏蔽

```c
// 完整路径屏蔽
es_mute_path_literal(client, "/usr/bin/mdworker");

// 路径前缀屏蔽
es_mute_path_prefix(client, "/System/Library/");
```

> ⚠️ **警告**：添加大量路径可能对性能造成不利影响。用进程审计令牌屏蔽通常更好。

### 8.5 屏蔽的典型用例

```c
// 屏蔽 Spotlight 索引服务，减少消息量
es_mute_path_prefix(client, "/System/Library/Frameworks/CoreServices.framework/"
                            "Versions/A/Frameworks/Metadata.framework/");
```

---

## 九、缓存机制

### 9.1 缓存概述

- AUTH 事件的组合响应存储在**全局缓存**中
- 所有 ES 客户端共享同一缓存
- 缓存策略是**尽力而为**，条目可在任何时刻过期

### 9.2 自动失效

EndpointSecurity 跟踪以下操作并自动失效缓存条目：
- 文件被写入
- 文件被截断
- 文件被删除
- 其他修改操作

### 9.3 缓存控制

```c
// 响应时控制是否缓存
es_respond_auth_result(client, msg, ES_AUTH_RESULT_ALLOW, 
    false);  // false = 不缓存此结果

// 清除整个缓存
es_clear_cache(client);
```

### 9.4 自动清除缓存的情况

- 新客户端连接
- 现有客户端断开连接

### 9.5 FLAGS 响应的缓存陷阱

> ⚠️ **重要警告**

使用 `es_respond_flags_result` 时，响应必须包含 ES 客户端**可能为操作开启的所有标志**，不仅仅是当前事件请求的标志。

**错误示例**：

```
1. 进程以只读标志打开文件
2. ES 客户端响应：只设置 READ 标志（因为只请求了读）
3. 结果被缓存
4. 进程以写标志打开同一文件
5. 缓存命中，但缓存中没有 WRITE 标志
6. 写操作被自动拒绝！（即使这不是你想要的）
```

**正确做法**：

```c
// 如果你想允许进程以任意方式操作文件
// 应该设置所有合适的标志，包括 WRITE
es_respond_flags_result(client, msg, FREAD | FWRITE, true);
```

### 9.6 缓存使用原则

> **缓存仅用于性能目的，从不用于策略目的**

**错误用法**：
1. 拒绝进程打开文件，允许缓存
2. 屏蔽该进程
3. 缓存条目过期后，进程重新打开文件
4. 因为进程被屏蔽，不产生 AUTH 事件
5. 操作被自动允许！

---

## 十、高级特性

### 10.1 消息版本兼容性

各种 ES 结构可以随时间发展添加新字段。版本号是整数值，一个 OS 版本中所有消息共享同一版本号。

```c
void handle_notify_create(const es_message_t *msg) {
    // 访问新字段前必须检查版本
    if (msg->version >= 2) {
        // acl 字段在版本 2 中添加
        acl_t acl = msg->event.create.acl;
        // 使用 acl...
    }
}
```

> 请密切关注 ES 结构的头文件文档，了解哪些版本添加了新字段。

### 10.2 早期启动 (Early Boot)

> ⚠️ 仅系统扩展可用，独立应用程序不可用

**启用方式**：在 Info.plist 中设置 `NSEndpointSecurityEarlyBoot` 键

**工作流程**：
1. 系统启动时，如果有注册的早期启动客户端
2. 系统正常启动，但**不允许任何第三方应用程序执行**
3. 等待所有早期启动扩展就绪
4. 扩展调用 `es_subscribe` 发送就绪信号
5. 所有早期启动客户端就绪后，第三方应用才允许执行

**注意事项**：
- 应该在**单次** `es_subscribe` 调用中订阅全部必要事件
- 分散到多个调用可能导致漏掉事件
- 有截止期限制，必须在截止期前发送就绪信号
- 不要在订阅前执行长初始化过程

### 10.3 与 NetworkExtension 结合

ES 不提供联网操作相关事件（这些在 NetworkExtension 框架中）。

**例外**：UNIX 域套接字事件由 ES 提供

**组合使用**：
- 可以在一个组合系统扩展中同时使用 ES 和 NetworkExtension
- 在 Info.plist 中组合两个框架的键值
- 系统会恰当应用这些键值

### 10.4 消息顺序

ES 按发生顺序为客户端提供消息：

```
FORK 事件 → EXEC 事件（同一进程产生时）
```

**注意**：
- 消息顺序仅适用于**单个 ES 客户端**的订阅
- 多个客户端之间的顺序只相对于各自的订阅
- 可用消息结构中的**生成时间**重构全局顺序

### 10.5 消息生命周期

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                           消息生命周期                                               │
└─────────────────────────────────────────────────────────────────────────────────────┘

1. 消息传递给处理代码块
   │
   ├── 消息仅在处理代码块执行期间有效
   │
   ├── 从代码块返回后，不应继续访问消息（未定义行为）
   │
   └── 如需延长寿命：
       │
       ├── es_copy_message(msg)  → 复制消息
       │
       ├── 使用复制的消息...
       │
       └── es_free_message(msg_copy)  → 释放
```

### 10.6 异步处理的 QoS

```c
// 根据需求选择合适的 QoS 等级
dispatch_queue_t queue = dispatch_queue_create("com.example.es",
    dispatch_queue_attr_make_with_qos_class(
        DISPATCH_QUEUE_CONCURRENT,
        QOS_CLASS_USER_INTERACTIVE,  // AUTH 事件建议使用高优先级
        0));
```

考虑因素：
- 是否订阅 AUTH 事件
- 预期事件规模
- 想使用多少 CPU/系统资源



---

## 十一、最佳实践

### 11.1 is_es_client 字段

消息结构中的 `is_es_client` 布尔字段：
- 如果启动进程含有 EndpointSecurity 客户端权限，设置为 `true`
- ES 应用程序**无法授权自身操作**（自省事件自动允许）
- 但**可以授权其他 ES 客户端的操作**

```c
void handle_auth(es_client_t *client, const es_message_t *msg) {
    // 检查是否为其他 ES 客户端
    if (msg->process->is_es_client) {
        // 谨慎处理，避免干扰其他安全产品
        // 避免创建反馈循环
        es_respond_auth_result(client, msg, ES_AUTH_RESULT_ALLOW, false);
        return;
    }
    // 正常处理...
}
```

### 11.2 路径屏蔽建议

路径屏蔽可以：
- 防止客户端被消息淹没
- 减少需处理/授权的消息数量
- 改善系统整体性能

**示例**：屏蔽 Spotlight 索引服务

```c
// 如果不关心 Spotlight 索引
es_mute_path_prefix(client, "/System/Library/Frameworks/CoreServices.framework/");
```

### 11.3 缓存使用原则

| ✅ 正确 | ❌ 错误 |
|---------|---------|
| 仅用于性能优化 | 用于策略实施 |
| 允许缓存后继续监控 | 允许缓存后屏蔽进程 |

### 11.4 调试注意事项

> ⚠️ 调试订阅 AUTH 事件的应用时要小心

- 响应截止期**无法禁用或延长**
- 即使应用程序遇到断点，仍必须在截止期前响应
- 否则进程将被终止

### 11.5 消息丢弃检测

如果消息队列满了，ES 可能丢弃消息。

```c
void handle_event(es_client_t *client, const es_message_t *msg) {
    static uint64_t last_seq_num = 0;
    
    // 检查序列号（每客户端每事件类型独有）
    if (msg->seq_num > last_seq_num + 1) {
        uint64_t dropped = msg->seq_num - last_seq_num - 1;
        os_log_error(OS_LOG_DEFAULT, "Dropped %llu messages!", dropped);
    }
    last_seq_num = msg->seq_num;
}
```

**高丢弃率的解决方案**：
- 使用屏蔽减少消息量
- 异步处理
- 跨多个 ES 客户端分割订阅

### 11.6 事件处理代码块原则

> 事件处理代码块应该**尽可能快**

- 不要执行大量 I/O
- 不要执行 CPU 密集型任务
- 目标：快速返回，持续离队消息
- 保持消息队列规模较小，防止丢弃消息

---

## 十二、macOS Big Sur 新特性

### 12.1 EXEC 事件增强

新增事件特定 API：
- **文件描述符列表**：新进程开始执行时的 FD 列表
- **FD 类型信息**：每个 FD 的类型
- **Pipe 唯一标识**：跟踪进程间通过 Pipe 通信

**注意**：
- 性能所限，不是所有 FD 都能提供
- 主要关注：stdin、stdout、stderr
- 客户端能获悉是否有未枚举的其他描述符

### 12.2 性能改进

| 改进 | 效果 |
|------|------|
| 重写数据结构 | 减少内存分配 |
| 增加事件吞吐量 | 更高性能 |
| 调整缓存 | 清除无效化瓶颈 |
| 改善内存性能 | 更少丢弃 |

### 12.3 新事件类型

#### 12.3.1 ES_EVENT_TYPE_NOTIFY_TRACE

进程被调试时通知客户端。

#### 12.3.2 ES_EVENT_TYPE_NOTIFY_CS_INVALIDATED

代码签名失效事件：
- 签名进程执行时，内核不断验证代码页哈希
- 发现不匹配时，清除 `CS_VALID` 标志位
- 以前：必须等待将来的消息检查代码签名标志
- 现在：可以得到**即时通知**

**注意**：使用强化运行时（`CS_KILL` 标志）的二进制文件，哈希不匹配时仍会被系统自动终止。

### 12.4 审计子系统弃用

> macOS Big Sur 宣布**弃用审计子系统**

**弃用范围**：
- 写入审计轨迹文件的事件（`/var/audit` 目录）
- 发送到 Auditpipe 伪设备的事件

**不受影响**：
- 审计令牌 (audit_token)
- 审计会话 (audit session)

**建议**：依赖审计事件的产品应迁移到 EndpointSecurity 框架。

---

## 十三、资源与链接

### 13.1 权限申请

- **EndpointSecurity 权限申请**：https://developer.apple.com/contact/request/system-extension/

### 13.2 文档

- **EndpointSecurity API 文档**：Apple Developer 网站
- **系统扩展 API 文档**：Apple Developer 网站
- **SDK 头文件文档**：包含网站上可能没有的详细注释

### 13.3 相关 Session

- **WWDC 2019**：系统扩展与 DriverKit
- **WWDC 2020**：Build an Endpoint Security app (本 Session)

### 13.4 示例代码

Apple 提供基于本 Session 演示的示例代码，帮助入门 EndpointSecurity 框架。

---

## 附录：API 速查表

### A.1 客户端管理

| API | 说明 |
|-----|------|
| `es_new_client` | 创建新的 ES 客户端 |
| `es_delete_client` | 删除 ES 客户端 |

### A.2 订阅管理

| API | 说明 |
|-----|------|
| `es_subscribe` | 订阅事件 |
| `es_unsubscribe` | 取消订阅事件 |
| `es_unsubscribe_all` | 取消所有订阅 |

### A.3 响应 API

| API | 说明 | 适用事件 |
|-----|------|----------|
| `es_respond_auth_result` | ALLOW/DENY 响应 | 大多数 AUTH 事件 |
| `es_respond_flags_result` | 标志位响应 | AUTH_OPEN |

### A.4 屏蔽 API

| API | 说明 |
|-----|------|
| `es_mute_process` | 按审计令牌屏蔽进程 |
| `es_unmute_process` | 取消屏蔽进程 |
| `es_mute_path_literal` | 按完整路径屏蔽 |
| `es_mute_path_prefix` | 按路径前缀屏蔽 |

### A.5 缓存 API

| API | 说明 |
|-----|------|
| `es_clear_cache` | 清除整个缓存 |

### A.6 消息 API

| API | 说明 |
|-----|------|
| `es_copy_message` | 复制消息（延长寿命） |
| `es_free_message` | 释放复制的消息 |

### A.7 辅助 API

| API | 说明 |
|-----|------|
| `audit_token_to_pid` | 从审计令牌提取 PID |
| `es_exec_arg_count` | 获取 EXEC 事件参数数量 |
| `es_exec_arg` | 获取 EXEC 事件指定参数 |

---

*文档整理自 WWDC 2020 Session 10159: Build an Endpoint Security app*  
*整理日期: 2026-01-09*
