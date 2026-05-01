# YouTube 播客内容提取与可视化 — 黄金圈结构

> 基于 Simon Sinek 的黄金圈法则（Golden Circle）+ 实战经验优化

---

## 🎯 WHY — 为什么做这件事

### 核心目的

**让播客知识高效沉淀，从"听过"变成"学到"。**

### 解决的痛点

- 播客内容转瞬即逝，难以回顾和检索
- 英文播客存在语言障碍
- 长内容缺乏结构化，核心观点被淹没
- 知识难以分享和传播

### 价值主张

| 维度 | 价值                     |
| ---- | ------------------------ |
| 效率 | 一键自动化，零人工干预   |
| 深度 | 金字塔原理提炼核心洞见   |
| 传播 | 可视化输出，适合社交分享 |
| 沉淀 | 结构化文档，便于回顾检索 |

---

## 🔧 HOW — 如何实现

### 设计原则

1. **全自动执行** — 无需用户确认或交互
2. **小步迭代** — 每完成一步验证结果再继续
3. **错误自愈** — 遇错自动分析并尝试替代方案
4. **质量优先** — 宁可多尝试，不交付低质量结果
5. **交付物优先** — 最终仅交付目标文件；回复中不输出任何程序代码、脚本、命令、伪代码或日志
6. **进度可见** — 每个阶段开始和完成时输出明显的状态标识

### 进度状态标识规范

每个阶段执行时，输出以下格式的状态提示：

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📍 阶段 N/6：[阶段名称]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

阶段完成时：
```
✅ 阶段 N 完成：[简要说明产出]
```

阶段失败时：
```
❌ 阶段 N 失败：[错误原因]
🔄 正在尝试备选方案...
```

**完整进度示例：**
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📍 阶段 0/6：前置检查
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  yt-dlp: ✓
  ffmpeg: ✓
  python3: ✓
  Playwright: ✓
  ImageMagick: ✓
✅ 阶段 0 完成：所有工具就绪

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📍 阶段 1/6：获取文本
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  → 获取视频标题...
  → 下载字幕...
  → 清洗文本...
  → 生成时间戳映射...
✅ 阶段 1 完成：transcript_en.txt (156KB), timestamp_map.json

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📍 阶段 2/6：翻译
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  → 分段阅读英文原文...
  → 生成中文翻译...
✅ 阶段 2 完成：transcript_zh.md (13KB)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📍 阶段 3/6：金字塔分析
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  → 提取核心论点...
  → 分析子论点...
  → 整理金句（中英对照）...
✅ 阶段 3 完成：pyramid_analysis_zh.md (15KB)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📍 阶段 4/6：金句截图
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  → 从 pyramid_analysis_zh.md 提取金句...
  → 定位金句时间戳...
  → 下载视频 (720p)...
  → 截取视频帧 (6条)...
  → 生成金句卡片 (英文在上、中文在下)...
✅ 阶段 4 完成：quotes/ (6张截图 + 6张卡片)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📍 阶段 5/6：可视化
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  → 生成 HTML 页面...
✅ 阶段 5 完成：pyramid.html

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📍 阶段 6/6：导出图片
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  → 截图 HTML 页面...
✅ 阶段 6 完成：pyramid.png (2800×6400px, 4.0MB)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎉 任务完成
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### 六阶段流程

```
阶段0    阶段1    阶段2    阶段3    阶段4    阶段5    阶段6    阶段7
前置检查 → 获取 → 翻译 → 分析 → 金句截图 → 可视化 → 导出 → 发布(可选)
```

### 数据依赖关系图

```
阶段0: 前置检查
  │ (无数据产出，仅验证环境)
  ▼
阶段1: 获取文本
  │ 产出: video_title, transcript_en.txt, timestamp_map.json
  │
  ├──────────────────────────────────────┐
  ▼                                      │
阶段2: 翻译                               │
  │ 依赖: transcript_en.txt              │
  │ 产出: transcript_zh.md               │
  │                                      │
  ├──────────────────┐                   │
  ▼                  ▼                   │
阶段3: 金字塔分析                         │
  │ 依赖: transcript_en.txt,             │
  │       transcript_zh.md               │
  │ 产出: pyramid_analysis_zh.md         │
  │       (含金句列表)                    │
  │                                      │
  ▼                                      ▼
阶段4: 金句截图
  │ 依赖: pyramid_analysis_zh.md (金句)
  │       timestamp_map.json (时间戳)
  │       YouTube_URL (视频下载)
  │ 产出: quotes_list.json
  │       quotes/*.png, quote_card_*.png
  │ 回填: pyramid_analysis_zh.md (步骤7)
  │       transcript_zh.md (步骤8)
  │
  ▼
阶段5: 可视化
  │ 依赖: pyramid_analysis_zh.md
  │       video_title
  │ 产出: pyramid.html
  │
  ▼
阶段6: 导出图片
  │ 依赖: pyramid.html
  │ 产出: pyramid.png
  ▼
完成
```

**关键依赖说明**：
- 阶段4的金句截图依赖阶段3产出的金句列表（英文原文用于时间戳定位）
- 阶段4完成后需要回填两个文档：`pyramid_analysis_zh.md` 和 `transcript_zh.md`
- 阶段5的HTML可视化依赖阶段4回填后的 `pyramid_analysis_zh.md`

---

### 阶段 0：前置检查（必须通过）

> ⚠️ **任务执行前必须完成此检查，任何必需工具缺失则终止任务。**

#### 检查脚本

```bash
#!/bin/bash
echo "=== 工具依赖检查 ==="

MISSING=()

# 必需工具
echo -n "yt-dlp: "
which yt-dlp > /dev/null 2>&1 && echo "✓" || { echo "✗ 缺失"; MISSING+=("yt-dlp"); }

echo -n "ffmpeg: "
which ffmpeg > /dev/null 2>&1 && echo "✓" || { echo "✗ 缺失"; MISSING+=("ffmpeg"); }

echo -n "python3: "
which python3 > /dev/null 2>&1 && echo "✓" || { echo "✗ 缺失"; MISSING+=("python3"); }

echo -n "Playwright/Chrome: "
(npx playwright --version > /dev/null 2>&1 || ls "/Applications/Google Chrome.app" > /dev/null 2>&1) && echo "✓" || { echo "✗ 缺失"; MISSING+=("playwright"); }

echo -n "ImageMagick: "
which convert > /dev/null 2>&1 && echo "✓" || { echo "✗ 缺失"; MISSING+=("imagemagick"); }

echo ""
if [ ${#MISSING[@]} -eq 0 ]; then
    echo "✅ 所有必需工具已就绪，可以执行任务"
    exit 0
else
    echo "❌ 缺失必需工具: ${MISSING[*]}"
    echo ""
    echo "安装命令:"
    for tool in "${MISSING[@]}"; do
        case $tool in
            yt-dlp) echo "  brew install yt-dlp" ;;
            ffmpeg) echo "  brew install ffmpeg" ;;
            python3) echo "  brew install python3" ;;
            playwright) echo "  npx playwright install chromium" ;;
            imagemagick) echo "  brew install imagemagick" ;;
        esac
    done
    exit 1
fi
```

#### 执行流程

1. **运行检查脚本**
2. **如有缺失**：
   - 提示用户："检测到缺失工具 [工具名]，是否立即安装？(Y/n)"
   - 用户选择 Y → 执行安装命令，安装完成后重新检查
   - 用户选择 N → 终止任务，输出："任务已取消，请先安装必需工具"
3. **全部通过**：继续执行阶段 1

#### 安装命令汇总

