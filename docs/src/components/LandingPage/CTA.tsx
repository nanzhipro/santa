import Link from "@docusaurus/Link";
import { Button } from "@site/src/components/shadcn/button";
import { ArrowRight, Download } from "lucide-react";

export default function CTA() {
  return (
    <section className="py-20 md:py-28 bg-gradient-to-b from-primary/5 to-primary/10 border-t border-border">
      <div className="mx-auto max-w-3xl px-6 text-center">
        <h2 className="text-3xl md:text-4xl font-bold text-bright mb-4">
          准备好保护您的 macOS 设备了吗？
        </h2>
        <p className="text-lg text-muted-foreground mb-10 leading-relaxed">
          立即开始使用 Santa，为您的企业构建强大的端点安全防护体系
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Button asChild size="lg" className="text-base px-8 h-12">
            <Link to="/intro">
              查看文档
              <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
          <Button
            asChild
            variant="outline"
            size="lg"
            className="text-base px-8 h-12"
          >
            <Link to="https://github.com/northpolesec/santa/releases">
              <Download className="mr-1 h-4 w-4" />
              下载最新版本
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
