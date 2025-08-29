/**
 * @author: 10000
 * @last_edit_time: 2025-08-29
 * @description: 增强版AI文生图服务Worker
 */

// 可用模型列表
const AVAILABLE_MODELS = [
  {
    id: 'stable-diffusion-xl-base-1.0',
    name: 'Stable Diffusion XL Base 1.0',
    description: 'Stability AI SDXL文生图模型',
    key: '@cf/stabilityai/stable-diffusion-xl-base-1.0',
    requiresImage: false,
    recommended_steps: 20,
    max_outputs: 5
  },
  {
    id: 'flux-1-schnell',
    name: 'FLUX.1 [schnell]',
    description: '高性能文生图模型',
    key: '@cf/black-forest-labs/flux-1-schnell',
    requiresImage: false,
    recommended_steps: 6,
    max_outputs: 4
  },
  {
    id: 'dreamshaper-8-lcm',
    name: 'DreamShaper 8 LCM',
    description: '增强图像真实感的SD微调模型',
    key: '@cf/lykon/dreamshaper-8-lcm',
    requiresImage: false,
    recommended_steps: 8,
    max_outputs: 6
  },
  {
    id: 'stable-diffusion-xl-lightning',
    name: 'Stable Diffusion XL Lightning',
    description: '高效文生图模型',
    key: '@cf/bytedance/stable-diffusion-xl-lightning',
    requiresImage: false,
    recommended_steps: 10,
    max_outputs: 8
  },
  {
    id: 'stable-diffusion-v1-5-img2img',
    name: 'Stable Diffusion v1.5 图生图',
    description: '将输入图像风格化或变换',
    key: '@cf/runwayml/stable-diffusion-v1-5-img2img',
    requiresImage: true,
    recommended_steps: 20,
    max_outputs: 3
  },
  {
    id: 'stable-diffusion-v1-5-inpainting',
    name: 'Stable Diffusion v1.5 局部重绘',
    description: '根据遮罩对局部区域重绘',
    key: '@cf/runwayml/stable-diffusion-v1-5-inpainting',
    requiresImage: true,
    requiresMask: true,
    recommended_steps: 25,
    max_outputs: 2
  }
];

// 随机提示词库
const RANDOM_PROMPTS = [
  'cyberpunk cat samurai graphic art, blood splattered, beautiful colors',
  '1girl, solo, outdoors, camping, night, mountains, nature, stars, moon, tent',
  'masterpiece, best quality, high resolution, ultra-detailed',
  'frost_glass, cute girl wearing red Christmas dress, holding small reindeer',
  '1girl, hatsune miku, white pupils, power elements, microphone',
];

// 访问密码
const PASSWORDS = ['10000'];

// 图片上传配置
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS 头部
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    // 处理预检请求
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // 处理API请求
      switch (true) {
        case path === '/api/models':
          return handleModelsRequest(corsHeaders);
        
        case path === '/api/prompts':
          return handlePromptsRequest(corsHeaders);
        
        case path === '/api/config':
          return handleConfigRequest(corsHeaders);
        
        case path === '/api/auth' && request.method === 'POST':
          return handleAuthRequest(request, corsHeaders);
        
        case path === '/api/upload' && request.method === 'POST':
          return handleUploadRequest(request, env, corsHeaders);
        
        case path.startsWith('/images/'):
          return handleImageRequest(path, env);
        
        case path === '/api/model-config':
          return handleModelConfigRequest(url, corsHeaders);
        
        case request.method === 'POST' && path === '/':
          return handleImageGeneration(request, env, corsHeaders);
        
        default:
          return new Response('Not Found', { status: 404 });
      }
    } catch (error) {
      console.error(`Worker error: ${error.message}`);
      return new Response(JSON.stringify({ 
        error: 'Internal server error', 
        details: error.message 
      }), { 
        status: 500,
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        }
      });
    }
  }
};

// 处理模型列表请求
function handleModelsRequest(corsHeaders) {
  return new Response(JSON.stringify(AVAILABLE_MODELS), {
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json'
    }
  });
}

// 处理提示词请求
function handlePromptsRequest(corsHeaders) {
  return new Response(JSON.stringify(RANDOM_PROMPTS), {
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json'
    }
  });
}

// 处理配置请求
function handleConfigRequest(corsHeaders) {
  return new Response(JSON.stringify({ 
    require_password: PASSWORDS.length > 0 
  }), {
    headers: { 
      ...corsHeaders, 
      'Content-Type': 'application/json' 
    }
  });
}