| 工具 | 安装命令 | 说明 |
|------|----------|------|
| yt-dlp | `brew install yt-dlp` | 下载字幕/视频 |
| ffmpeg | `brew install ffmpeg` | 视频帧截取 |
| python3 | `brew install python3` | 脚本执行（macOS 通常自带） |
| Playwright | `npx playwright install chromium` | HTML 截图 |
| ImageMagick | `brew install imagemagick` | 金句卡片生成 |

---

### 阶段 1：获取文本

#### 工具与命令

```bash
# 1. 获取视频标题（用于创建目录）
yt-dlp --print title "YouTube_URL"

# 2. 创建输出目录
mkdir -p "视频标题"

# 3. 下载字幕（优先自动字幕）
yt-dlp --write-auto-sub --sub-lang en --skip-download --sub-format vtt -o "subtitle" "YouTube_URL"

# 4. 清洗字幕文本（移除时间戳、重复行、HTML标签）
cat subtitle.en.vtt | \
  grep -v "^WEBVTT" | \
  grep -v "^Kind:" | \
  grep -v "^Language:" | \
  grep -v "^$" | \
  grep -v "^[0-9][0-9]:[0-9][0-9]:[0-9][0-9]" | \
  grep -v "^\-\->" | \
  grep -v "align:start position:" | \
  sed 's/<[^>]*>//g' | \
  awk '!seen[$0]++' > transcript_en.txt

# 5. 生成时间戳映射文件（用于金句截图）
# 使用 Python 解析VTT文件（macOS awk 不支持正则捕获组）
python3 << 'PYEOF'
import re
import json

with open('subtitle.en.vtt', 'r') as f:
    content = f.read()

pattern = r'(\d{2}:\d{2}:\d{2}\.\d{3}) --> (\d{2}:\d{2}:\d{2}\.\d{3})[^\n]*\n([^\n]+)'
matches = re.findall(pattern, content)

segments = []
for i, (start, end, text) in enumerate(matches):
    clean_text = re.sub(r'<[^>]*>', '', text).strip()
    if clean_text and not clean_text.startswith('align:'):
        segments.append({
            "index": len(segments),
            "start": start,
            "end": end,
            "text": clean_text
        })

with open('timestamp_map.json', 'w') as f:
    json.dump({"segments": segments}, f, ensure_ascii=False, indent=2)

print(f"Generated {len(segments)} segments")
PYEOF
```

> ⚠️ **重要**：保留 `subtitle.en.vtt` 文件，后续金句截图需要使用时间戳信息。

#### 策略

- **字幕优先** > 音频转写备选
- 若字幕获取失败，下载音频并使用语音识别
- 清洗文本，移除时间戳和重复内容
- **保留VTT原文件**，用于金句时间戳定位

#### 验证

```bash
# 1. 文件存在性检查
[ -f "transcript_en.txt" ] && echo "✓ transcript_en.txt 存在" || echo "✗ transcript_en.txt 缺失"
[ -f "timestamp_map.json" ] && echo "✓ timestamp_map.json 存在" || echo "✗ timestamp_map.json 缺失"
[ -f "subtitle.en.vtt" ] && echo "✓ subtitle.en.vtt 存在" || echo "✗ subtitle.en.vtt 缺失"

# 2. 内容有效性检查
LINE_COUNT=$(wc -l < transcript_en.txt)
if [ "$LINE_COUNT" -gt 100 ]; then
    echo "✓ transcript_en.txt 行数: $LINE_COUNT (合理)"
else
    echo "✗ transcript_en.txt 行数: $LINE_COUNT (过少，可能下载失败)"
fi

# 3. 时间戳映射有效性检查
SEGMENT_COUNT=$(python3 -c "import json; print(len(json.load(open('timestamp_map.json'))['segments']))")
if [ "$SEGMENT_COUNT" -gt 100 ]; then
    echo "✓ timestamp_map.json 段落数: $SEGMENT_COUNT (合理)"
else
    echo "✗ timestamp_map.json 段落数: $SEGMENT_COUNT (过少，可能解析失败)"
fi

# 4. 内容预览
echo "--- 英文原文前5行 ---"
head -5 transcript_en.txt
```

**验证标准：**
| 检查项 | 通过条件 | 失败处理 |
|--------|----------|----------|
| transcript_en.txt 存在 | 文件存在且非空 | 重新下载字幕 |
| 行数 | >100行 | 检查视频是否有字幕 |
| timestamp_map.json 段落数 | >100段 | 检查VTT格式是否正确 |

---

### 阶段 2：翻译（中英对照版）

#### 标准

- **信达雅**
- **中英对照格式**：关键段落保留英文原文，便于阶段4金句定位
- 中文翻译核心内容充分展开，非逐字翻译但信息量充足
- **金句卡片嵌入**：在金句对应位置，嵌入金句卡片图片（阶段4生成后回填）

#### 输出格式要求

```markdown
## 章节标题

中文翻译内容...

> English original quote here.

更多中文翻译...
```

**关键要求**：
- 金句相关的英文原文以引用格式（`> ...`）保留在文档中
- 不需要"原文："前缀，直接给出英文
- 这样阶段4可以直接用英文搜索定位，实现100%匹配率

#### 翻译深度指南

| 内容类型 | 翻译策略 |
| -------- | -------- |
| 核心论点 | 完整翻译 + 适当展开解释 |
| 关键案例 | 保留完整故事脉络和细节 |
| 精彩对话 | 保留问答原貌，体现思维碰撞 |
| 数据/事实 | 精确翻译，不可省略 |
| 过渡性内容 | 可适当精简 |
| 重复表述 | 合并去重，保留最精彩版本 |

#### 实战技巧

- 分段阅读英文原文（每次200-400行）
- 按主题模块组织中文内容
- 使用 Markdown 标题结构化输出
- 目标信息量：原文核心内容的 60-80%

#### 验证

```bash
# 1. 文件存在性检查
[ -f "transcript_zh.md" ] && echo "✓ transcript_zh.md 存在" || echo "✗ transcript_zh.md 缺失"

# 2. 内容量检查（中文翻译应为英文的30-60%字符数）
EN_CHARS=$(wc -c < transcript_en.txt)
ZH_CHARS=$(wc -c < transcript_zh.md)
RATIO=$(echo "scale=2; $ZH_CHARS * 100 / $EN_CHARS" | bc)
echo "翻译比例: ${RATIO}% (英文${EN_CHARS}字符 → 中文${ZH_CHARS}字符)"
if [ $(echo "$ZH_CHARS > 5000" | bc) -eq 1 ]; then
    echo "✓ 翻译内容量充足"
else
    echo "✗ 翻译内容量不足，请检查"
fi

# 3. 结构检查（应包含多个标题）
HEADING_COUNT=$(grep -c "^#" transcript_zh.md)
if [ "$HEADING_COUNT" -ge 3 ]; then
    echo "✓ 文档结构化良好 (${HEADING_COUNT}个标题)"
else
    echo "⚠️ 文档结构较简单 (${HEADING_COUNT}个标题)"
fi

# 4. 内容预览
echo "--- 中文翻译前10行 ---"
head -10 transcript_zh.md
```

**验证标准：**
| 检查项 | 通过条件 | 失败处理 |
|--------|----------|----------|
| 文件存在 | transcript_zh.md 存在且非空 | 重新生成翻译 |
| 内容量 | >5000字符 | 补充翻译内容 |
| 结构化 | ≥3个Markdown标题 | 添加章节结构 |

---

### 阶段 3：金字塔分析（深度版）

#### 输出结构

