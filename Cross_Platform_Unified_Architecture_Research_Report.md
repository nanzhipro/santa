# 跨平台统一架构：macOS/Windows/Linux 终端数据安全统一策略模型

> **调研日期**：2026-01-13  
> **调研目标**：以乔布斯对产品的极致追求和马斯克对技术的极致挑战为标准，深度分析终端数据安全产品的跨平台统一架构设计  
> **产品类型**：终端数据安全产品

---

## 一、执行摘要

### 1.1 核心洞察

**"简单是复杂的终极形态"** —— 史蒂夫·乔布斯

跨平台终端安全产品的最大挑战不在于技术实现的复杂性，而在于如何将三个截然不同的操作系统内核安全机制，抽象为一个**语义统一、体验一致、性能卓越**的策略模型。

本报告提出的核心架构理念：

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     "One Policy, Three Kernels"                             │
│                                                                             │
│   用户定义一次策略 → 三个平台自动适配 → 统一的安全姿态                        │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 关键结论

| 维度 | 结论 |
|------|------|
| **架构模式** | 四层抽象架构：策略语义层 → 规则编译层 → 平台适配层 → 内核接口层 |
| **策略语言** | 采用 CEL (Common Expression Language) 作为统一策略表达语言 |
| **数据模型** | 采用 OCSF + Protobuf 实现跨平台事件规范化 |
| **关键技术** | macOS: EndpointSecurity / Windows: ETW+Minifilter / Linux: eBPF+LSM |
| **性能目标** | AUTH 事件 < 1ms 响应，NOTIFY 事件 < 10ms 处理 |

---

## 二、问题定义：为什么跨平台统一如此困难？

### 2.1 三大平台的内核安全机制对比

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        三大平台内核安全机制差异                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  macOS (Darwin)              Windows (NT)              Linux                │
│  ┌─────────────────┐         ┌─────────────────┐       ┌─────────────────┐  │
│  │ EndpointSecurity│         │ ETW Provider    │       │ eBPF Programs   │  │
│  │ Framework       │         │ + Minifilter    │       │ + LSM Hooks     │  │
│  │                 │         │ Driver          │       │ + fanotify      │  │
│  │ • System Ext    │         │ • Kernel Driver │       │ • User/Kernel   │  │
│  │ • User Space    │         │ • Ring 0        │       │ • JIT Compiled  │  │
│  │ • Entitlements  │         │ • Signed        │       │ • Capabilities  │  │
│  └────────┬────────┘         └────────┬────────┘       └────────┬────────┘  │
│           │                           │                         │           │
│           ▼                           ▼                         ▼           │
│  ┌─────────────────┐         ┌─────────────────┐       ┌─────────────────┐  │
│  │ AUTH/NOTIFY     │         │ Pre/Post        │       │ BPF_PROG_TYPE   │  │
│  │ Events          │         │ Operations      │       │ _LSM            │  │
│  │ ~100 types      │         │ IRP Callbacks   │       │ ~200 hooks      │  │
│  └─────────────────┘         └─────────────────┘       └─────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 核心挑战矩阵

| 挑战维度 | macOS | Windows | Linux | 统一难度 |
|----------|-------|---------|-------|----------|
| **执行控制** | AUTH_EXEC + 代码签名 | Process Creation Callback | execve LSM hook | ⭐⭐⭐ |
| **文件访问** | AUTH_OPEN/CLONE/CREATE | Minifilter IRP_MJ_* | file_open LSM hook | ⭐⭐⭐⭐ |
| **网络控制** | ES_EVENT_TYPE_NOTIFY_* | WFP (Windows Filtering Platform) | socket LSM hooks | ⭐⭐⭐⭐⭐ |
| **进程信息** | audit_token + codesign | EPROCESS + Authenticode | task_struct + capabilities | ⭐⭐⭐ |
| **事件模型** | 同步 AUTH + 异步 NOTIFY | 同步 Pre + Post | 同步 LSM + 异步 tracing | ⭐⭐⭐⭐ |
| **权限模型** | Entitlements + TCC | Privileges + ACLs | Capabilities + SELinux | ⭐⭐⭐⭐⭐ |

### 2.3 Santa 项目的启示

通过分析 Santa 项目的 macOS 实现，我们提炼出以下可跨平台复用的设计模式：

```objc
// Santa 的三层架构设计 —— 可作为跨平台架构的蓝本
┌─────────────────────────────────────────────────────────────────┐
│  业务策略层 (Platform-Agnostic)                                  │
│  • Authorizer    • FAAPolicyProcessor    • DeviceManager        │
└───────────────────────────────┬─────────────────────────────────┘
                                │
┌───────────────────────────────┴─────────────────────────────────┐
│  通用抽象层 (Cross-Platform Abstraction)                         │
│  • EndpointSecurityAPI (虚接口)    • Message 抽象    • Enricher │
└───────────────────────────────┬─────────────────────────────────┘
                                │
┌───────────────────────────────┴─────────────────────────────────┐
│  平台适配层 (Platform-Specific Implementation)                   │
│  • ES C API 封装 (macOS)    • ETW+Minifilter (Windows)          │
└─────────────────────────────────────────────────────────────────┘
```

---

## 三、统一策略模型设计

### 3.1 设计哲学

> **"First Principles Thinking"** —— 埃隆·马斯克
>
> 不要从现有产品出发，而是从物理定律（安全的本质需求）出发：
> 1. **谁**（主体身份）访问**什么**（客体资源）
> 2. 执行**什么操作**（动作类型）
> 3. 在**什么条件**下（上下文约束）
> 4. 产生**什么结果**（允许/拒绝/审计）

### 3.2 统一策略语义模型

```yaml
# 统一策略定义语言 (Unified Policy Definition Language - UPDL)
apiVersion: security.example.com/v1
kind: EndpointPolicy
metadata:
  name: sensitive-data-protection
  version: "1.0.0"
spec:
  # 主体定义 - WHO
  subjects:
    - type: process
      match:
        # CEL 表达式实现跨平台统一匹配
        expr: |
          process.signing_id in ['com.example.approved-app'] ||
          process.team_id == 'ABCD1234' ||
          process.certificate.sha256 == 'abc123...'
    
    - type: user
      match:
        expr: |
          user.groups.exists(g, g in ['engineering', 'finance'])
  
  # 客体定义 - WHAT
  objects:
    - type: file
      paths:
        - pattern: "/Users/*/Documents/Confidential/**"
          type: prefix
        - pattern: "*.secret"
          type: glob
    
    - type: process
      match:
        expr: |
          target.path.startsWith('/usr/bin/') && 
          target.arguments.exists(a, a.contains('--sensitive'))
  
  # 操作定义 - OPERATION
  operations:
    - execute
    - read
    - write
    - rename
    - delete
  
  # 条件定义 - WHEN (CEL Expression)
  conditions:
    expr: |
      // 时间窗口检查
      timestamp.now().getHours() >= 9 && timestamp.now().getHours() <= 18 &&
      // 网络位置检查
      (context.network.type == 'corporate' || context.vpn.connected) &&
      // 设备合规检查
      device.compliant == true
  
  # 决策定义 - DECISION
  decision:
    action: deny  # allow | deny | audit
    audit: true
    notify:
      user: true
      admin: true
      message: "访问敏感数据需要额外授权"
    
  # 平台特定覆盖 (仅在必要时使用)
  platformOverrides:
    macos:
      conditions:
        expr: |
          process.cdhash != '' &&  // macOS 特有的 CDHash 检查
          process.hardened_runtime == true
    windows:
      conditions:
        expr: |
          process.authenticode.valid == true &&
          process.amsi.enabled == true  // Windows 特有的 AMSI 检查
    linux:
      conditions:
        expr: |
          process.selinux.context.contains(':unconfined_t:') == false
```

