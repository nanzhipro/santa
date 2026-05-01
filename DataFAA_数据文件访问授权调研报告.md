# Santa DataFAA（数据文件访问授权）深度调研报告

> 调研日期：2026-01-13  
> 调研目标：深入分析 Santa DataFAA 的实现机制，梳理完整数据流

---

## 一、DataFAA 概述

**DataFAA（Data File Access Authorization）** 是 Santa 的数据文件访问控制模块，用于监控和控制对**用户配置的敏感路径**的文件访问操作。其核心特点是：

- **精确监控**：只监控用户配置的敏感路径，而非全盘
- **高效过滤**：使用 Mute 反转模式，事件量极小
- **灵活策略**：支持多种进程匹配条件（TeamID、SigningID、证书等）

---

## 二、核心组件架构

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              配置层 (Configuration)                              │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│   ┌─────────────────┐   ┌──────────────────┐   ┌──────────────────────────┐    │
│   │ FileAccessPolicy│   │FileAccessPolicy  │   │    Sync Server Rules     │    │
│   │    (Plist)      │   │  (Embedded)      │   │    (Database)            │    │
│   └────────┬────────┘   └────────┬─────────┘   └────────────┬─────────────┘    │
│            │                     │                          │                   │
│            └─────────────────────┴──────────────────────────┘                   │
│                                  │                                              │
│                                  ▼                                              │
│                    ┌─────────────────────────────┐                              │
│                    │         WatchItems          │                              │
│                    │   (配置解析与策略管理)       │                              │
│                    └─────────────┬───────────────┘                              │
└──────────────────────────────────┼──────────────────────────────────────────────┘
                                   │
┌──────────────────────────────────┼──────────────────────────────────────────────┐
│                              策略层 (Policy)                                     │
├──────────────────────────────────┼──────────────────────────────────────────────┤
│                                  ▼                                              │
│   ┌───────────────────────────────────────────────────────────────────────┐     │
│   │                         DataWatchItems                                 │     │
│   │  ┌─────────────────────────────────────────────────────────────────┐  │     │
│   │  │                     PrefixTree<Policy>                          │  │     │
│   │  │   /Users/*/Documents/Confidential/* → Policy A                 │  │     │
│   │  │   /etc/sudoers → Policy B                                       │  │     │
│   │  │   /var/db/keychain/* → Policy C                                │  │     │
│   │  └─────────────────────────────────────────────────────────────────┘  │     │
│   └───────────────────────────────────────────────────────────────────────┘     │
│                                  │                                              │
│                                  │ FindPoliciesForTargets()                     │
│                                  ▼                                              │
│   ┌───────────────────────────────────────────────────────────────────────┐     │
│   │                     DataWatchItemPolicy                                │     │
│   │  • name: "ConfidentialDocs"                                           │     │
│   │  • path: "/Users/*/Documents/Confidential"                            │     │
│   │  • path_type: kPrefix                                                 │     │
│   │  • allow_read_access: false                                           │     │
│   │  • audit_only: false                                                  │     │
│   │  • processes: [{TeamID: "ABC123"}, {SigningID: "com.company.app"}]   │     │
│   └───────────────────────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────────────────────┘
                                   │
┌──────────────────────────────────┼──────────────────────────────────────────────┐
│                             事件处理层 (Event Processing)                        │
├──────────────────────────────────┼──────────────────────────────────────────────┤
│                                  ▼                                              │
│   ┌───────────────────────────────────────────────────────────────────────┐     │
│   │           SNTEndpointSecurityDataFileAccessAuthorizer                  │     │
│   │                                                                        │     │
│   │  订阅事件:                                                              │     │
│   │  • AUTH_CLONE, AUTH_COPYFILE, AUTH_CREATE                             │     │
│   │  • AUTH_EXCHANGEDATA, AUTH_LINK, AUTH_OPEN                            │     │
│   │  • AUTH_RENAME, AUTH_TRUNCATE, AUTH_UNLINK                            │     │
│   │  • NOTIFY_EXIT                                                        │     │
│   │                                                                        │     │
│   │  关键方法:                                                              │     │
│   │  • handleMessage:recordEventMetrics: → 入口                           │     │
│   │  • processMessage:overrideAction: → 策略评估                          │     │
│   │  • watchItemsCount:newPaths:removedPaths: → 动态路径更新              │     │
│   └───────────────────────────────────────────────────────────────────────┘     │
│                                  │                                              │
│                                  ▼                                              │
│   ┌───────────────────────────────────────────────────────────────────────┐     │
│   │                      FAAPolicyProcessor                                │     │
│   │                                                                        │     │
│   │  • ProcessMessage() - 核心策略评估                                     │     │
│   │  • ApplyPolicy() - 应用单条策略                                        │     │
│   │  • PolicyMatchesProcess() - 进程匹配判定                               │     │
│   │  • PolicyAllowsReadsForTarget() - 读权限检查                          │     │
│   │  • LogTelemetry() - 日志记录                                          │     │
│   │  • LogTTY() - TTY 通知                                                │     │
│   └───────────────────────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────────────────────┘
                                   │