// 处理认证请求
async function handleAuthRequest(request, corsHeaders) {
  try {
    const data = await request.json();
    const validPassword = PASSWORDS.length === 0 || 
      (data.password && PASSWORDS.includes(data.password));
    
    if (!validPassword) {
      return new Response(JSON.stringify({ error: '密码错误' }), {
        status: 403,
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        }
      });
    }
    
    // 设置认证cookie (7天有效期)
    const cookie = `auth=1; Path=/; Max-Age=${7 * 24 * 3600}; HttpOnly; SameSite=Lax; Secure`;
    return new Response(JSON.stringify({ success: true }), {
      headers: { 
        ...corsHeaders, 
        'Content-Type': 'application/json', 
        'Set-Cookie': cookie 
      }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: '无效请求' }), {
      status: 400,
      headers: { 
        ...corsHeaders, 
        'Content-Type': 'application/json' 
      }
    });
  }
}

// 处理图片上传请求
async function handleUploadRequest(request, env, corsHeaders) {
  try {
    const formData = await request.formData();
    const file = formData.get('image');
    
    if (!file || typeof file !== 'object') {
      return new Response(JSON.stringify({ error: '无效的图片文件' }), {
        status: 400,
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        }
      });
    }
    
    // 验证文件类型
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      return new Response(JSON.stringify({ 
        error: '不支持的文件类型',
        allowed_types: ALLOWED_IMAGE_TYPES
      }), {
        status: 400,
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        }
      });
    }
    
    // 验证文件大小
    if (file.size > MAX_IMAGE_SIZE) {
      return new Response(JSON.stringify({ 
        error: '文件过大',
        max_size: `${MAX_IMAGE_SIZE / 1024 / 1024}MB`
      }), {
        status: 400,
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        }
      });
    }
    
    // 生成唯一文件名
    const fileExt = file.type.split('/')[1] || 'bin';
    const filename = `upload-${Date.now()}-${Math.random().toString(36).substring(2, 8)}.${fileExt}`;
    
    // 保存到R2存储
    await env.IMAGE_BUCKET.put(filename, file.stream());
    
    // 返回图片URL
    return new Response(JSON.stringify({ 
      url: `${url.origin}/images/${filename}` 
    }), {
      headers: { 
        ...corsHeaders, 
        'Content-Type': 'application/json' 
      }
    });
    
  } catch (error) {
    return new Response(JSON.stringify({ 
      error: '上传处理失败',
      details: error.message
    }), {
      status: 500,
      headers: { 
        ...corsHeaders, 
        'Content-Type': 'application/json' 
      }
    });
  }
}

// 处理图片获取请求
async function handleImageRequest(path, env) {
  const filename = path.split('/').pop();
  if (!filename) return new Response('Invalid filename', { status: 400 });
  
  try {
    const object = await env.IMAGE_BUCKET.get(filename);
    if (!object) return new Response('Not Found', { status: 404 });
    
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);
    headers.set('Cache-Control', 'public, max-age=31536000');
    
    return new Response(object.body, { headers });
  } catch (error) {
    return new Response('Error retrieving image', { status: 500 });
  }
}

// 处理模型配置请求
function handleModelConfigRequest(url, corsHeaders) {
  const modelId = url.searchParams.get('id');
  const model = AVAILABLE_MODELS.find(m => m.id === modelId);
  
  if (!model) {
    return new Response(JSON.stringify({ error: '模型未找到' }), {
      status: 404,
      headers: { 
        ...corsHeaders, 
        'Content-Type': 'application/json' 
      }
    });
  }
  
  // 返回模型配置
  const config = {
    recommended_steps: model.recommended_steps,
    max_outputs: model.max_outputs,
    requires_image: model.requiresImage,
    requires_mask: model.requiresMask
  };
  
  return new Response(JSON.stringify(config), {
    headers: { 
      ...corsHeaders, 
      'Content-Type': 'application/json' 
    }
  });
}

