
<div align="center">
  <h1>Text2img · Cloudflare Workers (功能增强版)</h1>
  <p>一个功能强大、开箱即用的在线文生图/图生图服务，完全基于 Cloudflare Workers AI 平台构建。</p>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://github.com/huarzone/Text2img-Cloudflare-Workers/raw/main/public/top-dark.png">
  <img alt="应用截图" src="https://github.com/huarzone/Text2img-Cloudflare-Workers/raw/main/public/top.png">
</picture>

## ✨ 功能亮点

本项目在融合了多个开源方案的基础上，进行了大量功能增强和体验优化，主要特性如下：

-   **全能模型支持**：支持文生图 (SDXL, FLUX)、图生图、局部重绘等多种主流模型。
-   **本地文件上传**：告别图片链接的繁琐，直接从本地上传图片用于“图生图”和“局部重绘”。
-   **批量生成与下载**：支持一次性生成多张图片，并提供画廊式预览和 ZIP 压缩包批量下载。
-   **智能参数建议**：根据所选模型，自动推荐合理的迭代步数和引导系数，降低使用门槛。
-   **企业级安全配置**：
    * **环境变量密码**：通过 Cloudflare 环境变量设置访问密码，安全且易于管理。
    * **IP 速率限制**：内置基于 IP 的请求频率限制，有效防止服务被滥用。
    * **R2 临时存储**：上传的图片存储在 R2 中并会自动过期，保护用户隐私和存储空间。
-   **优秀用户体验**：
    * 明暗双色主题切换。
    * 响应式设计，完美适配移动端。
    * 带有超时的实时生成进度条。
    * 一键复制生成参数，方便分享和复现。

## 🚀 部署教程

部署过程非常简单，你只需要一个 Cloudflare 账号。请遵循以下步骤：

### 第 1 步：准备工作 (Cloudflare 控制台)

在部署代码之前，我们需要先在 Cloudflare 上创建好所需的**存储服务**和**配置**。

1.  **创建 R2 存储桶 (用于图片上传)**
    * 进入 Cloudflare 控制台 → **R2** → 点击“创建存储桶”。
    * 输入一个你喜欢的名称（例如 `ai-image-uploads`），然后点击“创建”。

2.  **创建 KV 命名空间 (用于速率限制)**
    * 进入 Cloudflare 控制台 → **Workers & Pages** → **KV** → 点击“创建命名空间”。
    * 输入一个名称（例如 `AI_RATE_LIMITER`），然后点击“创建”。

### 第 2 步：部署 Worker 并上传代码

1.  **创建 Worker 服务**
    * 进入 Cloudflare 控制台 → **Workers & Pages** → 点击“创建应用程序” → “创建 Worker”。
    * 为你的 Worker 设置一个独特的子域名，然后点击“部署”。

2.  **上传代码文件**
    * 部署成功后，点击“编辑代码”进入在线编辑器。
    * 你会看到一个默认的 `index.js` 或 `_worker.js` 文件。将我们项目中的 `worker.js` 代码**完整粘贴**进去，替换掉原有内容。
    * 点击编辑器左上角的“添加文件”按钮，创建一个名为 `index.html` 的新文件。
    * 将我们项目中的 `index.html` 代码**完整粘贴**到这个新文件中。

### 第 3 步：设置绑定与环境变量

这是最关键的一步，它将你的代码与之前创建的云服务关联起来。

1.  回到你的 Worker 管理页面，点击 **设置** → **绑定**。
2.  在“绑定”页面，点击“添加绑定”三次，分别完成以下配置：
    * **Workers AI**:
        * 变量名称: `AI`
        * (无需选择命名空间)
    * **R2 存储桶**:
        * 变量名称: `IMAGE_BUCKET`
        * R2 命名空间: 选择你在第 1 步创建的 R2 存储桶。
    * **KV 命名空间**:
        * 变量名称: `RATE_LIMITER_KV`
        * KV 命名空间: 选择你在第 1 步创建的 KV 命名空间。

3.  接下来，点击 **设置** → **变量**。
4.  在“环境变量”部分，点击“添加变量”，设置你的访问密码：
    * 变量名称: `PASSWORDS`
    * 变量值: 输入你的密码，例如 `10000`。
    * *提示：如果将此变量留空或不创建，则网站无需密码即可公开访问。*

### 第 4 步：完成部署

1.  完成所有设置后，回到“编辑代码”界面。
2.  点击右上角的 **部署** 按钮。
3.  等待片刻，部署完成后访问你的 Worker 地址 (`https://<你的名称>.<你的子域>.workers.dev`) 即可开始使用！

## 🙏 致谢

本项目是在以下优秀开源项目的基础上进行二次开发和功能增强的，感谢原作者的无私分享：

-   **[zhumengkang/cf-ai-image](https://github.com/zhumengkang/cf-ai-image)**
-   **[huarzone/Text2img-Cloudflare-Workers](https://github.com/huarzone/Text2img-Cloudflare-Workers)**