┌──────────────────────────────────┼──────────────────────────────────────────────┐
│                           ES 框架层 (EndpointSecurity)                          │
├──────────────────────────────────┼──────────────────────────────────────────────┤
│                                  ▼                                              │
│   ┌───────────────────────────────────────────────────────────────────────┐     │
│   │                   SNTEndpointSecurityClient (基类)                     │     │
│   │                                                                        │     │
│   │  Mute 反转模式:                                                        │     │
│   │  • enableTargetPathWatching() - 开启反转模式                          │     │
│   │  • muteTargetPaths() - 添加监控路径 (反转后=关注列表)                  │     │
│   │  • unmuteTargetPaths() - 移除监控路径                                 │     │
│   │  • unmuteAllTargetPaths() - 清空所有监控                              │     │
│   │                                                                        │     │
│   │  响应方法:                                                              │     │
│   │  • respondToMessage:withAuthResult:cacheable: → ES 响应               │     │
│   │  • clearCache → 清除 ES 缓存                                          │     │
│   └───────────────────────────────────────────────────────────────────────┘     │
│                                  │                                              │
│                                  ▼                                              │
│   ┌───────────────────────────────────────────────────────────────────────┐     │
│   │                    EndpointSecurity Framework                          │     │
│   │                                                                        │     │
│   │  • es_mute_path() / es_unmute_path()                                  │     │
│   │  • es_invert_muting(ES_MUTE_INVERSION_TYPE_TARGET_PATH)               │     │
│   │  • es_respond_auth_result() / es_respond_flags_result()               │     │
│   └───────────────────────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 三、完整数据流

### 3.1 初始化流程

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              初始化流程                                          │
└─────────────────────────────────────────────────────────────────────────────────┘

     ┌──────────────┐
     │  Santad.mm   │
     │   (main)     │
     └──────┬───────┘
            │
            │ 1. 创建 WatchItems
            ▼
     ┌──────────────────────────────────────────────────────────────────────────┐
     │  WatchItems::CreateFromPath / CreateFromEmbeddedConfig / CreateFromRules │
     │  • 读取配置文件 (FileAccessPolicyPlist) 或嵌入配置                        │
     │  • 解析 WatchItems 字典，校验每条规则                                     │
     │  • 构建 DataWatchItems (PrefixTree) 和 ProcessWatchItems                 │
     └──────────────────────────────────────┬───────────────────────────────────┘
                                            │
            │ 2. 创建 FAAPolicyProcessor    │
            ▼                               │
     ┌──────────────────────────────────────┴───────────────────────────────────┐
     │  FAAPolicyProcessor::Create()                                            │
     │  • 注入 DecisionCache, Enricher, Logger, TTYWriter, Metrics             │
     │  • 配置速率限制器 (fileAccessGlobalLogsPerSec)                           │
     │  • 设置事件存储回调 (store_access_event_block)                           │
     └──────────────────────────────────────┬───────────────────────────────────┘
                                            │
            │ 3. 创建 DataFAA Client        │
            ▼                               │
     ┌──────────────────────────────────────┴───────────────────────────────────┐
     │  SNTEndpointSecurityDataFileAccessAuthorizer::init                       │
     │  • establishClientOrDie() - 创建 ES 客户端                               │
     │  • enableTargetPathWatching() - 开启 Mute 反转模式                       │
     │  • 注入 findPoliciesForTargetsBlock                                      │
     └──────────────────────────────────────┬───────────────────────────────────┘
                                            │
            │ 4. 注册回调                   │
            ▼                               │
     ┌──────────────────────────────────────┴───────────────────────────────────┐
     │  WatchItems::RegisterDataWatchItemsUpdatedCallback                       │
     │  • 配置变更时通知 DataFAA Client 更新监控路径                            │
     │                                                                          │
     │  data_faa_client.fileAccessDeniedBlock = ^(...) {                        │
     │    // 访问被拒绝时通知 GUI                                               │
     │    [[notifier_queue.notifierConnection remoteObjectProxy]                │
     │        postFileAccessBlockNotification:...];                             │
     │  }                                                                       │
     └──────────────────────────────────────────────────────────────────────────┘