```markdown
# 金字塔原理分析：[主题]

## 核心论点
一句话概括 + 2-3句展开阐释

## 子论点
### 子论点一：[标题]
**论点陈述**：清晰明确
**原文论据**：2-3条，使用翻译后地道的中文表述
**案例支撑**：具体故事/数据，完整呈现
**延伸思考**：与其他观点的关联

### 子论点二：...
（重复以上结构，≥5个子论点）

## 金句（中英对照）

> ⚠️ **重要**：金句的英文部分必须是视频中的原话，不可改写或意译，后续需要用原文在字幕中定位时间戳。

### 金句 1
**中文**："中文金句"
**英文**："English original quote"
**卡片**：![](./quotes/quote_card_01.png)

### 金句 2
...

（5-8条，每条包含中英文和卡片图片）

## 深度洞见
- 嘉宾的独特视角或反常识观点
- 方法论或框架性思维
- 可迁移的底层逻辑

## 行动指南
1. **[行动名称]**：具体、可执行的建议
2. ...
（5-10条）

## 延伸阅读
### 提及的书籍
- 《书名》- 作者

### 提及的人物
- 人名 - 身份/贡献

### 核心概念
- 概念名称：简要解释
```

#### 内容量指南

| 模块 | 字数/条数 |
|------|-----------|
| 核心论点 | 100-200字 |
| 每个子论点 | 200-400字 |
| 金句 | 5-8条（中英对照） |
| 深度洞见 | 300-500字 |
| 行动指南 | 每条50-100字，共5-10条 |

#### 验证

```bash
# 1. 文件存在性检查
[ -f "pyramid_analysis_zh.md" ] && echo "✓ pyramid_analysis_zh.md 存在" || echo "✗ pyramid_analysis_zh.md 缺失"

# 2. 内容量检查
CHAR_COUNT=$(wc -c < pyramid_analysis_zh.md)
if [ "$CHAR_COUNT" -gt 8000 ]; then
    echo "✓ 分析内容量充足 (${CHAR_COUNT}字符)"
else
    echo "✗ 分析内容量不足 (${CHAR_COUNT}字符)，需>8000"
fi

# 3. 结构完整性检查（必须包含的章节）
echo "--- 结构检查 ---"
grep -q "## 核心论点" pyramid_analysis_zh.md && echo "✓ 核心论点" || echo "✗ 缺少核心论点"
grep -q "## 子论点" pyramid_analysis_zh.md && echo "✓ 子论点" || echo "✗ 缺少子论点"
grep -q "## 金句" pyramid_analysis_zh.md && echo "✓ 金句" || echo "✗ 缺少金句"
grep -q "## 深度洞见" pyramid_analysis_zh.md && echo "✓ 深度洞见" || echo "✗ 缺少深度洞见"
grep -q "## 行动指南" pyramid_analysis_zh.md && echo "✓ 行动指南" || echo "✗ 缺少行动指南"

# 4. 金句数量检查（用于后续截图）
QUOTE_COUNT=$(grep -c '".*" / ".*"' pyramid_analysis_zh.md || echo 0)
if [ "$QUOTE_COUNT" -ge 5 ]; then
    echo "✓ 金句数量: ${QUOTE_COUNT}条 (足够)"
else
    echo "✗ 金句数量: ${QUOTE_COUNT}条 (不足5条)"
fi

# 5. 金句格式检查（必须是 "中文" / "English" 格式）
echo "--- 金句格式预览 ---"
grep '".*" / ".*"' pyramid_analysis_zh.md | head -3
```

**验证标准：**
| 检查项 | 通过条件 | 失败处理 |
|--------|----------|----------|
| 文件存在 | pyramid_analysis_zh.md 存在 | 重新生成分析 |
| 内容量 | >8000字符 | 补充分析内容 |
| 结构完整 | 包含5个必需章节 | 补充缺失章节 |
| 金句数量 | ≥5条 | 补充金句 |
| 金句格式 | "中文" / "English" | 修正格式 |

---

### 阶段 4：金句截图

> ⚠️ **前置依赖**：必须先完成阶段3（金字塔分析），从 `pyramid_analysis_zh.md` 中提取金句列表。

#### ⚠️ 阶段 4 执行检查清单（必须全部完成）

| 步骤 | 任务 | 产出 | 必须执行 |
|------|------|------|----------|
| 步骤 1 | 从金字塔分析中提取金句 | - | ✓ |
| 步骤 2 | 定位金句时间戳 | quotes_list.json | ✓ |
| 步骤 3 | 下载视频 | video.mp4 | ✓ |
| 步骤 4 | 截取视频帧 | quotes/quote_*.png | ✓ |
| 步骤 5 | 生成金句卡片 | quotes/quote_card_*.png | ✓ |
| 步骤 6 | 生成索引文件 | quotes/index.md | ✓ |
| **步骤 7** | **更新金字塔分析文档** | pyramid_analysis_zh.md 嵌入卡片 | ✓ |
| **步骤 8** | **更新中文翻译文档** | transcript_zh.md 嵌入卡片 | ✓ |

> 🚨 **重要**：步骤 7 和步骤 8 容易被遗漏！必须在阶段 4 验证前完成这两个回填步骤。

#### 步骤 1：从金字塔分析中提取金句

从阶段3生成的 `pyramid_analysis_zh.md` 文件中，提取"金句（中英对照）"部分的内容。

**金句格式要求**（阶段3初始生成时使用简洁格式，阶段4完成后会自动更新为带卡片的格式）：

**阶段3初始格式**：
```markdown
## 金句（中英对照）

1. "习惯必须先建立，才能改进。" / "A habit must be established before it can be improved."
2. "每个行动都是对你想成为的那类人的一票投票。" / "Every action is like a vote for the type of person you wish to become."
...
```

**阶段4更新后格式**（自动替换）：
```markdown
## 金句（中英对照）

### 金句 1
**中文**："习惯必须先建立，才能改进。"
**英文**："A habit must be established before it can be improved."
**时间点**：15:25

![金句卡片1](./quotes/quote_card_01.png)

### 金句 2
...
```

#### 步骤 2：定位金句时间戳

使用 Python 从 `timestamp_map.json` 中搜索金句英文原文：

```python
python3 << 'PYEOF'
import json
import re

# 从 pyramid_analysis_zh.md 提取金句（动态读取，非硬编码）
with open('pyramid_analysis_zh.md', 'r') as f:
    content = f.read()

# 提取金句部分（格式："中文" / "English"）
pattern = r'"([^"]+)"\s*/\s*"([^"]+)"'
quotes_raw = re.findall(pattern, content)

# 加载时间戳映射
with open('timestamp_map.json', 'r') as f:
    data = json.load(f)

# 搜索每条金句的时间戳
quotes_with_ts = []
for zh, en in quotes_raw[:8]:  # 最多8条
    # 提取英文关键词（取前5个词）
    keywords = en.lower().split()[:5]
    search_key = ' '.join(keywords[:3])
    
    found_ts = None
    for seg in data['segments']:
        if search_key in seg['text'].lower():
            found_ts = seg['start']
            break
    
    if found_ts:
        quotes_with_ts.append((found_ts, zh, en))
        print(f"✓ [{found_ts}] {zh[:20]}...")
    else:
        print(f"✗ 未找到: {en[:30]}...")

# 保存供后续步骤使用
import json
with open('quotes_list.json', 'w') as f:
    json.dump(quotes_with_ts, f, ensure_ascii=False, indent=2)

print(f"\n共定位 {len(quotes_with_ts)} 条金句")
PYEOF
```

#### 步骤 3：下载视频

```bash
# 下载720p视频（如果尚未下载）
if [ ! -f "video.mp4" ]; then
  yt-dlp -f "bestvideo[height<=720]+bestaudio/best[height<=720]" \
    --merge-output-format mp4 \
    -o "video.mp4" "YouTube_URL"
fi
```

