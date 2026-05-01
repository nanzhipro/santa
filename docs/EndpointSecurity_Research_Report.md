## Santa 中 EndpointSecurity Framework 使用调研报告

> 代码仓库：`/Users/cyberserval/github/santa`  
> 调研目标：**全面梳理 Santa 如何使用 EndpointSecurity Framework，重点分析 API 选择与使用方式背后的原因，为自研 macOS 数据安全产品提供架构与实践参考。**

---

## 一、整体架构：Santa 的 EndpointSecurity 分层设计

Santa 没有在业务代码中到处直接调用 `es_*` C API，而是明显分了三层抽象，这一点非常值得借鉴：

- **底层 C→C++ 封装层**
  - 主要文件：
    - `Source/santad/EventProviders/EndpointSecurity/Client.h`
    - `Source/santad/EventProviders/EndpointSecurity/EndpointSecurityAPI.h/.mm`
    - `Source/santad/EventProviders/EndpointSecurity/Message.h`
  - 职责：
    - RAII 管理 `es_client_t *` 的创建与销毁；
    - 将 `es_new_client / es_subscribe / es_mute_* / es_respond_*` 等 C API 收口为 C++ 虚接口；
    - 封装 `es_message_t` 的 retain/release 与常用 helper（父进程信息、PathTargets 等）。

- **中间层「通用 ES 客户端基类」**
  - 主要文件：
    - `Source/santad/EventProviders/SNTEndpointSecurityClientBase.h`
    - `Source/santad/EventProviders/SNTEndpointSecurityClient.mm`
  - 职责：
    - 统一创建 ES client（`es_new_client`）和错误处理（失败即退出）；
    - 统一处理：
      - 订阅 / 取消订阅 ES 事件；
      - 进程 / 路径 muting 与 muting 反转；
      - AUTH 事件 deadline 预算与兜底响应；
      - 忽略其它 ES 客户端进程（避免互相干扰）；
      - 将 ES 回调消息分发到 GCD 队列（auth/notif）。

- **上层「功能型 ES 客户端」**
  - 主要类：
    - `SNTEndpointSecurityAuthorizer`：执行拦截与决策（核心）
    - `SNTEndpointSecurityRecorder`：事件记录与遥测
    - `SNTEndpointSecurityDeviceManager`：设备 / 网络挂载控制
    - `SNTEndpointSecurityTamperResistance`：自保护 / 反篡改
    - `SNTEndpointSecurityDataFileAccessAuthorizer`：根据文件路径+策略做 File Access Auth
    - `SNTEndpointSecurityProcessFileAccessAuthorizer`：根据进程+策略做 File Access Auth
  - 所有这些类都继承/实现 `SNTEndpointSecurityClientBase`，复用统一的 ES 调度逻辑，仅在 `handleMessage:` 中编写业务策略。

**设计优点：**

- 将 EndpointSecurity C API 与业务代码**彻底解耦**；
- 各模块只关心「订阅哪些事件、如何决策」，而不关心「如何安全使用 ES C API」；
- 有利于单元测试（大量使用 `MockEndpointSecurityAPI` 进行模拟）。

---

## 二、底层封装层：Client / EndpointSecurityAPI / Message

### 2.1 `santa::Client`：RAII 管理 `es_client_t *`

- 位置：`Source/santad/EventProviders/EndpointSecurity/Client.h`
- 关键代码：

```24:65:Source/santad/EventProviders/EndpointSecurity/Client.h
class Client {
 public:
  explicit Client(es_client_t* client, es_new_client_result_t result)
      : client_(client), result_(result) {}

  Client() : client_(nullptr), result_(ES_NEW_CLIENT_RESULT_ERR_INTERNAL) {}

  virtual ~Client() {
    if (client_) {
      // Special case: Not using EndpointSecurityAPI here due to circular refs.
      es_delete_client(client_);
    }
  }
  ...
  inline bool IsConnected() { return result_ == ES_NEW_CLIENT_RESULT_SUCCESS; }
  inline es_new_client_result_t NewClientResult() { return result_; }
  inline es_client_t* Get() const { return client_; }
```

**为什么要这样用 EndpointSecurity：**

- ES 要求：通过 `es_new_client` 获得的 `es_client_t *` 必须使用 `es_delete_client` 释放，否则内核对象泄漏。
- Santa 用 RAII 的 `Client` 类来管理生命周期：
  - 避免业务代码忘记调用 `es_delete_client`；
  - 析构函数中统一清理，异常路径也安全。
- 同时保存 `es_new_client_result_t`：
  - 上层可以通过 `IsConnected()` 快速判断是否成功；
  - 通过 `NewClientResult()` 输出用户友好的错误信息（例如「未授予 Full Disk Access」「未加 EndpointSecurity entitlement」等）。

### 2.2 `EndpointSecurityAPI`：统一封装 C API

- 头文件：`Source/santad/EventProviders/EndpointSecurity/EndpointSecurityAPI.h`
- 接口示例：

```30:75:Source/santad/EventProviders/EndpointSecurity/EndpointSecurityAPI.h
class EndpointSecurityAPI : public std::enable_shared_from_this<EndpointSecurityAPI> {
 public:
  virtual ~EndpointSecurityAPI() = default;

  virtual Client NewClient(void (^message_handler)(es_client_t *, Message));

  virtual bool Subscribe(const Client &client, const std::set<es_event_type_t> &);
  virtual bool UnsubscribeAll(const Client &client);

  virtual bool UnmuteAllPaths(const Client &client);
  virtual bool UnmuteAllTargetPaths(const Client &client);

  virtual bool IsTargetPathMutingInverted(const Client &client);
  virtual bool InvertTargetPathMuting(const Client &client);

  virtual bool MuteTargetPath(const Client &client, std::string_view path,
                              santa::WatchItemPathType path_type);
  virtual bool UnmuteTargetPath(const Client &client, std::string_view path,
                                santa::WatchItemPathType path_type);

  virtual bool IsProcessMutingInverted(const Client &client);
  virtual bool InvertProcessMuting(const Client &client);
  virtual bool MuteProcess(const Client &client, const audit_token_t *tok);
  virtual bool UnmuteProcess(const Client &client, const audit_token_t *tok);

  virtual void RetainMessage(const es_message_t *msg);
  virtual void ReleaseMessage(const es_message_t *msg);

  virtual bool RespondAuthResult(const Client &client, const Message &msg, es_auth_result_t result,
                                 bool cache);
  virtual bool RespondFlagsResult(const Client &client, const Message &msg, uint32_t allowed_flags,
                                  bool cache);

  virtual bool ClearCache(const Client &client);

  virtual uint32_t ExecArgCount(const es_event_exec_t *event);
  virtual es_string_token_t ExecArg(const es_event_exec_t *event, uint32_t index);
  virtual std::vector<std::string> ExecArgs(const es_event_exec_t *event);
  ...
};
```

- 实现示例：

```25:50:Source/santad/EventProviders/EndpointSecurity/EndpointSecurityAPI.mm
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
...
bool EndpointSecurityAPI::MuteTargetPath(const Client &client, std::string_view path,
                                         WatchItemPathType path_type) {
  return es_mute_path(client.Get(), path.data(),
                      path_type == WatchItemPathType::kPrefix
                          ? ES_MUTE_PATH_TYPE_TARGET_PREFIX
                          : ES_MUTE_PATH_TYPE_TARGET_LITERAL) == ES_RETURN_SUCCESS;
}
```

**设计与 API 使用理由：**

- **统一收口**：所有 `es_*` 调用集中在一个虚类中，业务层对外只看到 C++ 接口，便于 mock。
  - 测试文件中广泛使用 `MockEndpointSecurityAPI`（例如 `ProtobufTest.mm`, `SNTExecutionControllerTest.mm`）替代真实 ES。
