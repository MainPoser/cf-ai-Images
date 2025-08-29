✨✨ 基于 Cloudflare AI & Workers 的免费在线文生图服务

<p align="center">
  <a href="#" target="_blank" rel="noopener">
    
  </a>
</p>

<div align="center"></br></div>

<div align="center">
  <h1>
    ✨✨ 基于 Cloudflare AI & Workers 的免费在线文生图服务 </br>
  </h1>
</div>

<div align="center">

#📚📚-项目简介 
#✨-主要特性
#🚀🚀-快速开始
#📝📝-使用指南
#⚙⚙️-配置选项

#📊📊-模型限制

</div>

<div align="center"></br></div>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="public/top-dark.png">
  
</picture>

<div align="center"></br></div>

📚📚 项目简介

本项目是基于 https://github.com/huarzone/Text2img-Cloudflare-Workers 的增强版本，在原始基础上增加了多项实用功能。这是一个完全构建在 Cloudflare Workers 上的在线文本生成图像服务，通过调用 Cloudflare 官方提供的 https://developers.cloudflare.com/workers-ai/models/ 模型，实现无需登录的图像生成。

✨✨ 主要特性

• 🚀🚀🚀 完全基于 Cloudflare Workers，无需服务器部署

• 🎨🎨🎨 利用 Cloudflare AI 提供免费高质量文生图模型

• 🐳🐳🐳 支持 FLUX/SDXL 等多个文生图模型

• ⚙⚙⚙️ 支持图像生成的高级选项设置（尺寸、步数、引导系数等）

• 🖼️🖼️ 新增：支持上传参考图进行图生图（img2img）和局部重绘（inpainting）

• 🔢🔢 新增：支持批量生成（一次生成多张图片）并打包下载

• 🔐🔐 支持设置访问密码，私有化部署友好

• ⚡⚡⚡ 响应速度快，全球边缘网络加速

• 🌐🌐 简洁的用户界面，易于使用

• 🌓🌓 支持深色和浅色模式之间切换

• 📱📱 移动端友好，支持各种设备访问

• 📜📜 新增：生成历史记录功能，可随时复用参数

🚀🚀🚀 快速开始

前提条件

• 一个 Cloudflare 账户（https://dash.cloudflare.com/sign-up）

• 确保已启用 Workers AI（目前处于公开测试阶段）

部署步骤

1. 创建新的 Worker：在 Cloudflare 控制面板中找到 "Workers 和 Pages" 菜单，点击 "创建应用程序"，选择 "创建 Worker"，输入标识名称后点击 "部署"。

2. 编辑并部署代码：点击 "编辑代码" 按钮，将 worker.js 内容复制到左侧代码框，再创建 index.html 文件并复制 index.html 内容，然后点击 "保存并部署"。

3. 添加 Workers AI 绑定：返回 Worker 项目面板页，进入 "设置" -> "绑定"，点击 "添加绑定"，选择 Workers AI 类型，变量名称填写 AI，保存并部署。

4. 添加 R2 存储桶绑定（用于图片上传）：
   • 在 Cloudflare 控制台创建 R2 存储桶（名称如 ai-images）

   • 在 Worker 的绑定页面，点击 "添加绑定"，类型选择 "R2 Bucket"，变量名称填写 IMAGE_BUCKET，选择创建的存储桶

   • 保存并部署

5. 配置自定义域名（可选）：在 Worker 的 "设置"-> "域和路由" 中选择 "添加自定义域"，输入你的域名并完成 DNS 配置。

🎉🎉 部署完成后，即可通过 Cloudflare 分配的域名或自定义域名访问你的文生图服务！

📝📝 使用指南

1. 访问应用网址，默认分配的域名为 https://<your-worker-name>.<your-subdomain>.workers.dev/。

2. 输入访问密码：如果设置密码，则需要在页面顶部"访问密码"区域输入访问密码。

3. 填写提示词：
   • 在 "正向提示词" 文本框中描述你想要生成的图像内容，可使用 "随机提示词" 按钮获取灵感

   • 在 "反向提示词" 中添加你想避免的元素

   • 点击提示词下方的建议按钮可快速添加画质、光影等描述

