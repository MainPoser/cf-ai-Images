/**
 * @author: kared
 * @create_date: 2025-05-10 21:15:59
 * @last_editors: 10000
 * @last_edit_time: 2025-08-29 01:25:36
 * @description: 这个 Cloudflare Worker 脚本用于处理图像生成。
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
    description: '将输入图像风格化或变换（需要提供图像 URL）',
    key: '@cf/runwayml/stable-diffusion-v1-5-img2img',
    requiresImage: true
  },
  {
    id: 'stable-diffusion-v1-5-inpainting',
    name: 'Stable Diffusion v1.5 局部重绘',
    description: '根据遮罩对局部区域进行重绘（需要图像 URL，可选遮罩 URL）',
    key: '@cf/runwayml/stable-diffusion-v1-5-inpainting',
    requiresImage: true,
    requiresMask: true
  }
];

// 随机提示词列表
const RANDOM_PROMPTS = [
  'cyberpunk cat samurai graphic art, blood splattered, beautiful colors',
  '1girl, solo, outdoors, camping, night, mountains, nature, stars, moon, tent, twin ponytails, green eyes, cheerful, happy, backpack, sleeping bag, camping stove, water bottle, mountain boots, gloves, sweater, hat, flashlight, forest, rocks, river, wood, smoke, shadows, contrast, clear sky, constellations, Milky Way',
  'masterpiece, best quality, amazing quality, very aesthetic, high resolution, ultra-detailed, absurdres, newest, scenery, anime, anime coloring, (dappled sunlight:1.2), rim light, backlit, dramatic shadow, 1girl, long blonde hair, blue eyes, shiny eyes, parted lips, medium breasts, puffy sleeve white dress, forest, flowers, white butterfly, looking at viewer',
  'frost_glass, masterpiece, best quality, absurdres, cute girl wearing red Christmas dress, holding small reindeer, hug, braided ponytail, sidelocks, hairclip, hair ornaments, green eyes, (snowy forest, moonlight, Christmas trees), (sparkles, sparkling clothes), frosted, snow, aurora, moon, night, sharp focus, highly detailed, abstract, flowing',
  '1girl, hatsune miku, white pupils, power elements, microphone, vibrant blue color palette, abstract, abstract background, dreamlike atmosphere, delicate linework, wind-swept hair, energy, masterpiece, best quality, amazing quality',
  'cyberpunk cat(neon lights:1.3) clutter, ultra detailed, ctrash, chaotic, low light, contrast, dark, rain, at night, cinematic, dystopic, broken ground, tunnels, skyscrapers',
  'Cyberpunk catgirl with purple hair, wearing leather and latex outfit with pink and purple cheetah print, holding a hand gun, black latex brassiere, glowing blue eyes with purple tech sunglasses, tail, large breasts, glowing techwear clothes, handguns, black leather jacket, tight shiny leather pants, cyberpunk alley background, Cyb3rWar3, Cyberware',
  'a wide aerial view of a floating elven city in the sky, with two elven figures walking side by side across a glowing skybridge, the bridge arching between tall crystal towers, surrounded by clouds and golden light, majestic and serene atmosphere, vivid style, magical fantasy architecture',
  'masterpiece, newest, absurdres, incredibly absurdres, best quality, amazing quality, very aesthetic, 1girl, very long hair, blonde, multi-tied hair, center-flap bangs, sunset, cumulonimbus cloud, old tree, sitting in tree, dark blue track suit, adidas, simple bird',
  'beautiful girl, breasts, curvy, looking down scope, looking away from viewer, laying on the ground, laying on top of jacket, aiming a sniper rifle, dark braided hair, backwards hat, armor, sleeveless, arm sleeve tattoos, muscle tone, dogtags, sweaty, foreshortening, depth of field, at night, night, alpine, lightly snowing, dusting of snow, Closeup, detailed face, freckles'
];

// 导出 Worker 入口函数
export default {
  async fetch(request, env) {
    const originalHost = request.headers.get("host");
    // 解析环境变量中的密码列表 (JSON 字符串数组)
    const PASSWORDS = env.PASSWORDS ? JSON.parse(env.PASSWORDS) : [];
    
    // CORS 响应头
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    // 处理预检请求
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: corsHeaders
      });
    }

    try {
      const url = new URL(request.url);
      const path = url.pathname;

      // 处理 API 请求
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
        // 向客户端暴露是否需要密码登录的最小配置
        return new Response(JSON.stringify({ require_password: PASSWORDS.length > 0 }), {
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      } else if (path === '/api/auth' && request.method === 'POST') {
        // 验证密码并设置 Cookie
        const data = await request.json().catch(() => ({}));
        const ok = PASSWORDS.length === 0 ? true : (data && typeof data.password === 'string' && PASSWORDS.includes(data.password));
        if (!ok) {
          return new Response(JSON.stringify({ error: '密码错误' }), {
            status: 403,
            headers: {
              ...corsHeaders,
              'Content-Type': 'application/json'
            }
          });
        }
        const cookie = `auth=1; Path=/; Max-Age=${7 * 24 * 3600}; HttpOnly; SameSite=Lax; Secure`;
        return new Response(JSON.stringify({ success: true }), {
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
            'Set-Cookie': cookie
          }
        });
      } else if (path === '/api/upload' && request.method === 'POST') {
        // 处理图像上传请求，将图像保存到 R2
        const formData = await request.formData();
        const file = formData.get('file');
        if (!file) {
          return new Response(JSON.stringify({ error: '未提供文件' }), {
            status: 400,
            headers: {
              ...corsHeaders,
              'Content-Type': 'application/json'
            }
          });
        }
        // 生成唯一的文件名：使用时间戳和原始文件名
        const key = `${Date.now()}-${file.name}`;
        // 将文件流写入 R2 存储桶
        await env.IMAGE_BUCKET.put(key, file.stream(), {
          httpMetadata: { contentType: file.type }
        });
        // 返回文件的可访问路径或键
        const origin = `${url.protocol}//${url.host}`;
        const imageUrl = `${origin}/images/${key}`;
        return new Response(JSON.stringify({ key, url: imageUrl }), {
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      } else if (request.method === 'POST') {
        // 处理图像生成的 POST 请求
        const data = await request.json();
        
        // 检查是否需要密码，以及密码是否有效 (通过 Cookie 或 请求体)
        const cookieHeader = request.headers.get('cookie') || '';
        const authedByCookie = /(?:^|;\s*)auth=1(?:;|$)/.test(cookieHeader);
        const authedByBody = data && typeof data.password === 'string' && PASSWORDS.includes(data.password);
        if (PASSWORDS.length > 0 && !(authedByCookie || authedByBody)) {
          return new Response(JSON.stringify({ error: '需要正确的访问密码' }), {
            status: 403,
            headers: {
              ...corsHeaders,
              'Content-Type': 'application/json'
            }
          });
        }
        
        if ('prompt' in data && 'model' in data) {
          const selectedModel = AVAILABLE_MODELS.find(m => m.id === data.model);
          if (!selectedModel) {
            return new Response(JSON.stringify({ error: '无效的模型ID' }), {
              status: 400,
              headers: {
                ...corsHeaders,
                'Content-Type': 'application/json'
              }
            });
          }
          
          const model = selectedModel.key;
          let inputs = {};
          // 辅助：从 URL 拉取图像并转换成字节
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
            // 限制 10MB 大小，避免过大文件引发错误
            if (cl && cl > 10 * 1024 * 1024) {
              return { error: `${label}体积过大(${(cl/1024/1024).toFixed(2)}MB)，请不超过10MB` };
            }
            const bytes = new Uint8Array(await resp.arrayBuffer());
            return { bytes, contentType: ct, size: bytes.length };
          };
          // 限制和标准化函数
          const clamp = (val, min, max) => Math.max(min, Math.min(max, val));
          const sanitizeDimension = (val, def = 512) => {
            let v = typeof val === 'number' ? val : def;
            v = clamp(v, 256, 2048);
            // 四舍五入到最近的 64 的倍数
            v = Math.round(v / 64) * 64;
            return v;
          };
          
          // 根据模型类型处理输入参数
          if (data.model === 'flux-1-schnell') {
            // Flux-1 Schnell 仅使用提示词和步数
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
            // 图生图 / 局部重绘 需要输入图像 URL
            if (!data.image_url) {
              return new Response(JSON.stringify({ error: '该模型需要提供 image_url 参数（输入图像 URL）' }), {
                status: 400,
                headers: {
                  ...corsHeaders,
                  'Content-Type': 'application/json'
                }
              });
            }
            // 拉取输入图像并校验
            const imageResult = await fetchImageToBytes(data.image_url, '输入图像');
            if (imageResult.error) {
              return new Response(JSON.stringify({ error: imageResult.error }), {
                status: 400,
                headers: {
                  ...corsHeaders,
                  'Content-Type': 'application/json'
                }
              });
            }
            let maskBytes = undefined;
            if (data.model === 'stable-diffusion-v1-5-inpainting') {
              // 局部重绘需要遮罩图像 URL
              if (!data.mask_url) {
                return new Response(JSON.stringify({ error: '该模型需要提供 mask_url 参数（遮罩图像 URL）' }), {
                  status: 400,
                  headers: {
                    ...corsHeaders,
                    'Content-Type': 'application/json'
                  }
                });
              }
              const maskResult = await fetchImageToBytes(data.mask_url, '遮罩图像');
              if (maskResult.error) {
                return new Response(JSON.stringify({ error: maskResult.error }), {
                  status: 400,
                  headers: {
                    ...corsHeaders,
                    'Content-Type': 'application/json'
                  }
                });
              }
              maskBytes = maskResult.bytes;
            }
            // 组装图生图/重绘输入
            inputs = {
              prompt: data.prompt || 'cyberpunk cat',
              negative_prompt: data.negative_prompt || '',
              // 建议使用较小分辨率，避免内部错误
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
            // 默认的文生图模型输入参数
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

          // 日志：输出模型和提示词
          console.log(`Generating image with ${model} and prompt: ${inputs.prompt.substring(0, 50)}...`);

          try {
            const numOutputs = clamp(parseInt(data.num_outputs, 10) || 1, 1, 8);
            // 生成单次图像的函数（支持调整随机种子）
            const generateOnce = async (seedOffset = 0) => {
              const localInputs = { ...inputs };
              if (typeof localInputs.seed === 'number') localInputs.seed = localInputs.seed + seedOffset;
              const t0 = Date.now();
              const res = await env.AI.run(model, localInputs);
              const t1 = Date.now();
              return { res, seconds: (t1 - t0) / 1000 };
            };

            // 辅助函数：将二进制转换为 Base64
            const bytesToBase64 = (bytes) => {
              let binary = '';
              const chunk = 0x8000;
              for (let i = 0; i < bytes.length; i += chunk) {
                const sub = bytes.subarray(i, i + chunk);
                binary += String.fromCharCode.apply(null, sub);
              }
              return btoa(binary);
            };

            // 如果需要多张输出
            if (numOutputs > 1) {
              const tasks = Array.from({ length: numOutputs }, (_, i) => generateOnce(i));
              const results = await Promise.all(tasks);
              const secondsAvg = results.reduce((s, r) => s + r.seconds, 0) / results.length;
              const images = [];
              for (const { res } of results) {
                if (data.model === 'flux-1-schnell') {
                  // Flux 模型返回的是 JSON，其中包含 Base64 图像
                  const json = typeof res === 'object' ? res : JSON.parse(res);
                  if (!json.image) throw new Error('来自 FLUX 的响应无效: 缺少图像');
                  images.push(`data:image/png;base64,${json.image}`);
                } else {
                  // 普通模型返回二进制图片，将其转换为 Base64
                  let bytes;
                  if (res instanceof Uint8Array) {
                    bytes = res;
                  } else if (res && typeof res === 'object' && typeof res.byteLength === 'number') {
                    bytes = new Uint8Array(res);
                  } else {
                    bytes = new Uint8Array(await new Response(res).arrayBuffer());
                  }
                  images.push(`data:image/png;base64,${bytesToBase64(bytes)}`);
                }
              }
              // 返回 JSON 格式的多图像结果
              return new Response(JSON.stringify({ images }), {
                headers: {
                  ...corsHeaders,
                  'Content-Type': 'application/json',
                  'X-Used-Model': selectedModel.id,
                  'X-Server-Seconds': secondsAvg.toFixed(3)
                }
              });
            }

            // 单张图片生成
            const { res: response, seconds: serverSeconds } = await generateOnce(0);

            // 如果是 Flux 模型，需要解析 Base64 并返回二进制
            if (data.model === 'flux-1-schnell') {
              let jsonResponse;
              if (typeof response === 'object') {
                jsonResponse = response;
              } else {
                try {
                  jsonResponse = JSON.parse(response);
                } catch (e) {
                  console.error('解析 JSON 响应失败:', e);
                  return new Response(JSON.stringify({
                    error: '解析响应失败',
                    details: e.message
                  }), {
                    status: 500,
                    headers: {
                      ...corsHeaders,
                      'Content-Type': 'application/json'
                    }
                  });
                }
              }
              if (!jsonResponse.image) {
                return new Response(JSON.stringify({
                  error: '响应格式无效',
                  details: '模型响应中未包含图像数据'
                }), {
                  status: 500,
                  headers: {
                    ...corsHeaders,
                    'Content-Type': 'application/json'
                  }
                });
              }
              try {
                // Base64 转二进制
                const binaryString = atob(jsonResponse.image);
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                  bytes[i] = binaryString.charCodeAt(i);
                }
                // 返回 PNG 图片二进制
                return new Response(bytes, {
                  headers: {
                    ...corsHeaders,
                    'content-type': 'image/png',
                    'X-Used-Model': selectedModel.id,
                    ...(inputs.seed ? { 'X-Seed': String(inputs.seed) } : {}),
                    'X-Image-Bytes': String(bytes.length),
                    'X-Server-Seconds': serverSeconds.toFixed(3)
                  }
                });
              } catch (e) {
                console.error('Base64 转二进制失败:', e);
                return new Response(JSON.stringify({
                  error: '图像处理失败',
                  details: e.message
                }), {
                  status: 500,
                  headers: {
                    ...corsHeaders,
                    'Content-Type': 'application/json'
                  }
                });
              }
            } else {
              // 其他模型直接返回二进制图片
              let imageByteSize;
              try {
                if (response && typeof response === 'object') {
                  if (response instanceof Uint8Array) {
                    imageByteSize = response.length;
                  }
                  if (typeof response.byteLength === 'number') {
                    imageByteSize = response.byteLength;
                  }
                }
              } catch (_) {}
              return new Response(response, {
                headers: {
                  ...corsHeaders,
                  'content-type': 'image/png',
                  'X-Used-Model': selectedModel.id,
                  ...(inputs.seed ? { 'X-Seed': String(inputs.seed) } : {}),
                  ...(imageByteSize ? { 'X-Image-Bytes': String(imageByteSize) } : {}),
                  'X-Server-Seconds': serverSeconds.toFixed(3)
                }
              });
            }
          } catch (aiError) {
            console.error('AI 生成错误:', aiError);
            return new Response(JSON.stringify({
              error: '图像生成失败',
              details: aiError && (aiError.message || aiError.toString()),
              model: selectedModel.id
            }), {
              status: 500,
              headers: {
                ...corsHeaders,
                'Content-Type': 'application/json'
              }
            });
          }
        } else {
          return new Response(JSON.stringify({ error: '缺少必要参数: prompt 或 model' }), {
            status: 400,
            headers: {
              ...corsHeaders,
              'Content-Type': 'application/json'
            }
          });
        }
      } else if (path.startsWith('/images/')) {
        // 通过 R2 提供上传的图像
        const key = path.substring('/images/'.length);
        const object = await env.IMAGE_BUCKET.get(key);
        if (object === null) {
          return new Response('未找到', { status: 404 });
        }
        // 构造响应头并返回图像二进制
        const headers = new Headers();
        object.writeHttpMetadata(headers);
        headers.set('Access-Control-Allow-Origin', '*');
        return new Response(object.body, {
          status: 200,
          headers: headers
        });
      } else if (path.endsWith('.html') || path === '/') {
        // 将 HTML 请求重定向到 index.html
        return new Response(HTML.replace(/{{host}}/g, originalHost), {
          status: 200,
          headers: {
            ...corsHeaders,
            'content-type': 'text/html'
          }
        });
      } else {
        // 其他请求未找到
        return new Response('未找到', { status: 404 });
      }
    } catch (error) {
      console.error('Worker 错误:', error);
      return new Response(JSON.stringify({
        error: '内部服务器错误',
        details: error.message
      }), {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
  },
};