- **通过 `shared_from_this()` 传给 `Message`**：
  - 使 `Message` 内可以方便调用 `ESAPI()->ExecArgs(...)` 之类 helper，不需要把裸指针塞进业务层。
- **muting / cache / flags-response 全部封装**：
  - `MuteTargetPath / MuteProcess / Invert*Muting / ClearCache / RespondFlagsResult` 等被统一包装；
  - 对于 `AUTH_OPEN`，强制走 `es_respond_flags_result`，保证后续可细粒度控制权限。

### 2.3 `Message`：`es_message_t` 的安全封装

- 位置：`Source/santad/EventProviders/EndpointSecurity/Message.h`
- 核心接口：

```30:89:Source/santad/EventProviders/EndpointSecurity/Message.h
class Message {
 public:
  struct PathTarget {
    std::string path;
    bool is_readable;
    const es_file_t* unsafe_file;
  };

  Message(std::shared_ptr<EndpointSecurityAPI> esapi,
          const es_message_t* es_msg);
  ~Message();

  Message(Message&& other);
  Message(const Message& other);

  void SetProcessToken(santa::santad::process_tree::ProcessToken tok);

  inline const es_message_t* operator->() const { return es_msg_; }
  inline const es_message_t& operator*() const { return *es_msg_; }

  std::shared_ptr<EndpointSecurityAPI> ESAPI() const { return esapi_; }

  std::string ParentProcessName() const;
  std::string ParentProcessPath() const;

  const std::vector<Message::PathTarget> PathTargets();
  ...
```

**推断的实现要点与 API 使用方式：**

- 构造 / 复制 / 析构中必然配合 `EndpointSecurityAPI::RetainMessage` / `ReleaseMessage`：
  - ES 官方要求：如需跨越回调异步使用 `es_message_t`，必须调用 `es_retain_message` / `es_release_message`；
  - Santa 通过 `Message` RAII 管理 retain/release，使用者不需要手动记忆调用时机。
- `PathTargets()` 封装了对不同事件结构中 target 路径的统一提取逻辑（例如 `open.file`, `rename.source`, `unlink.target` 等），供 FAA 模块使用。
- `ParentProcessName/Path` 统一封装对 `parent_audit_token` 与进程路径的解析。

---

## 三、中间层：SNTEndpointSecurityClient 及基础能力

### 3.1 通用基类协议：`SNTEndpointSecurityClientBase`

- 位置：`Source/santad/EventProviders/SNTEndpointSecurityClientBase.h`
- 暴露了一批上层复用的 ES 操作：

```31:86:Source/santad/EventProviders/SNTEndpointSecurityClientBase.h
@protocol SNTEndpointSecurityClientBase
- (instancetype)initWithESAPI:(std::shared_ptr<santa::EndpointSecurityAPI>)esApi
                      metrics:(std::shared_ptr<santa::Metrics>)metrics
                    processor:(santa::Processor)processor;

/// 如果 es_new_client 失败，抛异常终止
- (void)establishClientOrDie;

- (bool)subscribe:(const std::set<es_event_type_t> &)events;
- (bool)subscribeAndClearCache:(const std::set<es_event_type_t> &)events;
- (bool)unsubscribeAll;

- (bool)unmuteAllTargetPaths;
- (bool)enableTargetPathWatching;
- (bool)muteTargetPaths:(const santa::SetPairPathAndType &)paths;
- (bool)unmuteTargetPaths:(const santa::SetPairPathAndType &)paths;

- (bool)enableProcessWatching;
- (bool)muteProcess:(const audit_token_t *)tok;
- (bool)unmuteProcess:(const audit_token_t *)tok;

- (bool)respondToMessage:(const santa::Message &)msg
          withAuthResult:(es_auth_result_t)result
               cacheable:(bool)cacheable;

- (void)processEnrichedMessage:(std::unique_ptr<santa::EnrichedMessage>)msg
                       handler:(void (^)(std::unique_ptr<santa::EnrichedMessage>))messageHandler;

- (void)asynchronouslyProcess:(santa::Message)msg
                      handler:(void (^)(santa::Message &&))messageHandler;

- (void)processMessage:(santa::Message &&)msg handler:(void (^)(santa::Message))messageHandler;

- (bool)clearCache;

- (bool)handleContextMessage:(santa::Message &)esMsg;
@end
```

### 3.2 统一客户端实现：`SNTEndpointSecurityClient`

- 位置：`Source/santad/EventProviders/SNTEndpointSecurityClient.mm`
- 内部成员：
  - `_esApi`：`std::shared_ptr<EndpointSecurityAPI>`
  - `_esClient`：`santa::Client`（RAII 包装的 `es_client_t *`）
  - `_authQueue` / `_notifyQueue`：两个 `dispatch_queue_t`
  - `_metrics`：事件统计指标记录

#### 3.2.1 创建 ES client 与错误处理

```133:179:Source/santad/EventProviders/SNTEndpointSecurityClient.mm
- (void)establishClientOrDie {
  if (self->_esClient.IsConnected()) {
    LOGE(@"Client already established. Aborting.");
    [NSException raise:@"Client already established" format:@"IsConnected already true"];
  }

  self->_esClient = self->_esApi->NewClient(^(es_client_t *c, Message esMsg) {
    int64_t processingStart = clock_gettime_nsec_np(CLOCK_MONOTONIC);

    self->_metrics->UpdateEventStats(self->_processor, esMsg.operator->());

    if ([self handleContextMessage:esMsg]) {
      ...
      return;
    }

    if ([self shouldHandleMessage:esMsg]) {
      [self handleMessage:std::move(esMsg)
          recordEventMetrics:^(EventDisposition disposition) { ... }];
    } else {
      ...
    }
  });

  if (!self->_esClient.IsConnected()) {
    NSString *errMsg = [self errorMessageForNewClientResult:_esClient.NewClientResult()];
    LOGE(@"Unable to create EndpointSecurity client: %@", errMsg);
    [NSException raise:@"Failed to create ES client" format:@"%@", errMsg];
  } else {
    LOGI(@"Connected to EndpointSecurity (%@)", self);
  }

  if (![self muteSelf]) {
    [NSException raise:@"ES Mute Failure" format:@"Failed to mute self"];
  }
}
```

**为什么要「失败即退出」：**

- 对安全产品来说，若 ES client 无法建立则意味着**核心功能不可用**，继续运行既不安全也没意义；
- 通过 exception 让 launchd 重新拉起，与系统服务管理机制配合。

#### 3.2.2 静音自身进程

```181:193:Source/santad/EventProviders/SNTEndpointSecurityClient.mm
- (bool)muteSelf {
  std::optional<audit_token_t> tok = santa::GetMyAuditToken();
  if (!tok.has_value()) { ...; return false; }

  if (!self->_esApi->MuteProcess(self->_esClient, &*tok)) {
    LOGE(@"Failed to mute this client's process.");
    return false;
  }
  return true;
}
```

**原因：**

- Santa 守护进程本身会执行大量 I/O/进程操作；
- 若不静音自身进程，将：
  - 产生大量自身事件，徒增 CPU/磁盘负担；
  - 可能触发自保护逻辑（Tamper client）误伤自己。

#### 3.2.3 统一响应 AUTH（包括 AUTH_OPEN）

```256:268:Source/santad/EventProviders/SNTEndpointSecurityClient.mm
- (bool)respondToMessage:(const Message &)msg
          withAuthResult:(es_auth_result_t)result
               cacheable:(bool)cacheable {
  if (msg->event_type == ES_EVENT_TYPE_AUTH_OPEN) {
    return _esApi->RespondFlagsResult(
        _esClient, msg, (result == ES_AUTH_RESULT_ALLOW) ? 0xffffffff : 0x0, cacheable);
  } else {
    return _esApi->RespondAuthResult(_esClient, msg, result, cacheable);
  }
}
```

