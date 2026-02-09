import { Shield, FileCheck, Usb, Code2 } from "lucide-react";

const features = [
  {
    icon: Shield,
    title: "二进制授权",
    description:
      "支持监控、锁定和独立三种模式，基于哈希、证书和签名 ID 精确控制 macOS 上可执行的程序。",
  },
  {
    icon: FileCheck,
    title: "文件访问授权",
    description:
      "实时监控和控制进程对敏感文件的读写操作，支持审计模式和阻止模式，有效防止数据泄露。",
  },
  {
    icon: Usb,
    title: "外部设备管控",
    description:
      "阻止或限制 USB、SD 卡等移动存储设备的使用，支持只读挂载和启动时自动卸载策略。",
  },
  {
    icon: Code2,
    title: "灵活策略引擎",
    description:
      "使用通用表达式语言 (CEL) 编写复杂策略规则，结合代码签名验证实现精细化的安全管控。",
  },
];

export default function Features() {
  return (
    <section className="py-20 md:py-28 bg-background">
      <div className="mx-auto max-w-6xl px-6">
        <h2 className="text-3xl md:text-4xl font-bold text-center text-bright mb-4">
          核心功能
        </h2>
        <p className="text-center text-muted-foreground mb-14 max-w-2xl mx-auto">
          Santa 提供多层次的 macOS 端点安全防护，覆盖程序执行、文件访问和外设管理
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="p-6 bg-card rounded-lg border border-border hover:shadow-md transition-shadow"
            >
              <feature.icon className="h-10 w-10 text-primary mb-4" />
              <h3 className="text-lg font-semibold text-bright mb-2">
                {feature.title}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
