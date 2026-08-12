export interface PackTile {
  id: string
  /** Columns the tile wants to span; the packer may demote 2 to 1 */
  span: 1 | 2
  /** Measured natural pixel height */
  height: number
  /** Day key; tiles are placed day by day and never mix across a boundary */
  day: string
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

// One budget rules all slack: seam stretch, how far above the lowest column
// any tile may sit, and the wide's pair depth. Relative to the median single
// because an absolute cap tuned for one batch of cards starves the next
const BUDGET_RATIO = 0.5

const median = (xs: number[]) => {
  if (xs.length === 0) return 0
  const sorted = [...xs].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

/**
 * Skyline packer over day groups: days go down strictly in input order and
 * never mix across a boundary, inside one day the order is free - a wide goes
 * down the moment the skyline welcomes it, singles of the same day level the
 * pair in the meantime. Every decision reads only the skyline built so far,
 * never the height of the tile being placed - a card measures shorter once it
 * is granted two columns, so a rule reading that height would demote it,
 * measure it tall, promote it, and never settle. (The budget median reads
 * single-wish tiles only, for the same reason.)
 */
export function packTiles(
  input: PackTile[],
  colCount: number,
  gap: number,
): Packing {
  const heights = new Array<number>(colCount).fill(0)
  const lastInCol = new Array<PackedTile | null>(colCount).fill(null)
  const placed: PackedTile[] = []

  const singleHeights = input
    .filter((t) => t.span === 1 || colCount === 1)
    .map((t) => t.height)
  const budget =
    BUDGET_RATIO *
    median(
      singleHeights.length > 0 ? singleHeights : input.map((t) => t.height),
    )

  // Snake cursor sweeping left-right-left; singles lean toward it so
  // placement meanders instead of whipping to whatever column is lowest
  let cursor = 0
  let dir = 1
  // The outer column the very next single may not take (3+ columns), so the
  // trail cannot whip corner to corner
  let banned = -1

  // A tile may grow only while it is the bottom of every column it spans: a
  // wide already built over in one of them would grow across that tile
  const stretchable = (t: PackedTile) =>
    lastInCol[t.col] === t && (t.span === 1 || lastInCol[t.col + 1] === t)

  // Which pair the previous wide took: the next one prefers the other side,
  // so wides alternate across the grid instead of stacking into a band
  let lastWideCol = -1

  // The pair a wide may take right now: seam within budget and still
  // stretchable closed, the pair not so far above the lowest column that a
  // later tile could land a full card above it
  const welcome = () => {
    const min = Math.min(...heights)
    let best: {
      col: number
      waste: number
      y: number
      fresh: boolean
    } | null = null
    for (let i = 0; i + 1 < colCount; i++) {
      const y = Math.max(heights[i], heights[i + 1])
      const waste = Math.abs(heights[i] - heights[i + 1])
      if (waste > budget || y - min > budget) continue
      if (waste > 1) {
        const short = heights[i] < heights[i + 1] ? i : i + 1
        const last = lastInCol[short]
        if (!last || !stretchable(last)) continue
      }
      const fresh = i !== lastWideCol
      if (
        !best ||
        (fresh && !best.fresh) ||
        (fresh === best.fresh &&
          (waste < best.waste || (waste === best.waste && y < best.y)))
      )
        best = { col: i, waste, y, fresh }
    }
    return best
  }

  // What a single placed in column c does for the waiting wide. The pair
  // under the previous wide is skipped: already level, it would win every
  // time and steer the levelling away from the side the next wide prefers
  const levelScore = (c: number, tileHeight: number) => {
    const hs = [...heights]
    hs[c] += tileHeight + gap
    const min = Math.min(...hs)
    let best = Infinity
    for (let i = 0; i + 1 < colCount; i++) {
      if (colCount > 2 && i === lastWideCol) continue
      const waste = Math.abs(hs[i] - hs[i + 1])
      const y = Math.max(hs[i], hs[i + 1])
      best = Math.min(best, Math.max(waste, y - min))
    }
    return best
  }

  const placeSingle = (t: PackTile, leveling: boolean) => {
    const min = Math.min(...heights)
    let cands: number[] = []
    for (let c = 0; c < colCount; c++)
      if (heights[c] - min <= budget) cands.push(c)
    if (banned >= 0 && cands.length > 1)
      cands = cands.filter((c) => c !== banned)

    // Leveling serves the waiting wide; otherwise the lowest column wins and
    // the cursor only breaks ties - so the tile after the last wide dives
    // under it instead of stepping aside
    let col = cands[0]
    let score = Infinity
    for (const c of cands) {
      const s = leveling ? levelScore(c, t.height) : heights[c]
      if (
        s < score - 0.5 ||
        (Math.abs(s - score) <= 0.5 &&
          Math.abs(c - cursor) < Math.abs(col - cursor))
      ) {
        col = c
        score = s
      }
    }

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

    banned =
      colCount >= 3 && (col === 0 || col === colCount - 1)
        ? colCount - 1 - col
        : -1
    cursor += dir
    if (cursor >= colCount - 1) dir = -1
    if (cursor <= 0) dir = 1
    cursor = Math.max(0, Math.min(colCount - 1, cursor))
  }

  const placeWide = (t: PackTile, pair: { col: number; y: number }) => {
    // Close the seam: the shorter column's last tile grows down to the wide
    // tile's top edge
    for (const c of [pair.col, pair.col + 1]) {
      const last = lastInCol[c]
      const deficit = pair.y - heights[c]
      if (last && deficit > 0 && stretchable(last)) {
        const growth = Math.min(deficit, budget)
        last.height += growth
        // A grown wide gets taller in both its columns: advance the skyline
        // of the one outside the pair too, or the next tile there lands on it
        if (last.span === 2)
          heights[last.col === c ? last.col + 1 : last.col] += growth
      }
    }
    const tile: PackedTile = {
      id: t.id,
      col: pair.col,
      y: pair.y,
      span: 2,
      height: t.height,
    }
    placed.push(tile)
    lastInCol[pair.col] = lastInCol[pair.col + 1] = tile
    heights[pair.col] = heights[pair.col + 1] = pair.y + t.height + gap
    lastWideCol = pair.col
    // The wide now sits between the singles the ban was guarding against
    banned = -1
  }

  let i = 0
  while (i < input.length) {
    const day = input[i].day
    const wides: PackTile[] = []
    const singles: PackTile[] = []
    for (; i < input.length && input[i].day === day; i++) {
      if (input[i].span === 2 && colCount > 1) wides.push(input[i])
      else singles.push(input[i])
    }

    // A day too small to level for its own wide still gets one when the day
    // before it prepares the ground - so levelling looks one day ahead
    let nextHasWide = false
    if (i < input.length) {
      const nextDay = input[i].day
      for (let j = i; j < input.length && input[j].day === nextDay; j++)
        if (input[j].span === 2 && colCount > 1) nextHasWide = true
    }

    let s = 0
    while (wides.length > 0 || s < singles.length) {
      const pair = wides.length > 0 ? welcome() : null
      if (pair) {
        placeWide(wides.shift() as PackTile, pair)
      } else if (s < singles.length) {
        placeSingle(singles[s++], wides.length > 0 || nextHasWide)
      } else {
        // The day ran out of singles before the skyline welcomed it, and the
        // next day may not level for an earlier tile - demote
        const w = wides.shift() as PackTile
        placeSingle(w, wides.length > 0 || nextHasWide)
      }
    }
  }

  // Flatten the bottom edge - but only when the stretch actually gets there:
  // a capped partial stretch adds emptiness without achieving alignment
  const maxH = Math.max(...heights, 0)
  for (const last of new Set(lastInCol)) {
    if (!last || !stretchable(last)) continue
    const deficit = maxH - heights[last.col]
    if (deficit > 0 && deficit <= budget) last.height += deficit
  }

  return { tiles: placed, height: Math.max(0, maxH - gap) }
}