**为何区分 AUTH_OPEN：**

- EndpointSecurity 对 `AUTH_OPEN` 推荐使用 `es_respond_flags_result` 来表达允许的具体访问 flag；
- Santa 当前把它简化为「全允许 / 全禁止」（`0xffffffff` / `0x0`），但封装层已经预留了将来支持更细粒度 flags 的空间；
- 通过基类封装，业务层不需要知道何时该用哪个 respond API。

#### 3.2.4 deadline 预算与兜底响应

```286:301:Source/santad/EventProviders/SNTEndpointSecurityClient.mm
- (int64_t)computeBudgetForDeadline:(uint64_t)deadline currentTime:(uint64_t)currentTime {
  int64_t nanosUntilDeadline = (int64_t)MachTimeToNanos(deadline - currentTime);
  int64_t budget = nanosUntilDeadline * self.defaultBudget;  // 默认 0.8
  int64_t headroom = nanosUntilDeadline - budget;
  headroom = std::clamp(headroom, self.minAllowedHeadroom, self.maxAllowedHeadroom);
  return nanosUntilDeadline - headroom;
}
```

```319:355:Source/santad/EventProviders/SNTEndpointSecurityClient.mm
int64_t processingBudget = [self computeBudgetForDeadline:msg->deadline
                                              currentTime:mach_absolute_time()];

__block Message tmpDeadlineMsg = msg;
dispatch_after(dispatch_time(DISPATCH_TIME_NOW, processingBudget), self->_authQueue, ^(void) {
  if (dispatch_semaphore_wait(processingSema, DISPATCH_TIME_NOW) != 0) {
    return; // 处理逻辑已完成
  }

  Message deadlineMsg = std::move(tmpDeadlineMsg);

  es_auth_result_t authResult;
  if (self.configurator.failClosed) {
    authResult = ES_AUTH_RESULT_DENY;
  } else {
    authResult = ES_AUTH_RESULT_ALLOW;
  }

  bool res = [self respondToMessage:deadlineMsg withAuthResult:authResult cacheable:false];
  ...
});
```

**与 EndpointSecurity 的关系：**

- AUTH 事件超时未响应，内核可能：
  - 杀死客户端；
  - 或套用默认决策；
- Santa 在基础层统一处理 deadline：
  - 计算可用处理时间（默认用掉 deadline 的 80%，并留 1–5 秒 headroom）；
  - 到时间仍未响应则根据 `failClosed` 配置做兜底 ALLOW/DENY。
- 上层业务（Authorizer/FAA 等）不需要自己管理每个事件的 deadline，只专注业务逻辑。

#### 3.2.5 忽略其他 EndpointSecurity 客户端的事件

```118:127:Source/santad/EventProviders/SNTEndpointSecurityClient.mm
- (BOOL)shouldHandleMessage:(const Message &)esMsg {
  if (esMsg->process->is_es_client && [self.configurator ignoreOtherEndpointSecurityClients]) {
    if (esMsg->action_type == ES_ACTION_TYPE_AUTH) {
      [self respondToMessage:esMsg withAuthResult:ES_AUTH_RESULT_ALLOW cacheable:true];
    }
    return NO;
  }

  return YES;
}
```

**为什么要这么做：**

- ES 提供 `es_process_t::is_es_client` 标记，用于识别「该进程本身就是某个 ES 客户端」；
- 若多个安全产品共存，彼此若都在处理对方的 AUTH 事件，会非常混乱（甚至互相阻塞）；
- Santa 提供 `IgnoreOtherEndpointSecurityClients` 配置：
  - 当开启时，对于 ES client 进程产生的事件直接 ALLOW 并缓存；
  - 避免和其它安全产品发生策略冲突。

---

## 四、上层功能型 ES 客户端

### 4.1 `SNTEndpointSecurityAuthorizer`：执行拦截核心

- 位置：`Source/santad/EventProviders/SNTEndpointSecurityAuthorizer.mm`

#### 4.1.1 订阅的事件

```241:245:Source/santad/EventProviders/SNTEndpointSecurityAuthorizer.mm
- (void)enable {
  [super subscribeAndClearCache:{
                                    ES_EVENT_TYPE_AUTH_EXEC,
                                    ES_EVENT_TYPE_AUTH_PROC_SUSPEND_RESUME,
  }];
}
```

- **为什么只订阅这两类：**
  - `AUTH_EXEC`：执行拦截决策的核心；
  - `AUTH_PROC_SUSPEND_RESUME`：用于「Hold & Ask」模式下，防止未授权 resume / suspend。

#### 4.1.2 AUTH 事件处理流程

**入口：**

```162:188:Source/santad/EventProviders/SNTEndpointSecurityAuthorizer.mm
- (void)handleMessage:(Message &&)esMsg
    recordEventMetrics:(void (^)(EventDisposition))recordEventMetrics {
  switch (esMsg->event_type) {
    case ES_EVENT_TYPE_AUTH_EXEC:
      if (![self.execController synchronousShouldProcessExecEvent:esMsg]) {
        [self postAction:SNTActionRespondDeny forMessage:esMsg];
        recordEventMetrics(EventDisposition::kDropped);
        return;
      }
      break;
    case ES_EVENT_TYPE_AUTH_PROC_SUSPEND_RESUME:
      if (esMsg->event.proc_suspend_resume.type != ES_PROC_SUSPEND_RESUME_TYPE_RESUME) {
        [self respondToMessage:esMsg withAuthResult:ES_AUTH_RESULT_ALLOW cacheable:YES];
        recordEventMetrics(EventDisposition::kDropped);
        return;
      }
      break;
    default:
      ...
  }

  [self processMessage:std::move(esMsg)
               handler:^(Message msg) {
                 [self processMessage:std::move(msg)];
                 recordEventMetrics(EventDisposition::kProcessed);
               }];
}
```

**缓存优先：`AuthResultCache` + ES cache 协同：**

```107:153:Source/santad/EventProviders/SNTEndpointSecurityAuthorizer.mm
while (true) {
  SNTAction returnAction = self->_authResultCache->CheckCache(targetProc->executable);
  if (RESPONSE_VALID(returnAction)) {
    es_auth_result_t authResult = ES_AUTH_RESULT_DENY;
    switch (returnAction) {
      case SNTActionRespondAllowCompiler:
        [self.compilerController setProcess:msg->event.exec.target->audit_token isCompiler:true];
        OS_FALLTHROUGH;
      case SNTActionRespondAllow: authResult = ES_AUTH_RESULT_ALLOW; break;
      default: break;
    }

    [self respondToMessage:msg
            withAuthResult:authResult
         forcePreventCache:(returnAction == SNTActionRespondAllowCompiler)];
    return;
  } else if (returnAction == SNTActionRespondHold) {
    ... // 有其他实例正在 Hold & Ask，本次 exec 直接 Deny
  } else if (returnAction == SNTActionRequestBinary) {
    usleep(5000);
  } else {
    break;
  }
}

self->_authResultCache->AddToCache(targetProc->executable, SNTActionRequestBinary);

[self.execController validateExecEvent:msg
                            postAction:^bool(SNTAction action) {
                              return [self postAction:action forMessage:msg];
                            }];
```

#### 4.1.3 `postAction`：控制 ES cache 行为

