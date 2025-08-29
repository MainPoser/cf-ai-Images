/**
 * @author: kared
 * @create_date: 2025-05-10
 * @last_editors: 10000
 * @last_edit_time: 2025-08-29
 * @description: 该Cloudflare Worker脚本处理图像生成和图片上传功能
 */

// 导入HTML模板
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
    description: '将输入图像风格化或变换（需要提供图像URL）',
    key: '@cf/runwayml/stable-diffusion-v1-5-img2img',
    requiresImage: true
  },
  {
    id: 'stable-diffusion-v1-5-inpainting',
    name: 'Stable Diffusion v1.5 局部重绘',
    description: '根据遮罩对局部区域进行重绘（需要图像URL，可选遮罩URL）',
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

export default {
  async fetch(request, env) {
    const originalHost = request.headers.get("host");

    // CORS 头部
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
      const ip = request.headers.get('cf-connecting-ip') || 'unknown';

      // 速率限制检查（每分钟5次）
      const rateLimitKey = `rate_limit_${ip}`;
      const currentTime = Math.floor(Date.now() / 1000);
      const windowStart = currentTime - 60; // 60秒窗口
      
      // 获取当前计数
      let count = 0;
      if (env.RATE_LIMIT_KV) {
        const data = await env.RATE_LIMIT_KV.get(rateLimitKey);
        count = data ? parseInt(data) : 0;
      }
      
      // 检查是否超过限制
      if (count >= 5) {
        return new Response(JSON.stringify({ 
          error: '请求过于频繁，请稍后再试',
          retry_after: 60 - (currentTime - windowStart)
        }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      // 增加计数并保存
      if (env.RATE_LIMIT_KV) {
        await env.RATE_LIMIT_KV.put(rateLimitKey, (count + 1).toString(), {
          expirationTtl: 60 // 60秒过期
        });
      }

      // 处理API请求
      if (path === '/api/models') {
        // 获取可用模型列表
        return new Response(JSON.stringify(AVAILABLE_MODELS), {
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      } else if (path === '/api/prompts') {
        // 获取随机提示词列表
        return new Response(JSON.stringify(RANDOM_PROMPTS), {
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      } else if (path === '/api/config') {
        // 向客户端公开最小配置
        return new Response(JSON.stringify({ 
          require_password: true,
          r2_enabled: !!env.IMAGE_BUCKET
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } else if (path === '/api/auth' && request.method === 'POST') {
        // 执行密码认证并设置cookie
        const data = await request.json().catch(() => ({}));
        
        // 从环境变量获取密码，如果没有则使用默认值
        const passwords = env.PASSWORD ? env.PASSWORD.split(',') : ['admin123'];
        
        const ok = data && typeof data.password === 'string' && passwords.includes(data.password);
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
      } else if (path.startsWith('/api/image/') && env.IMAGE_BUCKET) {
        // 获取R2存储桶中的图片
        const key = path.replace('/api/image/', '');
        const object = await env.IMAGE_BUCKET.get(key);
        
        if (!object) {
          return new Response('图片不存在', { status: 404 });
        }
        
        const headers = new Headers();
        object.writeHttpMetadata(headers);
        headers.set('etag', object.httpEtag);
        
        return new Response(object.body, {
          headers,
        });
      } else if (path === '/api/upload' && request.method === 'POST' && env.IMAGE_BUCKET) {
        // 处理图片上传到R2存储桶
        const formData = await request.formData();
        const file = formData.get('file');
        
        if (!file || typeof file === 'string') {
          return new Response(JSON.stringify({ error: '未选择文件' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
        
        // 生成唯一文件名
        const timestamp = Date.now();
        const randomString = Math.random().toString(36).substring(2, 8);
        const key = `upload_${timestamp}_${randomString}.${file.name.split('.').pop()}`;
        
        // 保存文件到R2
        await env.IMAGE_BUCKET.put(key, file.stream(), {
          httpMetadata: {
            contentType: file.type,
          },
        });
        
        // 返回图片URL
        return new Response(JSON.stringify({ 
          url: `${url.origin}/api/image/${key}`,
          key
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } else if (request.method === 'POST') {
        // 处理图像生成的POST请求
        const data = await request.json();
        
        // 检查是否需要密码（Cookie或请求体）
        const cookieHeader = request.headers.get('cookie') || '';
        const authedByCookie = /(?:^|;\s*)auth=1(?:;|$)/.test(cookieHeader);
        
        // 从环境变量获取密码，如果没有则使用默认值
        const passwords = env.PASSWORD ? env.PASSWORD.split(',') : ['admin123'];
        const authedByBody = data && typeof data.password === 'string' && passwords.includes(data.password);
        
        if (passwords.length > 0 && !(authedByCookie || authedByBody)) {
          return new Response(JSON.stringify({ error: '需要正确的访问密码' }), {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
        
        if ('prompt' in data && 'model' in data) {
          const selectedModel = AVAILABLE_MODELS.find(m => m.id === data.model);
          if (!selectedModel) {
            return new Response(JSON.stringify({ error: '模型无效' }), { 
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }
          
          const model = selectedModel.key;
          let inputs = {};
          const fetchImageToBytes = async (url, label) => {
            const resp = await fetch(url);
            if (!resp.ok) {
              return { error: `${label}获取失败，HTTP ${resp.status}` };
            }
            const ct = resp.headers.get('content-type') || '';
            if (!ct.startsWith('image/')) {
              return { error: `${label}不是图片资源，content-type=${ct}` };
            }
            const cl = parseInt(resp.headers.get('content-length') || '0', 10);
            // 设定10MB上限，避免大文件触发内部错误
            if (cl && cl > 10 * 1024 * 1024) {
              return { error: `${label}体积过大(${(cl/1024/1024).toFixed(2)}MB)，请不超过10MB` };
            }
            const bytes = new Uint8Array(await resp.arrayBuffer());
            return { bytes, contentType: ct, size: bytes.length };
          };
          
          // 辅助函数：数值范围限制
          const clamp = (val, min, max) => Math.max(min, Math.min(max, val));
          
          // 辅助函数：安全处理尺寸参数
          const sanitizeDimension = (val, def = 512) => {
            let v = typeof val === 'number' ? val : def;
            v = clamp(v, 256, 2048);
            // 四舍五入到最近的64倍数
            v = Math.round(v / 64) * 64;
            return v;
          };
          
          // 处理输入参数
          if (data.model === 'flux-1-schnell') {
            let steps = data.num_steps || 6;
            if (steps >= 8) steps = 8;
            else if (steps <= 4) steps = 4;
            
            // 只处理提示词和步数
            inputs = {
              prompt: data.prompt || 'cyberpunk cat',
              steps: steps
            };
          } else if (
            data.model === 'stable-diffusion-v1-5-img2img' ||
            data.model === 'stable-diffusion-v1-5-inpainting'
          ) {
            // 图生图/局部重绘需要图像URL
            if (!data.image_url) {
              return new Response(JSON.stringify({ error: '该模型需要提供 image_url 参数（输入图像 URL）' }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
              });
            }

            // 获取输入图像/遮罩的二进制数据并进行验证
            const imageResult = await fetchImageToBytes(data.image_url, '输入图像');
            if (imageResult.error) {
              return new Response(JSON.stringify({ error: imageResult.error }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
              });
            }

            let maskBytes = undefined;
            if (data.model === 'stable-diffusion-v1-5-inpainting') {
              if (!data.mask_url) {
                return new Response(JSON.stringify({ error: '该模型需要提供 mask_url 参数（遮罩图像 URL）' }), {
                  status: 400,
                  headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
              }
              const maskResult = await fetchImageToBytes(data.mask_url, '遮罩图像');
              if (maskResult.error) {
                return new Response(JSON.stringify({ error: maskResult.error }), {
                  status: 400,
                  headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
              }
              maskBytes = maskResult.bytes;
            }

            // 兼容不同模型的字段命名要求
            inputs = {
              prompt: data.prompt || 'cyberpunk cat',
              negative_prompt: data.negative_prompt || '',
              // 建议使用较小分辨率，避免3001内部错误
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
            // 默认输入参数
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

          console.log(`使用模型 ${model} 生成图像，提示词: ${inputs.prompt.substring(0, 50)}...`);
          
          try {
            // 处理生成数量
            const numOutputs = clamp(parseInt(data.num_outputs, 10) || 1, 1, 8);
            
            // 单次生成函数
            const generateOnce = async (seedOffset = 0) => {
              const localInputs = { ...inputs };
              if (typeof localInputs.seed === 'number') localInputs.seed = localInputs.seed + seedOffset;
              const t0 = Date.now();
              const res = await env.AI.run(model, localInputs);
              const t1 = Date.now();
              return { res, seconds: (t1 - t0) / 1000 };
            };

            // 辅助函数：字节转base64
            const bytesToBase64 = (bytes) => {
              let binary = '';
              const chunk = 0x8000;
              for (let i = 0; i < bytes.length; i += chunk) {
                const sub = bytes.subarray(i, i + chunk);
                binary += String.fromCharCode.apply(null, sub);
              }
              return btoa(binary);
            };

            // 处理多图生成
            if (numOutputs > 1) {
              const tasks = Array.from({ length: numOutputs }, (_, i) => generateOnce(i));
              const results = await Promise.all(tasks);
              const secondsAvg = results.reduce((s, r) => s + r.seconds, 0) / results.length;

              const images = [];
              for (const { res } of results) {
                if (data.model === 'flux-1-schnell') {
                  const json = typeof res === 'object' ? res : JSON.parse(res);
                  if (!json.image) throw new Error('FLUX响应无效: 缺少image字段');
                  images.push(`data:image/png;base64,${json.image}`);
                } else {
                  // 二进制转base64
                  let bytes;
                  if (res instanceof Uint8Array) bytes = res;
                  else if (res && typeof res === 'object' && typeof res.byteLength === 'number') bytes = new Uint8Array(res);
                  else bytes = new Uint8Array(await new Response(res).arrayBuffer());
                  images.push(`data:image/png;base64,${bytesToBase64(bytes)}`);
                }
              }

              return new Response(JSON.stringify({ images }), {
                headers: {
                  ...corsHeaders,
                  'Content-Type': 'application/json',
                  'X-Used-Model': selectedModel.id,
                  'X-Server-Seconds': secondsAvg.toFixed(3),
                }
              });
            }

            // 单图生成
            const { res: response, seconds: serverSeconds } = await generateOnce(0);
  
            // 处理FLUX模型的响应
            if (data.model === 'flux-1-schnell') {
              let jsonResponse;
  
              if (typeof response === 'object') {
                jsonResponse = response;
              } else {
                try {
                  jsonResponse = JSON.parse(response);
                } catch (e) {
                  console.error('JSON解析失败:', e);
                  return new Response(JSON.stringify({ 
                    error: '响应解析失败',
                    details: e.message
                  }), { 
                    status: 500,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                  });
                }
              }
  
              if (!jsonResponse.image) {
                return new Response(JSON.stringify({ 
                  error: '响应格式无效',
                  details: '响应中缺少图像数据'
                }), { 
                  status: 500,
                  headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
              }
  
              try {
                // base64转二进制
                const binaryString = atob(jsonResponse.image);
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                  bytes[i] = binaryString.charCodeAt(i);
                }
  
                // 返回PNG格式的二进制数据
                return new Response(bytes, {
                  headers: {
                    ...corsHeaders,
                    'content-type': 'image/png',
                    'X-Used-Model': selectedModel.id,
                    ...(inputs.seed ? { 'X-Seed': String(inputs.seed) } : {}),
                    'X-Image-Bytes': String(bytes.length),
                    'X-Server-Seconds': serverSeconds.toFixed(3),
                  },
                });
              } catch (e) {
                console.error('base64转二进制失败:', e);
                return new Response(JSON.stringify({ 
                  error: '图像数据处理失败',
                  details: e.message
                }), { 
                  status: 500,
                  headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
              }
            } else {
                // 直接返回二进制响应
                let imageByteSize = undefined;
                try {
                  if (response && typeof response === 'object') {
                    if (response instanceof Uint8Array) imageByteSize = response.length;
                    // ArrayBuffer有byteLength属性
                    if (typeof response.byteLength === 'number') imageByteSize = response.byteLength;
                  }
                } catch (_) {}

                return new Response(response, {
                  headers: {
                    ...corsHeaders,
                    'content-type': 'image/png',
                    'X-Used-Model': selectedModel.id,
                    ...(inputs.seed ? { 'X-Seed': String(inputs.seed) } : {}),
                    ...(imageByteSize ? { 'X-Image-Bytes': String(imageByteSize) } : {}),
                    'X-Server-Seconds': serverSeconds.toFixed(3),
                  },
                });
              }
            } catch (aiError) {
            console.error('AI生成错误:', aiError);
            return new Response(JSON.stringify({ 
              error: '图像生成失败',
              details: aiError && (aiError.message || aiError.toString()),
              model: selectedModel.id
            }), { 
              status: 500,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }
        } else {
          return new Response(JSON.stringify({ error: '缺少必要参数: prompt或model' }), { 
            status: 400, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          });
        }
      } else if (path.endsWith('.html') || path === '/') {
        // 重定向到index.html
        return new Response(HTML.replace(/{{host}}/g, originalHost), {
          status: 200,
          headers: {
            ...corsHeaders,
            "content-type": "text/html"
          }
        });
      } else {
        return new Response('未找到资源', { status: 404 });
      }
    } catch (error) {
      console.error('Worker错误:', error);
      return new Response(JSON.stringify({ error: '内部服务器错误', details: error.message }), { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  },
};
