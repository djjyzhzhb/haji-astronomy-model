import * as THREE from 'three'

export interface TextureParams {
  resolution: '1024' | '2048' | '4096'
  terrainRoughness: number
  cloudCoverage: number
  cloudOpacity: number
  atmosphereDensity: number
  atmosphereColor: string
  seed: number
}

const defaultParams: TextureParams = {
  resolution: '2048',
  terrainRoughness: 0.5,
  cloudCoverage: 0.4,
  cloudOpacity: 0.7,
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

// 3D 噪声函数用于云纹理生成
function hash3D(x: number, y: number, z: number): number {
  let h = x * 374761393 + y * 668265263 + z * 144067249
  h = (h ^ (h >> 13)) * 1274126177
  return (h ^ (h >> 16)) / 2147483648 + 0.5
}

function smoothNoise3D(x: number, y: number, z: number): number {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z)
  const fx = x - ix, fy = y - iy, fz = z - iz
  const sx = fx * fx * (3 - 2 * fx)
  const sy = fy * fy * (3 - 2 * fy)
  const sz = fz * fz * (3 - 2 * fz)
  const n000 = hash3D(ix, iy, iz)
  const n100 = hash3D(ix + 1, iy, iz)
  const n010 = hash3D(ix, iy + 1, iz)
  const n110 = hash3D(ix + 1, iy + 1, iz)
  const n001 = hash3D(ix, iy, iz + 1)
  const n101 = hash3D(ix + 1, iy, iz + 1)
  const n011 = hash3D(ix, iy + 1, iz + 1)
  const n111 = hash3D(ix + 1, iy + 1, iz + 1)
  const nx00 = n000 + (n100 - n000) * sx
  const nx10 = n010 + (n110 - n010) * sx
  const nx01 = n001 + (n101 - n001) * sx
  const nx11 = n011 + (n111 - n011) * sx
  const nxy0 = nx00 + (nx10 - nx00) * sy
  const nxy1 = nx01 + (nx11 - nx01) * sy
  return nxy0 + (nxy1 - nxy0) * sz
}

function fbm3D(x: number, y: number, z: number, octaves: number = 6): number {
  let value = 0, amplitude = 1, frequency = 1, maxValue = 0
  for (let i = 0; i < octaves; i++) {
    value += amplitude * smoothNoise3D(x * frequency, y * frequency, z * frequency)
    maxValue += amplitude
    amplitude *= 0.5
    frequency *= 2.5
  }
  return value / maxValue
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
  const opacity = mergedParams.cloudOpacity
  const seed = mergedParams.seed

  return createCanvasTexture(width, height, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h)
    const imageData = ctx.createImageData(w, h)

    for (let py = 0; py < h; py++) {
      const lat = (py / h) * Math.PI
      const latFactor = Math.sin(lat)
      // 补偿等距矩形投影在两极的水平拉伸：高纬度增加水平采样频率
      const hScale = 2.5 / Math.max(0.12, latFactor)

      for (let px = 0; px < w; px++) {
        const lon = (px / w) * Math.PI * 2

        const nx = Math.cos(lon) * hScale
        const ny = lat * 0.9
        const nz = Math.sin(lon) * hScale + seed * 0.1

        // 域扭曲：用低频噪声扰动采样坐标，产生更破碎不规则的云块边缘
        const warp = 0.6
        const wx = smoothNoise3D(nx * 0.4 + 1.7, ny * 0.4, nz * 0.4) * warp
        const wy = smoothNoise3D(nx * 0.4, ny * 0.4 + 3.1, nz * 0.4) * warp
        const wz = smoothNoise3D(nx * 0.4, ny * 0.4, nz * 0.4 + 5.3) * warp

        const noiseVal = fbm3D(nx + wx, ny + wy, nz + wz, 6)

        // 噪声值约在 [-0.3, 1.4] 分布，threshold 在 1.4(coverage=0) ~ 0.05(coverage=1) 之间
        const threshold = 1.4 - coverage * 1.35
        let alpha = 0
        if (noiseVal > threshold) {
          alpha = Math.min(1, (noiseVal - threshold) / (1.4 - threshold))
          // 用 opacity 控制云体厚度，不加额外锐化截断
          alpha *= opacity
          alpha *= latFactor
        }

        const idx = (py * w + px) * 4
        imageData.data[idx] = 255
        imageData.data[idx + 1] = 255
        imageData.data[idx + 2] = 255
        imageData.data[idx + 3] = Math.floor(alpha * 255)
      }
    }
    ctx.putImageData(imageData, 0, 0)
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