```191:235:Source/santad/EventProviders/SNTEndpointSecurityAuthorizer.mm
- (bool)postAction:(SNTAction)action forMessage:(const Message &)esMsg {
  es_auth_result_t authResult;
  bool cacheable = true;

  switch (action) {
    case SNTActionRespondAllowCompiler:
      [self.compilerController setProcess:esMsg->event.exec.target->audit_token isCompiler:true];
      cacheable = false;
      authResult = ES_AUTH_RESULT_ALLOW;
      break;
    case SNTActionRespondHold:
      cacheable = false;
      authResult = ES_AUTH_RESULT_ALLOW;
      break;
    case SNTActionRespondAllowNoCache:
      cacheable = false;
      authResult = ES_AUTH_RESULT_ALLOW;
      self->_authResultCache->RemoveFromCache(esMsg->event.exec.target->executable);
      break;
    case SNTActionRespondAllow: authResult = ES_AUTH_RESULT_ALLOW; break;
    case SNTActionRespondDeny: authResult = ES_AUTH_RESULT_DENY; break;
    ...
  }

  self->_authResultCache->AddToCache(esMsg->event.exec.target->executable, action);

  if (action != SNTActionHoldAllowed && action != SNTActionHoldDenied) {
    return [self respondToMessage:esMsg withAuthResult:authResult forcePreventCache:!cacheable];
  } else {
    return true;
  }
}
```

**对 EndpointSecurity cache 的策略：**

- **只对 ALLOW 允许 ES cache（且要满足一些条件）**：
  - DENY 不 cache，避免规则变更后内核仍沿用旧的 DENY 结果；
  - `Hold & Ask`、`AllowCompiler`、`AllowNoCache` 这几种特殊动作全部设置 `cache=false`。
- 本地 `AuthResultCache` 负责更复杂的缓存语义（包括 hold 状态、cel 决策结果等），ES cache 仅作为最外层的「粗粒度」缓存。

### 4.2 `SNTExecutionController`：如何读取 ES 结构并决策

- 位置：`Source/santad/SNTExecutionController.mm`

#### 4.2.1 快速拒绝过长路径

```155:190:Source/santad/SNTExecutionController.mm
- (bool)synchronousShouldProcessExecEvent:(const Message &)esMsg {
  if (unlikely(esMsg->event_type != ES_EVENT_TYPE_AUTH_EXEC)) { ... }

  const es_process_t *targetProc = esMsg->event.exec.target;

  if (targetProc->executable->path.length > kMaxAllowedPathLength ||
      targetProc->executable->path_truncated) {
    SNTCachedDecision *cd =
        [[SNTCachedDecision alloc] initWithEndpointSecurityFile:targetProc->executable];
    cd.decision = SNTEventStateBlockLongPath;
    ...
    [[SNTDecisionCache sharedCache] cacheDecision:cd];
    return NO;
  }

  return YES;
}
```

- 利用了 `es_process_t::executable->path.length` 和 `path_truncated` 字段。
- 对于过长路径，直接构造决策并拒绝，不再进入复杂处理流程。

#### 4.2.2 使用 EndpointSecurity 的 Exec 参数 & 环境变量 helper

构造 CEL Activation 时：

```586:618:Source/santad/SNTExecutionController.mm
std::shared_ptr<santa::EndpointSecurityAPI> esApi = esMsg.ESAPI();

return ^std::unique_ptr<::google::api::expr::runtime::BaseActivation>(bool useV2) {
  auto makeActivation =
      [&]<bool IsV2>() -> std::unique_ptr<::google::api::expr::runtime::BaseActivation> {
    ...
    return std::make_unique<santa::cel::Activation<IsV2>>(
        std::move(f),
        ^std::vector<std::string>() {
          return esApi->ExecArgs(&esMsg->event.exec);
        },
        ^std::map<std::string, std::string>() {
          return esApi->ExecEnvs(&esMsg->event.exec);
        },
        ^uid_t() {
          return audit_token_to_euid(esMsg->event.exec.target->audit_token);
        },
        ^std::string() {
          es_file_t *f = esMsg->event.exec.cwd;
          return std::string(f->path.data, f->path.length);
        });
  };
  ...
};
```

**注意点：**

- 没有直接操作内部数组，而是调用 ES 提供的：
  - `es_exec_arg_count` / `es_exec_arg`
  - `es_exec_env_count` / `es_exec_env`
- 这是符合 EndpointSecurity 官方建议的访问方式（避免依赖内部结构布局）。

### 4.3 `SNTEndpointSecurityRecorder`：只做 NOTIFY 记录

- 位置：`Source/santad/EventProviders/SNTEndpointSecurityRecorder.mm`

#### 4.3.1 订阅的事件

```186:231:Source/santad/EventProviders/SNTEndpointSecurityRecorder.mm
std::set<es_event_type_t> events{
  ES_EVENT_TYPE_NOTIFY_CLONE,
  ES_EVENT_TYPE_NOTIFY_CLOSE,
  ES_EVENT_TYPE_NOTIFY_COPYFILE,
  ES_EVENT_TYPE_NOTIFY_CS_INVALIDATED,
  ES_EVENT_TYPE_NOTIFY_EXCHANGEDATA,
  ES_EVENT_TYPE_NOTIFY_EXEC,
  ES_EVENT_TYPE_NOTIFY_EXIT,
  ES_EVENT_TYPE_NOTIFY_FORK,
  ES_EVENT_TYPE_NOTIFY_LINK,
  ES_EVENT_TYPE_NOTIFY_RENAME,
  ES_EVENT_TYPE_NOTIFY_UNLINK,
  ES_EVENT_TYPE_NOTIFY_AUTHENTICATION,
  ...
};
[super subscribe:events];
```

- 只订阅 NOTIFY，不处理 AUTH。
- 这样 Authorizer 与 Recorder 职责泾渭分明：一个做权限控制，一个做事实记录。

#### 4.3.2 `NOTIFY_CLOSE` 的优化处理

```100:119:Source/santad/EventProviders/SNTEndpointSecurityRecorder.mm
case ES_EVENT_TYPE_NOTIFY_CLOSE: {
  if (!esMsg->event.close.modified && !esMsg->event.close.was_mapped_writable) {
    // 未修改文件，直接忽略，不计入 dropped 统计
    return;
  }

  self->_authResultCache->RemoveFromCache(esMsg->event.close.target);
  break;
}
```

- 对既未 `modified` 且未 `was_mapped_writable` 的 CLOSE 事件直接忽略，避免无意义日志。
- 对真正修改过的目标文件，从 `AuthResultCache` 删除对应条目，防止后续基于旧文件内容做错误决策。

### 4.4 `SNTEndpointSecurityDeviceManager`：挂载控制

- 位置：`Source/santad/EventProviders/SNTEndpointSecurityDeviceManager.mm`

#### 4.4.1 订阅的事件

```467:471:Source/santad/EventProviders/SNTEndpointSecurityDeviceManager.mm
- (void)enable {
  ...
  [super subscribeAndClearCache:{
                                    ES_EVENT_TYPE_AUTH_MOUNT,
                                    ES_EVENT_TYPE_AUTH_REMOUNT,
                                    ES_EVENT_TYPE_NOTIFY_UNMOUNT,
  }];
}
```

#### 4.4.2 使用 ES 消息中的 `disposition` 字段（macOS 15+）

```423:439:Source/santad/EventProviders/SNTEndpointSecurityDeviceManager.mm
#if HAVE_MACOS_15
  if (esMsg->version >= 8) {
    switch (esMsg->event_type) {
      case ES_EVENT_TYPE_AUTH_MOUNT:
        isNetworkMount = (esMsg->event.mount.disposition == ES_MOUNT_DISPOSITION_NETWORK);
        break;
      case ES_EVENT_TYPE_AUTH_REMOUNT:
        isNetworkMount = (esMsg->event.remount.disposition == ES_MOUNT_DISPOSITION_NETWORK);
        break;
      default:
        LOGE(@"Unexpected Event Type passed to DeviceManager handleMessage: %d", esMsg->event_type);
        exit(EXIT_FAILURE);
    }
  }
#endif
```

- 注意对版本的判断：只有在 `HAVE_MACOS_15` 且 `version >= 8` 时才访问这个字段。
- 这是对 EndpointSecurity 版本演进的良好兼容实践：保证在旧系统上不会访问不存在的字段。

