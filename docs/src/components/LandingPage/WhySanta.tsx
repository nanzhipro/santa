import {
  GitBranch,
  Award,
  Zap,
  Settings,
  Server,
  BarChart3,
} from "lucide-react";

const advantages = [
  {
    icon: GitBranch,
    title: "开源透明",
    description:
      "Apache 2.0 许可证，源码完全公开。活跃的社区驱动开发，代码经过持续的安全审计和改进。",
  },
  {
    icon: Award,
    title: "久经验证",
    description:
      "被全球众多企业和组织广泛使用，在真实的生产环境中保护大量 macOS 设备的安全。",
  },
  {
    icon: Zap,
    title: "高性能",
    description:
      "系统扩展级监控结合智能缓存机制，对日常使用几乎零感知，不影响用户工作效率。",
  },
  {
    icon: Settings,
    title: "灵活部署",
    description:
      "支持 Monitor、Lockdown、Standalone 多种运行模式，完整兼容 MDM 配置文件部署。",
  },
  {
    icon: Server,
    title: "集中管理",
    description:
      "通过 Sync 服务器实现策略集中管理和快速分发，支持 Workshop、Moroz、Rudolph 等多种服务端。",
  },
  {
    icon: BarChart3,
    title: "全面审计",
    description:
      "丰富的遥测事件记录，覆盖程序执行、文件访问、设备挂载等关键操作，支持多种日志输出格式。",
  },
];

export default function WhySanta() {
  return (
    <section className="py-20 md:py-28 bg-accent/20">
      <div className="mx-auto max-w-6xl px-6">
        <h2 className="text-3xl md:text-4xl font-bold text-center text-bright mb-4">
          为什么选择 Santa
        </h2>
        <p className="text-center text-muted-foreground mb-14 max-w-2xl mx-auto">
          专为企业安全团队打造，兼顾安全性、性能和易用性
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {advantages.map((item) => (
            <div
              key={item.title}
              className="flex gap-4 p-5 bg-card rounded-lg border border-border hover:shadow-md transition-shadow"
            >
              <item.icon className="h-8 w-8 text-primary flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="text-base font-semibold text-bright mb-1">
                  {item.title}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {item.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