```

### 3.2 配置加载与路径监控数据流

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                          配置加载与路径监控数据流                                │
└─────────────────────────────────────────────────────────────────────────────────┘

 ┌─────────────────────────────────────────────────────────────────────────────┐
 │                         配置文件 (FileAccessPolicy.plist)                    │
 │                                                                             │
 │  <dict>                                                                     │
 │    <key>Version</key><string>v1.0</string>                                  │
 │    <key>WatchItems</key>                                                    │
 │    <dict>                                                                   │
 │      <key>ConfidentialDocs</key>                                           │
 │      <dict>                                                                 │
 │        <key>Paths</key>                                                     │
 │        <array>                                                              │
 │          <dict>                                                             │
 │            <key>Path</key><string>/Users/*/Documents/Confidential</string>  │
 │            <key>IsPrefix</key><true/>                                       │
 │          </dict>                                                            │
 │        </array>                                                             │
 │        <key>Processes</key>                                                 │
 │        <array>                                                              │
 │          <dict>                                                             │
 │            <key>TeamID</key><string>EQHXZ8M8AV</string>                     │
 │          </dict>                                                            │
 │        </array>                                                             │
 │        <key>Options</key>                                                   │
 │        <dict>                                                               │
 │          <key>AuditOnly</key><false/>                                       │
 │          <key>RuleType</key><string>PathsWithAllowedProcesses</string>     │
 │        </dict>                                                              │
 │      </dict>                                                                │
 │    </dict>                                                                  │
 │  </dict>                                                                    │
 └─────────────────────────────────────────────────────────┬───────────────────┘
                                                           │
                                                           │ 1. 定时重载
                                                           ▼
 ┌─────────────────────────────────────────────────────────────────────────────┐
 │                        WatchItems::ReloadConfig()                           │
 │                                                                             │
 │  1. 解析配置，提取所有规则                                                   │
 │  2. 通配符展开: /Users/*/Documents/Confidential                             │
 │     → /Users/john/Documents/Confidential                                    │
 │     → /Users/alice/Documents/Confidential                                   │
 │  3. 构建 DataWatchItemPolicy 对象                                           │
 │  4. 插入 PrefixTree (Literal 或 Prefix 类型)                                │
 │  5. 计算路径差异 (new_paths, removed_paths)                                 │
 └─────────────────────────────────────────────────────────┬───────────────────┘
                                                           │
                                                           │ 2. 通知回调
                                                           ▼
 ┌─────────────────────────────────────────────────────────────────────────────┐
 │         DataFAA Client: watchItemsCount:newPaths:removedPaths:              │
 │                                                                             │
 │  - (void)watchItemsCount:(size_t)count                                      │
 │                 newPaths:(const SetPairPathAndType &)newPaths                │
 │             removedPaths:(const SetPairPathAndType &)removedPaths {         │
 │    if (count == 0) {                                                        │
 │      [self disable];  // 无监控路径，禁用客户端                              │
 │    } else {                                                                 │
 │      [super unmuteTargetPaths:removedPaths];  // 移除旧路径监控              │
 │      [super muteTargetPaths:newPaths];        // 添加新路径监控              │
 │      [self enable];                           // 确保订阅事件               │
 │    }                                                                        │
 │  }                                                                          │
 └─────────────────────────────────────────────────────────┬───────────────────┘
                                                           │
                                                           │ 3. Mute 反转
                                                           ▼
 ┌─────────────────────────────────────────────────────────────────────────────┐
 │                    EndpointSecurity Framework (内核)                        │
 │                                                                             │
 │  反转模式下:                                                                │
 │  • es_mute_path("/Users/john/Documents/Confidential", TARGET_PREFIX)        │
 │    → 只有访问此路径的事件会被发送到 ES 客户端                               │
 │  • 其他路径的事件被内核静默过滤                                              │
 │                                                                             │
 │  效果: 事件量从 ~50,000/s 降低到 ~100/s                                     │
 └─────────────────────────────────────────────────────────────────────────────┘
```

