import { useState, useEffect } from 'react'
import * as THREE from 'three'

const imageCache = new Map<string, HTMLImageElement>()
const pendingLoads = new Map<string, Promise<HTMLImageElement>>()

function loadImage(url: string): Promise<HTMLImageElement> {
  if (imageCache.has(url)) return Promise.resolve(imageCache.get(url)!)
  if (pendingLoads.has(url)) return pendingLoads.get(url)!

  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      imageCache.set(url, img)
      pendingLoads.delete(url)
      resolve(img)
    }
    img.onerror = (e) => {
      pendingLoads.delete(url)
      reject(e)
    }
    img.src = url
  })
  pendingLoads.set(url, promise)
  return promise
}

interface TextureCacheEntry {
  texture: THREE.Texture
  quality: string
  roughness: number
  seed: number
}

const textureOutputCache = new Map<string, TextureCacheEntry>()

function makeCacheKey(url: string, quality: string, roughness: number, seed: number): string {
  return `${url}::${quality}::${roughness.toFixed(2)}::${seed}`
}

function processTexture(img: HTMLImageElement, quality: string, roughness: number, seed: number): THREE.Texture {
  const resMap: Record<string, number> = { low: 128, medium: 256, high: 512, ultra: 1024 }
  const w = resMap[quality] || 256
  const h = Math.round(w / 2)

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(img, 0, 0, w, h)

  if (roughness > 0) {
    const imageData = ctx.getImageData(0, 0, w, h)
    const data = imageData.data
    let s = seed * 1000
    for (let i = 0; i < data.length; i += 4) {
      s = (s * 16807 + 0) % 2147483647
      const noise = ((s & 0xff) / 255 - 0.5) * roughness * 80
      data[i] = Math.min(255, Math.max(0, data[i] + noise))
      data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + noise))
      data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + noise))
    }
    ctx.putImageData(imageData, 0, 0)
  }

  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.colorSpace = THREE.SRGBColorSpace
  tex.magFilter = THREE.NearestFilter
  tex.minFilter = quality === 'low' ? THREE.NearestFilter : THREE.LinearMipmapLinearFilter
  tex.needsUpdate = true
  return tex
}

export function usePlanetTexture(
  url: string | null,
  quality: string,
  roughness: number,
  seed: number
): THREE.Texture | null {
  // 同步查缓存，避免首帧闪烁
  const initKey = url ? makeCacheKey(url, quality, roughness, seed) : null
  const initCached = initKey ? textureOutputCache.get(initKey) : null
  const initTex = initCached ? initCached.texture : null

  const [texture, setTexture] = useState<THREE.Texture | null>(initTex)

  useEffect(() => {
    if (!url) {
      if (texture !== null) setTexture(null)
      return
    }

    // 如果图片已缓存且参数相同，跳过（已在 useState 初始值中设置）
    const key = makeCacheKey(url, quality, roughness, seed)
    if (textureOutputCache.has(key)) return

    let cancelled = false

    loadImage(url).then((img) => {
      if (cancelled) return
      const key2 = makeCacheKey(url, quality, roughness, seed)
      const cached = textureOutputCache.get(key2)
      if (cached) {
        setTexture(cached.texture)
        return
      }
      const tex = processTexture(img, quality, roughness, seed)
      textureOutputCache.set(key2, { texture: tex, quality, roughness, seed })
      setTexture(tex)
    }).catch(() => {
      if (!cancelled) setTexture(null)
    })

    return () => { cancelled = true }
  }, [url, quality, roughness, seed])

  return texture
}

export function getIsHabitable(textureType?: string, type?: string): boolean {
  return textureType === 'earth-like' || (!textureType && type === 'planet')
}
