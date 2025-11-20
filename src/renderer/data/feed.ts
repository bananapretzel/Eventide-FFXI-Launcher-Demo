import type { Post } from "../types/feed";

interface PatchNote {
  name: string;
  timestamp: string;
  message: string;
}

// Cache for patch notes - persists for entire launcher session
let cachedPosts: Post[] | null = null;

/**
 * Fetches patch notes from the remote server and transforms them into Post format
 * Displays all patches ordered newest first
 * Caches results for the entire launcher session
 */
export async function fetchPatchNotes(): Promise<Post[]> {
  // Return cached data if available
  if (cachedPosts) {
    console.log('[feed] Returning cached patch notes');
    return cachedPosts;
  }

  try {
    const result = await window.electron.fetchPatchNotes();

    if (!result || !result.success || !result.data) {
      console.error('[feed] Failed to fetch patch notes:', result?.error);
      // Return cached data if available, even if stale
      return cachedPosts || [];
    }

    const patchNotes: PatchNote[] = result.data;

    // Reverse the array since API returns oldest first, we want newest first
    const reversedNotes = [...patchNotes].reverse();

    // Transform to Post format
    const posts: Post[] = reversedNotes.map((note: PatchNote, index: number) => {
      // Format date and time without seconds
      const date = new Date(note.timestamp);
      const formattedDate = date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
      const formattedTime = date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });

      return {
        id: String(index + 1),
        title: `${formattedDate}, ${formattedTime}`,
        body: note.message,
        timestamp: note.timestamp,
        author: note.name
      };
    });

    // Update cache
    cachedPosts = posts;
    console.log('[feed] Cached patch notes updated');

    return posts;
  } catch (error) {
    console.error('[feed] Error fetching patch notes:', error);
    // Return cached data if available, even if stale
    return cachedPosts || [];
  }
}

// Export empty array as default for backward compatibility
export default [];