| 参数 | 说明 |
|------|------|
| `-f "bestvideo[height<=720]..."` | 选择720p或更低分辨率（加快下载） |
| `--merge-output-format mp4` | 合并为MP4格式 |
| `-o "video.mp4"` | 输出文件名 |

> 💡 720p 视频约 100-200MB，相比 1080p（300-500MB）下载更快，截图质量仍足够清晰。

#### 步骤 4：截取视频帧

```python
python3 << 'PYEOF'
import subprocess
import os
import json

# 从步骤2生成的文件读取金句列表（动态数据）
with open('quotes_list.json', 'r') as f:
    quotes = json.load(f)

def time_to_seconds(ts):
    parts = ts.replace('.', ':').split(':')
    h, m, s = int(parts[0]), int(parts[1]), float(parts[2] + '.' + parts[3] if len(parts) > 3 else parts[2])
    return h * 3600 + m * 60 + s + 1.5  # 加1.5秒偏移避免转场

os.makedirs('quotes', exist_ok=True)

for i, (ts, zh, en) in enumerate(quotes, 1):
    sec = time_to_seconds(ts)
    output = f'quotes/quote_{i:02d}.png'
    cmd = ['ffmpeg', '-y', '-ss', str(sec), '-i', 'video.mp4', '-vframes', '1', '-q:v', '2', output]
    subprocess.run(cmd, capture_output=True)
    if os.path.exists(output):
        print(f"✓ {i}. {zh[:15]}... -> {output}")
PYEOF
```

#### 步骤 5：生成金句卡片

使用 Python + ImageMagick 批量生成，**支持长文本自动换行，中英文分层布局**：

```python
python3 << 'PYEOF'
import subprocess
import json
import os
import textwrap

with open('quotes_list.json', 'r') as f:
    quotes = json.load(f)

VIDEO_TITLE = os.path.basename(os.getcwd())

def wrap_text(text, max_chars):
    if len(text) <= max_chars:
        return text
    return '\n'.join(textwrap.wrap(text, width=max_chars))

for i, (ts, zh, en) in enumerate(quotes, 1):
    input_file = f'quotes/quote_{i:02d}.png'
    output_file = f'quotes/quote_card_{i:02d}.png'
    
    if not os.path.exists(input_file):
        continue
    
    # 长文本自动换行（中文28字/行，英文55字符/行）
    zh_wrapped = wrap_text(zh, 28)
    en_wrapped = wrap_text(en, 55)
    
    zh_lines = zh_wrapped.count('\n') + 1
    en_lines = en_wrapped.count('\n') + 1
    
    # 布局计算（从底部向上，确保不重叠）
    source_y = 20                                    # 来源距底部
    zh_y = source_y + 25 + 15                        # 中文起始 = 来源 + 来源高度 + 间距
    en_y = zh_y + zh_lines * 40 + 20                 # 英文起始 = 中文 + 中文总高度 + 间距
    bg_height = en_y + en_lines * 32 + 25            # 背景高度 = 英文顶部 + 英文总高度 + 顶部留白
    
    cmd = [
        'magick', input_file,
        '-gravity', 'south',
        '-fill', 'rgba(0,0,0,0.75)',
        '-draw', f'rectangle 0,%[fx:h-{bg_height}] %[fx:w],%[fx:h]',
        # 来源（最底部）
        '-font', 'Helvetica', '-pointsize', '16',
        '-fill', 'rgba(255,255,255,0.6)', '-annotate', f'+0+{source_y}', VIDEO_TITLE,
        # 中文（中间）
        # ⚠️ 重要：macOS中文字体必须使用 magick -list font 输出的精确名称
        # 首选：'.Hiragino-Sans-GB-Interface-W6'（冬青黑体，兼容性最佳）
        # 备选：'PingFang-SC-Semibold'（苹方，部分系统可能不识别）
        # 查询可用中文字体：magick -list font | grep -i "Hiragino-Sans-GB\|PingFang-SC"
        '-font', '.Hiragino-Sans-GB-Interface-W6', '-pointsize', '32',
        '-fill', 'white', '-annotate', f'+0+{zh_y}', zh_wrapped,
        # 英文（上方）
        '-font', 'Helvetica', '-pointsize', '24',
        '-fill', 'rgba(255,255,255,0.85)', '-annotate', f'+0+{en_y}', en_wrapped,
        output_file
    ]
    
    result = subprocess.run(cmd, capture_output=True)
    if os.path.exists(output_file):
        print(f"✓ 卡片 {i}: {zh[:20]}...")
    else:
        print(f"✗ 卡片 {i} 生成失败")
PYEOF
```

**布局说明（从底部向上）：**
```
┌─────────────────────────────────┐
│         视频画面                 │
├─────────────────────────────────┤ ← 背景顶部（25px留白）
│  English quote line 1           │ ← 英文（24pt，行高32px）
│  English quote line 2           │
│                                 │ ← 间距（20px）
│  中文金句第一行                  │ ← 中文（32pt，行高40px）
│  中文金句第二行                  │
│                                 │ ← 间距（15px）
│  来源信息                        │ ← 来源（16pt）
└─────────────────────────────────┘ ← 底部（20px留白）
```

**长文本处理要点：**
- 中文按28字符/行换行，英文按55字符/行换行
- 背景高度根据实际行数动态计算
- 各元素间有固定间距，确保不重叠

#### 步骤 6：生成索引文件

```python
python3 << 'PYEOF'
import json
import os
from datetime import datetime

with open('quotes_list.json', 'r') as f:
    quotes = json.load(f)

VIDEO_TITLE = os.path.basename(os.getcwd())
VIDEO_URL = "YouTube URL"  # 从执行参数获取

content = f"""# 金句截图索引

## 视频信息
- **标题**: {VIDEO_TITLE}
- **链接**: {VIDEO_URL}
- **处理时间**: {datetime.now().strftime('%Y-%m-%d')}

## 金句列表

"""

for i, (ts, zh, en) in enumerate(quotes, 1):
    # 转换时间戳格式 00:15:25.110 -> 15:25
    time_short = ':'.join(ts.split(':')[1:2]) + ':' + ts.split(':')[2].split('.')[0]
    content += f"""### 金句 {i}
- **中文**: "{zh}"
- **英文**: "{en}"
- **时间点**: {time_short}
- **截图**: ![](./quote_{i:02d}.png)
- **卡片**: ![](./quote_card_{i:02d}.png)

"""

with open('quotes/index.md', 'w') as f:
    f.write(content)

print(f"✓ 索引文件已生成，共 {len(quotes)} 条金句")
PYEOF
```

#### 步骤 7：更新金字塔分析文档（集成金句卡片）

金句卡片生成完成后，更新 `pyramid_analysis_zh.md` 中的金句部分，将卡片图片嵌入：

```python
python3 << 'PYEOF'
import json
import re

with open('quotes_list.json', 'r') as f:
    quotes = json.load(f)

with open('pyramid_analysis_zh.md', 'r') as f:
    content = f.read()

# 构建新的金句部分
new_quotes_section = """## 金句（中英对照）

"""

for i, (ts, zh, en) in enumerate(quotes, 1):
    time_short = ts.split(':')[1] + ':' + ts.split(':')[2].split('.')[0]
    new_quotes_section += f"""### 金句 {i}
**中文**："{zh}"
**英文**："{en}"
**时间点**：{time_short}

![金句卡片{i}](./quotes/quote_card_{i:02d}.png)

"""

# 替换原有金句部分
pattern = r'## 金句（中英对照）.*?(?=\n## )'
content = re.sub(pattern, new_quotes_section, content, flags=re.DOTALL)

with open('pyramid_analysis_zh.md', 'w') as f:
    f.write(content)

print(f"✓ 已更新 pyramid_analysis_zh.md，集成 {len(quotes)} 张金句卡片")
PYEOF
```