### 3.3 统一数据模型 (基于 OCSF + Protobuf)

```protobuf
// unified_security_event.proto
// 基于 OCSF (Open Cybersecurity Schema Framework) 的跨平台事件模型

syntax = "proto3";
package security.unified.v1;

import "google/protobuf/timestamp.proto";

// 统一安全事件
message SecurityEvent {
  // 元数据
  EventMetadata metadata = 1;
  
  // 主体 (发起操作的实体)
  Subject subject = 2;
  
  // 客体 (被操作的目标)
  Object object = 3;
  
  // 操作类型
  OperationType operation = 4;
  
  // 决策结果
  Decision decision = 5;
  
  // 上下文信息
  Context context = 6;
  
  // 平台特定扩展 (使用 Any 类型实现可扩展性)
  google.protobuf.Any platform_specific = 100;
}

message Subject {
  // 进程信息 - 跨平台统一字段
  ProcessInfo process = 1;
  
  // 用户信息
  UserInfo user = 2;
  
  // 代码签名信息 - 抽象统一表示
  SigningInfo signing = 3;
}

message ProcessInfo {
  int64 pid = 1;
  int64 ppid = 2;
  string path = 3;
  string name = 4;
  string cmdline = 5;
  bytes hash_sha256 = 6;
  google.protobuf.Timestamp start_time = 7;
  
  // 平台无关的进程权限抽象
  repeated string capabilities = 8;
  
  // 进程树血统 (用于行为分析)
  repeated ProcessInfo ancestors = 9;
}

message SigningInfo {
  // 统一签名状态
  enum SigningStatus {
    UNKNOWN = 0;
    UNSIGNED = 1;
    SIGNED_VALID = 2;
    SIGNED_INVALID = 3;
    SIGNED_ADHOC = 4;
  }
  SigningStatus status = 1;
  
  // 跨平台统一的签名者身份
  string signer_id = 2;           // macOS: Signing ID, Windows: Subject CN
  string team_id = 3;              // macOS: Team ID, Windows: Issuer O
  bytes certificate_hash = 4;      // SHA256 of signing certificate
  
  // 代码完整性哈希
  bytes code_hash = 5;             // macOS: CDHash, Windows: Authenticode Hash
  
  // 信任链
  repeated CertificateInfo certificate_chain = 6;
}

message Object {
  oneof target {
    FileObject file = 1;
    ProcessObject process = 2;
    NetworkObject network = 3;
    DeviceObject device = 4;
  }
}

message FileObject {
  string path = 1;
  bytes hash_sha256 = 2;
  int64 size = 3;
  google.protobuf.Timestamp mtime = 4;
  
  // 统一的文件权限表示
  FilePermissions permissions = 5;
  
  // 文件分类标签
  repeated string labels = 6;
}

enum OperationType {
  OP_UNKNOWN = 0;
  
  // 进程操作
  OP_EXEC = 1;
  OP_FORK = 2;
  OP_EXIT = 3;
  OP_SIGNAL = 4;
  
  // 文件操作
  OP_FILE_OPEN = 10;
  OP_FILE_READ = 11;
  OP_FILE_WRITE = 12;
  OP_FILE_CREATE = 13;
  OP_FILE_DELETE = 14;
  OP_FILE_RENAME = 15;
  OP_FILE_LINK = 16;
  OP_FILE_CHMOD = 17;
  OP_FILE_CHOWN = 18;
  
  // 网络操作
  OP_NET_CONNECT = 30;
  OP_NET_LISTEN = 31;
  OP_NET_ACCEPT = 32;
  OP_NET_DNS = 33;
  
  // 设备操作
  OP_DEVICE_MOUNT = 50;
  OP_DEVICE_UNMOUNT = 51;
}

message Decision {
  enum Action {
    ALLOW = 0;
    DENY = 1;
    AUDIT = 2;    // 允许但记录
    PENDING = 3;  // 需要用户确认
  }
  Action action = 1;
  
  // 决策来源
  string rule_name = 2;
  string rule_id = 3;
  
  // 决策理由 (用于审计和用户通知)
  string reason = 4;
  
  // 是否可缓存
  bool cacheable = 5;
}
```

---

## 四、四层统一架构设计

### 4.1 架构总览

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        跨平台终端安全统一架构                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ╔═══════════════════════════════════════════════════════════════════════╗  │
│  ║                    第一层：策略语义层 (Policy Semantic Layer)           ║  │
│  ║                                                                       ║  │
│  ║  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐   ║  │
│  ║  │ UPDL 策略   │  │ CEL 表达式  │  │ 策略仓库    │  │ 版本控制    │   ║  │
│  ║  │ 定义        │  │ 编辑器      │  │ (Git-based) │  │ & 回滚      │   ║  │
│  ║  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘   ║  │
│  ╚═══════════════════════════════════════════════════════════════════════╝  │
│                                    │                                        │
│                                    ▼                                        │
│  ╔═══════════════════════════════════════════════════════════════════════╗  │
│  ║                    第二层：规则编译层 (Rule Compilation Layer)          ║  │
│  ║                                                                       ║  │
│  ║  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐   ║  │
│  ║  │ CEL 编译器  │→ │ AST 优化    │→ │ 平台规则    │→ │ 规则分发    │   ║  │
│  ║  │             │  │ & 验证      │  │ 生成器      │  │ 服务        │   ║  │
│  ║  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘   ║  │
│  ╚═══════════════════════════════════════════════════════════════════════╝  │
│                                    │                                        │
│         ┌──────────────────────────┼──────────────────────────┐             │
│         │                          │                          │             │
│         ▼                          ▼                          ▼             │
│  ╔═════════════════╗    ╔═════════════════╗    ╔═════════════════╗          │
│  ║ macOS Adapter   ║    ║ Windows Adapter ║    ║ Linux Adapter   ║          │
│  ║                 ║    ║                 ║    ║                 ║          │
│  ║ ┌─────────────┐ ║    ║ ┌─────────────┐ ║    ║ ┌─────────────┐ ║          │
│  ║ │ ES Client   │ ║    ║ │ ETW Session │ ║    ║ │ eBPF Loader │ ║          │
│  ║ │ Manager     │ ║    ║ │ Manager     │ ║    ║ │ Manager     │ ║          │
│  ║ └─────────────┘ ║    ║ └─────────────┘ ║    ║ └─────────────┘ ║          │
│  ║ ┌─────────────┐ ║    ║ ┌─────────────┐ ║    ║ ┌─────────────┐ ║          │
│  ║ │ Message     │ ║    ║ │ Event       │ ║    ║ │ Event       │ ║          │
│  ║ │ Enricher    │ ║    ║ │ Enricher    │ ║    ║ │ Enricher    │ ║          │
│  ║ └─────────────┘ ║    ║ └─────────────┘ ║    ║ └─────────────┘ ║          │
│  ║ ┌─────────────┐ ║    ║ ┌─────────────┐ ║    ║ ┌─────────────┐ ║          │
│  ║ │ Codesign    │ ║    ║ │ Authenticode│ ║    ║ │ IMA/EVM     │ ║          │
│  ║ │ Verifier    │ ║    ║ │ Verifier    │ ║    ║ │ Verifier    │ ║          │
│  ║ └─────────────┘ ║    ║ └─────────────┘ ║    ║ └─────────────┘ ║          │
│  ╚════════╤════════╝    ╚════════╤════════╝    ╚════════╤════════╝          │
│           │                      │                      │                   │
│           ▼                      ▼                      ▼                   │
│  ╔═══════════════════════════════════════════════════════════════════════╗  │
│  ║                    第四层：内核接口层 (Kernel Interface Layer)          ║  │
│  ║                                                                       ║  │
│  ║  ┌─────────────┐       ┌─────────────┐       ┌─────────────┐          ║  │
│  ║  │EndpointSec  │       │ Minifilter  │       │ eBPF/LSM    │          ║  │
│  ║  │Framework    │       │ + ETW       │       │ Hooks       │          ║  │
│  ║  │             │       │ + WFP       │       │ + fanotify  │          ║  │
│  ║  └─────────────┘       └─────────────┘       └─────────────┘          ║  │
│  ╚═══════════════════════════════════════════════════════════════════════╝  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 策略语义层详细设计

