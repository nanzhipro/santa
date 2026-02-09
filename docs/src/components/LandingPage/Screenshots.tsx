const screenshots = [
  {
    lightSrc: "/img/binary-auth-dialog_light.png#light",
    darkSrc: "/img/binary-auth-dialog_dark.png#dark",
    alt: "二进制授权阻止对话框",
    caption: "当程序执行被阻止时，向用户展示清晰的阻止原因和操作指引",
  },
  {
    lightSrc: "/img/faa-dialog_light.png#light",
    darkSrc: "/img/faa-dialog_dark.png#dark",
    alt: "文件访问授权对话框",
    caption: "文件访问授权功能实时监控敏感文件的访问并通知用户",
  },
  {
    lightSrc: "/img/usb-dialog_light.png#light",
    darkSrc: "/img/usb-dialog_dark.png#dark",
    alt: "USB 设备阻止对话框",
    caption: "灵活管控 USB 和 SD 卡等外部存储设备的接入和使用",
  },
];

export default function Screenshots() {
  return (
    <section className="py-20 md:py-28 bg-background">
      <div className="mx-auto max-w-6xl px-6">
        <h2 className="text-3xl md:text-4xl font-bold text-center text-bright mb-4">
          产品界面
        </h2>
        <p className="text-center text-muted-foreground mb-14 max-w-2xl mx-auto">
          简洁直观的用户界面，让安全策略的执行清晰可见
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {screenshots.map((item) => (
            <div key={item.alt} className="flex flex-col gap-4">
              <div className="rounded-lg overflow-hidden shadow-lg border border-border bg-card">
                <img
                  src={item.lightSrc}
                  alt={item.alt}
                  className="w-full h-auto"
                  loading="lazy"
                />
                <img
                  src={item.darkSrc}
                  alt={item.alt}
                  className="w-full h-auto"
                  loading="lazy"
                />
              </div>
              <p className="text-sm text-muted-foreground text-center">
                {item.caption}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