#### 步骤 8：更新中文翻译文档（嵌入金句卡片）

> ⚠️ **注意**：金句是从分析中提炼的精华，与 `transcript_zh.md` 中的原文措辞可能不完全一致。此步骤使用关键词模糊匹配，匹配失败的金句需要人工确认位置。

将金句卡片嵌入到 `transcript_zh.md` 中对应金句内容的位置：

```python
python3 << 'PYEOF'
import json
import re

with open('quotes_list.json', 'r') as f:
    quotes = json.load(f)

with open('transcript_zh.md', 'r') as f:
    content = f.read()

# 基于英文原文搜索定位（transcript_zh.md 为中英对照格式）
matched = 0
for i, (ts, zh, en) in enumerate(quotes, 1):
    card_ref = f'![金句卡片](./quotes/quote_card_{i:02d}.png)'
    
    if card_ref in content:
        matched += 1
        continue
    
    # 策略1：用英文关键词搜索（取前5个词）
    en_key = ' '.join(en.split()[:5]).lower()
    found = False
    lines = content.split('\n')
    for j, line in enumerate(lines):
        if en_key in line.lower():
            # 检查附近是否已有卡片
            nearby = '\n'.join(lines[max(0,j-2):j+3])
            if 'quote_card_' not in nearby:
                lines.insert(j + 1, f'\n{card_ref}')
                content = '\n'.join(lines)
                matched += 1
                print(f"✓ 金句 {i} (英文匹配): {zh[:20]}...")
                found = True
                break
    
    if not found:
        # 策略2：用中文关键词搜索（备选）
        zh_key = zh[:8]
        for j, line in enumerate(lines):
            if zh_key in line:
                nearby = '\n'.join(lines[max(0,j-2):j+3])
                if 'quote_card_' not in nearby:
                    lines.insert(j + 1, f'\n{card_ref}')
                    content = '\n'.join(lines)
                    matched += 1
                    print(f"✓ 金句 {i} (中文匹配): {zh[:20]}...")
                    found = True
                    break
    
    if not found:
        print(f"⚠️ 金句 {i} 未匹配: {zh[:20]}...")

with open('transcript_zh.md', 'w') as f:
    f.write(content)

print(f"\n✓ 已更新 transcript_zh.md，成功嵌入 {matched}/{len(quotes)} 张金句卡片")
PYEOF
```

**匹配策略说明**：
1. 优先用英文关键词搜索（因为 `transcript_zh.md` 是中英对照格式）
2. 备选用中文关键词搜索
3. 检查附近是否已有卡片，避免重复插入

#### 验证

```bash
# 1. 文件完整性检查
echo "--- 文件检查 ---"
[ -f "quotes_list.json" ] && echo "✓ quotes_list.json" || echo "✗ quotes_list.json 缺失"
[ -d "quotes" ] && echo "✓ quotes/ 目录" || echo "✗ quotes/ 目录缺失"
[ -f "quotes/index.md" ] && echo "✓ quotes/index.md" || echo "✗ quotes/index.md 缺失"

# 2. 金句定位成功率检查
TOTAL_QUOTES=$(python3 -c "import json; print(len(json.load(open('quotes_list.json'))))")
echo "金句定位成功: ${TOTAL_QUOTES}条"
if [ "$TOTAL_QUOTES" -ge 5 ]; then
    echo "✓ 定位成功率合格"
else
    echo "✗ 定位成功率不足，需检查金句英文是否为原文"
fi

# 3. 截图文件检查
SCREENSHOT_COUNT=$(ls quotes/quote_[0-9][0-9].png 2>/dev/null | wc -l)
CARD_COUNT=$(ls quotes/quote_card_[0-9][0-9].png 2>/dev/null | wc -l)
echo "视频截图: ${SCREENSHOT_COUNT}张, 金句卡片: ${CARD_COUNT}张"
if [ "$SCREENSHOT_COUNT" -eq "$CARD_COUNT" ] && [ "$SCREENSHOT_COUNT" -gt 0 ]; then
    echo "✓ 截图和卡片数量匹配"
else
    echo "✗ 截图和卡片数量不匹配或为空"
fi

# 4. 图片有效性检查（非空文件）
echo "--- 图片有效性 ---"
for f in quotes/quote_card_*.png; do
    SIZE=$(stat -f%z "$f" 2>/dev/null || stat -c%s "$f" 2>/dev/null)
    if [ "$SIZE" -gt 10000 ]; then
        echo "✓ $(basename $f): ${SIZE}字节"
    else
        echo "✗ $(basename $f): ${SIZE}字节 (过小，可能生成失败)"
    fi
done

# 5. 金字塔分析文档更新检查（步骤7）
echo ""
echo "--- 步骤 7 检查：pyramid_analysis_zh.md ---"
if grep -q "quote_card_01.png" pyramid_analysis_zh.md; then
    echo "✓ pyramid_analysis_zh.md 已集成金句卡片"
else
    echo "✗ pyramid_analysis_zh.md 未集成金句卡片 【必须执行步骤7】"
    exit 1
fi

# 6. 中文翻译文档更新检查（步骤8）
echo ""
echo "--- 步骤 8 检查：transcript_zh.md ---"
ZH_CARD_COUNT=$(grep -c "quote_card_" transcript_zh.md 2>/dev/null || echo 0)
echo "transcript_zh.md 已嵌入金句卡片: ${ZH_CARD_COUNT}张"
if [ "$ZH_CARD_COUNT" -ge 3 ]; then
    echo "✓ transcript_zh.md 金句卡片嵌入合格"
else
    echo "✗ transcript_zh.md 金句卡片嵌入不足 【必须执行步骤8】"
    exit 1
fi

# 7. 图片尺寸检查（需要ImageMagick的identify命令）
echo "--- 图片尺寸 ---"
identify quotes/quote_01.png 2>/dev/null | awk '{print $3}' | head -1
```

**验证标准：**
| 检查项 | 通过条件 | 失败处理 |
|--------|----------|----------|
| 金句定位 | ≥5条成功定位 | 检查金句英文是否为视频原文 |
| 截图数量 | 截图数=卡片数>0 | 检查ffmpeg/magick命令 |
| 图片大小 | 每张>10KB | 重新生成卡片 |
| pyramid_analysis_zh.md | 包含quote_card引用 | 重新执行步骤7 |
| transcript_zh.md | ≥3张卡片嵌入 | 人工补充未匹配的金句位置 |

---

### 阶段 5：可视化

#### HTML 模板结构

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>[视频原始标题]</title>
    <!-- SEO meta 标签 -->
    <meta name="description" content="内容摘要（50-160字符）">
    <meta name="keywords" content="关键词1,关键词2,关键词3">
    <meta name="author" content="QuestResearch">
    <meta property="og:title" content="标题">
    <meta property="og:description" content="描述">
    <meta property="og:type" content="article">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="标题">
    <meta name="twitter:description" content="描述">
    <style>
        :root {
            --pink: #ffb3ba;
            --peach: #ffdfba;
            --yellow: #ffffba;
            --mint: #baffc9;
            --sky: #bae1ff;
        }
        /* 响应式设计，清晰美观 */
    </style>
</head>
<body>
    <!-- 头部：标题 + 嘉宾信息 -->
    <!-- 核心论点卡片 -->
    <!-- 子论点金字塔布局 -->
    <!-- 四法则/框架网格 -->
    <!-- 金句卡片网格 -->
    <!-- 行动指南列表 -->
    <!-- 页脚：来源信息 -->