### 3.3 文件访问事件处理数据流

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                          文件访问事件处理数据流                                  │
└─────────────────────────────────────────────────────────────────────────────────┘

 ┌─────────────────────────────────────────────────────────────────────────────┐
 │                           用户进程文件操作                                   │
 │                                                                             │
 │  例: Terminal.app 尝试 open("/Users/john/Documents/Confidential/secret.txt")│
 └─────────────────────────────────────────────────────────┬───────────────────┘
                                                           │
                                                           │ 内核拦截
                                                           ▼
 ┌─────────────────────────────────────────────────────────────────────────────┐
 │                 EndpointSecurity Framework 产生 AUTH_OPEN 事件              │
 │                                                                             │
 │  es_message_t {                                                             │
 │    event_type: ES_EVENT_TYPE_AUTH_OPEN                                      │
 │    action_type: ES_ACTION_TYPE_AUTH                                         │
 │    process: {                                                               │
 │      audit_token: ...,                                                      │
 │      executable: { path: "/System/Applications/Utilities/Terminal.app/..." }│
 │      signing_id: "com.apple.Terminal",                                      │
 │      team_id: nil (platform binary),                                        │
 │      is_platform_binary: true                                               │
 │    },                                                                       │
 │    event.open: {                                                            │
 │      file: { path: "/Users/john/Documents/Confidential/secret.txt" }        │
 │      fflag: FREAD | FWRITE                                                  │
 │    }                                                                        │
 │  }                                                                          │
 └─────────────────────────────────────────────────────────┬───────────────────┘
                                                           │
                                                           │ ES 回调
                                                           ▼
 ┌─────────────────────────────────────────────────────────────────────────────┐
 │       DataFAA Client: handleMessage:recordEventMetrics:                     │
 │                                                                             │
 │  1. 检查 overrideAction == Disable?                                         │
 │     → 是: 直接 ALLOW，返回                                                  │
 │                                                                             │
 │  2. 检查 event_type == NOTIFY_EXIT?                                         │
 │     → 是: 通知 FAAPolicyProcessor 清理进程缓存，返回                        │
 │                                                                             │
 │  3. 检查 ImmediateResponse()?                                               │
 │     → 有: 直接响应（读缓存命中等场景）                                       │
 │                                                                             │
 │  4. 异步分发到处理队列                                                       │
 │     → processMessage:overrideAction:                                        │
 └─────────────────────────────────────────────────────────┬───────────────────┘
                                                           │
                                                           │ 策略查找
                                                           ▼
 ┌─────────────────────────────────────────────────────────────────────────────┐
 │              DataFAA Client: processMessage:overrideAction:                 │
 │                                                                             │
 │  // 1. 获取事件中所有目标路径                                                │
 │  auto pathTargets = msg.PathTargets();                                      │
 │  // PathTargets() 统一抽象不同事件类型的目标文件:                            │
 │  // AUTH_OPEN → event.open.file                                             │
 │  // AUTH_RENAME → event.rename.source + event.rename.destination_type       │
 │  // AUTH_LINK → event.link.source + event.link.target_dir                   │
 │                                                                             │
 │  // 2. 为每个目标路径查找匹配的策略                                          │
 │  findPoliciesForTargetsBlock(^(LookupPolicyBlock lookupPolicyBlock) {       │
 │    for (const auto &target : pathTargets) {                                 │
 │      // PrefixTree 最长前缀匹配                                              │
 │      auto policy = lookupPolicyBlock(target.path.c_str());                  │
 │      targetPolicyPairs.emplace_back(idx, policy);                           │
 │    }                                                                        │
 │  });                                                                        │
 │                                                                             │
 │  // 结果: [("/Users/john/.../secret.txt", Policy "ConfidentialDocs")]       │
 └─────────────────────────────────────────────────────────┬───────────────────┘
                                                           │
                                                           │ 策略评估
                                                           ▼
 ┌─────────────────────────────────────────────────────────────────────────────┐
 │                FAAPolicyProcessor::ProcessMessage()                         │
 │                                                                             │
 │  对每个 (target, policy) 对执行 ProcessTargetAndPolicy():                   │
 │                                                                             │
 │  ┌─────────────────────────────────────────────────────────────────────┐    │
 │  │                     ApplyPolicy()                                   │    │
 │  │                                                                     │    │
 │  │  1. 检查策略是否存在                                                │    │
 │  │     → 无策略: FileAccessPolicyDecision::kNoPolicy                  │    │
 │  │                                                                     │    │
 │  │  2. 检查进程签名有效性                                              │    │
 │  │     → 无效签名 + EnableBadSignatureProtection:                     │    │
 │  │       FileAccessPolicyDecision::kDeniedInvalidSignature            │    │
 │  │                                                                     │    │
 │  │  3. 检查是否允许读访问 (PolicyAllowsReadsForTarget)                 │    │
 │  │     → allow_read_access=true + FREAD 标志:                         │    │
 │  │       FileAccessPolicyDecision::kAllowedReadAccess                 │    │
 │  │                                                                     │    │
 │  │  4. 调用 CheckIfPolicyMatchesBlock 判断进程是否匹配                 │    │
 │  │     遍历 policy.processes，检查:                                   │    │
 │  │     • PlatformBinary 匹配                                          │    │
 │  │     • TeamID 匹配                                                  │    │
 │  │     • SigningID 匹配 (支持通配符)                                  │    │
 │  │     • CertificateSha256 匹配                                       │    │
 │  │     • CDHash 匹配                                                  │    │
 │  │     • BinaryPath 匹配                                              │    │
 │  │                                                                     │    │
 │  │  5. 根据 RuleType 确定最终决策:                                    │    │
 │  │     PathsWithAllowedProcesses:                                     │    │
 │  │       匹配 → ALLOW, 不匹配 → DENY                                  │    │
 │  │     PathsWithDeniedProcesses:                                      │    │
 │  │       匹配 → DENY, 不匹配 → ALLOW                                  │    │
 │  │                                                                     │    │
 │  │  6. 应用 audit_only 标志                                           │    │
 │  │     → DENY + audit_only: kDeniedAuditOnly (记录但不阻止)           │    │
 │  └─────────────────────────────────────────────────────────────────────┘    │
 │                                                                             │
 │  示例结果:                                                                   │
 │  Terminal.app (platform binary, 不在允许列表中)                             │
 │  → FileAccessPolicyDecision::kDenied                                        │
 └─────────────────────────────────────────────────────────┬───────────────────┘
                                                           │
                                                           │ 结果处理
                                                           ▼
 ┌─────────────────────────────────────────────────────────────────────────────┐
 │                         后续处理                                            │
 │                                                                             │
 │  ┌───────────────────┐  ┌───────────────────┐  ┌───────────────────────┐   │
 │  │   LogTelemetry()  │  │     LogTTY()      │  │ fileAccessDeniedBlock │   │
 │  │                   │  │                   │  │                       │   │
 │  │ • 速率限制检查    │  │ • 检查 TTY 消息   │  │ • 发送阻止通知到 GUI  │   │
 │  │ • 记录日志事件    │  │   缓存            │  │ • 存储事件到数据库    │   │
 │  │ • 存储到数据库    │  │ • 输出到终端      │  │ • 同步服务上传        │   │
 │  │   (同步上传)      │  │                   │  │                       │   │
 │  └─────────┬─────────┘  └─────────┬─────────┘  └───────────┬───────────┘   │
 │            │                      │                        │               │
 │            └──────────────────────┴────────────────────────┘               │
 └─────────────────────────────────────────────────────────┬───────────────────┘
                                                           │
                                                           │ ES 响应
                                                           ▼
 ┌─────────────────────────────────────────────────────────────────────────────┐
 │           respondToMessage:withAuthResult:cacheable:                        │
 │                                                                             │
 │  es_respond_auth_result(client, msg, ES_AUTH_RESULT_DENY, cacheable);       │
 │                                                                             │
 │  缓存策略:                                                                   │
 │  • ALLOW + 所有目标均允许 + 签名有效 → cacheable = true                     │
 │  • DENY → cacheable = false (便于规则更新后重新评估)                        │
 │  • 审计模式 → 实际响应 ALLOW，但记录日志                                    │
 └─────────────────────────────────────────────────────────┬───────────────────┘
                                                           │
                                                           │ 内核执行
                                                           ▼
 ┌─────────────────────────────────────────────────────────────────────────────┐
 │                           内核层执行决策                                     │
 │                                                                             │
 │  DENY: 文件操作被拒绝，进程收到 EPERM 错误                                  │
 │  ALLOW: 文件操作正常执行                                                    │
 └─────────────────────────────────────────────────────────────────────────────┘