#### 4.2.1 CEL (Common Expression Language) 作为统一策略语言

**为什么选择 CEL：**

| 特性 | CEL 优势 | 竞品对比 |
|------|----------|----------|
| **安全性** | 沙箱执行，无副作用 | OPA/Rego 更复杂 |
| **性能** | 编译一次，多次评估 (ns~μs 级) | Lua 需要 VM 开销 |
| **可移植性** | Go/C++/Java/Rust 实现 | Rego 主要 Go |
| **表达能力** | 类 C 语法，学习曲线低 | JSONPath 表达力弱 |
| **类型安全** | 编译时类型检查 | JavaScript 运行时检查 |
| **扩展性** | 自定义函数/类型 | 良好 |

**CEL 在安全策略中的应用示例：**

```cel
// 示例 1: 基于代码签名的执行控制
process.signing.status == SigningStatus.SIGNED_VALID &&
process.signing.team_id in ['ABCD1234', 'EFGH5678'] &&
process.signing.certificate_chain.all(c, c.not_after > timestamp.now())

// 示例 2: 基于文件路径和进程血统的数据保护
object.file.path.startsWith('/Users/') &&
object.file.path.contains('/Confidential/') &&
!subject.process.ancestors.exists(p, 
  p.signing.signer_id == 'com.example.trusted-backup')

// 示例 3: 基于上下文的动态策略
context.network.type == 'public' ? 
  // 公共网络：严格限制
  (operation in [OperationType.OP_FILE_READ] && 
   object.file.labels.exists(l, l == 'public')) :
  // 企业网络：正常访问
  true

// 示例 4: 跨平台代码签名验证 (平台差异透明化)
has(subject.process.signing.code_hash) &&
size(subject.process.signing.code_hash) == 32 &&
// 统一的签名者白名单检查
subject.process.signing.signer_id in approved_signers
```

### 4.3 规则编译层详细设计

#### 4.3.1 CEL 到平台原生规则的编译流程

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        CEL 规则编译流程                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   UPDL Policy                                                               │
│       │                                                                     │
│       ▼                                                                     │
│   ┌─────────────────────────────────────────────┐                          │
│   │            CEL Parser & Compiler             │                          │
│   │                                             │                          │
│   │  1. 语法解析 → AST                           │                          │
│   │  2. 类型检查 → 类型化 AST                    │                          │
│   │  3. 优化 → 常量折叠、死代码消除              │                          │
│   └─────────────────────┬───────────────────────┘                          │
│                         │                                                   │
│                         ▼                                                   │
│   ┌─────────────────────────────────────────────┐                          │
│   │          Platform Rule Generator             │                          │
│   │                                             │                          │
│   │  分析 CEL AST 中使用的字段，生成：           │                          │
│   │  • 需要订阅的事件类型                        │                          │
│   │  • 需要收集的上下文信息                      │                          │
│   │  • 平台特定的优化规则                        │                          │
│   └─────────────────────┬───────────────────────┘                          │
│                         │                                                   │
│         ┌───────────────┼───────────────┐                                   │
│         │               │               │                                   │
│         ▼               ▼               ▼                                   │
│   ┌───────────┐   ┌───────────┐   ┌───────────┐                            │
│   │ macOS     │   │ Windows   │   │ Linux     │                            │
│   │ Rule Pkg  │   │ Rule Pkg  │   │ Rule Pkg  │                            │
│   │           │   │           │   │           │                            │
│   │ • ES订阅  │   │ • ETW     │   │ • eBPF    │                            │
│   │   列表    │   │   Provider│   │   Program │                            │
│   │ • Mute    │   │ • Mini-   │   │ • LSM     │                            │
│   │   配置    │   │   filter  │   │   Hooks   │                            │
│   │ • CEL     │   │   Rules   │   │ • fanotify│                            │
│   │   Bytecode│   │ • CEL     │   │   Marks   │                            │
│   │           │   │   Bytecode│   │ • CEL     │                            │
│   │           │   │           │   │   Bytecode│                            │
│   └───────────┘   └───────────┘   └───────────┘                            │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### 4.3.2 智能订阅分析

```cpp
// CEL 表达式分析，自动推导需要订阅的事件类型
class SubscriptionAnalyzer {
public:
    struct AnalysisResult {
        // macOS EndpointSecurity 事件类型
        std::set<es_event_type_t> macos_events;
        
        // Windows ETW Provider + Minifilter IRP
        std::set<GUID> windows_etw_providers;
        std::set<IRP_MJ_TYPE> windows_minifilter_irps;
        
        // Linux eBPF/LSM hooks
        std::set<std::string> linux_lsm_hooks;
        std::set<std::string> linux_tracepoints;
        
        // 需要的上下文信息
        bool needs_process_tree;
        bool needs_code_signing;
        bool needs_network_context;
        bool needs_user_context;
    };
    
    AnalysisResult Analyze(const cel::Ast& ast) {
        AnalysisResult result;
        
        // 遍历 AST，分析访问的字段
        for (const auto& field : ExtractAccessedFields(ast)) {
            if (field.starts_with("subject.process.")) {
                // 进程相关字段
                if (field.contains("ancestors")) {
                    result.needs_process_tree = true;
                }
                if (field.contains("signing")) {
                    result.needs_code_signing = true;
                    // macOS 需要额外时间验证签名
                }
            }
            
            if (field.starts_with("operation")) {
                // 根据操作类型确定需要订阅的事件
                MapOperationToEvents(field, &result);
            }
            
            if (field.starts_with("object.file.")) {
                // 文件操作相关事件
                result.macos_events.insert(ES_EVENT_TYPE_AUTH_OPEN);
                result.macos_events.insert(ES_EVENT_TYPE_AUTH_CREATE);
                result.windows_minifilter_irps.insert(IRP_MJ_CREATE);
                result.linux_lsm_hooks.insert("file_open");
            }
        }
        
        return result;
    }
};
```

### 4.4 平台适配层详细设计

#### 4.4.1 macOS 适配器 (基于 Santa 架构扩展)

```cpp
// macOS Platform Adapter - 基于 Santa 的 EndpointSecurityAPI 抽象
class MacOSPlatformAdapter : public PlatformAdapter {
public:
    // Santa 风格的多客户端架构
    struct ClientConfig {
        std::string name;
        dispatch_qos_class_t qos;
        std::set<es_event_type_t> subscribed_events;
        MuteStrategy mute_strategy;
    };
    
    // 统一事件处理接口
    void HandleEvent(const SecurityEvent& unified_event) override {
        // 1. CEL 规则评估
        auto decision = rule_engine_->Evaluate(unified_event);
        
        // 2. 响应 ES 框架
        if (unified_event.requires_auth_response) {
            es_respond_auth_result(
                client_, 
                &original_message_,
                decision.action == Decision::ALLOW ? 
                    ES_AUTH_RESULT_ALLOW : ES_AUTH_RESULT_DENY,
                decision.cacheable
            );
        }
        
        // 3. 日志和遥测
        logger_->Log(unified_event, decision);
    }
    
private:
    // Santa 的核心组件复用
    std::shared_ptr<EndpointSecurityAPI> esapi_;
    std::shared_ptr<Enricher> enricher_;
    std::shared_ptr<AuthResultCache> auth_cache_;
    
    // 事件转换：es_message_t → SecurityEvent
    SecurityEvent ConvertToUnifiedEvent(const Message& es_msg) {
        SecurityEvent event;
        
        // 主体信息
        event.mutable_subject()->mutable_process()->set_pid(
            audit_token_to_pid(es_msg.process()->audit_token));
        
        // 签名信息 - macOS 特有字段映射到统一模型
        auto* signing = event.mutable_subject()->mutable_signing();
        signing->set_status(MapSigningStatus(es_msg.process()->codesigning_flags));
        signing->set_signer_id(GetSigningIdentifier(es_msg.process()));
        signing->set_team_id(GetTeamIdentifier(es_msg.process()));
        
        // ... 其他字段映射
        
        return event;
    }
};
```

