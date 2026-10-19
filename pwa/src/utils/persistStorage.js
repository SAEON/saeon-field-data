// Ask the browser to keep this site's data (saved profile, open visit, queued changes and files) instead of
// clearing it when the device is short of space. An installed app is also treated more kindly than a tab.

export async function requestPersistentStorage() {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch { return false; }
}
