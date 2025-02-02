export interface TokenPair {
  baseToken: {
    name: string
    symbol: string
    address: string
  }
  chainId: string
  dexId: string
  priceUsd: string | null
  priceChange: {
    h1: number | null
    h6: number | null
    h24: number | null
  } | null
  liquidity?: {
    usd: number
  }
  volume?: {
    h24: number
  }
  marketCap?: number
  pairCreatedAt?: number
  info?: {
    websites?: Array<{ url: string }>
    socials?: Array<{ platform?: string; type?: string; url: string }>
  }
  url: string
}

export interface WorkspaceFile {
  path: string
  size: number
  type: string
}
