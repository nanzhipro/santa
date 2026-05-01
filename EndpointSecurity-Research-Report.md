## Santa 对 EndpointSecurity Framework 的使用调研报告

> 版本：2026-01  
> 代码基线：`northpolesec/santa`（`Source/santad` 目录及相关模块）  
> 主题：系统梳理 Santa 如何使用 macOS EndpointSecurity Framework，并分析其 API 使用方式和设计原因，为自研产品提供参考。

---

## 一、总体架构：三层封装的 EndpointSecurity 使用方式

Santa 对 EndpointSecurity 的使用不是直接在业务逻辑里散落 `es_*` 调用，而是分为三层：

- **底层 C→C++ 封装层**
  - `Source/santad/EventProviders/EndpointSecurity/Client.h`
  - `Source/santad/EventProviders/EndpointSecurity/EndpointSecurityAPI.{h,mm}`
  - `Source/santad/EventProviders/EndpointSecurity/Message.{h,mm}`
  - 职责：安全地管理 `es_client_t` / `es_message_t` 生命周期，统一包装 `es_*` C API，并提供 exec 参数/环境变量等 helper。

- **中间通用 ES 客户端层**
  - `Source/santad/EventProviders/SNTEndpointSecurityClientBase.h`
  - `Source/santad/EventProviders/SNTEndpointSecurityClient.{h,mm}`
  - 职责：统一处理客户端创建（`es_new_client`）、订阅、muting、AUTH deadline 管理、多队列调度、是否忽略其他 ES 客户端等。

- **上层功能化 ES 客户端层**
  - `SNTEndpointSecurityAuthorizer`：执行拦截与策略决策
  - `SNTEndpointSecurityRecorder`：事件记录与遥测
  - `SNTEndpointSecurityDeviceManager`：USB/网络挂载控制
  - `SNTEndpointSecurityTamperResistance`：自保护与反篡改
  - `SNTEndpointSecurityDataFileAccessAuthorizer`：基于路径的 File Access Authorization (FAA)
  - `SNTEndpointSecurityProcessFileAccessAuthorizer`：基于进程的 FAA
  - 这些类各自订阅不同 ES 事件子集，构成一个多客户端协同体系。

这种结构将“如何正确、安全、高性能地使用 EndpointSecurity”固化在底层/中间层，业务逻辑只依赖高层语义接口。例如“订阅某些事件”、“对这条 AUTH 事件 allow/deny”、“只 watch 某些路径/某些进程”，而不直接触碰 `es_*` C API 和复杂的生命周期管理。

---

## 二、底层封装层：Client / EndpointSecurityAPI / Message

### 2.1 RAII 封装 `es_client_t`：`santa::Client`

文件：`Source/santad/EventProviders/EndpointSecurity/Client.h`

核心设计：

- 构造函数保存 `es_client_t *` 和 `es_new_client_result_t`。
- 析构函数如果有有效 client，则调用 `es_delete_client(client_)`。
- 删除拷贝构造/拷贝赋值，仅支持 move 语义（避免多次释放）。
- 提供：
  - `bool IsConnected()`：`result_ == ES_NEW_CLIENT_RESULT_SUCCESS`
  - `es_new_client_result_t NewClientResult()`
  - `es_client_t *Get() const`

**为什么要这样使用 EndpointSecurity API：**

- ES 官方约束：使用 `es_new_client` 获得的 `es_client_t *` 必须成对调用 `es_delete_client` 释放，否则导致内核资源泄漏。
- Santa 用 RAII 类 `Client` 将 “`es_delete_client` 必须被调用” 变成编译期保证：对象生命周期结束即释放。
- 同时保存 `es_new_client_result_t`，便于上层根据错误类型输出人类可读错误信息（例如缺 F ull Disk Access / 缺 EndpointSecurity entitlement / 非 root 等）。

对自研产品的建议：

- 参考 Santa 的做法，把 ES client 封装成 RAII 对象，不要在业务代码中成对手写 `es_new_client` / `es_delete_client`。

### 2.2 统一 C API 的 C++ 接口：`EndpointSecurityAPI`

文件：`Source/santad/EventProviders/EndpointSecurity/EndpointSecurityAPI.{h,mm}`

头文件定义了几类方法：

- **客户端管理**
  - `Client NewClient(void (^message_handler)(es_client_t *, Message));`
- **订阅与取消订阅**
  - `bool Subscribe(const Client &, const std::set<es_event_type_t> &);`
  - `bool UnsubscribeAll(const Client &);`
- **muting 控制（路径/进程 + 反转）**
  - `bool UnmuteAllPaths(const Client &);`
  - `bool UnmuteAllTargetPaths(const Client &);`
  - `bool IsTargetPathMutingInverted(const Client &);`
  - `bool InvertTargetPathMuting(const Client &);`
  - `bool MuteTargetPath(const Client &, std::string_view path, WatchItemPathType);`
  - `bool UnmuteTargetPath(const Client &, std::string_view path, WatchItemPathType);`
  - `bool IsProcessMutingInverted(const Client &);`
  - `bool InvertProcessMuting(const Client &);`
  - `bool MuteProcess(const Client &, const audit_token_t *);`
  - `bool UnmuteProcess(const Client &, const audit_token_t *);`