```

---

## 四、关键实现细节

### 4.1 Mute 反转模式

```cpp
// SNTEndpointSecurityDataFileAccessAuthorizer.mm

- (instancetype)init... {
  // ...
  [self establishClientOrDie];
  
  // 关键: 开启 Target Path Mute 反转模式
  [super enableTargetPathWatching];
}

// SNTEndpointSecurityClient.mm
- (bool)enableTargetPathWatching {
  // 1. 清空所有目标路径 mute 规则
  _esApi->UnmuteAllTargetPaths(_esClient);
  
  // 2. 反转 muting 语义
  //    反转前: mute = 忽略
  //    反转后: mute = 关注 (watch list)
  _esApi->InvertTargetPathMuting(_esClient);
}
```

**反转模式的意义：**

| 模式 | 默认行为 | mute 列表含义 | 事件量 |
|------|----------|---------------|--------|
| 正常模式 | 接收所有事件 | 忽略列表 | ~50,000/s |
| **反转模式** | 忽略所有事件 | **关注列表** | **~100/s** |

### 4.2 路径前缀树匹配

```cpp
// WatchItems.mm

bool DataWatchItems::Build(SetSharedDataWatchItemPolicy data_policies) {
  for (const auto &item : data_policies) {
    // Glob 展开: /Users/*/Documents → 多个实际路径
    std::vector<std::string> matches = FindMatches(@(item->path.c_str()));
    
    for (const auto &match : matches) {
      if (item->path_type == WatchItemPathType::kPrefix) {
        // 前缀类型: /Users/john/Documents/Confidential/*
        tree_->InsertPrefix(match.c_str(), item);
      } else {
        // 字面量类型: /etc/sudoers
        tree_->InsertLiteral(match.c_str(), item);
      }
    }
  }
}

