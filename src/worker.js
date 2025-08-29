/**
 * @author: kared
 * @create_date: 2025-05-10 21:15:59
 * @last_editors: kared
 * @last_edit_time: 2025-08-29 12:30:00
 * @description: This Cloudflare Worker script handles image generation, file uploads to R2, and basic rate limiting.
 */

// import html template
import HTML from './index.html';

/**
 * 可用模型清单（名称与 description 按要求保持不变）
 * 注意：key 为 Workers AI 模型标识，建议与 Cloudflare 官方目录保持一致
 */
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

/**
 * 随机提示词清单
 */
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

/**
 * 简易速率限制（内存态，按 IP 限制）
 * 说明：Workers 多实例情况下非强一致，此实现为“尽力而为”，充分保护需使用 DO/KV。
 */
const RATE_LIMIT_CACHE = new Map(); // key: ip, value: { count, resetAt }

/**
 * 生成随机键名（用于 R2 对象）
 */
function randomKey(ext = 'png') {
  const t = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const ts = `${t.getUTCFullYear()}${pad(t.getUTCMonth() + 1)}${pad(t.getUTCDate())}-${pad(t.getUTCHours())}${pad(t.getUTCMinutes())}${pad(t.getUTCSeconds())}`;
  const rand = Math.random().toString(36).slice(2, 10);
  return `uploads/${ts}-${rand}.${ext}`;
}

/**
 * 从请求中获取客户端 IP
 */
function getClientIP(request) {
  return request.headers.get('CF-Connecting-IP') ||
         request.headers.get('x-forwarded-for') ||
         '0.0.0.0';
}

/**
 * 速率限制检查
 * 每分钟最多生成 N 张（含多图一次性提交）
 */
function checkRateLimit(ip, imagesRequested, limit = 5) {
  const now = Date.now();
  const rec = RATE_LIMIT_CACHE.get(ip);
  if (!rec || now >= rec.resetAt) {
    RATE_LIMIT_CACHE.set(ip, { count: imagesRequested, resetAt: now + 60 * 1000 });
    return { allowed: true, remaining: Math.max(0, limit - imagesRequested), resetIn: 60 };
  }
  const newCount = rec.count + imagesRequested;
  const remaining = Math.max(0, limit - newCount);
  if (newCount > limit) {
    return { allowed: false, remaining: 0, resetIn: Math.ceil((rec.resetAt - now) / 1000) };
  }
  rec.count = newCount;
  return { allowed: true, remaining, resetIn: Math.ceil((rec.resetAt - now) / 1000) };
}

/**
 * 解析 Content-Type 以决定响应类型
 */
function guessContentTypeByExt(key) {
  const lower = key.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  return 'application/octet-stream';
}

/**
 * 将 File/ArrayBuffer 转为 Uint8Array
 */
async function fileToUint8(file) {
  const buf = await file.arrayBuffer();
  return new Uint8Array(buf);
}