- **消息 retain/release**
  - `void RetainMessage(const es_message_t *);`
  - `void ReleaseMessage(const es_message_t *);`
- **AUTH 结果响应与缓存控制**
  - `bool RespondAuthResult(const Client &, const Message &, es_auth_result_t, bool cache);`
  - `bool RespondFlagsResult(const Client &, const Message &, uint32_t allowed_flags, bool cache);`
  - `bool ClearCache(const Client &);`
- **exec 参数/环境/FD helper**
  - `ExecArgCount / ExecArg / ExecArgs`
  - `ExecEnvCount / ExecEnv / ExecEnvs`
  - `ExecFDCount / ExecFD`

实现层直接透传到 C API，如：

```cpp
Client EndpointSecurityAPI::NewClient(void (^message_handler)(es_client_t *, Message)) {
  es_client_t *client = NULL;

  auto shared_esapi = shared_from_this();
  es_new_client_result_t res = es_new_client(&client, ^(es_client_t *c, const es_message_t *msg) {
    @autoreleasepool {
      message_handler(c, Message(shared_esapi, msg));
    }
  });

  return Client(client, res);
}

bool EndpointSecurityAPI::Subscribe(const Client &client,
                                    const std::set<es_event_type_t> &event_types) {
  std::vector<es_event_type_t> subs(event_types.begin(), event_types.end());
  return es_subscribe(client.Get(), subs.data(), (uint32_t)subs.size()) == ES_RETURN_SUCCESS;
}
```

**为什么要这样设计：**

- **单一封装点 + 可 Mock**：
  - 所有 `es_*` 调用集中在 `EndpointSecurityAPI`，上层只依赖虚接口，可用 `MockEndpointSecurityAPI` 编写单元测试（见 `MockEndpointSecurityAPI.h` 与多处测试文件）。
- **`shared_from_this()` 传给 `Message`**：
  - NewClient 中用 `auto shared_esapi = shared_from_this();`，构造 `Message(shared_esapi, msg)`。
  - 之后高层从 `Message` 就能取到 `ESAPI()`，在任何处理逻辑里都可以访问 `ExecArgs/ExecEnvs` 等 helper，而无需在栈上反复传 `EndpointSecurityAPI*`。
- **集中管理 muting / cache / flags 响应**：
  - 封装 `es_mute_path/es_invert_muting/es_clear_cache/es_respond_flags_result` 等细节，业务层只表达语义：“watch 这些路径”、“watch 这些进程”、“清空 ES 缓存”、“根据 allow/deny 响应”。

对自研产品的建议：

- 定义一个 `EndpointSecurityAPI` 风格的虚接口，把所有 ES 相关操作都集中在这里，便于测试、mock 和后续替换。

### 2.3 `santa::Message`：对 `es_message_t` 的生命周期与辅助封装

文件：`Source/santad/EventProviders/EndpointSecurity/Message.{h,mm}`

关键职责：

- 持有：
  - `std::shared_ptr<EndpointSecurityAPI> esapi_`
  - `const es_message_t *es_msg_`
- 生命周期：
  - 构造时通过 `esapi_->RetainMessage(es_msg_)` 调用 `es_retain_message`。
  - 析构时调用 `esapi_->ReleaseMessage(es_msg_)` → `es_release_message`。
  - 拷贝构造时增加引用计数；移动构造时转移所有权。
- 对外暴露：
  - `operator->` / `operator*`：`es_message_t` 的只读访问。
  - `ESAPI()`：取回 `EndpointSecurityAPI`。
  - `ParentProcessName()` / `ParentProcessPath()`：封装对父进程 `audit_token` 的解析。
  - `PathTargets()`：统一抽象一个事件中所有“路径目标”（用于 FAA 等逻辑）。

**为什么要这样管理 `es_message_t`：**

- ES 的官方要求：如果在 callback block 结束后还需要使用 `es_message_t`，必须在 block 内调用 `es_retain_message`，用完再 `es_release_message`。
- Santa 中大量逻辑是异步提交到 GCD 队列上执行（特别是授权与 FAA），因此不能直接在 block 中处理全部业务，否则容易超时。
- 将 retain/release 抽象到 `Message` 的构造/析构中，用 RAII 保证所有异步路径不会忘记 release，也避免在每个业务函数顶部写样板代码。

对自研产品的建议：

- 一定要封装一个类似 `Message` 的 RAII 类：
  - 构造时 retain，析构时 release。
  - 允许复制（增加引用计数）和移动（转移所有权）。
  - 不要在业务代码里手工调用 `es_retain_message` / `es_release_message`。

---

## 三、中间层：通用 ES 客户端 `SNTEndpointSecurityClient`

### 3.1 接口：`SNTEndpointSecurityClientBase`

文件：`Source/santad/EventProviders/SNTEndpointSecurityClientBase.h`

抽象出所有 ES 客户端的共同行为：

- 初始化：`initWithESAPI:metrics:processor:`
- 建立客户端：`establishClientOrDie`（失败抛异常终止）
- 订阅/取消订阅：
  - `subscribe:`
  - `subscribeAndClearCache:`（先订阅，再 `es_clear_cache`，防止在 “创建 client” 与 “订阅事件” 的空窗期被其他 client cache 住）
  - `unsubscribeAll`
