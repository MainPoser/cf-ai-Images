/**
 * @author: kared
 * @create_date: 2025-05-10
 * @last_editors: 10000
 * @last_edit_time: 2025-08-29
 * @description: 增强版 Cloudflare Worker，处理图像生成、上传、密码认证和速率限制。
 */

// 导入 HTML 模板
import HTML from './index.html';

// 可用模型列表
const AVAILABLE_MODELS = [
  {
    id: 'stable-diffusion-xl-base-1.0',
    name: 'Stable Diffusion XL Base 1.0',
    description: 'Stability AI SDXL 文生图模型',
    key: '@cf/stabilityai/stable-diffusion-xl-base-1.0',
    requiresImage: false
  },
  {
    id: 'flux-1-schnell',
    name: 'FLUX.1 [schnell]',
    description: '精确细节表现的高性能文生图模型',
    key: '@cf/black-forest-labs/flux-1-schnell',
    requiresImage: false
  },
  {
    id: 'dreamshaper-8-lcm',
    name: 'DreamShaper 8 LCM',
    description: '增强图像真实感的 SD 微调模型',
    key: '@cf/lykon/dreamshaper-8-lcm',
    requiresImage: false
  },
  {
    id: 'stable-diffusion-xl-lightning',
    name: 'Stable Diffusion XL Lightning',
    description: '更加高效的文生图模型',
    key: '@cf/bytedance/stable-diffusion-xl-lightning',
    requiresImage: false
  },
  {
    id: 'stable-diffusion-v1-5-img2img',
    name: 'Stable Diffusion v1.5 图生图',
    description: '将输入图像风格化或变换（需要提供图像）',
    key: '@cf/runwayml/stable-diffusion-v1-5-img2img',
    requiresImage: true
  },
  {
    id: 'stable-diffusion-v1-5-inpainting',
    name: 'Stable Diffusion v1.5 局部重绘',
    description: '根据遮罩对局部区域进行重绘（需要图像和遮罩）',
    key: '@cf/runwayml/stable-diffusion-v1-5-inpainting',
    requiresImage: true,
    requiresMask: true
  }
];

// 随机提示词列表
const RANDOM_PROMPTS = [
  'cyberpunk cat samurai graphic art, blood splattered, beautiful colors',
  '1girl, solo, outdoors, camping, night, mountains, nature, stars, moon, tent, twin ponytails, green eyes, cheerful, happy, backpack, sleeping bag, camping stove, water bottle, mountain boots, gloves, sweater, hat, flashlight,forest, rocks, river, wood, smoke, shadows, contrast, clear sky, constellations, Milky Way',
  'masterpiece, best quality, amazing quality, very aesthetic, high resolution, ultra-detailed, absurdres, newest, scenery, anime, anime coloring, (dappled sunlight:1.2), rim light, backlit, dramatic shadow, 1girl, long blonde hair, blue eyes, shiny eyes, parted lips, medium breasts, puffy sleeve white dress, forest, flowers, white butterfly, looking at viewer',
];

// CORS 头部，用于跨域请求
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// 辅助函数：检查用户是否已通过认证
async function isAuthorized(request, env) {
  // 如果没有设置密码，则始终允许访问
  if (!env.PASSWORD) {
    return true;
  }
  // 检查 Cookie
  const cookieHeader = request.headers.get('cookie') || '';
  const authedByCookie = /(?:^|;\s*)auth=1(?:;|$)/.test(cookieHeader);
  if (authedByCookie) {
    return true;
  }
  // 检查 Authorization 头部 (Bearer Token)
  const authHeader = request.headers.get('Authorization') || '';
  const authedByHeader = authHeader.startsWith('Bearer ') && authHeader.substring(7) === env.PASSWORD;

  return authedByHeader;
}