#### 4.4.2 Windows 适配器

```cpp
// Windows Platform Adapter
class WindowsPlatformAdapter : public PlatformAdapter {
public:
    // ETW + Minifilter 双轨架构
    struct WindowsClientConfig {
        // ETW 配置
        std::vector<GUID> etw_providers;
        EVENT_TRACE_PROPERTIES trace_properties;
        
        // Minifilter 配置
        std::vector<IRP_MJ_TYPE> monitored_irps;
        PFLT_FILTER filter_handle;
    };
    
    void Initialize() override {
        // 1. 启动 ETW 会话
        StartEtwSession();
        
        // 2. 注册 Minifilter 驱动
        RegisterMinifilter();
        
        // 3. 初始化 Authenticode 验证器
        InitializeAuthenticodeVerifier();
    }
    
private:
    // Minifilter Pre-Operation 回调
    FLT_PREOP_CALLBACK_STATUS PreOperationCallback(
        PFLT_CALLBACK_DATA Data,
        PCFLT_RELATED_OBJECTS FltObjects,
        PVOID* CompletionContext
    ) {
        // 转换为统一事件
        SecurityEvent event = ConvertToUnifiedEvent(Data);
        
        // CEL 规则评估
        auto decision = rule_engine_->Evaluate(event);
        
        // Windows 特有：返回 Minifilter 决策
        if (decision.action == Decision::DENY) {
            Data->IoStatus.Status = STATUS_ACCESS_DENIED;
            return FLT_PREOP_COMPLETE;
        }
        
        return FLT_PREOP_SUCCESS_WITH_CALLBACK;
    }
    
    // 事件转换：Windows 原生 → SecurityEvent
    SecurityEvent ConvertToUnifiedEvent(PFLT_CALLBACK_DATA Data) {
        SecurityEvent event;
        
        // 获取进程信息
        PEPROCESS process = IoThreadToProcess(Data->Thread);
        HANDLE pid = PsGetProcessId(process);
        event.mutable_subject()->mutable_process()->set_pid((int64_t)pid);
        
        // Authenticode 签名验证
        auto* signing = event.mutable_subject()->mutable_signing();
        VerifyAuthenticode(process, signing);
        
        // 文件路径
        if (Data->Iopb->MajorFunction == IRP_MJ_CREATE) {
            PFLT_FILE_NAME_INFORMATION nameInfo;
            FltGetFileNameInformation(Data, FLT_FILE_NAME_NORMALIZED, &nameInfo);
            event.mutable_object()->mutable_file()->set_path(
                WideToUtf8(nameInfo->Name.Buffer));
        }
        
        return event;
    }
    
    // Authenticode 签名验证
    void VerifyAuthenticode(PEPROCESS process, SigningInfo* signing) {
        // 使用 WinVerifyTrust API
        WINTRUST_DATA wtd = {0};
        wtd.cbStruct = sizeof(WINTRUST_DATA);
        wtd.dwUIChoice = WTD_UI_NONE;
        wtd.fdwRevocationChecks = WTD_REVOKE_NONE;
        wtd.dwUnionChoice = WTD_CHOICE_FILE;
        
        LONG status = WinVerifyTrust(NULL, &WINTRUST_ACTION_GENERIC_VERIFY_V2, &wtd);
        
        signing->set_status(status == ERROR_SUCCESS ? 
            SigningStatus::SIGNED_VALID : SigningStatus::SIGNED_INVALID);
        
        // 提取证书信息映射到统一模型
        ExtractCertificateInfo(&wtd, signing);
    }
};
```

#### 4.4.3 Linux 适配器

```cpp
// Linux Platform Adapter - eBPF/LSM 架构
class LinuxPlatformAdapter : public PlatformAdapter {
public:
    void Initialize() override {
        // 1. 加载 eBPF 程序
        LoadBpfPrograms();
        
        // 2. 附加 LSM hooks
        AttachLsmHooks();
        
        // 3. 设置 Ring Buffer 接收事件
        SetupRingBuffer();
    }
    
private:
    // eBPF 程序定义 (使用 libbpf)
    static const char* BPF_PROGRAM = R"(
#include <linux/bpf.h>
#include <bpf/bpf_helpers.h>
#include <bpf/bpf_tracing.h>

// 统一事件结构
struct security_event {
    __u32 pid;
    __u32 uid;
    __u32 operation;
    char path[256];
    char comm[16];
    __u64 timestamp;
};

// Ring Buffer map
struct {
    __uint(type, BPF_MAP_TYPE_RINGBUF);
    __uint(max_entries, 256 * 1024);
} events SEC(".maps");

// LSM hook: file_open
SEC("lsm/file_open")
int BPF_PROG(file_open_hook, struct file *file) {
    struct security_event *e;
    
    e = bpf_ringbuf_reserve(&events, sizeof(*e), 0);
    if (!e) return 0;
    
    e->pid = bpf_get_current_pid_tgid() >> 32;
    e->uid = bpf_get_current_uid_gid() & 0xFFFFFFFF;
    e->operation = OP_FILE_OPEN;
    e->timestamp = bpf_ktime_get_ns();
    
    bpf_get_current_comm(&e->comm, sizeof(e->comm));
    bpf_d_path(&file->f_path, e->path, sizeof(e->path));
    
    bpf_ringbuf_submit(e, 0);
    
    // LSM hook 返回值: 0 = 允许, 负值 = 拒绝
    // 实际决策在用户空间完成后通过 BPF map 返回
    return check_policy(e);
}

// 策略检查 (BPF map lookup)
static __always_inline int check_policy(struct security_event *e) {
    struct policy_decision *decision;
    
    decision = bpf_map_lookup_elem(&policy_cache, &e->pid);
    if (decision && decision->action == DENY) {
        return -EACCES;
    }
    
    return 0;
}
    )";
    
    // 用户空间事件处理
    static int HandleRingBufferEvent(void* ctx, void* data, size_t size) {
        auto* adapter = static_cast<LinuxPlatformAdapter*>(ctx);
        auto* bpf_event = static_cast<bpf_security_event*>(data);
        
        // 转换为统一事件
        SecurityEvent event = adapter->ConvertToUnifiedEvent(bpf_event);
        
        // 丰富化：获取完整进程信息、签名验证等
        adapter->enricher_->Enrich(&event);
        
        // CEL 规则评估
        auto decision = adapter->rule_engine_->Evaluate(event);
        
        // 更新 BPF policy_cache map (用于内核态快速决策)
        adapter->UpdatePolicyCache(bpf_event->pid, decision);
        
        // 日志
        adapter->logger_->Log(event, decision);
        
        return 0;
    }
    
    // Linux 签名验证 (IMA/EVM)
    void VerifySignature(const std::string& path, SigningInfo* signing) {
        // 检查 IMA 扩展属性
        char xattr_value[1024];
        ssize_t len = getxattr(path.c_str(), "security.ima", xattr_value, sizeof(xattr_value));
        
        if (len > 0) {
            // 解析 IMA 签名
            ParseImaSignature(xattr_value, len, signing);
        } else {
            // 检查 ELF 签名 (如果有)
            CheckElfSignature(path, signing);
        }
    }
};
```