- muting：
  - `unmuteAllTargetPaths` / `enableTargetPathWatching` / `muteTargetPaths` / `unmuteTargetPaths`
  - `enableProcessWatching` / `muteProcess` / `unmuteProcess`
- 响应 AUTH：
  - `respondToMessage:withAuthResult:cacheable:`
- 异步处理：
  - `processEnrichedMessage:handler:`
  - `asynchronouslyProcess:handler:`
  - `processMessage:handler:`
- 缓存与上下文：
  - `clearCache`
  - `handleContextMessage:`（用于特殊上下文，如仅更新指标不进入业务逻辑）

### 3.2 实现：`SNTEndpointSecurityClient` 的核心逻辑

文件：`Source/santad/EventProviders/SNTEndpointSecurityClient.mm`

#### 3.2.1 建立 ES 客户端与队列

- 持有：
  - `_esApi`：`std::shared_ptr<EndpointSecurityAPI>`
  - `_metrics`：`std::shared_ptr<Metrics>`
  - `_esClient`：前述 `santa::Client`
  - `_authQueue`：高优先级并发队列，处理 AUTH 事件
  - `_notifyQueue`：Utility QoS 并发队列，处理 NOTIFY 等非时间敏感任务

**为什么拆两个队列：**

- AUTH 事件存在严格 deadline，如果和日志/遥测混在一个队列，很容易被慢任务拖垮，造成超时。
- 通过将 AUTH 事件限定在 `_authQueue`，可以更好地控制最大处理时延，并在该队列内实现 deadline 兜底逻辑。

#### 3.2.2 `establishClientOrDie`：创建 client 并处理消息

核心流程：

1. 调用 `_esApi->NewClient(...)` 创建 `es_client_t*`：
   - block 参数 `(es_client_t *c, Message esMsg)` 中仅做：
     - 记录 `processingStart`；
     - 更新 metrics（保持事件序号一致）；
     - 调用 `handleContextMessage` 处理 context-only 事件；
     - 调 `shouldHandleMessage` 判断是否应该处理（例如是否忽略其他 ES 客户端进程）；
     - 最终调用子类覆写的 `handleMessage:recordEventMetrics:`。
2. 若 `!_esClient.IsConnected()`，根据 `es_new_client_result_t` 生成友好错误，并抛异常终止：
   - 比如未授予 Full Disk Access、缺少 EndpointSecurity entitlement、非 root 运行等。
3. 调 `muteSelf`：
   - 使用 ES 提供的 `es_mute_process(client, tok)`，静音自身进程（santad），避免自己产生大量无意义事件，也避免被 TamperResistance 等逻辑影响。

**为什么失败直接终止进程：**

- 对一个安全产品来说，如果无法成功注册为 EndpointSecurity client，继续运行没有意义，且可能误导用户“安全软件仍在运行”。丢给 launchd/WATCHDOG 重新拉起反而更可靠。

#### 3.2.3 统一 AUTH 响应与 deadline 兜底

`respondToMessage:withAuthResult:cacheable:` 的实现逻辑：

- 如果事件类型是 `ES_EVENT_TYPE_AUTH_OPEN`：
  - 使用 `es_respond_flags_result`：
    - allow → `allowed_flags = 0xffffffff`；
    - deny → `allowed_flags = 0x0`。
- 否则使用 `es_respond_auth_result`。

这样业务层只需要关心“allow/deny + 是否 cacheable”，无需知道到底是走 `auth_result` 还是 `flags_result`，也不必关心 flags 细节。

**deadline 管理：**

- 每条 AUTH 事件上 Santa 都会读取 `msg->deadline`，通过 `mach_absolute_time()` 计算当前剩余时间，得到一个 `processingBudget`（留出 1–5 秒 headroom）。
- 在 `_authQueue` 上使用 `dispatch_after(processingBudget, ...)` 安排一个兜底 block：
  - 如果业务处理超时，兜底 block 会尝试从信号量获取执行权，并根据配置：
    - `failClosed = true` → 自动 `ES_AUTH_RESULT_DENY`，保守阻断；
    - 否则 → 自动 `ES_AUTH_RESULT_ALLOW`，避免因组件过载导致大面积业务阻断。
- 真正的业务处理则在另一个 `dispatch_async` block 中执行，完成后释放信号量，阻止兜底 block 生效。

这一套逻辑完全封装在 `SNTEndpointSecurityClient` 中，高层 Authorizer/FAA 不需要每条事件都对 deadline 进行管理与兜底判断。

#### 3.2.4 忽略其他 EndpointSecurity 客户端进程

函数 `shouldHandleMessage:` 使用 ES 结构体的 `process->is_es_client` 字段来识别其它 ES 客户端生成的进程：

- 如果配置 `IgnoreOtherEndpointSecurityClients` 开启：
  - 对这些进程的 AUTH 事件直接 `ES_AUTH_RESULT_ALLOW`（并允许 ES cache）。
  - 其他类型的事件直接忽略。

**原因：**

