export type HashRoute = { page: 'main' } | { page: 'detail'; planetId: string }

export function parseHash(): HashRoute {
  const hash = window.location.hash.replace('#/', '').replace('#', '')
  if (!hash) return { page: 'main' }
  const parts = hash.split('/')
  if (parts[0] === 'detail' && parts[1]) return { page: 'detail', planetId: parts[1] }
  return { page: 'main' }
}

export function setHash(route: HashRoute) {
  if (route.page === 'main') {
    window.location.hash = '#/'
  } else {
    window.location.hash = `#/detail/${route.planetId}`
  }
}