---

## 五、性能优化策略

### 5.1 多层缓存架构

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        跨平台统一缓存架构                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                     L1: 内核态缓存 (平台特定)                        │   │
│   │                                                                     │   │
│   │  macOS: ES Cache        Windows: Filter Cache   Linux: BPF Hash Map │   │
│   │  (es_respond_*_result   (FltCache* APIs)       (BPF_MAP_TYPE_HASH) │   │
│   │   with cache=true)                                                  │   │
│   │                                                                     │   │
│   │  特点: 纳秒级访问，内核态直接命中无需上下文切换                        │   │
│   │  命中率目标: >90% (针对重复执行的进程)                                │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                    │ miss                                   │
│                                    ▼                                        │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                     L2: 用户态进程缓存 (跨平台统一)                   │   │
│   │                                                                     │   │
│   │  ┌─────────────────────────────────────────────────────────────┐   │   │
│   │  │ AuthResultCache (基于 Santa 的 SantaCache 实现)              │   │   │
│   │  │                                                             │   │   │
│   │  │ Key: (file_hash, signing_info_hash, policy_version)         │   │   │
│   │  │ Value: (decision, expiry_time, cacheable_flag)              │   │   │
│   │  │                                                             │   │   │
│   │  │ 特点: 微秒级访问，LRU 淘汰，进程内共享                        │   │   │
│   │  │ 容量: 10,000 条目 (可配置)                                   │   │   │
│   │  └─────────────────────────────────────────────────────────────┘   │   │
│   │                                                                     │   │
│   │  ┌─────────────────────────────────────────────────────────────┐   │   │
│   │  │ SigningInfoCache (代码签名验证结果缓存)                      │   │   │
│   │  │                                                             │   │   │
│   │  │ Key: (file_inode, file_mtime)                               │   │   │
│   │  │ Value: (SigningInfo, verification_time)                     │   │   │
│   │  │                                                             │   │   │
│   │  │ 特点: 签名验证开销大 (100ms~1s)，必须缓存                    │   │   │
│   │  │ 失效策略: 文件修改时间变化时失效                             │   │   │
│   │  └─────────────────────────────────────────────────────────────┘   │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                    │ miss                                   │
│                                    ▼                                        │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                     L3: 分布式缓存 (可选)                            │   │
│   │                                                                     │   │
│   │  ┌─────────────────────────────────────────────────────────────┐   │   │
│   │  │ Redis / Memcached Cluster                                   │   │   │
│   │  │                                                             │   │   │
│   │  │ 用途:                                                       │   │   │
│   │  │ • 跨主机共享已知好/坏文件的决策                              │   │   │
│   │  │ • 签名验证结果共享 (同一组织内相同二进制)                    │   │   │
│   │  │ • 威胁情报缓存                                              │   │   │
│   │  │                                                             │   │   │
│   │  │ 特点: 毫秒级访问，网络开销，适用于非实时场景                  │   │   │
│   │  └─────────────────────────────────────────────────────────────┘   │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 CEL 表达式优化

```cpp
// CEL 编译优化器
class CelOptimizer {
public:
    OptimizedProgram Optimize(const cel::Program& program) {
        OptimizedProgram result;
        
        // 1. 提取静态条件 (不依赖运行时上下文)
        result.static_conditions = ExtractStaticConditions(program);
        
        // 2. 分析短路评估机会
        result.short_circuit_order = AnalyzeShortCircuit(program);
        
        // 3. 提取可缓存子表达式
        result.cacheable_subexprs = ExtractCacheableSubexpressions(program);
        
        // 4. 生成快速路径
        result.fast_path = GenerateFastPath(program);
        
        return result;
    }
    
private:
    // 示例: 提取可以在编译时评估的条件
    // 原始: process.signing.team_id in ['A', 'B'] && context.time.hour >= 9
    // 优化: 
    //   静态部分: team_id in ['A', 'B'] 可以预编译为 HashSet 查找
    //   动态部分: context.time.hour >= 9 必须运行时评估
    
    std::vector<StaticCondition> ExtractStaticConditions(const cel::Program& program) {
        std::vector<StaticCondition> result;
        
        for (const auto& node : program.ast().nodes()) {
            if (IsStaticCheckable(node)) {
                result.push_back(CreateStaticChecker(node));
            }
        }
        
        return result;
    }
    
    // 短路评估优化
    // 将最可能失败的条件放在前面，减少不必要的评估
    std::vector<int> AnalyzeShortCircuit(const cel::Program& program) {
        std::vector<std::pair<int, float>> node_costs;
        
        for (int i = 0; i < program.ast().nodes().size(); i++) {
            const auto& node = program.ast().nodes()[i];
            
            // 估算评估成本和失败概率
            float cost = EstimateEvaluationCost(node);
            float failure_prob = EstimateFailureProbability(node);
            
            // 优化目标: 最小化预期总评估成本
            // 失败概率高 + 成本低 的条件应该先评估
            float priority = failure_prob / (cost + 1);
            node_costs.push_back({i, priority});
        }
        
        // 按优先级排序
        std::sort(node_costs.begin(), node_costs.end(),
            [](const auto& a, const auto& b) { return a.second > b.second; });
        
        std::vector<int> order;
        for (const auto& [idx, _] : node_costs) {
            order.push_back(idx);
        }
        
        return order;
    }
};
```

### 5.3 平台特定性能优化

| 优化策略 | macOS | Windows | Linux | 效果 |
|----------|-------|---------|-------|------|
| **内核缓存** | ES Cache (es_respond with cache=true) | Minifilter Context Cache | BPF Hash Map | 90%+ 热路径命中 |
| **事件过滤** | Mute 反转模式 (macOS 13+) | Altitude-based filtering | BPF 程序内过滤 | 减少 95% 无关事件 |
| **异步处理** | dispatch_queue QoS | I/O Completion Ports | io_uring | 高并发不阻塞 |
| **签名缓存** | CDHash + mtime | Authenticode + PE hash | IMA digest | 避免重复验证 |
| **进程树** | 懒加载 + 增量更新 | ETW Process Events | eBPF task_struct | O(1) 祖先查询 |

---

## 六、用户体验设计

### 6.1 乔布斯式产品哲学

> **"设计不仅仅是外观和感觉，设计是它如何工作的。"** —— 史蒂夫·乔布斯

#### 6.1.1 零配置安全 (Zero-Config Security)

```yaml
# 默认安全策略 - 用户无需配置即可获得基线保护
default_policy:
  name: "Out-of-Box Protection"
  description: "开箱即用的安全保护，无需任何配置"
  
  rules:
    # 规则 1: 只允许有效签名的应用执行
    - name: "Signed Applications Only"
      enabled: true
      priority: 100
      subjects:
        - type: all_processes
      decision:
        condition: |
          subject.process.signing.status == SigningStatus.SIGNED_VALID
        action_on_match: allow
        action_on_mismatch: audit  # 默认审计而非阻止，避免影响用户
        user_override: true  # 允许用户临时放行
    
    # 规则 2: 保护系统关键目录
    - name: "System Directory Protection"
      enabled: true
      priority: 90
      objects:
        - type: file
          paths:
            - "/System/**"
            - "/usr/**"
            - "C:\\Windows\\**"
            - "/bin/**"
            - "/sbin/**"
      decision:
        condition: |
          operation in [OP_FILE_WRITE, OP_FILE_DELETE, OP_FILE_RENAME] &&
          !subject.process.signing.signer_id.startsWith('com.apple.') &&
          !subject.process.signing.signer_id.startsWith('Microsoft ')
        action_on_match: deny
        notification: "系统目录受保护，此操作已被阻止"
```

