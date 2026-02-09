import Link from "@docusaurus/Link";
import { Button } from "@site/src/components/shadcn/button";
import { ArrowRight, Github } from "lucide-react";

export default function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-border">
      <div className="absolute inset-0 bg-gradient-to-b from-background to-accent/30" />
      <div className="relative mx-auto max-w-5xl px-6 py-24 md:py-36 flex flex-col items-center text-center">
        <img
          src="/img/santa-black.svg#light"
          alt="Santa"
          className="h-16 md:h-20 w-auto mb-10"
        />
        <img
          src="/img/santa-white.svg#dark"
          alt="Santa"
          className="h-16 md:h-20 w-auto mb-10"
        />
        <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-bright tracking-tight mb-6">
          macOS 企业级终端安全授权系统
        </h1>
        <p className="text-lg md:text-xl text-muted-foreground max-w-3xl mb-10 leading-relaxed">
          开源的二进制与文件访问授权解决方案，为企业安全团队提供强大的 macOS
          端点防护能力。精确控制程序执行、文件访问和外部设备使用。
        </p>
        <div className="flex flex-col sm:flex-row gap-4">
          <Button asChild size="lg" className="text-base px-8 h-12">
            <Link to="/intro">
              开始使用
              <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
          <Button
            asChild
            variant="outline"
            size="lg"
            className="text-base px-8 h-12"
          >
            <Link to="https://github.com/northpolesec/santa">
              <Github className="mr-1 h-4 w-4" />
              GitHub
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
