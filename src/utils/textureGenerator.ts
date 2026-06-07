import * as THREE from 'three'

export interface TextureParams {
  resolution: '1024' | '2048' | '4096'
  terrainRoughness: number
  cloudCoverage: number
  cloudSpeed: number
  atmosphereDensity: number
  atmosphereColor: string
  seed: number
}

const defaultParams: TextureParams = {
  resolution: '2048',
  terrainRoughness: 0.5,
  cloudCoverage: 0.4,
  cloudSpeed: 0.2,
  atmosphereDensity: 0.6,
  atmosphereColor: '#64a5ff',
  seed: 42
}

function createCanvasTexture(
  width: number, 
  height: number, 
  drawFn: (ctx: CanvasRenderingContext2D, w: number, h: number) => void
): THREE.Texture {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  
  // 首先填充背景
  ctx.fillStyle = '#333333'
  ctx.fillRect(0, 0, width, height)
  
  drawFn(ctx, width, height)
  
  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.ClampToEdgeWrapping
  texture.anisotropy = 8
  texture.needsUpdate = true
  return texture
}

export function generateTerrainTexture(params: Partial<TextureParams> = {}): THREE.Texture {
  const mergedParams = { ...defaultParams, ...params }
  const resolution = parseInt(mergedParams.resolution)
  const width = resolution * 2
  const height = resolution
  const roughness = mergedParams.terrainRoughness
  const random = seededRandom(mergedParams.seed)

  return createCanvasTexture(width, height, (ctx, w, h) => {
    // 创建基础渐变
    const gradient = ctx.createLinearGradient(0, 0, 0, h)
    gradient.addColorStop(0, '#1a5f9e')  // 深海
    gradient.addColorStop(0.3, '#2e8b57') // 森林
    gradient.addColorStop(0.6, '#daa520') // 沙漠
    gradient.addColorStop(1, '#d2691e')   // 山地
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, w, h)

    // 根据粗糙度添加细节
    if (roughness > 0) {
      const detailLevel = roughness * 10 // 0-10 级
      const step = Math.max(4, 30 - detailLevel * 2.5) // 粗糙度越高，细节越小越密集
      
      for (let y = 0; y < h; y += step) {
        for (let x = 0; x < w; x += step) {
          // 基于seed的随机变化
          const rand1 = random()
          const rand2 = random()
          const brightness = 0.7 + rand1 * roughness * 0.6
          
          // 获取基础颜色
          const gradientPos = y / h
          let baseColor
          if (gradientPos < 0.3) baseColor = [26, 95, 158]
          else if (gradientPos < 0.6) baseColor = [46, 139, 87]
          else if (gradientPos < 0.8) baseColor = [218, 165, 32]
          else baseColor = [210, 105, 30]

          // 应用亮度变化
          const r = Math.floor(Math.max(0, Math.min(255, baseColor[0] * brightness)))
          const g = Math.floor(Math.max(0, Math.min(255, baseColor[1] * brightness)))
          const b = Math.floor(Math.max(0, Math.min(255, baseColor[2] * brightness)))
          
          ctx.fillStyle = `rgb(${r},${g},${b})`
          ctx.fillRect(x, y, step, step)
        }
      }
    }
  })
}

// 简单的伪随机数生成器（基于seed）
function seededRandom(seed: number) {
  let value = seed
  return function() {
    value = (value * 9301 + 49297) % 233280
    return value / 233280
  }
}

export function generateCloudTexture(params: Partial<TextureParams> = {}): THREE.Texture {
  const mergedParams = { ...defaultParams, ...params }
  const resolution = parseInt(mergedParams.resolution)
  const width = resolution * 2
  const height = resolution
  const coverage = mergedParams.cloudCoverage
  const random = seededRandom(mergedParams.seed)

  return createCanvasTexture(width, height, (ctx, w, h) => {
    // 完全透明背景
    ctx.clearRect(0, 0, w, h)

    if (coverage > 0) {
      // 根据覆盖度添加云朵
      const cloudDensity = Math.floor(coverage * 50)
      const cloudSize = Math.max(20, 200 - coverage * 100)

      for (let i = 0; i < cloudDensity; i++) {
        const x = random() * w
        const y = random() * h
        const radius = cloudSize * (0.5 + random() * 0.5)
        
        // 创建亮白色云朵
        const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius)
        gradient.addColorStop(0, `rgba(255, 255, 255, ${Math.min(0.9, 0.6 * coverage)})`)
        gradient.addColorStop(0.4, `rgba(255, 255, 255, ${Math.min(0.7, 0.4 * coverage)})`)
        gradient.addColorStop(0.7, `rgba(255, 255, 255, ${Math.min(0.4, 0.2 * coverage)})`)
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0)')
        
        ctx.fillStyle = gradient
        ctx.beginPath()
        ctx.arc(x, y, radius, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  })
}

export function generateAtmosphereTexture(params: Partial<TextureParams> = {}): THREE.Texture {
  const mergedParams = { ...defaultParams, ...params }
  const resolution = parseInt(mergedParams.resolution)
  const width = resolution * 2
  const height = resolution

  return createCanvasTexture(width, height, (ctx, w, h) => {
    // 简单的蓝色大气纹理
    ctx.fillStyle = mergedParams.atmosphereColor || '#64a5ff'
    ctx.fillRect(0, 0, w, h)
  })
}

export function generateMoonTexture(params: Partial<TextureParams> = {}): THREE.Texture {
  const mergedParams = { ...defaultParams, ...params }
  const resolution = parseInt(mergedParams.resolution)
  const width = resolution * 2
  const height = resolution

  return createCanvasTexture(width, height, (ctx, w, h) => {
    // 简单的灰色月球纹理
    const gradient = ctx.createLinearGradient(0, 0, 0, h)
    gradient.addColorStop(0, '#808080')
    gradient.addColorStop(0.5, '#a0a0a0')
    gradient.addColorStop(1, '#606060')
    
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, w, h)
  })
}

