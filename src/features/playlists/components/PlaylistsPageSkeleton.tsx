import { Skeleton } from '@/shared'
import { UserHeader } from './UserHeader'
import { StatsBar } from './StatsBar'
import { PlaylistSelector } from './PlaylistSelector'
import { BatchBpmController } from './BatchBpmController'
import { TrackListSkeleton } from './TrackList'
import type { ViewMode } from './ViewToggle'

const noop = () => {}

function getStoredViewMode(): ViewMode {
  try {
    const v = localStorage.getItem('ykvlv_playlists_view_mode')
    return v === 'cards' ? 'cards' : 'compact'
  } catch {
    return 'compact'
  }
}

interface PlaylistsPageSkeletonProps {
  loadingHint?: string
}

export function PlaylistsPageSkeleton({
  loadingHint,
}: PlaylistsPageSkeletonProps = {}) {
  return (
    <div className="space-y-8">
      <UserHeader isLoading loadingHint={loadingHint} />
      <StatsBar totalLiked={0} unsorted={0} selectedPlaylists={0} isLoading />
      <PlaylistSelector
        playlists={[]}
        selectedKinds={[]}
        failedKinds={new Set()}
        onChange={noop}
        isLoading
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <BatchBpmController
          pendingCount={0}
          isProcessing={false}
          processedCount={0}
          totalCount={0}
          onStart={noop}
          onCancel={noop}
          isLoading
        />
        <div className="flex items-center gap-2 ml-auto">
          <Skeleton className="h-10 w-22 rounded-xl" />
          <Skeleton className="size-9 rounded-lg" />
        </div>
      </div>
      <TrackListSkeleton viewMode={getStoredViewMode()} />
    </div>
  )
}