</body>
</html>
```

#### HTML 生成实现

> ⚠️ **重要**:行动指南提取必须使用完整的正则表达式,避免非贪婪匹配导致截断。

```python
python3 << 'PYEOF'
import re
import json

# 读取金字塔分析
with open('pyramid_analysis_zh.md', 'r') as f:
    content = f.read()

# 读取金句列表
with open('quotes_list.json', 'r') as f:
    quotes = json.load(f)

# 提取核心论点
core_thesis_match = re.search(r'## 核心论点\n(.*?)\n## ', content, re.DOTALL)
if core_thesis_match:
    core_thesis = core_thesis_match.group(1).strip()
else:
    core_thesis = "AI 通过输入→处理→输出系统化应用提升生产力"

# 提取5个子论点标题
sub_points = re.findall(r'### (子论点.*?:.*)', content)[:5]

# 提取金句
quotes_cards = []
for i, (ts, zh, en) in enumerate(quotes, 1):
    time_short = ts.split(':')[1] + ':' + ts.split(':')[2].split('.')[0]
    quotes_cards.append({
        'index': i,
        'zh': zh,
        'en': en,
        'time': time_short,
        'card': f'quotes/quote_card_{i:02d}.png'
    })

# ⚠️ 关键修复:行动指南提取逻辑
# 使用正确的正则表达式,避免非贪婪匹配截断
actions_section_match = re.search(r'## 行动指南\n(.*?)\n## ', content, re.DOTALL)
if actions_section_match:
    actions_text = actions_section_match.group(1)
    # 提取所有带数字的行(匹配到句号或换行)
    actions = re.findall(r'(\d+\. .*?)(?=\n\d+\. |\n##)', actions_text)
else:
    actions = []

print(f"提取到 {len(actions)} 条行动指南")
for i, action in enumerate(actions[:10], 1):
    print(f"  {i}. {action[:60]}...")

# 生成HTML... (继续后续代码)
PYEOF
```

**关键修复说明**:
1. **问题**: `r'(\d+\. .*?)'` 使用非贪婪匹配 `.*?` 导致只匹配第一个句号前的内容
2. **修复**: 改为 `r'(\d+\. .*?)(?=\n\d+\. |\n##)'` 匹配到下一个数字标题或章节标题
3. **验证**: 控制台输出提取到的行动指南数量和预览,确保完整性

#### 设计要求

- **HTML title 使用视频播客的原始标题**（从 yt-dlp --print title 获取）
- **SEO meta 标签**：description、keywords、OG、Twitter Card
- **配色使用色彩系统设计规范**（见 `色彩系统设计规范.md`）
- 响应式布局（移动端适配）
- 卡片式设计，层次分明
- **禁止使用 emoji**
- **行动指南完整性**: 必须包含≥5条完整行动指南,不能截断

#### 金句卡片交互要求

- **悬停微交互**：鼠标悬停时卡片适度放大（scale 1.03），形成收放效果
- **点击大图展示**：Lightbox 模式，点击卡片弹出大图，点击背景或按 ESC 关闭

**CSS 实现**：
```css
.quote-card { cursor: pointer; transition: transform 0.2s ease; border-radius: 10px; }
.quote-card:hover { transform: scale(1.03); }
.lightbox { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.9); z-index: 1000; justify-content: center; align-items: center; cursor: pointer; }
.lightbox.active { display: flex; }
.lightbox img { max-width: 90%; max-height: 90%; border-radius: 12px; }
```

**JS 实现**：
```javascript
function openLightbox(el) {
  document.getElementById('lightbox-img').src = el.querySelector('img').src;
  document.getElementById('lightbox').classList.add('active');
}
function closeLightbox() {
  document.getElementById('lightbox').classList.remove('active');
}
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') closeLightbox();
});
```

#### 验证

```bash
# 1. 文件存在性检查
[ -f "pyramid.html" ] && echo "✓ pyramid.html 存在" || echo "✗ pyramid.html 缺失"

# 2. 文件大小检查（HTML应>5KB）
HTML_SIZE=$(stat -f%z pyramid.html 2>/dev/null || stat -c%s pyramid.html 2>/dev/null)
if [ "$HTML_SIZE" -gt 5000 ]; then
    echo "✓ pyramid.html 大小: ${HTML_SIZE}字节 (合理)"
else
    echo "✗ pyramid.html 大小: ${HTML_SIZE}字节 (过小)"
fi

# 3. HTML结构完整性检查
echo "--- HTML结构检查 ---"
grep -q "<!DOCTYPE html>" pyramid.html && echo "✓ DOCTYPE声明" || echo "✗ 缺少DOCTYPE"
grep -q "<html" pyramid.html && echo "✓ html标签" || echo "✗ 缺少html标签"
grep -q "</html>" pyramid.html && echo "✓ html闭合" || echo "✗ html未闭合"
grep -q "<style>" pyramid.html && echo "✓ 内联样式" || echo "✗ 缺少样式"

# 4. SEO标签检查
echo "--- SEO检查 ---"
grep -q 'meta name="description"' pyramid.html && echo "✓ description" || echo "✗ 缺少description"
grep -q 'og:title' pyramid.html && echo "✓ OG标签" || echo "✗ 缺少OG标签"
grep -q 'twitter:card' pyramid.html && echo "✓ Twitter Card" || echo "✗ 缺少Twitter Card"

# 5. 关键内容检查
grep -q "核心论点" pyramid.html && echo "✓ 包含核心论点" || echo "✗ 缺少核心论点"
grep -q "金句" pyramid.html && echo "✓ 包含金句" || echo "✗ 缺少金句"
grep -q "行动指南" pyramid.html && echo "✓ 包含行动指南" || echo "✗ 缺少行动指南"

# 6. 浏览器预览测试（可选）
echo "可用以下命令预览: open pyramid.html"
```

**验证标准：**
| 检查项 | 通过条件 | 失败处理 |
|--------|----------|----------|
| 文件存在 | pyramid.html 存在 | 重新生成HTML |
| 文件大小 | >5KB | 检查生成逻辑 |
| HTML结构 | DOCTYPE+html标签完整 | 修复HTML结构 |
| 关键内容 | 包含核心论点/金句/行动指南 | 补充内容 |

---

### 阶段 6：导出图片

#### 方案一：Chrome Headless（首选）

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless \
  --disable-gpu \
  --screenshot="pyramid.png" \
  --window-size=1400,2800 \
  --force-device-scale-factor=2 \
  "file://$(pwd)/pyramid.html"
```

| 参数 | 作用 |
|------|------|
| `--headless` | 无界面模式 |
| `--disable-gpu` | 禁用GPU加速（稳定性） |
| `--screenshot` | 输出文件名 |
| `--window-size` | 视口尺寸（宽,高） |
| `--force-device-scale-factor=2` | 2倍分辨率（高清） |

#### 方案二：Playwright（备选，推荐）

> ⚠️ Chrome Headless 在 macOS 上可能静默失败（命令成功但文件未生成），此时使用 Playwright。

```bash
# 首次使用需安装浏览器（仅一次）
npx playwright install chromium

# 截图命令（用大视口实现高清，因 --device-scale-factor 不支持）
npx playwright screenshot --viewport-size=2800,6400 --full-page pyramid.html pyramid.png
```

| 参数 | 作用 |
|------|------|
| `--viewport-size=2800,6400` | 2倍尺寸视口（替代 scale-factor） |
| `--full-page` | 截取完整页面 |

#### 方案三：Puppeteer（备选）