export function generateMarsTexture(params: Partial<TextureParams> = {}): THREE.Texture {
  const mergedParams = { ...defaultParams, ...params }
  const resolution = parseInt(mergedParams.resolution)
  const width = resolution * 2
  const height = resolution

  return createCanvasTexture(width, height, (ctx, w, h) => {
    // 简单的红色火星纹理
    const gradient = ctx.createLinearGradient(0, 0, 0, h)
    gradient.addColorStop(0, '#8b0000')
    gradient.addColorStop(0.5, '#cd5c5c')
    gradient.addColorStop(1, '#a52a2a')
    
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, w, h)
  })
}

export function generateGasGiantTexture(params: Partial<TextureParams> = {}): THREE.Texture {
  const mergedParams = { ...defaultParams, ...params }
  const resolution = parseInt(mergedParams.resolution)
  const width = resolution * 2
  const height = resolution

  return createCanvasTexture(width, height, (ctx, w, h) => {
    // 简单的气态巨行星纹理 - 使用条纹渐变
    const gradient = ctx.createLinearGradient(0, 0, 0, h)
    gradient.addColorStop(0, '#DEB887')
    gradient.addColorStop(0.2, '#DAA520')
    gradient.addColorStop(0.4, '#CD853F')
    gradient.addColorStop(0.6, '#D2691E')
    gradient.addColorStop(0.8, '#8B4513')
    gradient.addColorStop(1, '#F4A460')
    
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, w, h)
    
    // 添加简单的条纹效果
    for (let i = 0; i < 20; i++) {
      const y = (h / 20) * i
      ctx.fillStyle = i % 2 === 0 ? 'rgba(218, 165, 32, 0.3)' : 'rgba(139, 69, 19, 0.2)'
      ctx.fillRect(0, y, w, h / 20)
    }
  })
}

export function loadImageTexture(url: string): THREE.Texture | null {
  try {
    const loader = new THREE.TextureLoader()
    const texture = loader.load(url)
    texture.wrapS = THREE.RepeatWrapping
    texture.wrapT = THREE.RepeatWrapping
    return texture
  } catch (error) {
    console.error('加载图片纹理失败:', url, error)
    return null
  }
}

export function getTextureByType(type: string, params: Partial<TextureParams> = {}): THREE.Texture | null {
  try {
    switch (type) {
      case 'earth-like':
        return generateTerrainTexture(params)
      case 'moon-like':
        return generateMoonTexture(params)
      case 'mars-like':
        return generateMarsTexture(params)
      case 'gas-giant':
        return generateGasGiantTexture(params)
      case 'custom':
        return null
      default:
        return null
    }
  } catch (error) {
    console.error('纹理生成失败:', error)
    return null
  }
}

export function getTexturesByType(type: string, params: Partial<TextureParams> = {}): { 
  terrain: THREE.Texture | null, 
  clouds: THREE.Texture | null, 
  atmosphere: THREE.Texture | null 
} {
  try {
    switch (type) {
      case 'earth-like':
        return {
          terrain: generateTerrainTexture(params),
          clouds: generateCloudTexture(params),
          atmosphere: generateAtmosphereTexture(params)
        }
      case 'moon-like':
        return {
          terrain: generateMoonTexture(params),
          clouds: null,
          atmosphere: null
        }
      case 'mars-like':
        return {
          terrain: generateMarsTexture(params),
          clouds: null,
          atmosphere: null
        }
      case 'gas-giant':
        return {
          terrain: generateGasGiantTexture(params),
          clouds: null,
          atmosphere: null
        }
      case 'custom':
        return { terrain: null, clouds: null, atmosphere: null }
      default:
        return { terrain: null, clouds: null, atmosphere: null }
    }
  } catch (error) {
    console.error('纹理生成失败:', error)
    return { terrain: null, clouds: null, atmosphere: null }
  }
}