export default {
  async fetch(request, env) {
    // CORS 头（开放给浏览器直连；如需限制来源可按需替换）
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      const url = new URL(request.url);
      const path = url.pathname;
      const originalHost = request.headers.get("host");

      // 环境配置（密码优先由环境变量提供；为空表示不启用密码）
      const PASSWORD = (env.PASSWORD || '').trim();
      const REQUIRE_PASSWORD = PASSWORD.length > 0;

      // 基础工具函数
      const json = (obj, status = 200, extra = {}) =>
        new Response(JSON.stringify(obj), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json', ...extra } });

      const unauthorized = () => json({ error: '需要正确的访问密码' }, 403);
      const getCookie = (name) => {
        const cookieHeader = request.headers.get('cookie') || '';
        const m = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
        return m ? decodeURIComponent(m[1]) : '';
      };
      const setAuthCookie = () => {
        const cookie = `auth=1; Path=/; Max-Age=${7 * 24 * 3600}; HttpOnly; SameSite=Lax; Secure`;
        return cookie;
      };
      const isAuthed = () => {
        if (!REQUIRE_PASSWORD) return true;
        const authedByCookie = getCookie('auth') === '1';
        return authedByCookie;
      };

      // 公开 API
      if (path === '/api/models' && request.method === 'GET') {
        return json(AVAILABLE_MODELS);
      }

      if (path === '/api/prompts' && request.method === 'GET') {
        return json(RANDOM_PROMPTS);
      }

      if (path === '/api/config' && request.method === 'GET') {
        return json({ require_password: REQUIRE_PASSWORD });
      }

      if (path === '/api/auth' && request.method === 'POST') {
        // 登录认证：校验 body.password 与 env.PASSWORD
        const data = await request.json().catch(() => ({}));
        const ok = !REQUIRE_PASSWORD || (data && typeof data.password === 'string' && data.password === PASSWORD);
        if (!ok) return json({ error: '密码错误' }, 403);
        return json({ success: true }, 200, { 'Set-Cookie': setAuthCookie() });
      }

      // R2 上传接口：接收 multipart/form-data，字段 image 或 mask（二选一或都传）
      if (path === '/api/upload' && request.method === 'POST') {
        if (!isAuthed()) return unauthorized();
        if (!env.IMAGE_BUCKET) return json({ error: 'R2 bucket not bound' }, 500);

        const contentType = request.headers.get('content-type') || '';
        if (!contentType.includes('multipart/form-data')) {
          return json({ error: 'Content-Type must be multipart/form-data' }, 400);
        }

        const form = await request.formData();
        const imageFile = form.get('image');
        const maskFile = form.get('mask');

        if (!imageFile && !maskFile) {
          return json({ error: 'No file provided: "image" or "mask" is required' }, 400);
        }

        const results = {};
        // 上传文件方法（限制大小 10MB）
        const uploadOne = async (file, kind) => {
          if (!(file instanceof File)) return { error: `${kind} is invalid` };
          const size = file.size;
          if (size > 10 * 1024 * 1024) return { error: `${kind} too large, max 10MB` };
          const ext = (() => {
            const n = (file.name || '').toLowerCase();
            if (n.endsWith('.png')) return 'png';
            if (n.endsWith('.jpg') || n.endsWith('.jpeg')) return 'jpg';
            if (n.endsWith('.webp')) return 'webp';
            if (n.endsWith('.gif')) return 'gif';
            return 'png';
          })();
          const key = randomKey(ext);
          const bytes = await fileToUint8(file);
          await env.IMAGE_BUCKET.put(key, bytes, {
            httpMetadata: { contentType: file.type || guessContentTypeByExt(key) },
          });
          // 通过 Worker 暴露 GET /r2/:key 访问
          const publicUrl = `${url.origin}/r2/${encodeURIComponent(key)}`;
          return { key, url: publicUrl };
        };

        if (imageFile) {
          const r = await uploadOne(imageFile, 'image');
          if (r.error) return json({ error: r.error }, 400);
          results.image_key = r.key;
          results.image_url = r.url;
        }
        if (maskFile) {
          const r = await uploadOne(maskFile, 'mask');
          if (r.error) return json({ error: r.error }, 400);
          results.mask_key = r.key;
          results.mask_url = r.url;
        }

        return json(results);
      }

      // R2 文件读取：GET /r2/:key
      if (path.startsWith('/r2/')) {
        if (!env.IMAGE_BUCKET) return new Response('R2 not configured', { status: 500 });
        const key = decodeURIComponent(path.replace('/r2/', ''));
        if (!key || key.includes('..')) return new Response('Bad key', { status: 400 });
        const obj = await env.IMAGE_BUCKET.get(key);
        if (!obj) return new Response('Not Found', { status: 404 });
        const ct = obj.httpMetadata?.contentType || guessContentTypeByExt(key);
        const headers = {
          ...corsHeaders,
          'Content-Type': ct,
          'Cache-Control': 'public, max-age=31536000, immutable'
        };
        return new Response(obj.body, { headers });
      }

      // 核心生成接口（POST /）
      if (request.method === 'POST' && path === '/') {
        // 身份校验：优先 Cookie，若未登录且启用密码，可允许 body 附带 password 首次使用
        const bodyData = await request.json().catch(() => ({}));
        if (REQUIRE_PASSWORD) {
          const authed = isAuthed() || (bodyData && typeof bodyData.password === 'string' && bodyData.password === PASSWORD);
          if (!authed) return unauthorized();
        }

        // 速率限制：按 IP 与请求图片张数
        const ip = getClientIP(request);
        const numOutputsRequested = Math.max(1, Math.min(8, parseInt(bodyData.num_outputs, 10) || 1));
        const rate = checkRateLimit(ip, numOutputsRequested);
        if (!rate.allowed) {
          return json(
            { error: 'Rate limit exceeded', details: `Try again in ${rate.resetIn}s` },
            429,
            { 'Retry-After': String(rate.resetIn) }
          );
        }

        // 参数校验
        if (!('prompt' in bodyData) || !('model' in bodyData)) {
          return json({ error: 'Missing required parameter: prompt or model' }, 400);
        }
        const selectedModel = AVAILABLE_MODELS.find(m => m.id === bodyData.model);
        if (!selectedModel) {
          return json({ error: 'Model is invalid' }, 400);
        }

        // 工具函数：下载远程图片为二进制（增加安全校验与大小限制）
        const fetchImageToBytes = async (srcUrl, label) => {
          const resp = await fetch(srcUrl);
          if (!resp.ok) {
            return { error: `${label} fetch failed, HTTP ${resp.status}` };
          }
          const ct = resp.headers.get('content-type') || '';
          if (!ct.startsWith('image/')) {
            return { error: `${label} is not image, content-type=${ct}` };
          }
          // 流式读取并限制 10MB
          const reader = resp.body.getReader();
          const chunks = [];
          let total = 0;
          const limit = 10 * 1024 * 1024;
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            total += value.byteLength;
            if (total > limit) return { error: `${label} too large (>10MB)` };
            chunks.push(value);
          }
          const bytes = new Uint8Array(total);
          let offset = 0;
          for (const c of chunks) {
            bytes.set(c, offset);
            offset += c.byteLength;
          }
          return { bytes, contentType: ct, size: total };
        };

        // 参数规整与限制
        const clamp = (val, min, max) => Math.max(min, Math.min(max, val));
        const sanitizeDimension = (val, def = 512) => {
          let v = typeof val === 'number' ? val : def;
          v = clamp(v, 256, 2048);
          v = Math.round(v / 64) * 64; // 64 对齐
          return v;
        };

        const model = selectedModel.key;
        let inputs = {};

        if (bodyData.model === 'flux-1-schnell') {
          let steps = bodyData.num_steps || 6;
          if (steps >= 8) steps = 8;
          else if (steps <= 4) steps = 4;
          inputs = {
            prompt: bodyData.prompt || 'cyberpunk cat',
            steps
          };
        } else if (
          bodyData.model === 'stable-diffusion-v1-5-img2img' ||
          bodyData.model === 'stable-diffusion-v1-5-inpainting'
        ) {
          if (!bodyData.image_url) {
            return json({ error: '该模型需要提供 image_url 参数（输入图像 URL）' }, 400);
          }
          const imageResult = await fetchImageToBytes(bodyData.image_url, '输入图像');
          if (imageResult.error) return json({ error: imageResult.error }, 400);

          let maskBytes = undefined;
          if (bodyData.model === 'stable-diffusion-v1-5-inpainting') {
            if (!bodyData.mask_url) {
              return json({ error: '该模型需要提供 mask_url 参数（遮罩图像 URL）' }, 400);
            }
            const maskResult = await fetchImageToBytes(bodyData.mask_url, '遮罩图像');
            if (maskResult.error) return json({ error: maskResult.error }, 400);
            maskBytes = maskResult.bytes;
          }

          inputs = {
            prompt: bodyData.prompt || 'cyberpunk cat',
            negative_prompt: bodyData.negative_prompt || '',
            height: sanitizeDimension(parseInt(bodyData.height, 10) || 512, 512),
            width: sanitizeDimension(parseInt(bodyData.width, 10) || 512, 512),
            num_steps: clamp(parseInt(bodyData.num_steps, 10) || 20, 1, 50),
            strength: clamp(parseFloat(bodyData.strength ?? 0.8), 0.0, 1.0),
            guidance: clamp(parseFloat(bodyData.guidance ?? 7.5), 0.0, 30.0),
            seed: bodyData.seed || parseInt((Math.random() * 1024 * 1024).toString(), 10),
            image: [...imageResult.bytes],
            ...(maskBytes ? { mask: [...maskBytes], mask_image: [...maskBytes] } : {})
          };
        } else {
          inputs = {
            prompt: bodyData.prompt || 'cyberpunk cat',
            negative_prompt: bodyData.negative_prompt || '',
            height: sanitizeDimension(parseInt(bodyData.height, 10) || 1024, 1024),
            width: sanitizeDimension(parseInt(bodyData.width, 10) || 1024, 1024),
            num_steps: clamp(parseInt(bodyData.num_steps, 10) || 20, 1, 50),
            strength: clamp(parseFloat(bodyData.strength ?? 0.1), 0.0, 1.0),
            guidance: clamp(parseFloat(bodyData.guidance ?? 7.5), 0.0, 30.0),
            seed: bodyData.seed || parseInt((Math.random() * 1024 * 1024).toString(), 10),
          };
        }

        console.log(`Generating with model=${selectedModel.id}, prompt="${String(inputs.prompt).slice(0, 64)}..."`);

        // 生成工具
        const bytesToBase64 = (bytes) => {
          let binary = '';
          const chunk = 0x8000;
          for (let i = 0; i < bytes.length; i += chunk) {
            const sub = bytes.subarray(i, i + chunk);
            binary += String.fromCharCode.apply(null, sub);
          }
          return btoa(binary);
        };
        const numOutputs = clamp(parseInt(bodyData.num_outputs, 10) || 1, 1, 8);

        const generateOnce = async (seedOffset = 0) => {
          const localInputs = { ...inputs };
          if (typeof localInputs.seed === 'number') localInputs.seed = localInputs.seed + seedOffset;
          const t0 = Date.now();
          const res = await env.AI.run(model, localInputs);
          const t1 = Date.now();
          return { res, seconds: (t1 - t0) / 1000 };
        };

        try {
          if (numOutputs > 1) {
            // 简单并发（全部并发），如需限流可改为分批
            const tasks = Array.from({ length: numOutputs }, (_, i) => generateOnce(i));
            const results = await Promise.all(tasks);
            const secondsAvg = results.reduce((s, r) => s + r.seconds, 0) / results.length;

            const images = [];
            for (const { res } of results) {
              if (bodyData.model === 'flux-1-schnell') {
                const jsonRes = typeof res === 'object' ? res : JSON.parse(res);
                if (!jsonRes.image) throw new Error('Invalid response from FLUX: missing image');
                images.push(`data:image/png;base64,${jsonRes.image}`);
              } else {
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

          const { res: response, seconds: serverSeconds } = await generateOnce(0);

          if (bodyData.model === 'flux-1-schnell') {
            let jsonResponse;
            if (typeof response === 'object') jsonResponse = response;
            else {
              try {
                jsonResponse = JSON.parse(response);
              } catch (e) {
                console.error('Failed to parse JSON response:', e);
                return json({ error: 'Failed to parse response', details: e.message }, 500);
              }
            }
            if (!jsonResponse.image) {
              return json({ error: 'Invalid response format', details: 'Image data not found in response' }, 500);
            }
            try {
              const binaryString = atob(jsonResponse.image);
              const bytes = new Uint8Array(binaryString.length);
              for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
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
              console.error('Failed to convert base64 to binary:', e);
              return json({ error: 'Failed to process image data', details: e.message }, 500);
            }
          } else {
            let imageByteSize = undefined;
            try {
              if (response && typeof response === 'object') {
                if (response instanceof Uint8Array) imageByteSize = response.length;
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
          console.error('AI generation error:', aiError);
          return json({
            error: 'Image generation failed',
            details: aiError && (aiError.message || String(aiError)),
            model: selectedModel.id
          }, 500);
        }
      }

      // HTML 页面
      if (path.endsWith('.html') || path === '/') {
        return new Response(HTML.replace(/{{host}}/g, originalHost), {
          status: 200,
          headers: { ...corsHeaders, "content-type": "text/html" }
        });
      }

      // 其它未命中路由
      return new Response('Not Found', { status: 404, headers: corsHeaders });
    } catch (error) {
      console.error('Worker error:', error);
      return new Response(JSON.stringify({ error: 'Internal server error', details: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  },
};
