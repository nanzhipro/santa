import Layout from "@theme/Layout";
import Hero from "@site/src/components/LandingPage/Hero";
import Features from "@site/src/components/LandingPage/Features";
import HowItWorks from "@site/src/components/LandingPage/HowItWorks";
import Screenshots from "@site/src/components/LandingPage/Screenshots";
import WhySanta from "@site/src/components/LandingPage/WhySanta";
import CTA from "@site/src/components/LandingPage/CTA";

export default function Home() {
  return (
    <Layout
      title="Santa - macOS 企业级终端安全授权系统"
      description="Santa 是开源的 macOS 二进制与文件访问授权系统，为企业提供强大的端点安全防护能力。支持多模式授权、CEL 规则引擎、远程集中管理。"
    >
      <main>
        <Hero />
        <Features />
        <HowItWorks />
        <Screenshots />
        <WhySanta />
        <CTA />
      </main>
    </Layout>
  );
}
