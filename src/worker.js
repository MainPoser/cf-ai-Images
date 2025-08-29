/**
 * @author: kared
 * @create_date: 2025-05-10
 * @last_editors: 10000
 * @last_edit_time: 2025-08-29
 * @description: This Cloudflare Worker script handles image generation with R2 upload, rate limiting, and environment variables.
 */

// 导入 HTML 模板
import HTML from './index.html';

// --- 配置区域 ---

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
    description: '将输入图像风格化或变换（需要上传本地图片）',
    key: '@cf/runwayml/stable-diffusion-v1-5-img2img',
    requiresImage: true
  },
  {
    id: 'stable-diffusion-v1-5-inpainting',
    name: 'Stable Diffusion v1.5 局部重绘',
    description: '根据遮罩对局部区域进行重绘（需要上传原图和遮罩图）',
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
  'frost_glass, masterpiece, best quality, absurdres, cute girl wearing red Christmas dress, holding small reindeer, hug, braided ponytail, sidelocks, hairclip, hair ornaments, green eyes, (snowy forest, moonlight, Christmas trees), (sparkles, sparkling clothes), frosted, snow, aurora, moon, night, sharp focus, highly detailed, abstract, flowing',
  '1girl, hatsune miku, white pupils, power elements, microphone, vibrant blue color palette, abstract,abstract background, dreamlike atmosphere, delicate linework, wind-swept hair, energy, masterpiece, best quality, amazing quality',
  'cyberpunk cat(neon lights:1.3) clutter,ultra detailed, ctrash, chaotic, low light, contrast, dark, rain ,at night ,cinematic , dystopic, broken ground, tunnels, skyscrapers',
  'Cyberpunk catgirl with purple hair, wearing leather and latex outfit with pink and purple cheetah print, holding a hand gun, black latex brassiere, glowing blue eyes with purple tech sunglasses, tail, large breasts, glowing techwear clothes, handguns, black leather jacket, tight shiny leather pants, cyberpunk alley background, Cyb3rWar3, Cyberware',
  'a wide aerial view of a floating elven city in the sky, with two elven figures walking side by side across a glowing skybridge, the bridge arching between tall crystal towers, surrounded by clouds and golden light, majestic and serene atmosphere, vivid style, magical fantasy architecture',
  'masterpiece, newest, absurdres,incredibly absurdres, best quality, amazing quality, very aesthetic, 1girl, very long hair, blonde, multi-tied hair, center-flap bangs, sunset, cumulonimbus cloud, old tree,sitting in tree, dark blue track suit, adidas, simple bird',
  'beautiful girl, breasts, curvy, looking down scope, looking away from viewer, laying on the ground, laying ontop of jacket, aiming a sniper rifle, dark braided hair, backwards hat, armor, sleeveless, arm sleeve tattoos, muscle tone, dogtags, sweaty, foreshortening, depth of field, at night, night, alpine, lightly snowing, dusting of snow, Closeup, detailed face, freckles',
];


// --- 新增：速率限制配置 ---
// 说明：你需要创建一个 KV 命名空间并将其绑定为 'RATE_LIMITER_KV'
const RATE_LIMIT = {
  WINDOW_SECONDS: 60, // 限制周期（秒）
  MAX_REQUESTS: 10,   // 在一个周期内允许的最大请求数
};

/**
 * 检查 IP 速率限制
 * @param {Request} request - 传入的请求
 * @param {object} env - Worker 的环境变量
 * @returns {Promise<boolean>} - 如果允许请求，则返回 true
 */