- 在同一台机器上可能同时存在多个 EndpointSecurity 客户端（多个安全产品或自家多组件）。
- 如果互相审计/阻断，会导致复杂的交互与潜在死锁，Santa 的策略是**尽量不干扰其他 ES 客户端**。

---

## 四、上层功能 ES 客户端：事件订阅与策略实现

本节按功能模块逐一说明所订阅的 ES 事件、处理逻辑以及设计原因。

### 4.1 SNTEndpointSecurityAuthorizer：执行拦截与决策

文件：`Source/santad/EventProviders/SNTEndpointSecurityAuthorizer.mm`

#### 4.1.1 订阅的事件

```objc
- (void)enable {
  [super subscribeAndClearCache:{
                                    ES_EVENT_TYPE_AUTH_EXEC,
                                    ES_EVENT_TYPE_AUTH_PROC_SUSPEND_RESUME,
  }];
}
```

- `ES_EVENT_TYPE_AUTH_EXEC`：进程执行授权，是 Santa 的核心控制点。
- `ES_EVENT_TYPE_AUTH_PROC_SUSPEND_RESUME`：
  - 用于配合 “Hold & Ask” 功能，防止用户在 GUI 审批期间被其它进程非法 resume / suspend。

#### 4.1.2 AUTH_EXEC 处理流程

大致流程：

1. **预检查**：调用 `execController synchronousShouldProcessExecEvent:`
   - 例如路径过长、被截断等情况会直接 deny 并缓存一个特殊决策。
2. **查本地 AuthResultCache**：
   - 如果返回的是最终动作（Allow/Deny/Hold/AllowCompiler 等），直接转换为 `ES_AUTH_RESULT_*` 并响应。
   - 如果返回 `SNTActionRequestBinary`，说明当前没有决策但已经有其他线程在处理中，则轮询等待一段时间（`usleep(5000)`）。
3. **触发决策流程**：
   - 调用 `SNTExecutionController::validateExecEvent` 执行策略计算：
     - 从 `es_message_t` 取目标二进制、签名信息、Quarantine 信息等；
     - 通过规则表/同步策略/CEL 表达式等生成 `SNTCachedDecision`。
4. **通过 `postAction:forMessage:` 统一转换为 ES 响应**：
   - 不同类型的 `SNTAction`（例如 Hold & Ask、Allow Compiler、Allow No Cache）会同时影响：
     - 向 ES 返回 allow/deny；
     - 是否允许 ES cache；
     - 是否更新/移除 Santa 自身的 `AuthResultCache`。

**API 使用要点：**

- 使用 `es_message_t->event.exec.target` 获取 `es_process_t *`，进而得到：
  - 审计 token（`audit_token_to_pid` / `audit_token_to_euid` 等）
  - 路径、签名 ID、Team ID 等。
- 通过 `EndpointSecurityAPI::ExecArgs/ExecEnvs` 获得 argv/env，用于 CEL 脚本的上下文。
- 对授权结果，显式选择是否让 ES cache，从而避免 DENY 结果被内核长期缓存而压住规则更新。

#### 4.1.3 AUTH_PROC_SUSPEND_RESUME 与 Hold & Ask

在 Authorizer 中对 `AUTH_PROC_SUSPEND_RESUME` 的策略：

- 非 resume 类型的 suspend/resume 直接 allow 并记录为 dropped（不参与安全决策）。
- resume 事件交给 `SNTExecutionController::validateSuspendResumeEvent` 进行检查：
  - 如果是对被 Santa 挂起等待用户决策的进程的 resume 尝试，则 deny；
  - 反之 allow。

**设计理由：**

- “Hold & Ask” 模式中，Santa 对用户要审批的进程采取 `suspend + ES_ALLOW` 两步：
  - 对 ES 来说已经 allow，不会超时；
  - 但进程被实际 suspend，不会执行。
- 如果其他进程试图 resume 该进程，就相当于绕过用户审批，必须被禁止。这只能通过监控 `AUTH_PROC_SUSPEND_RESUME` 实现。

### 4.2 SNTExecutionController：具体执行策略实现

文件：`Source/santad/SNTExecutionController.mm`

ExecutionController 并不是 ES client，但大量依赖 `santa::Message` 和 ES 结构体进行决策。

#### 4.2.1 对 ES 结构体的使用

- 读取：
  - `esMsg->event.exec.target` → `es_process_t`。
  - `targetProc->executable` → `es_file_t`，取路径长度、`path_truncated` 等。
  - `targetProc->audit_token` → UID/GID/PID/PIDVersion。
  - `esMsg.ParentProcessName()/ParentProcessPath()` → 利用 `Message` 封装的辅助函数。
- 通过 `[[SNTFileInfo alloc] initWithEndpointSecurityFile:...]` 将 `es_file_t` 转换为 Santa 封装的文件信息类，进一步拉取签名信息、bundle 信息等。
- 构造 `SNTCachedDecision` 并缓存到 `SNTDecisionCache` 中，供日志、挂载控制、FAA 等模块复用。

#### 4.2.2 与 EndpointSecurityAPI 的配合：CEL Activation

在创建 CEL Activation（动态策略）时，会从 `Message` 上取回 `EndpointSecurityAPI`，调用 `ExecArgs/ExecEnvs` 等 helper：