#### 6.1.2 渐进式披露 (Progressive Disclosure)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        渐进式用户界面设计                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ╔═══════════════════════════════════════════════════════════════════════╗  │
│  ║                     Level 1: 普通用户视图                              ║  │
│  ║                                                                       ║  │
│  ║  ┌─────────────────────────────────────────────────────────────────┐  ║  │
│  ║  │  🛡️ 安全状态: 受保护                                            │  ║  │
│  ║  │                                                                 │  ║  │
│  ║  │  今日拦截: 3 次可疑操作                                          │  ║  │
│  ║  │  上次更新: 5 分钟前                                              │  ║  │
│  ║  │                                                                 │  ║  │
│  ║  │  [查看详情]                                                      │  ║  │
│  ║  └─────────────────────────────────────────────────────────────────┘  ║  │
│  ╚═══════════════════════════════════════════════════════════════════════╝  │
│                                    │                                        │
│                                    ▼ 点击"查看详情"                          │
│  ╔═══════════════════════════════════════════════════════════════════════╗  │
│  ║                     Level 2: 高级用户视图                              ║  │
│  ║                                                                       ║  │
│  ║  ┌─────────────────────────────────────────────────────────────────┐  ║  │
│  ║  │  最近事件:                                                       │  ║  │
│  ║  │                                                                 │  ║  │
│  ║  │  ⚠️ 14:32 - suspicious.app 尝试访问 ~/Documents/Confidential    │  ║  │
│  ║  │     [允许一次] [始终允许] [始终拒绝]                             │  ║  │
│  ║  │                                                                 │  ║  │
│  ║  │  ✅ 14:28 - Safari 正常访问网络                                  │  ║  │
│  ║  │  ✅ 14:25 - Finder 正常文件操作                                  │  ║  │
│  ║  │                                                                 │  ║  │
│  ║  │  [导出日志] [配置规则]                                           │  ║  │
│  ║  └─────────────────────────────────────────────────────────────────┘  ║  │
│  ╚═══════════════════════════════════════════════════════════════════════╝  │
│                                    │                                        │
│                                    ▼ 点击"配置规则"                          │
│  ╔═══════════════════════════════════════════════════════════════════════╗  │
│  ║                     Level 3: 专家用户视图                              ║  │
│  ║                                                                       ║  │
│  ║  ┌─────────────────────────────────────────────────────────────────┐  ║  │
│  ║  │  策略编辑器 (CEL Expression)                                     │  ║  │
│  ║  │                                                                 │  ║  │
│  ║  │  ```cel                                                         │  ║  │
│  ║  │  // 自定义规则: 允许特定应用访问敏感目录                          │  ║  │
│  ║  │  subject.process.signing.team_id == 'MYTEAMID' &&               │  ║  │
│  ║  │  object.file.path.startsWith('/Users/me/Confidential/')         │  ║  │
│  ║  │  ```                                                            │  ║  │
│  ║  │                                                                 │  ║  │
│  ║  │  [语法检查] [模拟测试] [部署规则]                                 │  ║  │
│  ║  └─────────────────────────────────────────────────────────────────┘  ║  │
│  ╚═══════════════════════════════════════════════════════════════════════╝  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 6.2 跨平台一致性体验

| 体验维度 | macOS | Windows | Linux | 统一目标 |
|----------|-------|---------|-------|----------|
| **通知样式** | NSUserNotificationCenter | Toast Notification | D-Bus Notification | 统一的视觉语言 |
| **系统托盘** | Menu Bar Item | System Tray Icon | Status Notifier | 一致的图标和菜单 |
| **配置界面** | Native SwiftUI | Native WPF | GTK/Qt | 遵循各平台设计规范 |
| **命令行** | `santactl` | `santactl.exe` | `santactl` | 完全相同的命令语法 |
| **日志格式** | JSON/Protobuf | JSON/Protobuf | JSON/Protobuf | 统一的日志 Schema |

---

## 七、同步与管理架构

### 7.1 统一管理平面

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        统一管理平面架构                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                     Control Plane (云端)                             │   │
│   │                                                                     │   │
│   │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │   │
│   │  │ Policy      │  │ Event       │  │ Threat      │  │ Dashboard   │ │   │
│   │  │ Management  │  │ Aggregation │  │ Intelligence│  │ & Reporting │ │   │
│   │  │ Service     │  │ Service     │  │ Service     │  │ Service     │ │   │
│   │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘ │   │
│   │         │                │                │                │        │   │
│   │         └────────────────┴────────────────┴────────────────┘        │   │
│   │                                    │                                 │   │
│   │                              gRPC/Protobuf                           │   │
│   │                                    │                                 │   │
│   └────────────────────────────────────┼────────────────────────────────┘   │
│                                        │                                    │
│            ┌───────────────────────────┬─────────────────────────────┐    │
│            │                           │                             │    │
│            ▼                           ▼                             ▼    │
│   ┌─────────────────┐         ┌─────────────────┐         ┌─────────────────┐│
│   │  macOS Agent    │         │  Windows Agent  │         │  Linux Agent    ││
│   │                 │         │                 │         │                 ││
│   │ ┌─────────────┐ │         │ ┌─────────────┐ │         │ ┌─────────────┐ ││
│   │ │ Sync Client │ │         │ │ Sync Client │ │         │ │ Sync Client │ ││
│   │ └─────────────┘ │         │ └─────────────┘ │         │ └─────────────┘ ││
│   │ ┌─────────────┐ │         │ ┌─────────────┐ │         │ ┌─────────────┐ ││
│   │ │ Rule Engine │ │         │ │ Rule Engine │ │         │ │ Rule Engine │ ││
│   │ └─────────────┘ │         │ └─────────────┘ │         │ └─────────────┘ ││
│   │ ┌─────────────┐ │         │ ┌─────────────┐ │         │ ┌─────────────┐ ││
│   │ │ Event       │ │         │ │ Event       │ │         │ │ Event       │ ││
│   │ │ Collector   │ │         │ │ Collector   │ │         │ │ Collector   │ ││
│   │ └─────────────┘ │         │ └─────────────┘ │         │ └─────────────┘ ││
│   └─────────────────┘         └─────────────────┘         └─────────────────┘│
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 7.2 同步协议设计

```protobuf
// sync_protocol.proto
// 基于 Santa 同步协议的跨平台扩展

service SyncService {
    // 预检 - 获取同步配置
    rpc Preflight(PreflightRequest) returns (PreflightResponse);
    
    // 规则下载 - 增量同步
    rpc DownloadRules(RuleDownloadRequest) returns (stream RuleBundle);
    
    // 事件上报 - 流式上传
    rpc UploadEvents(stream SecurityEvent) returns (UploadResponse);
    
    // 推送通知 - 服务端推送
    rpc Subscribe(SubscribeRequest) returns (stream PushNotification);
}

message PreflightRequest {
    string machine_id = 1;
    string serial_number = 2;
    string hostname = 3;
    
    // 平台标识
    Platform platform = 4;
    string os_version = 5;
    string agent_version = 6;
    
    // 当前规则状态
    string rule_sync_cursor = 7;
    int64 rule_count = 8;
}

message PreflightResponse {
    // 同步配置
    bool enable_bundles = 1;
    bool enable_transitive_rules = 2;
    int32 batch_size = 3;
    
    // 客户端模式
    ClientMode client_mode = 4;
    
    // 推送通知配置
    PushNotificationConfig push_config = 5;
    
    // 下一次完整同步时间
    google.protobuf.Timestamp next_full_sync = 6;
}

enum Platform {
    PLATFORM_UNKNOWN = 0;
    PLATFORM_MACOS = 1;
    PLATFORM_WINDOWS = 2;
    PLATFORM_LINUX = 3;
}

message RuleBundle {
    // 规则列表
    repeated UnifiedRule rules = 1;
    
    // 游标 (用于增量同步)
    string cursor = 2;
    
    // 是否还有更多规则
    bool has_more = 3;
}

message UnifiedRule {
    string id = 1;
    string name = 2;
    int32 priority = 3;
    
    // CEL 表达式 (跨平台统一)
    string cel_expression = 4;
    
    // 编译后的平台特定规则 (可选，用于优化)
    oneof compiled_rule {
        MacOSCompiledRule macos_rule = 10;
        WindowsCompiledRule windows_rule = 11;
        LinuxCompiledRule linux_rule = 12;
    }
    
    // 决策配置
    Decision default_decision = 5;
    
    // 元数据
    google.protobuf.Timestamp created_at = 6;
    google.protobuf.Timestamp updated_at = 7;
}
```

