/**
 * Schatten - injected.js
 * Runs in the page's own JavaScript world (manifest: "world": "MAIN"),
 * because only there can we read window.ytInitialPlayerResponse, the object
 * in which YouTube lists the caption tracks of the current video.
 *
 * It does two jobs:
 *  1. Announce the caption tracks of the current video to the content
 *     script (also after YouTube's internal page navigation).
 *  2. Fetch the caption file itself, because a fetch from the page world
 *     is a plain same-origin request on youtube.com.
 * Communication with the content script uses window.postMessage.
 */

"use strict";

(function () {
  // Read the caption tracks from YouTube's player response.
  function readTracks() {
    const response = window.ytInitialPlayerResponse;
    if (!response || !response.captions) return null;
    const renderer = response.captions.playerCaptionsTracklistRenderer;
    if (!renderer || !renderer.captionTracks) return null;
    return {
      videoId: response.videoDetails ? response.videoDetails.videoId : null,
      title: response.videoDetails ? response.videoDetails.title : "",
      tracks: renderer.captionTracks.map((track) => ({
        baseUrl: track.baseUrl,
        languageCode: track.languageCode,
        kind: track.kind || "",
        name: track.name && track.name.simpleText ? track.name.simpleText : "",
      })),
    };
  }

  // Tell the content script which tracks the current video has.
  function announce() {
    const info = readTracks();
    window.postMessage({ type: "dbl-tracks", info }, "*");
  }

  // Fetch a caption file on behalf of the content script.
  // The content script says "dbl-ready" once its listener exists; only
  // then is a postMessage guaranteed to be heard.
  window.addEventListener("message", (event) => {
    if (event.data && event.data.type === "dbl-ready") announce();
    if (!event.data || event.data.type !== "dbl-fetch-captions") return;
    const sep = event.data.baseUrl.includes("?") ? "&" : "?";
    fetch(event.data.baseUrl + sep + "fmt=json3", { credentials: "include" })
      .then((response) => response.json())
      .then((json) => {
        window.postMessage(
          { type: "dbl-caption-body", nonce: event.data.nonce, json },
          "*"
        );
      })
      .catch(() => {
        window.postMessage(
          { type: "dbl-caption-body", nonce: event.data.nonce, json: null },
          "*"
        );
      });
  });

  // YouTube is a single-page app: moving to another video fires this event
  // instead of reloading the page, so we announce the new tracks again.
  window.addEventListener("yt-navigate-finish", () => {
    setTimeout(announce, 500);
  });

  announce();
})();
