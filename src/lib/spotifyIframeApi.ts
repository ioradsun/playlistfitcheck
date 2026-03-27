/**
 * Singleton loader for the Spotify IFrame API.
 *
 * Usage:
 *   const IFrameAPI = await loadSpotifyIframeApi();
 *   IFrameAPI.createController(element, { uri }, callback);
 *
 * The script is loaded lazily on first call and cached thereafter.
 */

export interface SpotifyEmbedController {
  play: () => void;
  pause: () => void;
  resume: () => void;
  togglePlay: () => void;
  seek: (seconds: number) => void;
  destroy: () => void;
  addListener: (event: string, callback: (e: any) => void) => void;
  removeListener: (event: string, callback?: (e: any) => void) => void;
}

export interface SpotifyIFrameAPI {
  createController: (
    element: HTMLElement,
    options: { uri: string; width?: string | number; height?: number },
    callback: (controller: SpotifyEmbedController) => void,
  ) => void;
}

let apiPromise: Promise<SpotifyIFrameAPI> | null = null;

export function loadSpotifyIframeApi(): Promise<SpotifyIFrameAPI> {
  if (apiPromise) return apiPromise;

  apiPromise = new Promise<SpotifyIFrameAPI>((resolve, reject) => {
    // If the API is already loaded (e.g. from a previous session/HMR), resolve immediately
    if ((window as any).__spotifyIframeApi) {
      resolve((window as any).__spotifyIframeApi);
      return;
    }

    (window as any).onSpotifyIframeApiReady = (IFrameAPI: SpotifyIFrameAPI) => {
      (window as any).__spotifyIframeApi = IFrameAPI;
      resolve(IFrameAPI);
    };

    const script = document.createElement("script");
    script.src = "https://open.spotify.com/embed/iframe-api/v1";
    script.async = true;
    script.onerror = () => {
      apiPromise = null; // allow retry
      reject(new Error("Failed to load Spotify IFrame API"));
    };
    document.head.appendChild(script);
  });

  return apiPromise;
}