// 辅助函数：根据路径和方法路由请求
const router = {
  // 处理 OPTIONS 预检请求
  'OPTIONS': () => new Response(null, { headers: CORS_HEADERS }),
  
  // 提供可用模型列表
  'GET /api/models': () => new Response(JSON.stringify(AVAILABLE_MODELS), { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }),

  // 提供随机提示词列表
  'GET /api/prompts': () => new Response(JSON.stringify(RANDOM_PROMPTS), { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }),

  // 告诉前端是否需要密码
  'GET /api/config': (request, env) => new Response(JSON.stringify({ require_password: !!env.PASSWORD }), { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }),

  // 处理密码认证
  'POST /api/auth': async (request, env) => {
    // 如果未设置密码，直接认证成功
    if (!env.PASSWORD) {
      return new Response(JSON.stringify({ success: true }), { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }
    const { password } = await request.json().catch(() => ({}));
    if (password === env.PASSWORD) {
      const cookie = `auth=1; Path=/; Max-Age=${7 * 24 * 3600}; HttpOnly; SameSite=Lax; Secure`;
      return new Response(JSON.stringify({ success: true, token: env.PASSWORD }), { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', 'Set-Cookie': cookie } });
    }
    return new Response(JSON.stringify({ error: '密码错误' }), { status: 403, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
  },

  // 处理图片上传到 R2
  'POST /api/upload': async (request, env) => {
    // 权限校验
    if (!await isAuthorized(request, env)) {
      return new Response(JSON.stringify({ error: '需要正确的访问密码' }), { status: 403, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }
    // 检查 R2 绑定和公开 URL 是否已配置
    if (!env.IMAGE_BUCKET || !env.R2_PUBLIC_URL) {
      return new Response(JSON.stringify({ error: '后端 R2 存储未配置' }), { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }

    const file = await request.blob();
    const fileType = file.type;

    // 校验文件类型和大小
    if (!fileType.startsWith('image/')) {
      return new Response(JSON.stringify({ error: '只允许上传图片文件' }), { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }
    if (file.size > 10 * 1024 * 1024) { // 10 MB 限制
      return new Response(JSON.stringify({ error: `文件体积过大(${(file.size / 1024 / 1024).toFixed(2)}MB)，请不超过10MB` }), { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }

    // 生成唯一文件名
    const fileExtension = fileType.split('/')[1] || 'png';
    const fileName = `${Date.now()}-${crypto.randomUUID()}.${fileExtension}`;

    // 上传到 R2
    await env.IMAGE_BUCKET.put(fileName, file, {
      httpMetadata: { contentType: fileType },
    });

    // 返回公开 URL
    const publicUrl = `${env.R2_PUBLIC_URL}/${fileName}`;
    return new Response(JSON.stringify({ url: publicUrl }), { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
  },
  
  // 处理图片生成请求
  'POST /api/generate': async (request, env) => {
    // 速率限制检查
    if (env.RATE_LIMITER) {
      const ip = request.headers.get('cf-connecting-ip');
      const { success } = await env.RATE_LIMITER.limit({ key: ip });
      if (!success) {
        return new Response(JSON.stringify({ error: '请求过于频繁，请稍后再试' }), { status: 429, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
      }
    }
    
    // 权限校验
    if (!await isAuthorized(request, env)) {
      return new Response(JSON.stringify({ error: '需要正确的访问密码' }), { status: 403, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }

    const data = await request.json().catch(() => ({}));
    
    if (!('prompt' in data && 'model' in data)) {
      return new Response(JSON.stringify({ error: '缺少必要参数: prompt 或 model' }), { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }

    const selectedModel = AVAILABLE_MODELS.find(m => m.id === data.model);
    if (!selectedModel) {
      return new Response(JSON.stringify({ error: '模型无效' }), { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }

    // 通用辅助函数
    const clamp = (val, min, max) => Math.max(min, Math.min(max, val));
    const fetchImageToBytes = async (url, label) => {
      const resp = await fetch(url);
      if (!resp.ok) return { error: `${label}获取失败，HTTP ${resp.status}`};
      const ct = resp.headers.get('content-type') || '';
      if (!ct.startsWith('image/')) return { error: `${label}不是图片资源` };
      const bytes = new Uint8Array(await resp.arrayBuffer());
      return { bytes };
    };
    
    // --- 参数处理 ---
    let inputs = {};
    if (selectedModel.requiresImage) {
      if (!data.image_url) return new Response(JSON.stringify({ error: '该模型需要提供 image_url' }), { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }});
      const imageResult = await fetchImageToBytes(data.image_url, '输入图像');
      if (imageResult.error) return new Response(JSON.stringify({ error: imageResult.error }), { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }});
      inputs.image = [...imageResult.bytes];

      if (selectedModel.requiresMask) {
        if (!data.mask_url) return new Response(JSON.stringify({ error: '该模型需要提供 mask_url' }), { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }});
        const maskResult = await fetchImageToBytes(data.mask_url, '遮罩图像');
        if (maskResult.error) return new Response(JSON.stringify({ error: maskResult.error }), { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }});
        inputs.mask = [...maskResult.bytes];
      }
    }
    
    // 合并通用参数
    Object.assign(inputs, {
      prompt: data.prompt || 'cyberpunk cat',
      negative_prompt: data.negative_prompt || '',
      num_steps: clamp(parseInt(data.num_steps, 10) || 20, 1, 50),
      guidance: clamp(parseFloat(data.guidance ?? 7.5), 0.0, 30.0),
      strength: clamp(parseFloat(data.strength ?? 0.8), 0.0, 1.0),
      seed: data.seed || Math.floor(Math.random() * 4294967295),
      height: clamp(parseInt(data.height, 10) || 1024, 256, 2048),
      width: clamp(parseInt(data.width, 10) || 1024, 256, 2048),
    });
    
    // --- 开始生成 ---
    try {
      const numOutputs = clamp(parseInt(data.num_outputs, 10) || 1, 1, 8);
      const generateOnce = async (seedOffset = 0) => {
        const localInputs = { ...inputs };
        if (typeof localInputs.seed === 'number') localInputs.seed += seedOffset;
        const t0 = Date.now();
        const res = await env.AI.run(selectedModel.key, localInputs);
        const t1 = Date.now();
        return { res, seconds: (t1 - t0) / 1000 };
      };

      const bytesToBase64 = (bytes) => {
        let binary = '';
        for (let i = 0; i < bytes.length; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
      };
      
      // 并行生成多张图片
      if (numOutputs > 1) {
        const tasks = Array.from({ length: numOutputs }, (_, i) => generateOnce(i));
        const results = await Promise.all(tasks);
        const secondsAvg = results.reduce((s, r) => s + r.seconds, 0) / results.length;

        const images = results.map(({ res }) => {
          const bytes = new Uint8Array(res);
          return `data:image/png;base64,${bytesToBase64(bytes)}`;
        });
        
        return new Response(JSON.stringify({ images }), { 
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', 'X-Used-Model': selectedModel.id, 'X-Server-Seconds': secondsAvg.toFixed(3) }
        });
      }

      // 生成单张图片
      const { res: response, seconds: serverSeconds } = await generateOnce(0);
      const imageBytes = new Uint8Array(response);
      return new Response(imageBytes, {
        headers: {
          ...CORS_HEADERS, 'content-type': 'image/png', 'X-Used-Model': selectedModel.id,
          'X-Seed': String(inputs.seed), 'X-Image-Bytes': String(imageBytes.length), 'X-Server-Seconds': serverSeconds.toFixed(3),
        }
      });

    } catch (aiError) {
      console.error('AI generation error:', aiError);
      return new Response(JSON.stringify({ error: '图片生成失败', details: aiError.message }), { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }});
    }
  },
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    try {
      // 优先匹配 API 路由
      let handler = router[`${method} ${path}`] || router[method];
      if (handler) {
        return await handler(request, env);
      }
      
      // 如果没有匹配的 API，则提供前端页面
      if (method === 'GET') {
          const originalHost = request.headers.get("host");
          return new Response(HTML.replace(/{{host}}/g, originalHost), {
              headers: { ...CORS_HEADERS, "content-type": "text/html" }
          });
      }

      return new Response('Not Found', { status: 404 });
    } catch (error) {
      console.error('Worker error:', error);
      return new Response(JSON.stringify({ error: '内部服务器错误', details: error.message }), { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }
  },
};