```bash
# 创建截图脚本
cat > screenshot.js << 'EOF'
const puppeteer = require('puppeteer');
const path = require('path');
(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 3200, deviceScaleFactor: 2 });
  await page.goto('file://' + path.join(__dirname, 'pyramid.html'), { waitUntil: 'networkidle0' });
  await page.screenshot({ path: 'pyramid.png', fullPage: true });
  await browser.close();
})();
EOF

# 执行（需先 npm install puppeteer）
node screenshot.js
```

#### 规格要求

- 格式：PNG
- 尺寸：≥2800px 宽（高清）
- 质量：适合社交分享

#### 验证

```bash
# 1. 文件存在性检查
[ -f "pyramid.png" ] && echo "✓ pyramid.png 存在" || echo "✗ pyramid.png 缺失"

# 2. 文件大小检查（PNG应>500KB）
PNG_SIZE=$(stat -f%z pyramid.png 2>/dev/null || stat -c%s pyramid.png 2>/dev/null)
if [ "$PNG_SIZE" -gt 500000 ]; then
    echo "✓ pyramid.png 大小: $(echo "scale=2; $PNG_SIZE/1024/1024" | bc)MB (合理)"
else
    echo "✗ pyramid.png 大小: ${PNG_SIZE}字节 (过小，可能截图失败)"
fi

# 3. 图片格式和尺寸检查
echo "--- 图片详情 ---"
file pyramid.png
identify pyramid.png 2>/dev/null || echo "⚠️ 需安装ImageMagick查看详细尺寸"

# 4. 尺寸数值验证
DIMENSIONS=$(identify -format "%wx%h" pyramid.png 2>/dev/null)
WIDTH=$(echo $DIMENSIONS | cut -d'x' -f1)
HEIGHT=$(echo $DIMENSIONS | cut -d'x' -f2)
if [ -n "$WIDTH" ] && [ "$WIDTH" -ge 1200 ]; then
    echo "✓ 宽度: ${WIDTH}px (≥1200px)"
else
    echo "✗ 宽度: ${WIDTH}px (<1200px，不够清晰)"
fi
if [ -n "$HEIGHT" ] && [ "$HEIGHT" -ge 2000 ]; then
    echo "✓ 高度: ${HEIGHT}px (内容完整)"
else
    echo "⚠️ 高度: ${HEIGHT}px (可能内容被截断)"
fi

# 5. 图片完整性检查（PNG文件头验证）
if head -c 8 pyramid.png | grep -q "PNG"; then
    echo "✓ PNG文件头有效"
else
    echo "✗ PNG文件头无效，文件可能损坏"
fi
```

**验证标准：**
| 检查项 | 通过条件 | 失败处理 |
|--------|----------|----------|
| 文件存在 | pyramid.png 存在 | 重新截图 |
| 文件大小 | >500KB | 检查截图命令是否成功 |
| 宽度 | ≥1200px | 增大viewport-size |
| 高度 | ≥2000px | 使用--full-page参数 |
| 文件头 | 有效PNG | 重新生成 |

#### 故障排查

| 问题 | 解决方案 |
|------|----------|
| Chrome 命令成功但无文件 | 切换到 Playwright 方案 |
| Playwright 报缺少浏览器 | 执行 `npx playwright install chromium` |
| Puppeteer MODULE_NOT_FOUND | 在项目目录执行 `npm install puppeteer` |
| 截图不完整/被截断 | 增大 viewport 高度 |

---

### 阶段 7：内容发布（可选）

#### 生成多平台文案

创建 `publish_content.md`，包含以下平台的适配文案：

| 平台 | 格式 | 特点 |
|------|------|------|
| 知乎/公众号 | 长文 | 完整论述，引用金句，互动提问 |
| 小红书 | 图文 | 封面文案 + emoji + 标签 |
| Twitter/X | 线程 | 7条推文，英文为主 |
| 即刻 | 短文 | 精简版，带标签 |
| 微博 | 短文 | emoji + 话题标签 |

#### 输出文件

| 文件 | 说明 |
|------|------|
| `publish_content.md` | 各平台发布文案 |

---

### 清理工作

```bash
# 删除临时文件
rm -f subtitle.en.vtt
```

---

## 📦 WHAT — 具体产出什么

### 输入

YouTube 视频链接（播客/访谈类内容）

### 输出清单

| 序号 | 文件 | 说明 | 内容深度要求 |
| ---- | ---- | ---- | ------------ |
| 1 | `transcript_en.txt` | 纯英文文本（无时间戳） | 完整保留 |
| 2 | `timestamp_map.json` | 时间戳映射文件 | 字幕文本与时间点对应 |
| 3 | `transcript_zh.md` | 中英对照翻译（含金句卡片） | 中文翻译 + 英文原文引用 + 金句卡片 |
| 4 | `pyramid_analysis_zh.md` | 金字塔原理分析（含金句卡片） | 深度分析 + 嵌入金句卡片图片 |
| 5 | `quotes_list.json` | 金句列表（中间文件） | 从阶段4动态提取 |
| 6 | `quotes/` | 金句截图目录 | 视频截图 + 金句卡片 |
| 6.1 | `quotes/quote_01.png` ... | 金句时刻视频截图 | ≥1280x720 |
| 6.2 | `quotes/quote_card_01.png` ... | 金句分享卡片 | 英文在上、中文在下的双语字幕 |
| 6.3 | `quotes/index.md` | 金句索引文件 | 汇总所有金句信息 |
| 7 | `pyramid.html` | 可视化 HTML 页面 | 清晰美观，响应式 |
| 8 | `pyramid.png` | 高质量分享图片 | ≥1200px，2倍分辨率 |
| 9 | `publish_content.md` | 多平台发布文案（可选） | 知乎/小红书/Twitter/即刻/微博 |

### 文件组织

```
{视频标题}/
├── transcript_en.txt
├── timestamp_map.json
├── transcript_zh.md
├── pyramid_analysis_zh.md
├── quotes_list.json          # 中间文件：金句列表
├── quotes/
│   ├── index.md
│   ├── quote_01.png
│   ├── quote_card_01.png
│   ├── quote_02.png
│   ├── quote_card_02.png
│   └── ...
├── pyramid.html
├── pyramid.png
└── publish_content.md      # 可选：多平台发布文案
```

### 输出规范

- **最终回复只包含**：完成确认 + 文件清单
- **禁止输出**：脚本/命令/运行日志/HTML/CSS/JS/伪代码内容
- **文件内容**：直接写入对应文件，而不是贴到回复中
- **禁止使用 emoji**：所有输出文件（.md、.html）中不使用任何 emoji 符号

---

## 🛠 工具依赖

> ⚠️ **任务执行前会自动检查，必需工具缺失将终止任务。**

| 工具 | 用途 | 安装 | 必需 |
|------|------|------|------|
| `yt-dlp` | 下载字幕/视频 | `brew install yt-dlp` | ✓ |
| `ffmpeg` | 视频帧截取 | `brew install ffmpeg` | ✓ |
| `python3` | 时间戳解析/批量处理 | 系统自带 | ✓ |
| `Playwright` | HTML转PNG | `npx playwright install chromium` | ✓ |
| `ImageMagick` | 金句卡片生成 | `brew install imagemagick` | ✓ |

### 一键安装所有必需工具

```bash
brew install yt-dlp ffmpeg python3 imagemagick && npx playwright install chromium
```

### 检查工具可用性

```bash
# 快速检查（返回 0 表示全部就绪）
(which yt-dlp && which ffmpeg && which python3 && (npx playwright --version 2>/dev/null || ls "/Applications/Google Chrome.app" 2>/dev/null)) > /dev/null 2>&1 && echo "✅ 就绪" || echo "❌ 有缺失"
```