---

## 八、安全性设计

### 8.1 自保护机制

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        跨平台自保护 (Tamper Resistance)                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     Layer 1: 进程保护                                │   │
│  │                                                                     │   │
│  │  macOS:                                                             │   │
│  │  • System Extension 由 SIP 保护                                      │   │
│  │  • ES 客户端监控 AUTH_SIGNAL 防止被 kill                             │   │
│  │  • launchd KeepAlive 确保重启                                       │   │
│  │                                                                     │   │
│  │  Windows:                                                           │   │
│  │  • Protected Process Light (PPL) 保护                                │   │
│  │  • Minifilter 自我保护回调                                           │   │
│  │  • Service Control Manager 重启策略                                  │   │
│  │                                                                     │   │
│  │  Linux:                                                             │   │
│  │  • eBPF 程序固定 (pinning)                                          │   │
│  │  • LSM hook 保护                                                    │   │
│  │  • systemd 重启策略                                                 │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     Layer 2: 文件保护                                │   │
│  │                                                                     │   │
│  │  监控并阻止对以下路径的修改:                                          │   │
│  │  • 代理程序安装目录                                                  │   │
│  │  • 配置文件目录                                                      │   │
│  │  • 规则数据库                                                        │   │
│  │  • 日志目录                                                          │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     Layer 3: 通信保护                                │   │
│  │                                                                     │   │
│  │  • mTLS 双向证书认证                                                 │   │
│  │  • 证书固定 (Certificate Pinning)                                    │   │
│  │  • 代码签名验证 (XPC/COM/D-Bus 端点)                                  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 8.2 安全边界设计

| 安全边界 | 实现方式 | 威胁防护 |
|----------|----------|----------|
| **代理 ↔ 管理平面** | mTLS + 证书固定 + Protobuf | 中间人攻击、伪造服务器 |
| **内核 ↔ 用户态** | 签名验证 + Entitlement | 恶意注入、权限提升 |
| **规则存储** | 加密存储 + 完整性校验 | 规则篡改、绕过检测 |
| **日志通道** | 签名日志 + 防篡改存储 | 日志伪造、审计逃避 |

---

## 九、部署与运维

### 9.1 渐进式部署策略

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        渐进式部署流程                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Phase 1: 监控模式 (2周)                                                    │
│  ├── 目标: 收集基线数据，零阻断                                              │
│  ├── 策略: 所有规则设为 audit 模式                                          │
│  ├── 输出: 正常行为基线、误报分析、规则调优                                  │
│  └── 风险: 无                                                               │
│                                                                             │
│  Phase 2: 告警模式 (2周)                                                    │
│  ├── 目标: 验证规则准确性，用户教育                                          │
│  ├── 策略: 高置信度规则启用通知，不阻断                                      │
│  ├── 输出: 用户反馈、规则微调、处理流程验证                                  │
│  └── 风险: 低                                                               │
│                                                                             │
│  Phase 3: 软阻断模式 (2周)                                                  │
│  ├── 目标: 验证阻断逻辑，用户可覆盖                                          │
│  ├── 策略: 阻断 + 用户可临时放行 (需要理由)                                  │
│  ├── 输出: 误报修正、覆盖审计、业务影响评估                                  │
│  └── 风险: 中低                                                             │
│                                                                             │
│  Phase 4: 强制模式 (持续)                                                   │
│  ├── 目标: 完全保护                                                         │
│  ├── 策略: 阻断无覆盖，特殊场景走审批                                        │
│  ├── 输出: 安全事件响应、持续规则优化                                        │
│  └── 风险: 受控                                                             │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 9.2 可观测性设计

```yaml
# 统一监控指标 (Prometheus 格式)
metrics:
  # 性能指标
  - name: santa_event_processing_duration_seconds
    type: histogram
    labels: [platform, event_type, decision]
    buckets: [0.0001, 0.0005, 0.001, 0.005, 0.01, 0.05, 0.1]
    
  - name: santa_cache_hit_ratio
    type: gauge
    labels: [platform, cache_level]
    
  - name: santa_events_total
    type: counter
    labels: [platform, event_type, decision]
  
  # 健康指标  
  - name: santa_agent_up
    type: gauge
    labels: [platform, version]
    
  - name: santa_last_sync_timestamp
    type: gauge
    labels: [platform, sync_type]
    
  - name: santa_rule_count
    type: gauge
    labels: [platform, rule_type]
  
  # 安全指标
  - name: santa_policy_violations_total
    type: counter
    labels: [platform, rule_name, severity]
    
  - name: santa_tamper_attempts_total
    type: counter
    labels: [platform, attempt_type]
```

---

## 十、技术挑战与解决方案

### 10.1 核心挑战矩阵

| 挑战 | 复杂度 | 解决方案 | 风险 |
|------|--------|----------|------|
| **代码签名语义统一** | ⭐⭐⭐⭐⭐ | 抽象 SigningInfo 模型 + 平台适配器 | 语义损失 |
| **事件类型映射** | ⭐⭐⭐⭐ | OCSF 标准 + 扩展字段 | 覆盖不完整 |
| **性能一致性** | ⭐⭐⭐⭐ | 分层缓存 + 平台特定优化 | 平台差异大 |
| **内核接口演进** | ⭐⭐⭐⭐⭐ | 抽象层隔离 + 版本适配 | 维护成本高 |
| **部署复杂性** | ⭐⭐⭐ | 统一打包 + 自动化部署 | 环境多样性 |

### 10.2 马斯克式技术挑战

> **"如果现有的方法不够好，就从第一性原理重新设计"** —— 埃隆·马斯克

#### 挑战 1: 代码签名语义鸿沟

**问题**: macOS CDHash ≠ Windows Authenticode ≠ Linux IMA

**传统方案**: 各平台独立处理，策略不可移植

**第一性原理方案**:
```
代码签名的本质是什么？
→ 证明代码来源的可信性
→ 证明代码未被篡改

统一模型:
┌─────────────────────────────────────────────────────────────────┐
│  SigningInfo (跨平台统一抽象)                                    │
│                                                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │ 身份证明    │  │ 完整性证明  │  │ 信任链证明  │              │
│  │             │  │             │  │             │              │
│  │ signer_id   │  │ code_hash   │  │ cert_chain  │              │
│  │ team_id     │  │ (统一为     │  │ (统一为     │              │
│  │ (统一为     │  │  SHA-256)   │  │  X.509链)   │              │
│  │  组织标识)  │  │             │  │             │              │
│  └─────────────┘  └─────────────┘  └─────────────┘              │
│                                                                 │
│  平台适配:                                                      │
│  • macOS: Signing ID → signer_id, CDHash → code_hash            │
│  • Windows: Subject CN → signer_id, Authenticode Hash → code_hash│
│  • Linux: IMA signature → code_hash, RPM/DEB signer → signer_id │
└─────────────────────────────────────────────────────────────────┘
```