async function checkRateLimit(request, env) {
  // 如果没有绑定 KV，则跳过速率限制
  if (!env.RATE_LIMITER_KV) {
    console.log("未绑定 RATE_LIMITER_KV，跳过速率限制。");
    return true;
  }

  // 从请求头中获取客户端 IP 地址
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  const key = `rate-limit:${ip}`;
  
  // 从 KV 中获取当前 IP 的请求记录
  const data = await env.RATE_LIMITER_KV.get(key, { type: 'json' }) || { count: 0, start: Date.now() };

  const now = Date.now();
  const elapsedSeconds = (now - data.start) / 1000;

  if (elapsedSeconds > RATE_LIMIT.WINDOW_SECONDS) {
    // 如果时间窗口已过，重置计数器和开始时间
    data.count = 0;
    data.start = now;
  }

  data.count++;
  
  // 将更新后的记录存回 KV，并设置过期时间（比窗口稍长一点以防边缘情况）
  await env.RATE_LIMITER_KV.put(key, JSON.stringify(data), {
    expirationTtl: RATE_LIMIT.WINDOW_SECONDS + 5
  });

  // 检查请求次数是否超过限制
  return data.count <= RATE_LIMIT.MAX_REQUESTS;
}


export default {
  async fetch(request, env) {
    const originalHost = request.headers.get("host");

    // CORS 响应头
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: corsHeaders
      });
    }

    try {
      const url = new URL(request.url);
      const path = url.pathname;
      
      // --- 修改：从环境变量获取密码 ---
      // PASSWORDS 是一个逗号分隔的字符串
      const passwords = (env.PASSWORDS || "").split(',').map(p => p.trim()).filter(Boolean);

      // --- 新增：认证检查辅助函数 ---
      const isAuthed = (req) => {
        if (passwords.length === 0) return true;
        const cookieHeader = req.headers.get('cookie') || '';
        const authedByCookie = /(?:^|;\s*)auth=1(?:;|$)/.test(cookieHeader);
        return authedByCookie;
      };

      if (path === '/api/models') {
        return new Response(JSON.stringify(AVAILABLE_MODELS), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } else if (path === '/api/prompts') {
        return new Response(JSON.stringify(RANDOM_PROMPTS), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } else if (path === '/api/config') {
        return new Response(JSON.stringify({ require_password: passwords.length > 0 }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } else if (path === '/api/auth' && request.method === 'POST') {
        const data = await request.json().catch(() => ({}));
        const ok = passwords.length === 0 ? true : (data && typeof data.password === 'string' && passwords.includes(data.password));
        if (!ok) {
          return new Response(JSON.stringify({ error: '密码错误' }), {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
        const cookie = `auth=1; Path=/; Max-Age=${7 * 24 * 3600}; HttpOnly; SameSite=Lax; Secure`;
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Set-Cookie': cookie }
        });
      
      // --- 新增：处理图片上传到 R2 的接口 ---
      } else if (path === '/api/upload' && request.method === 'POST') {
        // 检查是否已认证
        if (!isAuthed(request)) {
          return new Response(JSON.stringify({ error: '需要认证才能上传' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }});
        }
        // 检查 R2 是否已绑定
        if (!env.IMAGE_BUCKET) {
          return new Response(JSON.stringify({ error: '服务端未配置 R2 存储桶' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }});
        }

        // 生成一个随机的唯一文件名
        const key = `${crypto.randomUUID()}.png`;
        // 将上传的图片放入 R2，并设置 1 小时后自动删除
        await env.IMAGE_BUCKET.put(key, request.body, {
          httpMetadata: { contentType: 'image/png' },
          customMetadata: { uploadedBy: request.headers.get('cf-connecting-ip') || 'unknown' },
          // 设置对象在 3600 秒（1小时）后过期
          expirationTtl: 3600
        });
        
        // 返回成功信息和文件 key
        return new Response(JSON.stringify({ success: true, key: key }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }});
      
      } else if (request.method === 'POST' && path === '/') { // 图像生成主逻辑
        // --- 新增：在生成图片前进行速率限制检查 ---
        const allowed = await checkRateLimit(request, env);
        if (!allowed) {
          return new Response(JSON.stringify({ error: '请求过于频繁，请稍后再试。' }), {
            status: 429, // 429 Too Many Requests
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const data = await request.json();
        
        // 认证检查
        if (passwords.length > 0 && !isAuthed(request)) {
          return new Response(JSON.stringify({ error: '需要正确的访问密码' }), {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
        
        if ('prompt' in data && 'model' in data) {
          const selectedModel = AVAILABLE_MODELS.find(m => m.id === data.model);
          if (!selectedModel) {
            return new Response(JSON.stringify({ error: '无效的模型' }), { 
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }
          
          const model = selectedModel.key;
          let inputs = {};
          
          // --- 新增：从 R2 获取图片的辅助函数 ---
          const getImageFromR2 = async (key, label) => {
            if (!env.IMAGE_BUCKET) {
              return { error: `服务端未配置 R2 存储桶` };
            }
            if (!key) {
              return { error: `缺少 ${label} 的文件 key` };
            }
            // 从 R2 中获取图片对象
            const object = await env.IMAGE_BUCKET.get(key);
            if (object === null) {
              return { error: `${label} (key: ${key}) 在 R2 中未找到，可能已过期或上传失败` };
            }
            // 将图片内容转为字节数组
            const bytes = new Uint8Array(await object.arrayBuffer());
            return { bytes };
          };

          const clamp = (val, min, max) => Math.max(min, Math.min(max, val));
          const sanitizeDimension = (val, def = 512) => {
            let v = typeof val === 'number' ? val : def;
            v = clamp(v, 256, 2048);
            v = Math.round(v / 64) * 64;
            return v;
          };
          
          // --- 修改：输入参数处理逻辑 ---
          if (data.model === 'flux-1-schnell') {
            let steps = data.num_steps || 6;
            if (steps >= 8) steps = 8;
            else if (steps <= 4) steps = 4;
            
            inputs = {
              prompt: data.prompt || 'cyberpunk cat',
              steps: steps
            };
          } else if (
            data.model === 'stable-diffusion-v1-5-img2img' ||
            data.model === 'stable-diffusion-v1-5-inpainting'
          ) {
            // 图生图 / 局部重绘，现在从 R2 获取图片
            if (!data.image_key) {
              return new Response(JSON.stringify({ error: '该模型需要上传输入图像' }), {
                status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
              });
            }

            const imageResult = await getImageFromR2(data.image_key, '输入图像');
            if (imageResult.error) {
              return new Response(JSON.stringify({ error: imageResult.error }), {
                status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
              });
            }

            let maskBytes = undefined;
            if (data.model === 'stable-diffusion-v1-5-inpainting') {
              if (!data.mask_key) {
                return new Response(JSON.stringify({ error: '该模型需要上传遮罩图像' }), {
                  status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
              }
              const maskResult = await getImageFromR2(data.mask_key, '遮罩图像');
              if (maskResult.error) {
                return new Response(JSON.stringify({ error: maskResult.error }), {
                  status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
              }
              maskBytes = maskResult.bytes;
            }

            inputs = {
              prompt: data.prompt || 'cyberpunk cat',
              negative_prompt: data.negative_prompt || '',
              height: sanitizeDimension(parseInt(data.height, 10) || 512, 512),
              width: sanitizeDimension(parseInt(data.width, 10) || 512, 512),
              num_steps: clamp(parseInt(data.num_steps, 10) || 20, 1, 50),
              strength: clamp(parseFloat(data.strength ?? 0.8), 0.0, 1.0),
              guidance: clamp(parseFloat(data.guidance ?? 7.5), 0.0, 30.0),
              seed: data.seed || parseInt((Math.random() * 1024 * 1024).toString(), 10),
              image: [...imageResult.bytes],
              ...(maskBytes ? { mask: [...maskBytes], mask_image: [...maskBytes] } : {})
            };
          } else {
            // 默认的文生图参数
            inputs = {
              prompt: data.prompt || 'cyberpunk cat',
              negative_prompt: data.negative_prompt || '',
              height: data.height || 1024,
              width: data.width || 1024,
              num_steps: data.num_steps || 20,
              strength: data.strength || 0.1,
              guidance: data.guidance || 7.5,
              seed: data.seed || parseInt((Math.random() * 1024 * 1024).toString(), 10),
            };
          }

          console.log(`使用模型 ${model} 生成图片，提示词: ${inputs.prompt.substring(0, 50)}...`);
          
          try {
            const numOutputs = clamp(parseInt(data.num_outputs, 10) || 1, 1, 8);
            const generateOnce = async (seedOffset = 0) => {
              const localInputs = { ...inputs };
              if (typeof localInputs.seed === 'number') localInputs.seed = localInputs.seed + seedOffset;
              const t0 = Date.now();
              const res = await env.AI.run(model, localInputs);
              const t1 = Date.now();
              return { res, seconds: (t1 - t0) / 1000 };
            };

            const bytesToBase64 = (bytes) => {
              let binary = '';
              const chunk = 0x8000;
              for (let i = 0; i < bytes.length; i += chunk) {
                const sub = bytes.subarray(i, i + chunk);
                binary += String.fromCharCode.apply(null, sub);
              }
              return btoa(binary);
            };

            if (numOutputs > 1) {
              const tasks = Array.from({ length: numOutputs }, (_, i) => generateOnce(i));
              const results = await Promise.all(tasks);
              const secondsAvg = results.reduce((s, r) => s + r.seconds, 0) / results.length;
              const images = [];
              for (const { res } of results) {
                if (data.model === 'flux-1-schnell') {
                  const json = typeof res === 'object' ? res : JSON.parse(res);
                  if (!json.image) throw new Error('从 FLUX 返回的响应无效: 缺少图像');
                  images.push(`data:image/png;base64,${json.image}`);
                } else {
                  let bytes;
                  if (res instanceof Uint8Array) bytes = res;
                  else if (res && typeof res === 'object' && typeof res.byteLength === 'number') bytes = new Uint8Array(res);
                  else bytes = new Uint8Array(await new Response(res).arrayBuffer());
                  images.push(`data:image/png;base64,${bytesToBase64(bytes)}`);
                }
              }
              return new Response(JSON.stringify({ images }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json', 'X-Used-Model': selectedModel.id, 'X-Server-Seconds': secondsAvg.toFixed(3) }
              });
            }

            const { res: response, seconds: serverSeconds } = await generateOnce(0);
  
            if (data.model === 'flux-1-schnell') {
              let jsonResponse = (typeof response === 'object') ? response : JSON.parse(response);
              if (!jsonResponse.image) {
                return new Response(JSON.stringify({ error: '无效响应格式', details: '响应中未找到图像数据' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }});
              }
              const binaryString = atob(jsonResponse.image);
              const bytes = new Uint8Array(binaryString.length);
              for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
              }
              return new Response(bytes, {
                headers: { ...corsHeaders, 'content-type': 'image/png', 'X-Used-Model': selectedModel.id, ...(inputs.seed ? { 'X-Seed': String(inputs.seed) } : {}), 'X-Image-Bytes': String(bytes.length), 'X-Server-Seconds': serverSeconds.toFixed(3) }
              });
            } else {
                let imageByteSize = undefined;
                try {
                  if (response && typeof response === 'object') {
                    if (response instanceof Uint8Array) imageByteSize = response.length;
                    if (typeof response.byteLength === 'number') imageByteSize = response.byteLength;
                  }
                } catch (_) {}
                return new Response(response, {
                  headers: { ...corsHeaders, 'content-type': 'image/png', 'X-Used-Model': selectedModel.id, ...(inputs.seed ? { 'X-Seed': String(inputs.seed) } : {}), ...(imageByteSize ? { 'X-Image-Bytes': String(imageByteSize) } : {}), 'X-Server-Seconds': serverSeconds.toFixed(3) }
                });
              }
            } catch (aiError) {
            console.error('AI 生成错误:', aiError);
            return new Response(JSON.stringify({ error: '图像生成失败', details: aiError && (aiError.message || aiError.toString()), model: selectedModel.id }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }});
          }
        } else {
          return new Response(JSON.stringify({ error: '缺少必要参数: prompt 或 model' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
      } else if (path.endsWith('.html') || path === '/') {
        return new Response(HTML.replace(/{{host}}/g, originalHost), {
          status: 200,
          headers: { ...corsHeaders, "content-type": "text/html" }
        });
      } else {
        return new Response('Not Found', { status: 404 });
      }
    } catch (error) {
      console.error('Worker 错误:', error);
      return new Response(JSON.stringify({ error: '内部服务器错误', details: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }});
    }
  },
};