#### 4.4.3 AUTH_MOUNT / AUTH_REMOUNT 决策

- 对网络挂载：

```570:604:Source/santad/EventProviders/SNTEndpointSecurityDeviceManager.mm
- (es_auth_result_t)handleAuthNetworkMount:(const Message &)m
                               eventStatFS:(const struct statfs *)eventStatFS {
  if (!self.configurator.blockNetworkMount) {
    return ES_AUTH_RESULT_ALLOW;
  }

  NSString *mountFromName = @(eventStatFS->f_mntfromname);
  NSURL *fromURL = [NSURL URLWithString:mountFromName];
  if (!fromURL.host) {
    if (self.configurator.failClosed) { ... return ES_AUTH_RESULT_DENY; }
    else { ... return ES_AUTH_RESULT_ALLOW; }
  }

  if ([self.configurator.allowedNetworkMountHosts containsObject:fromURL.host]) {
    return ES_AUTH_RESULT_ALLOW;
  }

  [self handleBlockedNetworkMount:m eventStatFS:eventStatFS];
  return ES_AUTH_RESULT_DENY;
}
```

- 对 USB / 外接存储挂载：

```498:536:Source/santad/EventProviders/SNTEndpointSecurityDeviceManager.mm
- (es_auth_result_t)handleAuthDeviceMount:(const Message &)m
                              eventStatFS:(const struct statfs *)eventStatFS {
  DADiskRef disk = DADiskCreateFromBSDName(NULL, self.diskArbSession, eventStatFS->f_mntfromname);
  ...
  if (![self shouldOperateOnDisk:disk]) {
    return ES_AUTH_RESULT_ALLOW;
  }
  ...
  if ([self haveRemountArgs]) {
    ...
    if ([self remountUSBModeContainsFlags:eventStatFS->f_flags] &&
        m->event_type != ES_EVENT_TYPE_AUTH_REMOUNT) {
      return ES_AUTH_RESULT_ALLOW;
    }
    uint32_t newMode = [self updatedMountFlags:eventStatFS];
    [self remount:disk mountMode:newMode semaphore:nil];
  } else {
    // 直接 DENY，并发送阻断事件
    ...
  }
  ...
  return ES_AUTH_RESULT_DENY;
}
```

**策略特点：**

- 用 `statfs` 与 DiskArbitration 结合，判断是否为 USB / SD / 网络等类型；
- 对于不应管理的设备（内部盘、非可移动设备等），直接 `ALLOW`；
- 对被管理的设备，可以选择：
  - 阻断；
  - 或以指定 flags（只读、noexec 等）重新挂载。

### 4.5 `SNTEndpointSecurityTamperResistance`：自保护

- 位置：`Source/santad/EventProviders/SNTEndpointSecurityTamperResistance.mm`

#### 4.5.1 使用 EndpointSecurity 的 muting 反转做「保护路径 watch 列表」

```267:285:Source/santad/EventProviders/SNTEndpointSecurityTamperResistance.mm
- (void)enable {
  [super enableTargetPathWatching];

  SetPairPathAndType protectedPaths = [SNTEndpointSecurityTamperResistance getProtectedPaths];
  protectedPaths.insert({"/Library/SystemExtensions", WatchItemPathType::kPrefix});
  protectedPaths.insert({"/bin/launchctl", WatchItemPathType::kLiteral});

  [super muteTargetPaths:protectedPaths];

  [super subscribeAndClearCache:{
                                    ES_EVENT_TYPE_AUTH_SIGNAL,
                                    ES_EVENT_TYPE_AUTH_EXEC,
                                    ES_EVENT_TYPE_AUTH_UNLINK,
                                    ES_EVENT_TYPE_AUTH_RENAME,
                                    ES_EVENT_TYPE_AUTH_OPEN,
                                    ES_EVENT_TYPE_AUTH_PROC_SUSPEND_RESUME,
  }];
}
```

**关键点：Muting 反转机制详解**

#### Muting 的默认语义（Normal Mode）

在默认模式下，EndpointSecurity 的 muting 机制遵循"黑名单"逻辑：

- **`es_mute_path(client, "/path/to/file", ...)`** → 将路径加入"静音列表"
- **效果**：被静音的路径**不会**产生任何 ES 事件（AUTH 或 NOTIFY）
- **用途**：减少噪音，避免对系统关键路径或高频路径产生过多事件

**示例**：
```c
// 默认模式：静音 /tmp 目录
es_mute_path(client, "/tmp", ES_MUTE_PATH_TYPE_TARGET_PREFIX);
// 结果：/tmp 下的所有文件操作都不会产生 ES 事件
```

#### Muting 反转（Inverted Mode）

调用 `es_invert_muting(client, ES_MUTE_INVERSION_TYPE_TARGET_PATH)` 后，语义完全反转：

- **反转前**：`es_mute_path` = "不接收该路径的事件"（黑名单）
- **反转后**：`es_mute_path` = "只接收该路径的事件"（白名单）

**反转后的行为**：
- 被"mute"的路径 → **会产生事件**（成为 watch list）
- 未被"mute"的路径 → **不会产生事件**（被静音）

**示例**：
```c
// 1. 先反转 muting 语义
es_invert_muting(client, ES_MUTE_INVERSION_TYPE_TARGET_PATH);

// 2. 现在 mute 操作变成"加入 watch list"
es_mute_path(client, "/private/var/db/santa/rules.db", ES_MUTE_PATH_TYPE_TARGET_LITERAL);
es_mute_path(client, "/Applications/Santa.app", ES_MUTE_PATH_TYPE_TARGET_PREFIX);

// 结果：
// ✅ 只会收到 /private/var/db/santa/rules.db 和 /Applications/Santa.app/* 的事件
// ❌ 其他所有路径的事件都被静音，不会收到
```

#### Watch List 的概念

**Watch List（监控列表）** 是在反转模式下，通过 `es_mute_path` 建立的"白名单"：

- **本质**：在反转模式下，"muted paths" 实际上变成了"watched paths"
- **作用**：只对 watch list 中的路径/进程产生事件，大幅减少系统开销
- **优势**：当只需要监控少数特定路径时，避免接收全系统所有文件操作事件

#### Santa 的实现流程

```objc
// 1. enableTargetPathWatching 的完整流程
- (bool)enableTargetPathWatching {
  // 步骤 1：清空所有已有的 target path muting
  [self unmuteAllTargetPaths];
  
  // 步骤 2：反转 muting 语义（从黑名单模式切换到白名单模式）
  return _esApi->InvertTargetPathMuting(_esClient);
}

// 2. 之后调用 muteTargetPaths 实际是"加入 watch list"
- (bool)muteTargetPaths:(const SetPairPathAndType &)paths {
  for (const auto &pathAndType : paths) {
    // 在反转模式下，这实际是"开始监控这个路径"
    _esApi->MuteTargetPath(_esClient, pathAndType.first, pathAndType.second);
  }
}
```

#### 加入 Watch List 后的实际效果

以 TamperResistance 为例：

**初始状态**（反转前）：
- 所有路径都会产生事件（如果已订阅）
- 系统开销：高（全系统文件操作）

**执行 `enableTargetPathWatching` 后**：
- Muting 语义已反转
- 但此时 watch list 为空（因为刚 `unmuteAllTargetPaths`）
- **结果**：**不会收到任何路径的事件**（因为反转后，未被 mute 的路径都被静音）

**执行 `muteTargetPaths` 加入保护路径后**：
```objc
protectedPaths = {
  "/private/var/db/santa/rules.db",           // literal
  "/private/var/db/santa/events.db",          // literal
  "/Applications/Santa.app",                  // prefix
  "/Library/LaunchDaemons/com.northpolesec.santa.",  // prefix
  "/bin/launchctl"                            // literal
};
[super muteTargetPaths:protectedPaths];
```

