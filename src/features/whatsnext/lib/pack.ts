export interface PackTile {
  id: string
  /** Columns the tile wants to span; the packer may demote 2 to 1 */
  span: 1 | 2
  /** Measured natural pixel height */
  height: number
}

export interface PackedTile {
  id: string
  col: number
  y: number
  /** Columns actually granted – render width must follow this, not the wish */
  span: 1 | 2
  /** Natural height plus any stretch granted to close a seam */
  height: number
}

export interface Packing {
  tiles: PackedTile[]
  height: number
}

// How much a tile may quietly grow to close a seam; past that the packer
// demotes the wide tile instead (or leaves the bottom edge ragged)
const STRETCH_MAX = 120

/**
 * Skyline packer. Never reorders: input is date order and the page has to read
 * later and later as it scrolls. Every decision reads only the skyline built
 * so far, never the height of the tile being placed - a card measures shorter
 * once it is granted two columns, so a rule reading that height would demote
 * it, measure it tall, promote it, and never settle.
 */
export function packTiles(
  input: PackTile[],
  colCount: number,
  gap: number,
): Packing {
  const heights = new Array<number>(colCount).fill(0)
  const lastInCol = new Array<PackedTile | null>(colCount).fill(null)
  const placed: PackedTile[] = []

  // A tile may grow only while it is the bottom of every column it spans: a
  // wide already built over in one of them would grow across that tile
  const stretchable = (t: PackedTile) =>
    lastInCol[t.col] === t && (t.span === 1 || lastInCol[t.col + 1] === t)

  const bestPair = () => {
    let col = 0
    let waste = Infinity
    let y = Infinity
    for (let i = 0; i + 1 < colCount; i++) {
      const pairY = Math.max(heights[i], heights[i + 1])
      const pairWaste = Math.abs(heights[i] - heights[i + 1])
      if (pairWaste < waste || (pairWaste === waste && pairY < y)) {
        col = i
        waste = pairWaste
        y = pairY
      }
    }
    return { col, waste, y }
  }

  const placeSingle = (t: PackTile) => {
    const col = heights.indexOf(Math.min(...heights))
    const tile: PackedTile = {
      id: t.id,
      col,
      y: heights[col],
      span: 1,
      height: t.height,
    }
    placed.push(tile)
    lastInCol[col] = tile
    heights[col] += t.height + gap
  }

  const placeWide = (t: PackTile) => {
    const { col, y } = bestPair()
    // Close the seam: the shorter column's last tile grows down to the wide
    // tile's top edge
    for (const c of [col, col + 1]) {
      const last = lastInCol[c]
      const deficit = y - heights[c]
      if (last && deficit > 0 && stretchable(last))
        last.height += Math.min(deficit, STRETCH_MAX)
    }
    const tile: PackedTile = { id: t.id, col, y, span: 2, height: t.height }
    placed.push(tile)
    lastInCol[col] = lastInCol[col + 1] = tile
    heights[col] = heights[col + 1] = y + t.height + gap
  }

  // Whether any single follows position i, for the anti-shaft demotion
  const singlesAfter = new Array<boolean>(input.length).fill(false)
  for (let i = input.length - 2; i >= 0; i--) {
    singlesAfter[i] = singlesAfter[i + 1] || input[i + 1].span === 1
  }

  input.forEach((t, i) => {
    if (t.span !== 2 || colCount === 1) {
      placeSingle(t)
      return
    }
    const pair = bestPair()
    // Everything a wide here would leave unfillable: the seam inside the pair
    // plus the column it strands outside it
    const stranded = pair.y - Math.min(...heights)
    const demote =
      pair.waste > STRETCH_MAX ||
      (colCount > 2 && !singlesAfter[i] && stranded > STRETCH_MAX)
    if (demote) placeSingle(t)
    else placeWide(t)
  })

  // Flatten the bottom edge - but only when the stretch actually gets there:
  // a capped partial stretch adds emptiness without achieving alignment
  const maxH = Math.max(...heights, 0)
  for (const last of new Set(lastInCol)) {
    if (!last || !stretchable(last)) continue
    const deficit = maxH - heights[last.col]
    if (deficit > 0 && deficit <= STRETCH_MAX) last.height += deficit
  }

  return { tiles: placed, height: Math.max(0, maxH - gap) }
}
