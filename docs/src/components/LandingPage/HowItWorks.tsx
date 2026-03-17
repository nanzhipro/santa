const steps = [
  {
    number: "01",
    title: "内核级事件监控",
    description:
      "Santa 系统扩展通过 macOS Endpoint Security 框架，在内核级别实时捕获二进制执行、文件访问和设备挂载等安全事件。",
  },
  {
    number: "02",
    title: "策略引擎评估",
    description:
      "规则引擎按优先级评估 CDHash、SHA-256、签名证书、团队 ID 及 CEL 表达式等多维度规则，做出允许或阻止决策。",
  },
  {
    number: "03",
    title: "用户实时通知",
    description:
      "当程序或文件访问被阻止时，GUI 代理向用户展示清晰的通知对话框，说明阻止原因并提供后续操作指引。",
  },
  {
    number: "04",
    title: "远程集中管理",
    description:
      "后台同步服务定期与远程服务器通信，自动同步安全策略、下载规则更新并上传事件日志，实现大规模集中管控。",
  },
];

export default function HowItWorks() {
  return (
    <section className="py-20 md:py-28 bg-accent/20">
      <div className="mx-auto max-w-6xl px-6">
        <h2 className="text-3xl md:text-4xl font-bold text-center text-bright mb-4">
          工作原理
        </h2>
        <p className="text-center text-muted-foreground mb-14 max-w-2xl mx-auto">
          从事件捕获到策略执行，Santa 构建了完整的端点安全防护链
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div className="space-y-8">
            {steps.map((step) => (
              <div key={step.number} className="flex gap-5">
                <div className="flex-shrink-0 w-12 h-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm">
                  {step.number}
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-bright mb-1">
                    {step.title}
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {step.description}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-center">
            <img
              src="/img/santa-block.gif"
              alt="Santa 阻止恶意程序执行演示"
              className="rounded-lg shadow-lg border border-border max-w-full h-auto"
              loading="lazy"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