**最终效果**：
- ✅ **只会收到**这些保护路径的事件：
  - `/private/var/db/santa/rules.db` 被删除/重命名/打开
  - `/Applications/Santa.app/Contents/MacOS/santad` 被执行
  - `/Library/LaunchDaemons/com.northpolesec.santa.daemon.plist` 被修改
  - `/bin/launchctl` 被执行（用于检测是否尝试 kill Santa）
- ❌ **不会收到**其他路径的事件：
  - `/Users/xxx/Documents/file.txt` 的操作 → 静音
  - `/tmp/random` 的操作 → 静音
  - 系统其他路径的操作 → 静音

**性能影响**：
- **反转前**：如果订阅 `AUTH_OPEN`，可能每秒收到数千个事件（全系统）
- **反转后**：只收到 watch list 中的事件，可能每秒只有几个或几十个事件
- **性能提升**：减少 99%+ 的事件处理开销

#### 为什么需要反转模式？

**场景对比**：

1. **传统方式（不反转）**：
   - 订阅 `AUTH_UNLINK` 事件
   - 收到全系统所有文件删除事件
   - 在用户态代码中过滤：`if (path == "/private/var/db/santa/rules.db") { ... }`
   - **问题**：内核→用户态的数据传输、事件队列处理、用户态过滤，开销巨大

2. **反转模式**：
   - 反转 muting，只把关心的路径加入 watch list
   - 内核层直接过滤，只发送 watch list 中的事件
   - **优势**：内核层过滤，零用户态开销，事件队列压力小

#### 取消 Watch List 中的路径

```objc
// 从 watch list 中移除路径
[super unmuteTargetPaths:removedPaths];

// 效果：这些路径不再产生事件（因为反转模式下，未被 mute = 被静音）
```

#### 总结

- **反转前**：`mute` = 静音（黑名单），`unmute` = 恢复事件（移出黑名单）
- **反转后**：`mute` = 监控（加入白名单），`unmute` = 停止监控（移出白名单）
- **Watch List**：反转模式下的"白名单"，只监控列表中的路径/进程
- **性能优势**：内核层过滤，避免全系统事件洪流，适合细粒度监控场景

Santa 利用此机制实现了：
- **TamperResistance**：只监控自身关键文件，而非全系统
- **File Access Authorizer**：只监控配置的敏感目录，而非所有文件访问
- **Process File Access Authorizer**：只监控特定进程，而非所有进程

#### 4.5.2 AUTH 事件决策

- AUTH_UNLINK / AUTH_RENAME / AUTH_OPEN：

```153:205:Source/santad/EventProviders/SNTEndpointSecurityTamperResistance.mm
case ES_EVENT_TYPE_AUTH_UNLINK: {
  if ([SNTEndpointSecurityTamperResistance
          isProtectedPath:esMsg->event.unlink.target->path.data]) {
    result = ES_AUTH_RESULT_DENY;
    ...
  }
  break;
}
...
case ES_EVENT_TYPE_AUTH_OPEN: {
  if ((esMsg->event.open.fflag & FWRITE) &&
      [SNTEndpointSecurityTamperResistance isProtectedPath:esMsg->event.open.file->path.data]) {
    result = ES_AUTH_RESULT_DENY;
    ...
    break;
  }
  if ([SNTEndpointSecurityTamperResistance
          isLiteralProtectedPath:esMsg->event.open.file->path.data]) {
    result = ES_AUTH_RESULT_DENY;
    ...
    break;
  }

  result = ES_AUTH_RESULT_ALLOW;
  cacheable = false;  // OPEN 目前一律不 cache
  break;
}
```

- AUTH_SIGNAL：

```225:243:Source/santad/EventProviders/SNTEndpointSecurityTamperResistance.mm
case ES_EVENT_TYPE_AUTH_SIGNAL: {
  if (esMsg->event.signal.sig == 0) { break; }

  pid_t sourcePid = audit_token_to_pid(esMsg->process->audit_token);
  pid_t targetPid = audit_token_to_pid(esMsg->event.signal.target->audit_token);
  if (targetPid == getpid() && sourcePid != 1) {
    result = ES_AUTH_RESULT_DENY;
  }
  break;
}
```

- AUTH_EXEC（只针对 `/bin/launchctl`）：

```245:248:Source/santad/EventProviders/SNTEndpointSecurityTamperResistance.mm
case ES_EVENT_TYPE_AUTH_EXEC: {
  std::tie(result, cacheable) = ValidateLaunchctlExec(esMsg);
  break;
}
```

`ValidateLaunchctlExec` 里通过 `esApi->ExecArgCount/ExecArg` 遍历 argv，阻断：

- 对 `com.northpolesec.santa.daemon` 的 kill / unload；
- 对旧版 Google Santa 的 plist load，并顺带调用 `unlinkat` 删除其 plist / newsyslog 配置。

**总体来说**，TamperResistance 使用 EndpointSecurity 的 AUTH 能力，在内核层面保护了：

- Santa 守护进程不被外部 suspend/resume / signal；
- Santa 关键文件不被 rename/delete/open-writable；
- 防止通过 launchctl / 旧版 Santa 配置来绕过新的 Santa。

### 4.6 File Access Authorizers（Data & Process）

#### 4.6.1 DataFileAccessAuthorizer

- 位置：`Source/santad/EventProviders/SNTEndpointSecurityDataFileAccessAuthorizer.mm`
- 订阅事件：

```161:167:Source/santad/EventProviders/SNTEndpointSecurityDataFileAccessAuthorizer.mm
std::set<es_event_type_t> events = {
    ES_EVENT_TYPE_AUTH_CLONE,        ES_EVENT_TYPE_AUTH_COPYFILE, ES_EVENT_TYPE_AUTH_CREATE,
    ES_EVENT_TYPE_AUTH_EXCHANGEDATA, ES_EVENT_TYPE_AUTH_LINK,     ES_EVENT_TYPE_AUTH_OPEN,
    ES_EVENT_TYPE_AUTH_RENAME,       ES_EVENT_TYPE_AUTH_TRUNCATE, ES_EVENT_TYPE_AUTH_UNLINK,
    ES_EVENT_TYPE_NOTIFY_EXIT,
};
```

使用 `Message::PathTargets()` 将事件中的所有目标文件统一抽象出来：

```103:127:Source/santad/EventProviders/SNTEndpointSecurityDataFileAccessAuthorizer.mm
__block std::vector<FAAPolicyProcessor::TargetPolicyPair> targetPolicyPairs;
__block auto pathTargets = msg.PathTargets();

self.findPoliciesForTargetsBlock(^(santa::LookupPolicyBlock lookupPolicyBlock) {
  size_t idx = 0;
  for (const auto &target : pathTargets) {
    targetPolicyPairs.emplace_back(idx, lookupPolicyBlock(target.path.c_str()));
    idx++;
  }
});

FAAPolicyProcessor::ESResult result = _faaPolicyProcessorProxy->ProcessMessage(
    msg, targetPolicyPairs,
    ^bool(const santa::WatchItemPolicyBase &base_policy, const Message::PathTarget &target,
          const Message &msg) {
      for (const santa::WatchItemProcess &process : base_policy.processes) {
        if ((*_faaPolicyProcessorProxy)->PolicyMatchesProcess(process, msg->process)) {
          return true;
        }
      }
      return false;
    },
    self.fileAccessDeniedBlock, overrideAction);

[self respondToMessage:msg withAuthResult:result.auth_result cacheable:result.cacheable];
```

并结合 target path muting 反转：