详细检查见 **阶段 0：前置检查**。

### macOS 中文字体配置（重要）

> ⚠️ **这是一个常见的坑**：ImageMagick 在 macOS 上的中文字体名称必须使用 `magick -list font` 输出的**精确名称**，否则中文静默不渲染（不报错但无输出）。

#### 问题现象

| 错误用法 | 结果 |
|---------|------|
| `-font ".苹方-简-中黑体"` | 中文不显示，无报错（中文名称不被识别） |
| `-font "PingFang SC"` | 中文不显示，无报错（带空格不识别） |
| `-font "苹方-简-中黑体"` | 中文不显示，无报错 |
| `-font "PingFang-SC-Semibold"` | 部分系统可能不识别（取决于 ImageMagick 版本） |

#### ✅ 正确用法（2026-01-05 验证）

```bash
# 推荐：冬青黑体（Hiragino Sans GB）- 兼容性最佳
-font ".Hiragino-Sans-GB-Interface-W6"    # 粗体（推荐，适合标题）✅ 已验证
-font ".Hiragino-Sans-GB-Interface-W3"    # 常规体

# 备选：苹方字体（部分系统可能不识别）
-font "PingFang-SC-Semibold"    # 中黑体
-font "PingFang-SC-Regular"     # 常规体
```

#### 查询可用中文字体

```bash
# 列出所有可用的中文字体（使用英文名搜索）
magick -list font | grep -i "Hiragino-Sans-GB\|PingFang-SC"

# 实际输出示例（2026-01-05 macOS）：
#   Font: .Hiragino-Sans-GB-Interface-W3   ← 常规体
#   Font: .Hiragino-Sans-GB-Interface-W6   ← 粗体（推荐）
```

#### 验证字体是否正确渲染

```bash
# 生成测试图片
magick -size 600x100 xc:navy -font ".Hiragino-Sans-GB-Interface-W6" -pointsize 40 \
  -fill white -gravity center -annotate +0+0 "中文测试 Test" test.png

# 检查结果：如果图片中有白色中文文字，说明字体正确
open test.png
```

#### 经验总结

| 关键点 | 说明 |
|--------|------|
| 优先用冬青黑体 | `.Hiragino-Sans-GB-Interface-W6` 兼容性最佳 |
| 不要用中文名 | `.苹方-简-中黑体` 等中文名称在 ImageMagick 中不被识别 |
| 不要带空格 | `PingFang SC` 不行，必须用连字符格式 |
| 用 magick -list font 查询 | 只有列表中精确输出的名称才有效 |
| 静默失败 | 字体错误时不报错，只是中文不显示 |

---

## ⚠️ 异常处理机制

| 异常场景 | 应对策略 |
| -------- | -------- |
| **前置检查失败** | 提示缺失工具，询问是否安装；选择否则终止任务 |
| 字幕获取失败 | 自动切换音频转写 |
| 音频下载失败 | 尝试不同格式/质量 |
| 转写质量差 | 尝试其他语音识别服务 |
| VTT解析失败 | 检查VTT格式，手动指定时间点 |
| 金句定位失败 | 使用模糊匹配，或手动搜索关键词 |
| 视频下载失败 | 重试3次，尝试不同分辨率 |
| 视频下载中断/超时 | 直接重试下载（yt-dlp默认断点续传），必要时降低分辨率或缩短片段 |
| ffmpeg截图失败 | 检查时间戳是否超出视频长度 |
| ImageMagick中文乱码 | 指定中文字体：`-font ".Hiragino-Sans-GB-Interface-W6"` |
| **ImageMagick中文不显示** | **字体名错误，必须用 `.Hiragino-Sans-GB-Interface-W6`（冬青黑体）或 `PingFang-SC-Semibold`（苹方），不能用中文名** |
| 中文字体缺失 | 使用系统默认字体，或指定其他中文字体 |
| Chrome截图失败 | 切换 Playwright：`npx playwright install chromium && npx playwright screenshot ...` |
| Playwright缺少浏览器 | 执行 `npx playwright install chromium` |
| 文件过大无法写入 | 分段写入 |
| 任何步骤失败 | 分析原因，最多重试3次 |
| **HTML行动指南为空** | **正则表达式 `r'(\d+\. .*?)'` 使用非贪婪匹配导致截断** | **使用 `r'(\d+\. .*?)(?=\n\d+\. |\n##)'` 匹配到下一个标题,并添加备用行动指南机制** |

### HTML生成故障排查

| 问题 | 可能原因 | 解决方案 |
|------|---------|---------|
| 行动指南部分为空 | 正则表达式 `.*?` 非贪婪匹配只提取第一个句号前内容 | 使用前瞻断言 `(?=\n\d+\. |\n##)` 匹配完整内容 |
| 行动指南不完整 | 提取逻辑未处理多行文本 | 按 `\n` 分割后逐行处理,保留完整结构 |
| 核心论点为空 | 金字塔分析文档格式变化 | 添加默认值和备用提取逻辑 |
| 金句卡片未显示 | 路径错误或文件未生成 | 验证 `quotes/quote_card_*.png` 文件存在性 |

### 金句截图故障排查

| 问题 | 可能原因 | 解决方案 |
|------|---------|---------|
| 金句在字幕中找不到 | 金句被改写或意译 | 使用原文关键词模糊搜索 |
| 时间戳映射为空 | VTT格式异常 | 检查VTT文件格式，手动解析 |
| ffmpeg截图黑屏 | 时间点在视频开头/结尾 | 调整时间偏移，避开转场 |
| 截图分辨率低 | 视频源分辨率不足 | 可改用1080p：`-f "bestvideo[height<=1080]..."` |
| ImageMagick中文乱码 | 字体不支持中文 | 指定中文字体：`-font ".Hiragino-Sans-GB-Interface-W6"` |
| **中文完全不显示（静默失败）** | **字体名不被识别** | **优先用 `.Hiragino-Sans-GB-Interface-W6`（冬青黑体），备选 `PingFang-SC-Semibold`（苹方），用 `magick -list font \| grep -i Hiragino-Sans-GB` 查询可用字体** |
| 卡片文字被截断 | 金句过长超出图片宽度 | 使用 `textwrap.wrap()` 自动换行（中文25字/行，英文50字符/行） |
| 背景条高度不够 | 换行后文字超出背景 | 根据行数动态计算背景高度 |
| jq命令报错 | JSON格式错误 | 检查timestamp_map.json语法 |
| 视频下载超时 | 网络问题或视频过长 | 使用代理或分段下载 |

---

## 📝 使用示例

**输入**：
```
https://www.youtube.com/watch?v=rtufWBLOXgw
```

**输出**：
```
✅ 任务完成

已生成以下文件：

| 文件 | 说明 |
|------|------|
| transcript_en.txt | 英文原文（160KB） |
| timestamp_map.json | 时间戳映射文件 |
| transcript_zh.md | 中文翻译（20KB） |
| pyramid_analysis_zh.md | 金字塔分析（12KB） |
| quotes/ | 金句截图目录（6条金句） |
| pyramid.html | 可视化HTML页面 |
| pyramid.png | 高质量分享图片（2800×5600px） |

📁 输出目录：Discipline Expert - The Habit That Will Make Or Break Your Entire 2026/
```

---

## 🔄 黄金圈总结

| 层级 | 内容 |
| ---- | ---- |
| WHY | 让播客知识从"听过"变成"学到" |
| HOW | 前置检查 + 六阶段自动化 + 错误自愈 + 深度翻译 + 金句截图 |
| WHAT | 多份成果物：完整英文 + 时间戳映射 + 充实中文 + 深度分析 + 金句卡片 + 可视化 |