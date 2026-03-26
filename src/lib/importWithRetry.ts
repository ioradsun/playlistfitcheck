const DYNAMIC_IMPORT_FETCH_ERROR = "Failed to fetch dynamically imported module";

let hasTriggeredReload = false;

const forceReloadOnce = () => {
  if (typeof window === "undefined" || hasTriggeredReload) return;
  hasTriggeredReload = true;
  window.location.reload();
};

export const isDynamicImportFetchError = (error: unknown) =>
  error instanceof Error && error.message.includes(DYNAMIC_IMPORT_FETCH_ERROR);

export const importWithRetry = async <T>(
  importer: () => Promise<T>,
  cacheBustImporter?: () => Promise<T>,
  retries = 1,
): Promise<T> => {
  try {
    return await importer();
  } catch (error) {
    if (isDynamicImportFetchError(error)) {
      if (retries > 0) {
        const retryImporter = cacheBustImporter ?? importer;
        return importWithRetry(retryImporter, cacheBustImporter, retries - 1);
      }

      forceReloadOnce();
      return new Promise<T>(() => {});
    }

    throw error;
  }
};