```188:203:Source/santad/EventProviders/SNTEndpointSecurityDataFileAccessAuthorizer.mm
- (void)watchItemsCount:(size_t)count
               newPaths:(const santa::SetPairPathAndType &)newPaths
           removedPaths:(const santa::SetPairPathAndType &)removedPaths {
  if (count == 0) {
    [self disable];
  } else {
    [super unmuteTargetPaths:removedPaths];
    [super muteTargetPaths:newPaths];
    [self enable];
  }
}
```

**要点：**

- 利用 `es_invert_muting(ES_MUTE_INVERSION_TYPE_TARGET_PATH)` 构造「watch list」；
- 只有处于策略 watch list 中的路径才会生成 AUTH 事件，大大降低系统开销。

#### 4.6.2 ProcessFileAccessAuthorizer

- 位置：`Source/santad/EventProviders/SNTEndpointSecurityProcessFileAccessAuthorizer.mm`

订阅事件：

```245:250:Source/santad/EventProviders/SNTEndpointSecurityProcessFileAccessAuthorizer.mm
static const std::set<es_event_type_t> events = {
    ES_EVENT_TYPE_AUTH_CLONE,        ES_EVENT_TYPE_AUTH_COPYFILE, ES_EVENT_TYPE_AUTH_CREATE,
    ES_EVENT_TYPE_AUTH_EXCHANGEDATA, ES_EVENT_TYPE_AUTH_LINK,     ES_EVENT_TYPE_AUTH_OPEN,
    ES_EVENT_TYPE_AUTH_RENAME,       ES_EVENT_TYPE_AUTH_TRUNCATE, ES_EVENT_TYPE_AUTH_UNLINK,
    ES_EVENT_TYPE_NOTIFY_EXEC,       ES_EVENT_TYPE_NOTIFY_EXIT,   ES_EVENT_TYPE_NOTIFY_FORK};
```

构造「进程 watch list」：

- `enableProcessWatching` 内部调用 Process muting 反转；
- `probeInterest:` 在 Authorizer 中作为「探针」：

```209:223:Source/santad/EventProviders/SNTEndpointSecurityProcessFileAccessAuthorizer.mm
- (santa::ProbeInterest)probeInterest:(const santa::Message &)esMsg {
  if (!self.isSubscribed) {
    return santa::ProbeInterest::kUninterested;
  }

  std::shared_ptr<ProcessWatchItemPolicy> policy =
      [self findPolicyForProcess:esMsg->event.exec.target];

  if (policy) {
    [self startWatching:esMsg->event.exec.target->audit_token policy:policy];
    return santa::ProbeInterest::kInterested;
  } else {
    return santa::ProbeInterest::kUninterested;
  }
}
```

`startWatching` 则：

```226:236:Source/santad/EventProviders/SNTEndpointSecurityProcessFileAccessAuthorizer.mm
- (void)startWatching:(const audit_token_t)tok
               policy:(std::shared_ptr<ProcessWatchItemPolicy>)policy {
  if (policy) {
    _procRuleCache->set(PidPidversion(tok), policy);
  }

  // 总是 muteProcess，无论是否有 policy
  [self muteProcess:&tok];
}
```

**结合 EndpointSecurity：**

- 在 `ES_MUTE_INVERSION_TYPE_PROCESS` 反转模式下：
  - 被 `muteProcess` 的进程才会生成事件（变成「只监控这些进程」）；
  - 这非常适合 process-centric FAA：只对特定进程的文件访问做审计与授权。

---

## 五、其它地方对 EndpointSecurity 的使用

### 5.1 SNTRuleTable：临时 ES client 读取「默认 mute set」

- 位置：`Source/santad/DataLayer/SNTRuleTable.mm`

```44:72:Source/santad/DataLayer/SNTRuleTable.mm
static void addPathsFromDefaultMuteSet(NSMutableSet *criticalPaths) {
  es_client_t *client = NULL;
  es_new_client_result_t ret = es_new_client(&client, ^(es_client_t *c, const es_message_t *m){
                                                 // noop
                                             });
  if (ret != ES_NEW_CLIENT_RESULT_SUCCESS) { ... }

  es_muted_paths_t *mps = NULL;
  if (es_muted_paths_events(client, &mps) != ES_RETURN_SUCCESS) { ... }

  for (size_t i = 0; i < mps->count; i++) {
    if (mps->paths[i].type == ES_MUTE_PATH_TYPE_LITERAL) {
      [criticalPaths addObject:@(mps->paths[i].path.data)];
    }
  }

  es_release_muted_paths(mps);
  es_delete_client(client);
}
```

结合硬编码 fallback 列表：

```101:152:Source/santad/DataLayer/SNTRuleTable.mm
// ES Monterey 默认 mute set
NSSet *fallbackDefaultMuteSet = [[NSSet alloc] initWithArray:@[
  @"/System/Library/PrivateFrameworks/SkyLight.framework/Versions/A/Resources/WindowServer",
  ...
]];

NSSet *santaDefinedCriticalPaths = [NSSet setWithArray:@[
  @"/usr/libexec/trustd",
  ...
  @"/Applications/Santa.app/Contents/MacOS/santasyncservice",
]];

NSMutableSet *superSet = [NSMutableSet setWithSet:fallbackDefaultMuteSet];
[superSet unionSet:santaDefinedCriticalPaths];

addPathsFromDefaultMuteSet(superSet);
criticalPaths = [superSet allObjects];
```

**目的：**

- macOS Monterey 起，ES 对某些「系统关键进程路径」会自动应用默认静音 set，防止被第三方拦截拖慢；
- Santa 在启动时读取当前系统的默认 mute set，并与自己维护的关键二进制列表 merge：
  - 用于后续策略（例如在 lockdown 模式下依然允许某些关键进程正常工作）。

### 5.2 日志与辅助工具依赖的 ES 类型

- `Source/santad/Logs/EndpointSecurity/Serializers/Serializer.mm`：
  - 通过 `EnrichedExec` 与 ES 的 `es_event_exec_t`、`es_auth_result_t` 来构造日志 payload；
  - 使用 `SNTDecisionCache` 与 `exec.target->executable->stat` 关联。
- `Source/santad/Logs/EndpointSecurity/Serializers/Utilities.h/.mm`：
  - `OriginalPathForTranslocation(const es_process_t *es_proc)`：
    - 利用 `es_proc->executable->path` 组合 Security.framework 的私有 API；
  - `GetAllowListTargetFile(const santa::Message &msg)`：
    - 封装不同事件类型中「用于 allowlist」的目标 `es_file_t *` 选择逻辑；
  - `NormalizePath(es_string_token_t)` / `ConcatPrefixIfRelativePath`：
    - 使用 ES 中的 `es_string_token_t` 处理路径/URL 转路径的细节。

---

## 六、EndpointSecurity API 调研与实践总结

本节从框架角度总结 EndpointSecurity API 的关键点，并结合 Santa 的实践给出使用建议。

### 6.1 核心类型与初始化

- **核心类型：**
  - `es_client_t`：用户态客户端；
  - `es_message_t`：事件消息（包含 `version`, `event_type`, `action_type`, `deadline` 等）；
  - `es_process_t`, `es_file_t`：进程与文件结构；
  - `es_event_*_t`：各类事件子结构。

- **创建 client：**
  - `es_new_client(&client, ^(es_client_t *c, const es_message_t *msg){ ... })`
  - 返回 `es_new_client_result_t`：
    - `ES_NEW_CLIENT_RESULT_ERR_NOT_PERMITTED`：缺 Full Disk Access；
    - `ES_NEW_CLIENT_RESULT_ERR_NOT_ENTITLED`：缺 ES entitlement；
    - `ES_NEW_CLIENT_RESULT_ERR_NOT_PRIVILEGED`：非 root；
    - `ES_NEW_CLIENT_RESULT_ERR_TOO_MANY_CLIENTS`：系统限制。

**Santa 的实践：**

