# 天文模型

基于 React + Three.js 的交互式太阳系可视化，支持高精度的行星细节渲染和效果控制。

[![Deploy to GitHub Pages](https://github.com/actions/actions/actions/workflows/deploy.yml/badge.svg)](https://github.com/actions/actions)

## ✨ 功能

- 🪐 **太阳系模拟** — 完整的行星系统，支持开普勒轨道计算
- 🌍 **细节行星视图** — 点击行星进入精细细节页面，高分辨率纹理、大气散射、昼夜变化
- 💫 **行星环** — 实时光照变化的行星环，冰粒子散射效果
- ☁️ **动态云层** — 类地行星带有变化的云层效果
- 🌙 **大气辉光** — 大气散射和辉光效果
- 🎮 **自由视角** — 鼠标旋转、缩放、视角预设
- ⏱️ **昼夜循环** — 可手动控制或自动循环
- 📊 **实时参数控制** — 质量等级、地形粗糙度、大气密度等可调
- 🗺️ **地图面板** — 侧边栏显示星球全貌等距矩形投影
- 🎨 **像素风贴图** — 支持自定义星球贴图，自动降分辨率适配风格

## 🚀 快速开始

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 生产构建
npm run build

# 预览生产构建
npm run preview
```

## 🛠 技术栈

| 类别 | 技术 |
|------|------|
| 框架 | React 18 |
| 3D 渲染 | Three.js + @react-three/fiber |
| 辅助库 | @react-three/drei |
| 状态管理 | Zustand |
| 样式 | Tailwind CSS |
| 构建 | Vite |
| 语言 | TypeScript |
| 图标 | Lucide React |

## 📂 项目结构

```
src/
├── components/      # React 组件
│   ├── Scene.tsx    # 主场景
│   ├── Star.tsx     # 恒星渲染
│   ├── Planet.tsx   # 行星渲染
│   ├── DetailPage.tsx  # 细节行星页面
│   ├── MapPanel.tsx    # 地图侧边面板
│   └── ...
├── store/           # Zustand 状态管理
│   └── index.ts
├── types/           # TypeScript 类型
│   └── index.ts
├── utils/           # 工具函数
│   ├── textureGenerator.ts   # 纹理生成
│   ├── planetTextureCache.ts # 纹理缓存
│   └── keplerOrbit.ts       # 开普勒轨道
├── config/          # 配置数据
│   └── celestialBodies.ts
├── App.tsx
└── main.tsx
```

## 📄 开源协议

MIT