- 这样做的好处是：
  - 上层策略逻辑完全独立于 `es_exec_arg_count/es_exec_arg/es_exec_env_count/...` 这些 C 接口。
  - 所有字符串解析（`es_string_token_t` → `std::string_view` → `std::string`）都封装在一处。

对自研产品的启示：

- 把“如何正确读取 exec 参数/环境”的知识固化在 `EndpointSecurityAPI` 中，而不是分散在策略代码中。

### 4.3 SNTEndpointSecurityRecorder：只订阅 NOTIFY 事件做日志与遥测

文件：`Source/santad/EventProviders/SNTEndpointSecurityRecorder.mm`

#### 4.3.1 订阅的事件

Recorder 只订阅 NOTIFY 事件：

- 文件相关：`NOTIFY_CLONE/CLOSE/COPYFILE/EXCHANGEDATA/LINK/RENAME/UNLINK/CS_INVALIDATED`
- 进程相关：`NOTIFY_EXEC/EXIT/FORK`
- 身份认证/会话相关：`NOTIFY_AUTHENTICATION`、`LOGIN_*`、`LW_SESSION_*`、`SCREENSHARING_*`、`OPENSSH_*`
- 启动项/XProtect：`BTM_LAUNCH_ITEM_*`、`XP_MALWARE_*`
- Gatekeeper/TCC（macOS 15+）：`GATEKEEPER_USER_OVERRIDE/TCC_MODIFY`

这些通知型事件不会影响内核决策，主要用于：

- 记录审计日志；
- 驱动编译器追踪（CompilerController）；
- 生成遥测数据发送到服务器。

#### 4.3.2 处理要点

- 对 `NOTIFY_CLOSE` 事件：
  - 若 `modified == false` 且 `was_mapped_writable == false`，直接忽略，不记录为 drop（这类事件量大且安全价值低）。
  - 否则删除对应 `AuthResultCache` 条目，避免对已经修改的文件继续沿用旧决策。
- 利用 `Enricher` 进行同步 enrich，再将 `EnrichedMessage` 放到 `_notifyQueue` 中异步送给 `Logger`。

**设计理由：**

- 将 “是否记录日志/遥测” 的决策与内核授权解耦，即使关闭日志功能，授权仍然能正常工作。
- 将 I/O 与序列化开销放在低优先级队列中，不干扰 AUTH 队列的实时性。

### 4.4 SNTEndpointSecurityDeviceManager：挂载控制

文件：`Source/santad/EventProviders/SNTEndpointSecurityDeviceManager.mm`

#### 4.4.1 订阅的事件

- `ES_EVENT_TYPE_AUTH_MOUNT`
- `ES_EVENT_TYPE_AUTH_REMOUNT`
- `ES_EVENT_TYPE_NOTIFY_UNMOUNT`

配合 DiskArbitration 框架，DeviceManager 实现：

- 启动时根据配置统一处理已有挂载（Unmount/ForceUnmount/Remount 等）；
- 在运行期控制：
  - USB/SD 设备挂载；
  - 网络挂载（如 SMB/NFS 等）。

#### 4.4.2 与 ES 的交互方式

- 在 `handleMessage:` 里：
  - 如果事件是 `NOTIFY_UNMOUNT`：
    - 通过 `AuthResultCache::FlushCache(NonRootOnly, FilesystemUnmounted)` 刷新非 root 文件系统的缓存。
  - 如果是挂载类 AUTH：
    - 通过 `msg->version` 和 `event.mount/remount.disposition` 判断是否为网络挂载（仅在 macOS 15+ message version >= 8 时使用该字段）。
    - 根据配置：
      - 若是网络挂载且未开启 blockNetworkMount → 直接 allow，并不计为 drop。
      - 若是 USB/SD 设备且未开启 blockUSBMount → 直接 allow。
      - 其他情况则根据 policy deny 并生成 `SNTStoredNetworkMountEvent` 记录。

**注意版本兼容性：**

- 访问 `esMsg->event.mount.disposition` 前，需先检查 message 版本（macOS 15 引入），以免在老系统上访问未定义字段。

### 4.5 SNTEndpointSecurityTamperResistance：自保护与反篡改

文件：`Source/santad/EventProviders/SNTEndpointSecurityTamperResistance.mm`

#### 4.5.1 使用 target path muting 的 watch-list 模式

- 在 `enable` 中调用：
  - `[super enableTargetPathWatching]`：
    - 内部会调用 `UnmuteAllTargetPaths + InvertTargetPathMuting`，使 muting 反转。
  - 然后指定一组受保护路径（数据库、状态文件、Santa.app、自家 launchd plist 等），通过 `muteTargetPaths` 将其加入 ES 的“muted set”。
- 在 muting 反转模式下，被 mute 的路径成为**唯一会产生事件的目标**，即 watch-list。

#### 4.5.2 订阅的事件与策略

订阅的 AUTH 事件：

- `AUTH_UNLINK/RENAME/OPEN`
- `AUTH_SIGNAL`
- `AUTH_EXEC`（只关注 `/bin/launchctl`）
- `AUTH_PROC_SUSPEND_RESUME`