#### 挑战 2: 性能 vs 安全 权衡

**问题**: 全量签名验证导致性能不可接受

**传统方案**: 牺牲验证深度换取性能

**第一性原理方案**:
```
验证的本质是什么？
→ 确保当前执行的代码与预期一致
→ 预期 = 之前验证过且未变化的

优化模型:
┌─────────────────────────────────────────────────────────────────┐
│  分层验证策略                                                    │
│                                                                 │
│  Level 0: 内核缓存 (file_id + mtime)                            │
│  └── 命中 → 直接返回之前的决策 (ns 级)                           │
│                                                                 │
│  Level 1: 快速哈希验证 (内存映射文件头)                          │
│  └── 与缓存的 code_hash 比对 (μs 级)                             │
│                                                                 │
│  Level 2: 完整签名验证 (首次执行或哈希变化)                       │
│  └── 完整证书链验证 (ms~s 级)                                    │
│      └── 结果写入缓存，下次跳过                                   │
│                                                                 │
│  关键洞察:                                                       │
│  • 99% 的执行是重复执行相同二进制                                │
│  • 只有 1% 需要完整验证                                          │
│  • 分层策略将平均延迟降低 1000x                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 十一、实施路线图

### 11.1 三阶段实施计划

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        实施路线图 (18个月)                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Phase 1: 基础架构 (M1-M6)                                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ M1-M2: 统一数据模型定义                                              │   │
│  │ • Protobuf schema 设计与评审                                         │   │
│  │ • OCSF 兼容性验证                                                    │   │
│  │ • CEL 规则语法设计                                                   │   │
│  │                                                                     │   │
│  │ M3-M4: 核心引擎开发                                                  │   │
│  │ • CEL 编译器集成 (Go/C++)                                            │   │
│  │ • 规则编译与分发服务                                                 │   │
│  │ • 统一缓存框架                                                       │   │
│  │                                                                     │   │
│  │ M5-M6: macOS 适配器 (基于 Santa 扩展)                                │   │
│  │ • EndpointSecurityAPI 抽象                                          │   │
│  │ • CEL 规则引擎集成                                                   │   │
│  │ • 现有 Santa 功能迁移                                                │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Phase 2: 跨平台扩展 (M7-M12)                                               │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ M7-M9: Windows 适配器开发                                            │   │
│  │ • ETW Provider 集成                                                  │   │
│  │ • Minifilter 驱动开发                                                │   │
│  │ • Authenticode 验证集成                                              │   │
│  │                                                                     │   │
│  │ M10-M12: Linux 适配器开发                                            │   │
│  │ • eBPF 程序开发                                                      │   │
│  │ • LSM hook 集成                                                      │   │
│  │ • IMA/EVM 签名验证                                                   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Phase 3: 生产就绪 (M13-M18)                                                │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ M13-M15: 管理平面开发                                                │   │
│  │ • 策略管理控制台                                                     │   │
│  │ • 事件聚合与分析                                                     │   │
│  │ • 可观测性集成                                                       │   │
│  │                                                                     │   │
│  │ M16-M18: 生产化与优化                                                │   │
│  │ • 性能调优与压测                                                     │   │
│  │ • 安全审计与渗透测试                                                 │   │
│  │ • 文档与培训                                                         │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 11.2 里程碑定义

| 里程碑 | 时间 | 交付物 | 验收标准 |
|--------|------|--------|----------|
| **M1** | M2 | 统一数据模型 v1.0 | Schema 评审通过 |
| **M2** | M4 | CEL 规则引擎 | 1000+ 规则/秒评估性能 |
| **M3** | M6 | macOS Agent v1.0 | Santa 功能 100% 兼容 |
| **M4** | M9 | Windows Agent v1.0 | 核心功能 Beta 发布 |
| **M5** | M12 | Linux Agent v1.0 | 核心功能 Beta 发布 |
| **M6** | M15 | 管理平面 v1.0 | 三平台统一管理 |
| **M7** | M18 | 产品 GA | 生产环境部署 |

---

## 十二、结论与建议

### 12.1 核心结论

1. **跨平台统一是可行的，但需要正确的抽象层次**
   - 不要试图统一内核接口（不可能）
   - 在策略语义层实现统一（可行且高价值）

2. **CEL 是策略表达的最佳选择**
   - 安全、高性能、跨语言
   - 已被 Kubernetes、Firebase 等验证

3. **Santa 的架构是优秀的起点**
   - 三层架构模式可直接复用
   - 多客户端设计适用于所有平台

4. **性能优化是关键差异化因素**
   - 分层缓存策略必不可少
   - 99% 事件应在内核态命中缓存

### 12.2 战略建议

| 维度 | 建议 | 优先级 |
|------|------|--------|
| **技术选型** | 采用 CEL + Protobuf + gRPC 技术栈 | P0 |
| **架构设计** | 四层抽象，策略与平台解耦 | P0 |
| **产品策略** | 先 macOS (复用 Santa)，再 Windows，最后 Linux | P0 |
| **开源策略** | 核心引擎开源，管理平面商业化 | P1 |
| **生态建设** | 与 OCSF 社区合作，贡献标准扩展 | P1 |

### 12.3 风险与缓解

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| 平台 API 变更 | 高 | 高 | 抽象层隔离 + 版本兼容测试 |
| 性能达标困难 | 中 | 高 | 早期性能原型 + 持续基准测试 |
| 签名语义损失 | 中 | 中 | 保留平台特定扩展字段 |
| 部署复杂性 | 中 | 中 | 自动化部署工具 + 渐进式策略 |

---

## 附录 A: 参考资料

### A.1 开源项目

| 项目 | 描述 | 参考价值 |
|------|------|----------|
| [Santa](https://github.com/northpolesec/santa) | macOS 二进制授权系统 | 架构设计、ES 集成 |
| [osquery](https://github.com/osquery/osquery) | 跨平台端点可见性 | 统一 Schema 设计 |
| [Falco](https://github.com/falcosecurity/falco) | Linux 运行时安全 | eBPF/LSM 集成 |
| [cel-go](https://github.com/google/cel-go) | CEL Go 实现 | 规则引擎 |
| [OCSF](https://github.com/ocsf) | 开放安全事件 Schema | 数据模型 |

### A.2 技术文档

- [Apple EndpointSecurity Framework](https://developer.apple.com/documentation/endpointsecurity)
- [Windows Minifilter Development](https://docs.microsoft.com/en-us/windows-hardware/drivers/ifs/)
- [Linux BPF LSM](https://docs.kernel.org/bpf/prog_lsm.html)
- [CEL Language Definition](https://github.com/google/cel-spec)

### A.3 行业报告

- CrowdStrike Falcon 架构分析
- SentinelOne Singularity 跨平台设计
- Microsoft Defender for Endpoint 统一管理

---

## 附录 B: 术语表

| 术语 | 全称 | 说明 |
|------|------|------|
| **ES** | EndpointSecurity | macOS 端点安全框架 |
| **ETW** | Event Tracing for Windows | Windows 事件跟踪 |
| **eBPF** | extended Berkeley Packet Filter | Linux 内核可编程框架 |
| **LSM** | Linux Security Modules | Linux 安全模块框架 |
| **CEL** | Common Expression Language | 通用表达式语言 |
| **OCSF** | Open Cybersecurity Schema Framework | 开放网络安全 Schema 框架 |
| **UPDL** | Unified Policy Definition Language | 统一策略定义语言 |
| **CDHash** | Code Directory Hash | macOS 代码目录哈希 |
| **IMA** | Integrity Measurement Architecture | Linux 完整性度量架构 |

---

*报告完成日期：2026-01-13*  
*基于 Santa 项目源码分析 + 业界调研*