- 对 `es_new_client` 结果做细粒度错误映射，转换成人类可读错误；
- 若无法建立 client，立即抛异常退出（由 launchd 重启）；
- `SantadMain` 中**优先建立 Authorizer client**，确保在 boot early hold 阶段就能处理 AUTH_EXEC。

### 6.2 事件订阅与版本兼容

- 基础 API：
  - `es_subscribe(es_client_t *, const es_event_type_t *, size_t count)`
  - `es_unsubscribe_all(es_client_t *)`
- 对于新增事件/字段（例如 macOS 15+ 的 Gatekeeper/TCC 相关）：
  - Santa 使用编译期宏 `HAVE_MACOS_15` / `HAVE_MACOS_15_4` 配合运行时判断 `@available(macOS 15.0, *)`；
  - 对消息内部结构体扩展（如 mount 的 `disposition`）还会结合 `msg->version` 判断。

**建议：**

- 按功能拆分多个 ES client（授权 / 日志 / 设备 / 自保护 / FAA），避免单个 client 订阅所有事件；
- 读取消息结构体中新增字段时要**同时检查 SDK 版本和 `msg->version`**，避免老系统崩溃；
- 对未来可能出现的新子类型（如 `ES_AUTHENTICATION_TYPE_*`）保留 default 分支，选择「忽略该事件」而非崩溃。

### 6.3 Muting 与「反转模式」的高效使用

- 常用 muting API：
  - 路径：
    - `es_mute_path`, `es_unmute_path`, `es_unmute_all_paths`
  - 进程：
    - `es_mute_process`, `es_unmute_process`, `es_unmute_all_target_paths`
  - 反转：
    - `es_invert_muting(client, ES_MUTE_INVERSION_TYPE_*)`
    - `es_muting_inverted(...)`

**语义：**

- 默认模式：muted 对象**不产生事件**；
- 反转模式：只有被 mute 的对象**会产生事件**（watch list）。

**Santa 的典型模式：**

- **TargetPath Watching：**
  - `enableTargetPathWatching`：
    - `UnmuteAllTargetPaths`；
    - `es_invert_muting(..., ES_MUTE_INVERSION_TYPE_TARGET_PATH)`；
  - `muteTargetPaths`：
    - 实际含义变为「加入 watch list」；
  - 应用场景：TamperResistance, Data FAA。

- **Process Watching：**
  - `enableProcessWatching`：
    - `UnmuteAllPaths/UnmuteAllTargetPaths`；
    - `es_invert_muting(..., ES_MUTE_INVERSION_TYPE_PROCESS)`；
  - `muteProcess(tok)`：
    - 实际含义为「只监控这个进程」；
  - 应用场景：Process FAA。

**经验：**

- 当你只关心少数路径/进程时，强烈建议采用 muting 反转模式，只让 ES 为这些对象产生事件，兼顾安全性与性能。

### 6.4 响应 API：`es_respond_auth_result` vs `es_respond_flags_result`

- AUTH 事件有两种响应形式：
  - `es_respond_auth_result(client, msg, ES_AUTH_RESULT_ALLOW/DENY, cache)`
  - `es_respond_flags_result(client, msg, allowed_flags, cache)`（主要用于 `AUTH_OPEN`）

**Santa 的做法：**

- 基类 `respondToMessage` 中统一封装：
  - 对 `AUTH_OPEN` 使用 `es_respond_flags_result`，其余使用 `es_respond_auth_result`；
  - 当前策略仅区分「全允许」`0xffffffff` 与「全拒绝」`0x0`，但代码结构可以轻松扩展到更细粒度 flags。

**cache 参数策略：**

- Santa 只对「合适的 ALLOW 决策」设置 `cache=true`；
- 以下场景一律 `cache=false`：
  - DENY 决策（避免规则更新被 ES cache 压住）；
  - Hold & Ask（ES 表面是 ALLOW，但进程已被暂停，这个半成品决策不能被缓存）；
  - Per-process CEL 决策（`AllowNoCache`）、compiler 特殊决策等；
- 对于影响决策的配置变化（clientMode/PathRegex/EntitlementsFilter/FileAccessPolicy 等）：
  - 先清空 Santa 自身 `AuthResultCache`；
  - 再调用 `es_clear_cache` 清理 ES 内核缓存；
  - 确保下一次 exec 强制走完整决策流程。

### 6.5 deadline 与异步调度模式

- AUTH 事件都附带 `deadline`（mach absolute time）；
- 若超时未响应，EndpointSecurity 可能：
  - 杀死客户端；
  - 或应用默认 deny/allow 策略。

**Santa 的模式：**

- 在基础层统一处理 deadline：
  - 计算授权处理「预算时间」；
  - 提前调度一个 `dispatch_after` 兜底响应 block；
  - 通过信号量与实际业务 block 协调，优先使用业务结果。
- 业务层逻辑（Authorizer/FAA）只需关注正确决策，不需要在每个事件中手工检查 `msg->deadline`。

### 6.6 与其他 ES 客户端共存策略

- 通过 `es_process_t::is_es_client` 识别「另一个 ES 客户端」；
- 通过配置 `IgnoreOtherEndpointSecurityClients` 决定是否过滤这些进程产生的事件；
- 对于被忽略的 ES 客户端：
  - 若是 AUTH 事件，直接 `ALLOW + cache=true`；
  - 避免与你自己的安全产品产生「互相拦截」。

### 6.7 默认 mute set 与系统关键二进制

- Santa 使用 `es_muted_paths_events` 在启动时获取系统当前的「默认静音路径集合」；
- 与自定义的关键系统路径列表合并，作为 `criticalSystemBinaryPaths`；
- 据此可以在策略/规则评估时对这些二进制赋予特殊处理（例如在某些模式下不做阻断）。

---

## 七、对自研产品的建议性总结

结合 Santa 的代码与 EndpointSecurity 官方 API 特性，可以给出如下建议：

- **构建类似 Santa 的三层结构：**
  - 最底层：`Client` / `EndpointSecurityAPI` / `Message`，统一封装 ES C API 与消息生命周期；
  - 中间层：通用 client 基类，负责 `es_new_client` / 订阅 / muting / deadline / 忽略其它 client；
  - 上层：多个独立 ES 客户端（执行拦截、日志、设备、FAA、自保护等）。

- **大量利用 muting 反转模式：**
  - TargetPath 反转用于构建「敏感路径 watch 列表」；
  - Process 反转用于构建「感兴趣进程集合」；
  - 将 ES 从「全局监控」降维为「精确监控」，显著降低资源占用。

- **对 ES cache 保持「轻信任」态度：**
  - 不要轻易 cache DENY 决策；
  - 大部分精细化逻辑通过自身缓存与规则系统完成；
  - 重要配置变化时及时同步清理 ES cache。

- **严格处理 deadline 与 VERSION：**
  - 所有 AUTH 事件都要有统一的超时兜底策略，并暴露 fail-open / fail-closed 开关；
  - 访问新增字段前要检查 `msg->version`，并用 `@available` 与宏保护编译；
  - 对未知枚举值（将来版本新增）选择优雅失败，而不是崩溃。

- **实现自保护（TamperResistance）：**
  - 使用 AUTH_UNLINK / AUTH_RENAME / AUTH_OPEN / AUTH_SIGNAL / AUTH_PROC_SUSPEND_RESUME / AUTH_EXEC 等事件；
  - 利用 muting + 反转只监控自身关键文件和进程；
  - 对尝试 kill / unload / 重写配置的行为进行内核层面的阻断。

总体来看，Santa 对 EndpointSecurity 的使用模式是当前业界非常成熟的一套实践，尤其在：**muting 反转、缓存策略、deadline 管理、多客户端分工、自保护** 等方面，都可直接作为你们自研 macOS 数据安全产品的参考模板，在此基础上再按业务需求扩展具体策略与 UI/配置层。