策略大致如下：

- 若 unlink/rename/open 目标路径在受保护集合中 → DENY + 记录日志。
- 若向 Santad 发送非 0 信号且来源进程不是 launchd (pid=1) → DENY。
- 若配置开启 `enableAntiTamperProcessSuspendResume`，且试图 suspend/resume Santad → DENY。
- 对 `/bin/launchctl` 的 EXEC：
  - 拦截试图停止 Santa 守护进程的命令（匹配参数中含 `com.northpolesec.santa.daemon`）。
  - 拦截试图 load 旧版 Google Santa 的 launchd plist，并主动删除这些 legacy plist 文件。

**为什么要把自保护做在 ES 层：**

- EndpointSecurity 提供的是内核级拦截点，远早于普通文件监控或进程监控；在这里阻断篡改行为更难被绕过。
- 利用 AUTH 事件可以在操作发生前截断（prevent），而不是事后发现异常。

### 4.6 File Access Authorizers：Data & Process FAA

两类 FAA 客户端都使用了 muting 反转模式，但监控粒度不同。

#### 4.6.1 DataFileAccessAuthorizer：按路径策略

文件：`Source/santad/EventProviders/SNTEndpointSecurityDataFileAccessAuthorizer.mm`

关键点：

- 在初始化后调用 `[super enableTargetPathWatching]`，通过 inverted target path muting 实现 watch-list。
- 订阅 AUTH 事件：
  - `AUTH_CLONE/COPYFILE/CREATE/EXCHANGEDATA/LINK/OPEN/RENAME/TRUNCATE/UNLINK` + `NOTIFY_EXIT`。
- 使用 `Message::PathTargets()` 统一枚举当前事件的所有文件目标，再通过策略引擎 `FAAPolicyProcessor` 与 watch-item policy 做匹配，得出 allow/deny 和 cacheable 决策。
- `watchItemsCount:newPaths:removedPaths:` 回调动态调整 watch-list：
  - count==0 → `disable`（取消订阅 + unmuteAllTargetPaths）
  - 否则：
    - 对 removedPaths 调 `unmuteTargetPaths`；
    - 对 newPaths 调 `muteTargetPaths`；
    - 并确保 `enable` 被调用。

**为何使用 target path muting 的 inverted 模式：**

- FAA 通常只关心少量敏感路径（例如公司机密目录），不必对全盘文件访问做代理。
- 在 inverted 模式下，ES 只对被 mute 到的路径产生事件，系统负载大幅下降。

#### 4.6.2 ProcessFileAccessAuthorizer：按进程策略

文件：`Source/santad/EventProviders/SNTEndpointSecurityProcessFileAccessAuthorizer.mm`

关键点：

- 初始化时调用 `[self enableProcessWatching]`，内部会：
  - 清空 path/target muting；
  - 调用 `es_invert_muting(..., ES_MUTE_INVERSION_TYPE_PROCESS)` 反转进程静音逻辑；
  - 之后通过 `muteProcess(tok)` 把需要监控的进程加入 watch-list。
- 订阅事件集合包括：
  - FAA 所需的 AUTH 事件（OPEN/RENAME/UNLINK 等）；
  - 进程生命周期相关的 NOTIFY（EXEC/EXIT/FORK）。
- 通过 `probeInterest:` 与 Authorizer 协作：
  - 在 `AUTH_EXEC` 时检查新进程是否匹配任何 process FAA 策略；
  - 若匹配则 `startWatching(audit_token, policy)`：
    - 将进程加入本地 `_procRuleCache`；
    - 调用 `muteProcess(&tok)` 开始接收其所有 FAA 相关的事件。

**muting 反转模式的必要性：**

- 传统 muting 只能表示 “屏蔽这些进程”，不能表达 “只关注这些进程”；
+- 对于 process-centered FAA，更自然的语义是 watch-list：只对某些业务进程做细粒度文件访问控制。

---

## 五、辅助模块中对 EndpointSecurity 的使用

### 5.1 SNTRuleTable：临时 ES 客户端读取 Default Mute Set

文件：`Source/santad/DataLayer/SNTRuleTable.mm`

Santa 在初始时创建一个短生命周期 ES client，只用于调用：

- `es_muted_paths_events(client, &mps)`：读取当前系统的默认 muted paths（Default Mute Set）。
- 遍历 `mps->paths`，挑出 type 为 `ES_MUTE_PATH_TYPE_LITERAL` 的路径，加入 Santa 的 `criticalSystemBinaryPaths` 集合。
- 关键路径包括 WindowServer、tccd、securityd、syspolicyd、amfid 等系统进程。

**设计理由：**

- 从 macOS Monterey 开始，系统对一些关键进程自动应用了默认的 mute set，以降低第三方 ES 客户端的干扰。
- Santa 需要了解这些路径，以便在自身策略中给予这些进程更高优先级或特殊处理（例如避免对其执行进行阻断或大量审计）。
- 由于只在启动时读取一次，采用一个临时 client + no-op handler 即可。

### 5.2 Enricher 与 Utilities：围绕 ES 类型构建高层语义

文件：