4. 选择模型：从下拉菜单中选择想要使用的文生图模型，根据需求选择合适的模型。

5. 图生图/局部重绘（可选）：
   • 如果选择需要输入图片的模型（如图生图），会出现图片上传区域

   • 点击上传按钮选择本地图片，或直接输入图片URL

   • 对于局部重绘，还需提供遮罩图片URL

6. 调整参数（可选）：
   • 点击"高级选项"中的"显示/隐藏"按钮

   • 调整图像尺寸（256-2048像素，64的倍数）

   • 设置迭代步数（1-20，影响细节和生成时间）

   • 调整引导系数（0-30，控制与提示词的匹配度）

   • 设置随机种子（留空则随机生成）

   • 选择生成数量（1-8张）

7. 生成图像：点击底部的"生成图像"按钮，等待几秒至几十秒不等，系统会在右侧展示生成结果。

8. 管理结果：
   • 单张图像：点击"下载图像"保存图片

   • 多张图像：点击"下载ZIP"打包下载所有图片

   • 点击"复制参数"保存当前生成参数

   • 在历史记录区域可查看和复用之前的生成参数

9. 切换主题：通过页面右上角的月亮/太阳图标按钮在深色和浅色模式之间切换。

⚙⚙⚙️ 配置选项

项目配置主要在 worker.js 文件中进行：

1. 模型设置：在 worker.js 的 AVAILABLE_MODELS 中可添加、删除或修改模型及其介绍。每个模型对象包含：
   {
     id: 'model-id',          // 唯一标识
     name: '模型名称',         // 显示名称
     description: '描述',     // 模型说明
     key: '@cf/...',          // Cloudflare AI 模型键值
     requiresImage: false,     // 是否需要输入图片
     requiresMask: false,     // 是否需要遮罩图片
     recommended_steps: 20,   // 推荐迭代步数
     max_outputs: 5           // 最大生成数量
   }
   

2. 随机提示词：编辑 worker.js 中的 RANDOM_PROMPTS 数组可自定义随机出现的创意提示词库。

3. 访问权限控制：通过在 worker.js 的 PASSWORDS 数组中添加密码来启用访问保护，支持多密码并行，留空则允许无密码访问。

4. 图片上传设置：
   • ALLOWED_IMAGE_TYPES: 允许上传的图片类型（默认：['image/jpeg', 'image/png', 'image/webp']）

   • MAX_IMAGE_SIZE: 最大图片大小（默认：10MB）

注意：所有配置修改都需要重新部署应用后才能生效。

📊📊 模型限制

• Cloudflare Workers 免费版每天有请求数量限制（免费计划每天10万次请求），建议私有化部署使用。

• 图像生成通常需要 3-20 秒左右，与模型选择、迭代步数和图像分辨率有关。

• 不同文生图模型参数的限制存在差异，请查阅官方提供的 https://developers.cloudflare.com/workers-ai/models/ 模型详情页。

• R2 存储有免费额度（每月10GB存储，100万次读取操作），超出会产生费用。

🔧🔧 常见问题

为什么图片生成失败？

• 检查是否输入了访问密码（如果设置了密码）

• 检查模型是否需要输入图片（如图生图模型需要提供图片URL）

• 尝试降低图像分辨率或减少迭代步数

如何提高生成图片的质量？

• 在提示词中添加质量描述词（如"masterpiece, best quality, ultra-detailed"）

• 适当增加迭代步数（但会增加生成时间）

• 尝试不同的模型

如何完全私有化部署？

1. 在 worker.js 中设置强密码
2. 在 Cloudflare 控制台中限制访问IP（设置 -> 触发器 -> 路由）
3. 使用自定义域名并启用HTTPS

🙏🙏 致谢

• 原始项目: https://github.com/huarzone/Text2img-Cloudflare-Workers

• https://workers.cloudflare.com/

• https://developers.cloudflare.com/workers-ai/

• https://stuk.github.io/jszip/ - 用于打包多张图片

<div align="center">
  基于 Cloudflare Workers 构建的开源项目 | 此项目是原始项目的增强版本
</div>