// 查找策略: 最长前缀匹配
void DataWatchItems::FindPolicies(IterateTargetsBlock iterateTargetsBlock) const {
  iterateTargetsBlock(^(const std::string &path) {
    return tree_->LookupLongestMatchingPrefix(path);
  });
}
```

### 4.3 进程匹配逻辑

```cpp
// FAAPolicyProcessor.mm

bool FAAPolicyProcessor::PolicyMatchesProcess(
    const WatchItemProcess &policy_proc,
    const es_process_t *es_proc) {
  
  // 1. 平台二进制匹配
  if (policy_proc.platform_binary.has_value()) {
    if (policy_proc.platform_binary.value() != es_proc->is_platform_binary) {
      return false;
    }
  }
  
  // 2. TeamID 匹配
  if (!policy_proc.team_id.empty()) {
    if (es_proc->team_id.data == nullptr ||
        policy_proc.team_id != es_proc->team_id.data) {
      return false;
    }
  }
  
  // 3. SigningID 匹配 (支持通配符 *)
  if (!policy_proc.signing_id.empty()) {
    // 通配符支持: com.company.* 或 *.daemon
    if (!SigningIDMatches(policy_proc.signing_id, es_proc->signing_id)) {
      return false;
    }
  }
  
  // 4. 证书哈希匹配
  if (!policy_proc.certificate_sha256.empty()) {
    NSString *certHash = GetCertificateHash(es_proc->executable);
    if (![certHash isEqualToString:@(policy_proc.certificate_sha256.c_str())]) {
      return false;
    }
  }
  
  // 5. CDHash 匹配
  // 6. BinaryPath 匹配
  // ...
  
  return true;  // 所有条件都匹配
}
```

### 4.4 规则类型

| RuleType | 行为 |
|----------|------|
| `PathsWithAllowedProcesses` | 监控路径，只允许匹配进程访问，其他进程被拒绝 |
| `PathsWithDeniedProcesses` | 监控路径，匹配进程被拒绝，其他进程允许 |
| `ProcessesWithAllowedPaths` | 监控进程，只允许访问匹配路径，其他路径被拒绝 |
| `ProcessesWithDeniedPaths` | 监控进程，访问匹配路径被拒绝，其他路径允许 |

---

## 五、性能优化策略

### 5.1 多层缓存

```
┌───────────────────────────────────────────────────────────────┐
│                     读缓存 (ReadsCache)                       │
│  Key: (pid, fd, FAAClientType)                               │
│  Value: (dev_t, ino_t)                                       │
│  作用: 避免对同一文件句柄的重复评估                           │
└───────────────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────────────┐
│                  证书哈希缓存 (CertHashCache)                 │
│  Key: SantaVnode                                             │
│  Value: NSString (SHA-256)                                   │
│  作用: 避免重复计算可执行文件的证书哈希                       │
└───────────────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────────────┐
│                TTY 消息缓存 (TTYMessageCache)                 │
│  Key: (pid, fd)                                              │
│  Value: (rule_name, path)                                    │
│  作用: 避免对同一进程/策略对重复输出 TTY 消息                │
└───────────────────────────────────────────────────────────────┘
```

### 5.2 速率限制

```cpp
// 配置: FileAccessGlobalLogsPerSec = 60, FileAccessGlobalWindowSizeSec = 15
// 允许 15 秒窗口内最多 60 条日志，支持突发