- `Source/santad/EventProviders/EndpointSecurity/Enricher.{h,mm}`
- `Source/santad/Logs/EndpointSecurity/Serializers/Utilities.{h,mm}`

职责：

- `Enricher`：
  - 将 `es_process_t`、`es_file_t` 等转换为 `EnrichedProcess` / `EnrichedFile` / `EnrichedMessage`：
    - 填充用户名 / 组名（基于 UID/GID）；
    - 使用 ProcessTree 附加进程树注解。
  - 提供 `UsernameForUID/UsernameForGID/UIDForUsername`，并内部用 `SantaCache` 做缓存。
- `Utilities`：
  - `OriginalPathForTranslocation`：根据 `es_process_t->executable->path` 调 Security.framework API 判断是否处于 App Translocation 环境，并解析原始路径。
  - `SerialForDevice` / `DiskImageForDevice` / `MountFromName`：基于 IOKit 与 `statfs` 解析设备和挂载源信息。
  - `NormalizePath/ConcatPrefixIfRelativePath`：统一处理 `es_string_token_t` 中可能是 URL 或相对路径的情况。

这些辅助模块依赖 ES 类型（如 `es_process_t`、`es_file_t`、`es_string_token_t`），但并不直接调用 `es_*` 函数，仍通过底层封装间接使用。

---

## 六、EndpointSecurity API 总结与实践建议

本节根据 Santa 的使用方式对 EndpointSecurity API 做系统总结，并提炼实践建议。

### 6.1 客户端与消息对象

- 核心类型：
  - `es_client_t`：EndpointSecurity 客户端实例。
  - `es_message_t`：单个事件消息：
    - `version`：结构体版本，访问新字段前必须检查。
    - `event_type`：`ES_EVENT_TYPE_*`。
    - `action_type`：`ES_ACTION_TYPE_AUTH` / `ES_ACTION_TYPE_NOTIFY`。
    - `deadline`：仅 AUTH 事件存在，表示最晚响应时间（mach time）。
- Santa 的封装方式：
  - 用 `Client` RAII 管理 `es_client_t`。
  - 用 `Message` RAII 管理 `es_message_t` 引用计数和辅助信息。

**建议：**

- 对 `es_client_t` 和 `es_message_t` 均采用 RAII 封装，禁止裸指针在业务层流动。

### 6.2 订阅与版本兼容

- C API：
  - `es_subscribe(es_client_t *, const es_event_type_t *events, uint32_t count)`
  - `es_unsubscribe_all(es_client_t *)`
- Santa 做法：
  - 不同功能模块单独 client + 单独订阅集：
    - Authorizer 只订阅 AUTH_EXEC/PROC_SUSPEND_RESUME。
    - Recorder 订阅大量 NOTIFY。
    - DeviceManager/Tamper/FAA 各自订阅少量 AUTH/NOTIFY。
  - 对新事件（如 Gatekeeper/TCC）与新字段（如 mount 的 disposition）：
    - 使用编译期宏（`HAVE_MACOS_15` 等）和运行时的 `@available(macOS 15.0, *)` 双重保护。
    - 在 `Enricher` 中为未知枚举类型保留 default 分支，返回 `nullptr` 表示“不支持该类型”，而不是崩溃。

**建议：**

- 按功能拆分 ES client，而不是创建一个全能 client。
- 对于任何新字段或新类型，必须以 message version 和 `@available` 保护访问。

### 6.3 muting 与反转模式

- C API：
  - Path muting：
    - `es_mute_path`, `es_unmute_path`, `es_unmute_all_paths`
  - Process muting：
    - `es_mute_process`, `es_unmute_process`, `es_unmute_all_target_paths`
  - Inversion：
    - `es_muting_inverted`, `es_invert_muting`
- Santa 使用了两套成熟模式：

1. **Target path muting 反转模式 → 路径 watch-list**
   - 步骤：
     - `UnmuteAllTargetPaths(client)`
     - `es_invert_muting(client, ES_MUTE_INVERSION_TYPE_TARGET_PATH)`
     - 对关注路径调用 `es_mute_path`。
   - 效果：
     - 只对指定路径产生事件，适用于：
       - TamperResistance 监控自身文件；
       - Data FAA 只对敏感目录进行 I/O 审计与授权。

2. **Process muting 反转模式 → 进程 watch-list**
   - 步骤：
     - `UnmuteAllPaths/UnmuteAllTargetPaths(client)`
     - `es_invert_muting(client, ES_MUTE_INVERSION_TYPE_PROCESS)`
     - 对关注进程调用 `es_mute_process`。
   - 效果：
     - 只对指定进程产生事件，适用于：
       - Process FAA 只对特定业务进程做细粒度文件访问控制。

**建议：**

- 尽量使用 muting 反转模式构建 watch-list，而不是对全局所有事件做审计/授权，从源头降低内核与用户态负载。

### 6.4 AUTH 响应与缓存控制

- C API：
  - `es_respond_auth_result(client, msg, ES_AUTH_RESULT_ALLOW/DENY, cache)`
  - `es_respond_flags_result(client, msg, allowed_flags, cache)`
  - `es_clear_cache(client)` / `es_clear_cache_result_t`