// 处理图片生成请求
async function handleImageGeneration(request, env, corsHeaders) {
  try {
    const data = await request.json();
    
    // 检查认证状态
    const cookieHeader = request.headers.get('cookie') || '';
    const authedByCookie = /(?:^|;\s*)auth=1(?:;|$)/.test(cookieHeader);
    const authedByBody = data.password && PASSWORDS.includes(data.password);
    
    if (PASSWORDS.length > 0 && !(authedByCookie || authedByBody)) {
      return new Response(JSON.stringify({ error: '需要正确的访问密码' }), {
        status: 403,
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        }
      });
    }
    
    // 验证必需参数
    if (!data.prompt || !data.model) {
      return new Response(JSON.stringify({ 
        error: '缺少必要参数: prompt 或 model' 
      }), {
        status: 400,
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        }
      });
    }
    
    const selectedModel = AVAILABLE_MODELS.find(m => m.id === data.model);
    if (!selectedModel) {
      return new Response(JSON.stringify({ error: '模型无效' }), { 
        status: 400,
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        }
      });
    }
    
    // 准备模型输入
    const inputs = prepareModelInputs(data, selectedModel);
    
    // 设置超时（120秒）
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000);
    
    // 执行AI模型
    const startTime = Date.now();
    const response = await env.AI.run(
      selectedModel.key, 
      inputs, 
      { signal: controller.signal }
    );
    clearTimeout(timeoutId);
    
    const processingTime = ((Date.now() - startTime) / 1000).toFixed(3);
    
    // 处理模型响应
    return handleModelResponse(response, selectedModel, processingTime, corsHeaders);
    
  } catch (error) {
    if (error.name === 'AbortError') {
      return new Response(JSON.stringify({ 
        error: '生成超时',
        suggestion: '请尝试降低分辨率或使用更快的模型'
      }), { 
        status: 504,
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        }
      });
    }
    
    return new Response(JSON.stringify({ 
      error: '生成失败',
      details: error.message
    }), { 
      status: 500,
      headers: { 
        ...corsHeaders, 
        'Content-Type': 'application/json' 
      }
    });
  }
}

// 准备模型输入
function prepareModelInputs(data, model) {
  const inputs = {
    prompt: data.prompt || 'cyberpunk cat',
    negative_prompt: data.negative_prompt || '',
    height: clampDimension(data.height || 1024),
    width: clampDimension(data.width || 1024),
    num_steps: clampSteps(data.num_steps || model.recommended_steps, model),
    guidance: clampGuidance(data.guidance || 7.5),
    seed: data.seed || Math.floor(Math.random() * 4294967295),
    num_outputs: clampOutputs(data.num_outputs || 1, model)
  };
  
  // 处理图生图模型的额外参数
  if (model.requiresImage) {
    if (!data.image_url) {
      throw new Error('该模型需要提供image_url参数');
    }
    inputs.image_url = data.image_url;
  }
  
  if (model.requiresMask && !data.mask_url) {
    throw new Error('该模型需要提供mask_url参数');
  }
  
  return inputs;
}

// 处理模型响应
function handleModelResponse(response, model, processingTime, corsHeaders) {
  // 处理flux模型的特殊响应格式
  if (model.id === 'flux-1-schnell') {
    return handleFluxModelResponse(response, model, processingTime, corsHeaders);
  }
  
  // 默认处理二进制图像响应
  return new Response(response, {
    headers: {
      ...corsHeaders,
      'content-type': 'image/png',
      'X-Used-Model': model.id,
      'X-Processing-Seconds': processingTime
    }
  });
}

// 处理Flux模型的响应
function handleFluxModelResponse(response, model, processingTime, corsHeaders) {
  try {
    // 尝试解析JSON响应
    const jsonResponse = typeof response === 'object' ? response : JSON.parse(response);
    
    if (!jsonResponse.image) {
      throw new Error('无效的响应格式: 缺少image字段');
    }
    
    // 转换Base64为二进制
    const binaryString = atob(jsonResponse.image);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    return new Response(bytes, {
      headers: {
        ...corsHeaders,
        'content-type': 'image/png',
        'X-Used-Model': model.id,
        'X-Processing-Seconds': processingTime
      }
    });
    
  } catch (error) {
    throw new Error(`处理Flux模型响应失败: ${error.message}`);
  }
}

// 辅助函数：限制尺寸在合理范围内
function clampDimension(value) {
  const v = parseInt(value);
  return Math.min(2048, Math.max(256, Math.round(v / 64) * 64));
}

// 辅助函数：限制迭代步数
function clampSteps(value, model) {
  const steps = parseInt(value);
  return Math.min(model.recommended_steps + 10, Math.max(1, steps));
}

// 辅助函数：限制引导系数
function clampGuidance(value) {
  return Math.min(30, Math.max(0, parseFloat(value)));
}

// 辅助函数：限制生成数量
function clampOutputs(value, model) {
  const outputs = parseInt(value);
  return Math.min(model.max_outputs, Math.max(1, outputs));
}