RateLimiter rate_limiter_(logs_per_sec, window_size_sec);

// 日志记录前检查
if (rate_limiter_.ShouldLog()) {
  LogTelemetry(policy, msg, target_index, decision);
}
```

### 5.3 即时响应

```cpp
std::optional<ESResult> ImmediateResponse(const Message &msg) {
  // 场景1: 已缓存的读访问
  if (IsReadOnlyAccess(msg) && IsInReadsCache(msg)) {
    return ESResult{ES_AUTH_RESULT_ALLOW, true};
  }
  
  // 场景2: 无匹配策略的快速路径
  // (实际在 PrefixTree 查找后才能判断)
  
  return std::nullopt;  // 需要完整评估
}
```

---

## 六、配置示例

### 6.1 保护敏感目录

```xml
<dict>
  <key>Version</key>
  <string>v1.0</string>
  <key>WatchItems</key>
  <dict>
    <!-- 保护机密文档目录 -->
    <key>ConfidentialDocs</key>
    <dict>
      <key>Paths</key>
      <array>
        <dict>
          <key>Path</key>
          <string>/Users/*/Documents/Confidential</string>
          <key>IsPrefix</key>
          <true/>
        </dict>
      </array>
      <key>Options</key>
      <dict>
        <key>RuleType</key>
        <string>PathsWithAllowedProcesses</string>
        <key>AllowReadAccess</key>
        <false/>
        <key>AuditOnly</key>
        <false/>
      </dict>
      <key>Processes</key>
      <array>
        <!-- 允许公司安全应用访问 -->
        <dict>
          <key>TeamID</key>
          <string>COMPANY123</string>
          <key>SigningID</key>
          <string>com.company.secure-editor</string>
        </dict>
        <!-- 允许 Finder -->
        <dict>
          <key>PlatformBinary</key>
          <true/>
          <key>SigningID</key>
          <string>com.apple.finder</string>
        </dict>
      </array>
    </dict>
  </dict>
</dict>
```

---

## 七、总结

Santa DataFAA 模块的技术亮点：

| 特性 | 实现方式 | 价值 |
|------|----------|------|
| **精确监控** | Mute 反转 + PrefixTree | 事件量降低 500 倍 |
| **灵活策略** | 多维度进程匹配 | 支持复杂业务场景 |
| **动态更新** | 配置变更回调 | 无需重启即时生效 |
| **性能优化** | 多层缓存 + 速率限制 | 高吞吐低延迟 |
| **用户体验** | GUI 通知 + TTY 消息 | 阻止原因透明 |

---

*本报告基于 Santa 开源代码深度分析，仅供技术研究参考。*