- Santa 的策略：
  - **仅对 ALLOW 在 ES 层允许 cache**：
    - DENY 结果由自家 `AuthResultCache` 管理，这样在规则更新时可以：
      - 先清自家缓存；
      - 再调用 `es_clear_cache` 清 ES 内核缓存；
      - 确保下一次执行一定重新决策。
  - 对特殊 action（例如编译器、Hold & Ask、基于 CEL 的 per-process 决策）：
    - 一律设置 `cache=false`，避免在 ES 内核层缓存这些高度上下文相关的结果。
  - 对 `AUTH_OPEN`：
    - 目前策略是 “全开/全关”（all flags / 0），但封装在 `respondToMessage` 中，未来可扩展为细粒度 flags。

**建议：**

- 谨慎使用 ES cache：
  - ALLOW 结果可以 cache；
  - DENY 结果建议在应用层缓存，便于控制无缝更新。
- 尽量将 “是否 cacheable” 逻辑集中在一处（类似 Santa 的 `postAction`），而不是分散在各个业务函数中。

### 6.5 deadline 与超时处理

- ES 对 AUTH 事件都定义了 `deadline`，超时不响应的后果很严重（可能导致客户端被杀、系统默认 deny/allow）。
- Santa 的统一做法：
  - 在通用 ES client 中读取 `msg->deadline`，动态计算当前处理预算 `processingBudget`。
  - 使用 `dispatch_after` 安排兜底处理：在 `failClosed` 下自动 deny，否则自动 allow。
  - 真实的业务逻辑都在一个异步 block 中执行，完成后通过信号量阻止兜底 block 再次响应。

**建议：**

- 在设计时就考虑 deadline：
  - 不要在 callback 里做重 I/O 或网络调用；
  - 通过统一的调度层对 deadline 做兜底，不要让业务逻辑散布 deadline 判断。

### 6.6 多客户端与协作

- Santa 本身即使用多个 ES client（Authorizer/Recorder/DeviceManager/Tamper/FAA 等），还要与 3rd-party ES 客户端共存。
- 关键实践：
  - 利用 `process->is_es_client` 字段，配合配置项选择是否忽略其它 ES 客户端进程事件。
  - 通过 `es_muted_paths_events` 读取系统默认 mute set，理解哪些系统进程被保护，从而与系统级策略协同。
  - 在 `SantadMain` 中确保：
    - **先启动 Authorizer client 并订阅 AUTH_EXEC**；
    - 再启动 Recorder / DeviceManager / FAA 等 client；
    - 防止系统在 early boot 时对第三方 exec wait/hold 时缺少 Santa 策略。

**建议：**

- 在设计多客户端体系时，要清楚每个 client 的职责边界与事件子集，避免重复或冲突。
- 与其它 ES 客户端并存时，尽量避免互相拦截和影响。

---

## 七、对自研产品的整体借鉴建议

结合上文 Santa 对 EndpointSecurity 的整体设计与实现，建议你们在自家 macOS 数据安全产品中考虑以下模式：

1. **构建统一的 ES 封装层**
   - 定义类似 `EndpointSecurityAPI/Client/Message` 的三层封装：
     - RAII 管理 `es_client_t` 与 `es_message_t`；
     - 将所有 `es_*` C API 的调用集中到一个虚接口里，便于 mock 与测试；
     - 提供 exec 参数/环境/FD 等高级 helper。

2. **基于 muting 反转模式设计 watch-list**
   - 使用 `es_invert_muting` 将 path/process muting 反转成 “只对这些对象产生活动”的 watch-list。
   - 对 FAA、反篡改、自研防护模块等，优先考虑 watch-list 模式，而不是对所有事件做全局拦截。

3. **拆分不同职责的 ES client**
   - 参考 Santa 的 Authorizer/Recorder/DeviceManager/Tamper/FAA 体系，将授权、日志、挂载控制、自保护划分到不同 client：
     - 订阅不同事件集；
     - 使用不同队列与 QoS；
     - 互相之间只通过高级对象（决策缓存、事件缓存等）协作。

4. **集中管理 AUTH 响应与缓存策略**
   - 定义类似 Santa 的 `postAction` + `respondToMessage` 流程：
     - 业务层只输出 “最终动作（allow/deny/hold/特殊）”；
     - 公共层统一负责转换为 `es_respond_*` 调用与 `cache` 参数选择。

5. **将 deadline 管理下沉到基础设施层**
   - 在统一的 client 封装层处理 `msg->deadline`：
     - 动态计算预算；
     - 通过 `dispatch_after` 实现 fail-open/fail-closed 兜底；
     - 让上层业务逻辑简化为“只要在 budget 内完成决策即可”。

6. **合理处理多 ES 客户端与系统默认策略**
   - 使用 `process->is_es_client` 和系统 default mute set（通过 `es_muted_paths_events` 获取）了解其他安全组件的存在与系统保护边界，避免互相干扰。

通过完整学习 Santa 对 EndpointSecurity 的封装与使用方式，可以明显看出其设计目标：**安全正确性优先、性能与隔离性兼顾、可测试性与可维护性强**。这些模式对于任何基于 EndpointSecurity 的 macOS 安全/数据保护产品，都具有很高的通用参考价值。 

